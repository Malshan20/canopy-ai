import Link from "next/link";
import type { Metadata } from "next";
import { ContentPageLayout } from "@/components/marketing/content-page-layout";
import { APP_NAME, API_BASE_URL } from "@/constants/config";

export const metadata: Metadata = {
  title: "API Documentation",
  description: `Reference documentation for the ${APP_NAME} REST API — authentication, shipments, webhooks, and organization management.`,
  alternates: { canonical: "/api-docs" },
};

export default function ApiDocsPage() {
  return (
    <ContentPageLayout eyebrow="Developers" title="API Documentation" lastUpdated="July 11, 2026">
      <p>
        The {APP_NAME} API lets you upload shipments, retrieve compliance results, and manage your
        organization programmatically. Every endpoint below is available on Enterprise and Custom-tier
        plans; Growth-tier organizations can request API access from their account team.
      </p>

      <h2>Base URL</h2>
      <pre>
        <code>{API_BASE_URL}/api/v1</code>
      </pre>

      <h2>Authentication</h2>
      <p>
        Authenticate requests with an API key in the <code>Authorization</code> header, as a Bearer
        token:
      </p>
      <pre>
        <code>Authorization: Bearer cnry_live_...</code>
      </pre>
      <p>
        Create and manage API keys from <strong>Settings → API Keys</strong> in the dashboard. The
        plaintext key is shown exactly once, at creation — store it securely; {APP_NAME} never stores
        or displays it again. Revoking a key takes effect immediately, on its very next request.
      </p>
      <p>
        API requests are rate-limited per key. If you exceed the limit, you&apos;ll receive a{" "}
        <code>429</code> response — back off and retry after a short delay.
      </p>

      <h2>Errors</h2>
      <p>Errors return a JSON body with a machine-readable error type and a human-readable message:</p>
      <pre>
        <code>{`{
  "error": "InsufficientRoleError",
  "detail": "Only owners and admins can change the organization's plan."
}`}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>400</code>
            </td>
            <td>Invalid request, or a shipment doesn&apos;t yet meet compliance requirements for the requested action</td>
          </tr>
          <tr>
            <td>
              <code>401</code>
            </td>
            <td>Missing or invalid credentials</td>
          </tr>
          <tr>
            <td>
              <code>403</code>
            </td>
            <td>Authenticated, but not authorized for this specific action (role or approval requirement)</td>
          </tr>
          <tr>
            <td>
              <code>404</code>
            </td>
            <td>Resource not found, or not visible to your organization</td>
          </tr>
          <tr>
            <td>
              <code>429</code>
            </td>
            <td>Rate limit exceeded</td>
          </tr>
        </tbody>
      </table>

      <h2>Shipments</h2>

      <h3>Upload a shipment</h3>
      <pre>
        <code>{`POST /api/v1/shipments/upload-zip
Content-Type: multipart/form-data

file: shipment.zip
total_declared_weight_kg: 12500`}</code>
      </pre>
      <p>
        Upload a ZIP archive of supplier documents for synchronous processing — the response includes
        every document&apos;s extracted data, satellite verification, and the shipment&apos;s overall
        compliance summary. For high-volume integrations, use the async variant below instead so a
        large upload doesn&apos;t hold your connection open.
      </p>

      <h3>Upload a shipment asynchronously</h3>
      <pre>
        <code>POST /api/v1/shipments/upload-zip-async</code>
      </pre>
      <p>
        Same inputs as above, but returns immediately with a job ID for priority-queue processing.
        Poll <code>GET /api/v1/shipments/jobs/{"{job_id}"}</code> for status.
      </p>

      <h3>List shipments</h3>
      <pre>
        <code>GET /api/v1/shipments</code>
      </pre>

      <h3>Get a shipment&apos;s full result</h3>
      <pre>
        <code>GET /api/v1/shipments/{"{shipment_id}"}</code>
      </pre>

      <h3>Generate the DDS XML</h3>
      <pre>
        <code>{`GET /api/v1/shipments/{shipment_id}/xml
  ?operator_name=Acme+Imports+Ltd
  &operator_eori=GB123456789000
  &hs_code=09012100`}</code>
      </pre>
      <p>
        Operator name, EORI, and HS code are required as query parameters — these are supplied by a
        human at export time by design, not extracted by AI (see our{" "}
        <Link href="/eudr-guide">EUDR guide</Link> for why). If your organization requires export sign-off
        (the default), this returns <code>403</code> until the shipment has been approved via the
        endpoint below.
      </p>

      <h3>Approve a shipment for export</h3>
      <pre>
        <code>{`GET  /api/v1/shipments/{shipment_id}/export-approval
POST /api/v1/shipments/{shipment_id}/export-approval`}</code>
      </pre>
      <p>Requires the owner, admin, or compliance manager role.</p>

      <h3>Shipment audit trail</h3>
      <pre>
        <code>GET /api/v1/shipments/{"{shipment_id}"}/audit-trail</code>
      </pre>

      <h2>Organizations</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GET /api/v1/organizations/me</code>
            </td>
            <td>Your organization&apos;s profile, plan, and usage</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/v1/organizations/me/memberships</code>
            </td>
            <td>Every organization you belong to</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/v1/organizations/me/members</code>
            </td>
            <td>Team members in your organization</td>
          </tr>
          <tr>
            <td>
              <code>POST /api/v1/organizations/me/members</code>
            </td>
            <td>Add a team member by email — invites them if they don&apos;t have an account yet</td>
          </tr>
          <tr>
            <td>
              <code>PATCH /api/v1/organizations/me/plan</code>
            </td>
            <td>Change your organization&apos;s plan (owner/admin only)</td>
          </tr>
          <tr>
            <td>
              <code>PATCH /api/v1/organizations/me/export-approval-setting</code>
            </td>
            <td>Turn mandatory export sign-off on or off (owner/admin only)</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/v1/organizations/me/summary</code>
            </td>
            <td>Dashboard summary cards</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/v1/organizations/me/compliance-overview</code>
            </td>
            <td>Compliance page overview</td>
          </tr>
        </tbody>
      </table>

      <h2>Webhooks</h2>
      <p>
        Register a webhook to be notified when a shipment finishes processing, instead of polling.
      </p>
      <pre>
        <code>{`POST /api/v1/webhooks
{
  "url": "https://your-erp.example.com/webhooks/canoryai"
}`}</code>
      </pre>
      <p>
        The response includes a signing secret, shown exactly once — use it to verify the{" "}
        <code>X-CanoryAI-Signature</code> header on every delivered payload (HMAC-SHA256 of the raw
        request body).
      </p>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GET /api/v1/webhooks</code>
            </td>
            <td>List your organization&apos;s webhooks (never includes the signing secret)</td>
          </tr>
          <tr>
            <td>
              <code>DELETE /api/v1/webhooks/{"{webhook_id}"}</code>
            </td>
            <td>Delete a webhook</td>
          </tr>
        </tbody>
      </table>

      <h2>Notifications</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GET /api/v1/notifications</code>
            </td>
            <td>List notifications and unread count</td>
          </tr>
          <tr>
            <td>
              <code>PATCH /api/v1/notifications/{"{id}"}/read</code>
            </td>
            <td>Mark one notification read</td>
          </tr>
          <tr>
            <td>
              <code>POST /api/v1/notifications/mark-all-read</code>
            </td>
            <td>Mark every notification read</td>
          </tr>
        </tbody>
      </table>

      <h2>Audit trail</h2>
      <pre>
        <code>GET /api/v1/audit-trail</code>
      </pre>
      <p>Your organization&apos;s complete, chronological compliance audit trail, newest first.</p>

      <hr />

      <p>
        Questions or need higher rate limits for your integration? Contact{" "}
        <a href="mailto:support@canoryai.example">support@canoryai.example</a>.
      </p>
    </ContentPageLayout>
  );
}
