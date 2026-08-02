"""
API key generation, hashing, and format detection.

Kept as pure, dependency-free functions (no DB access here — that lives
in the route handlers and `app/core/auth.py`) so the cryptographic shape
of a key is defined in exactly one place.
"""

from __future__ import annotations

import hashlib
import secrets

KEY_PREFIX = "cnry_live_"
# Shown in the UI so a user can identify a key without ever seeing the
# full value again — long enough to be useful, short enough to reveal
# nothing about the secret portion.
DISPLAY_PREFIX_LENGTH = len(KEY_PREFIX) + 8


def generate_api_key() -> str:
    """
    A new, cryptographically random plaintext API key, e.g.
    `cnry_live_Xy9fQ2b7mK...`. `secrets.token_urlsafe` (not `random` or
    `uuid4`) specifically — it's generated from `os.urandom`, the
    standard library's own recommendation for security tokens.
    """
    return f"{KEY_PREFIX}{secrets.token_urlsafe(32)}"


def hash_api_key(plaintext_key: str) -> str:
    """
    Hex-encoded SHA-256 hash of a plaintext key, for storage and lookup.
    Plain SHA-256 (not bcrypt/argon2) is the right choice here — unlike a
    user-chosen password, an API key is already 256 bits of true random
    entropy, so it isn't vulnerable to dictionary/rainbow-table attacks
    the way a password hash needs to defend against; a fast, deterministic
    hash is exactly what's needed for an equality-lookup-by-hash query.
    """
    return hashlib.sha256(plaintext_key.encode("utf-8")).hexdigest()


def display_prefix(plaintext_key: str) -> str:
    """The truncated, safe-to-store-and-display portion of a key."""
    return plaintext_key[:DISPLAY_PREFIX_LENGTH]


def looks_like_api_key(token: str) -> bool:
    """
    Distinguishes an API key from a Supabase JWT at the HTTP layer, before
    any parsing/verification — a JWT is three dot-separated base64url
    segments and never starts with this prefix, so this check is cheap
    and unambiguous.
    """
    return token.startswith(KEY_PREFIX)
