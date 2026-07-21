"""
Real TRACES NT SOAP submission client — WS-Security authenticated,
built directly against the European Commission's own published EUDR API
conformance-test specification, not a third-party guess.

--------------------------------------------------------------------------
WHAT'S VERIFIED HERE VERSUS WHAT ISN'T (read before assuming this is a
finished, tested integration — it cannot be, without real credentials)
--------------------------------------------------------------------------
VERIFIED, with certainty: the WS-Security UsernameToken password-digest
algorithm below (`_build_password_digest`) is the standard OASIS
WS-Security UsernameToken Profile 1.0 digest — Base64(SHA-1(nonce +
created + password)) — which is exactly what the European Commission's
own document, "EUDR API specifications for Operators — Conformance Test
1" (dated 8 May 2024, EC contacts: Karine.GADIOU@ext.ec.europa.eu,
ENV-EUDR-IS-TEAM@ec.europa.eu), describes for this exact system. This is
pure, deterministic cryptography — it's either implemented correctly or
it isn't, independent of ever calling a live server, and it's covered by
real unit tests that verify the math directly (see tests referenced in
this module's own test file).

NOT verified, and cannot be without real credentials: whether the SOAP
envelope structure below (element names, namespaces, ordering) exactly
matches what the live TRACES NT `EudrSubmissionService` WSDL currently
expects. The EC's own document explicitly warns "specifications... are
not final and may still be subject to change." The endpoint URLs below
are a best-available synthesis of that document (the Alpha/conformance
test environment, dated 2024) and a more recently-documented open-source
client's endpoints — these disagree on the exact hostname, which is real,
honest evidence they may have changed as the system matured. VERIFY THE
CURRENT REAL ENDPOINT before ever pointing this at anything beyond
acceptance testing — see Settings.TRACES_BASE_URL's docstring for exactly
where to check.

This has never been run against a real TRACES NT server, acceptance or
production, because CanoryAI has never held real credentials — this
module exists so that the moment real credentials exist, testing it is
the very next step, not a from-scratch build.
"""

from __future__ import annotations

import base64
import hashlib
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any, Final

import httpx

from app.core.config import Settings
from app.core.exceptions import TracesNotConfiguredError, TracesSubmissionError
from app.core.logging import get_logger

logger = get_logger(__name__)

_SOAP_ENV_NS: Final[str] = "http://schemas.xmlsoap.org/soap/envelope/"
_WSSE_NS: Final[str] = (
    "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
)
_WSU_NS: Final[str] = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
_PASSWORD_DIGEST_TYPE: Final[str] = (
    "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest"
)
_ENCODING_TYPE_BASE64: Final[str] = (
    "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary"
)

# XML namespace matching is technically prefix-independent (only the URI
# matters per spec) — but registering conventional prefixes rather than
# letting ElementTree auto-generate "ns0"/"ns1"/"ns2" is a real, cheap
# interoperability hedge: government and enterprise SOAP servers are
# frequently non-spec-compliant in practice and sometimes parse prefixes
# literally rather than resolving namespaces properly. Zero downside to
# using the conventional names every real-world example (including the
# EC's own document) implies.
ET.register_namespace("soap", _SOAP_ENV_NS)
ET.register_namespace("wsse", _WSSE_NS)
ET.register_namespace("wsu", _WSU_NS)

# Per the EC's own document: a WS-Security Timestamp for this system
# cannot be valid for more than 1 minute from creation.
_TIMESTAMP_VALIDITY_SECONDS: Final[int] = 60


def _iso8601_now() -> str:
    """UTC timestamp in the millisecond-precision ISO8601 form WS-Security expects."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def _build_password_digest(authentication_key: str, nonce_bytes: bytes, created: str) -> str:
    """
    The standard OASIS WS-Security UsernameToken Profile 1.0 password
    digest: Base64(SHA-1(nonce + created + password)) — concatenated as
    raw bytes (the *decoded* nonce, not its base64 text form; the UTF-8
    bytes of the created timestamp string; the UTF-8 bytes of the
    authentication key), then SHA-1 hashed, then the resulting hash
    (not the inputs) is base64-encoded. This exact formula is what the
    EC's own conformance-test document specifies for TRACES NT.
    """
    digest_input = nonce_bytes + created.encode("utf-8") + authentication_key.encode("utf-8")
    digest = hashlib.sha1(digest_input).digest()  # noqa: S324 — SHA-1 is what TRACES NT's own spec mandates, not our choice
    return base64.b64encode(digest).decode("ascii")


def build_ws_security_header(username: str, authentication_key: str) -> ET.Element:
    """
    Build the WS-Security SOAP header element exactly as the EC's
    conformance-test document specifies: a UsernameToken (Username,
    base64 Nonce, Created, digested Password) plus a Timestamp
    (Created/Expires, max 1 minute validity).
    """
    nonce_bytes = os.urandom(16)
    nonce_b64 = base64.b64encode(nonce_bytes).decode("ascii")
    created = _iso8601_now()
    expires_dt = datetime.strptime(created, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
        tzinfo=timezone.utc
    ) + timedelta(seconds=_TIMESTAMP_VALIDITY_SECONDS)
    expires = expires_dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{expires_dt.microsecond // 1000:03d}Z"

    password_digest = _build_password_digest(authentication_key, nonce_bytes, created)

    security = ET.Element(f"{{{_WSSE_NS}}}Security")
    security.set(f"{{{_SOAP_ENV_NS}}}mustUnderstand", "1")

    timestamp = ET.SubElement(security, f"{{{_WSU_NS}}}Timestamp")
    ET.SubElement(timestamp, f"{{{_WSU_NS}}}Created").text = created
    ET.SubElement(timestamp, f"{{{_WSU_NS}}}Expires").text = expires

    token = ET.SubElement(security, f"{{{_WSSE_NS}}}UsernameToken")
    ET.SubElement(token, f"{{{_WSSE_NS}}}Username").text = username
    password_el = ET.SubElement(token, f"{{{_WSSE_NS}}}Password")
    password_el.set("Type", _PASSWORD_DIGEST_TYPE)
    password_el.text = password_digest
    nonce_el = ET.SubElement(token, f"{{{_WSSE_NS}}}Nonce")
    nonce_el.set("EncodingType", _ENCODING_TYPE_BASE64)
    nonce_el.text = nonce_b64

    return security


def build_soap_envelope(
    *,
    username: str,
    authentication_key: str,
    web_service_client_id: str,
    body_element: ET.Element,
) -> str:
    """
    Wrap a SOAP body element (e.g. the DdsSubmissionRequest content from
    `xml_generator.generate_traces_xml`) in a complete SOAP envelope with
    the WS-Security header and the required WebServiceClientId tag.
    """
    envelope = ET.Element(f"{{{_SOAP_ENV_NS}}}Envelope")
    header = ET.SubElement(envelope, f"{{{_SOAP_ENV_NS}}}Header")
    header.append(build_ws_security_header(username, authentication_key))

    client_id_el = ET.SubElement(header, "WebServiceClientId")
    client_id_el.text = web_service_client_id

    body = ET.SubElement(envelope, f"{{{_SOAP_ENV_NS}}}Body")
    body.append(body_element)

    return ET.tostring(envelope, encoding="unicode")


async def _send_soap_request(
    settings: Settings, http_client: httpx.AsyncClient, endpoint: str, envelope_xml: str
) -> httpx.Response:
    """Shared transport for any TRACES NT SOAP call — echo or submission alike."""
    try:
        response = await http_client.post(
            endpoint,
            content=envelope_xml.encode("utf-8"),
            headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": ""},
            timeout=settings.TRACES_REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.RequestError as exc:
        raise TracesSubmissionError(f"Network error calling TRACES NT: {exc}") from exc

    if response.status_code != 200:
        # A SOAP Fault is real, meaningful diagnostic content — surface it,
        # don't discard it (the exact mistake that cost real debugging
        # time with the GFW integration earlier in this project).
        raise TracesSubmissionError(f"TRACES NT returned HTTP {response.status_code}: {response.text[:1000]}")

    return response


async def submit_dds_to_traces(
    settings: Settings,
    http_client: httpx.AsyncClient,
    dds_request_element: ET.Element,
) -> dict[str, Any]:
    """
    Submit a DDS to TRACES NT over SOAP. Raises `TracesNotConfiguredError`
    if real credentials aren't set (see Settings' TRACES_* fields), or
    `TracesSubmissionError` on any HTTP-level or SOAP Fault failure.

    Returns the parsed response on success — in practice this cannot be
    fully specified without a real server to observe a real success
    response from; see this module's docstring.
    """
    if not settings.traces_nt_configured:
        raise TracesNotConfiguredError()

    envelope_xml = build_soap_envelope(
        username=settings.TRACES_USERNAME,  # type: ignore[arg-type]  # guaranteed non-None by traces_nt_configured
        authentication_key=settings.TRACES_AUTHENTICATION_KEY,  # type: ignore[arg-type]
        web_service_client_id=settings.TRACES_WEB_SERVICE_CLIENT_ID,
        body_element=dds_request_element,
    )
    endpoint = f"{settings.TRACES_BASE_URL.rstrip('/')}/ws/EudrSubmissionServiceV1"
    response = await _send_soap_request(settings, http_client, endpoint, envelope_xml)

    logger.info("TRACES NT submission request completed with HTTP 200 — response parsing is unverified; see module docstring.")
    return {"raw_response": response.text}


async def echo_traces(settings: Settings, http_client: httpx.AsyncClient, message: str = "CanoryAI connectivity test") -> dict[str, Any]:
    """
    The real, EC-recommended FIRST step before ever attempting a DDS
    submission: a basic authenticated "ping" against EudrEchoService.
    The Commission's own conformance-test document frames this as CF
    Test 1's actual first task — "Test connection to a basic Web Service
    of the EUDR system" — specifically so a real integration confirms
    authentication and connectivity work before ever risking a real
    submission. This is genuinely the lowest-risk way to find out whether
    real TRACES NT credentials are actually valid and whether this
    module's SOAP/WS-Security implementation is compatible with the live
    server — something no amount of local testing here can confirm.

    Raises the same `TracesNotConfiguredError` / `TracesSubmissionError`
    as `submit_dds_to_traces`.
    """
    if not settings.traces_nt_configured:
        raise TracesNotConfiguredError()

    echo_body = ET.Element("Echo")
    ET.SubElement(echo_body, "message").text = message

    envelope_xml = build_soap_envelope(
        username=settings.TRACES_USERNAME,  # type: ignore[arg-type]
        authentication_key=settings.TRACES_AUTHENTICATION_KEY,  # type: ignore[arg-type]
        web_service_client_id=settings.TRACES_WEB_SERVICE_CLIENT_ID,
        body_element=echo_body,
    )
    endpoint = f"{settings.TRACES_BASE_URL.rstrip('/')}/ws/EudrEchoService"
    response = await _send_soap_request(settings, http_client, endpoint, envelope_xml)

    logger.info("TRACES NT echo test completed with HTTP 200.")
    return {"raw_response": response.text}
