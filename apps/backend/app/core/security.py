import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import HTTPException, status

from app.core.config import get_settings

token_duration_seconds = 60 * 60 * 8


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt.encode("utf-8"),
        210_000,
    )
    return digest.hex(), password_salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    candidate_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(candidate_hash, password_hash)


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_access_token(user_id: int, email: str) -> str:
    payload = {
        "email": email,
        "exp": int(time.time()) + token_duration_seconds,
        "sub": str(user_id),
    }
    encoded_payload = _base64url_encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    signature = hmac.new(
        get_settings().secret_key.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_base64url_encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        ) from exc

    expected_signature = hmac.new(
        get_settings().secret_key.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    if not hmac.compare_digest(_base64url_encode(expected_signature), encoded_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )

    payload = json.loads(_base64url_decode(encoded_payload))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication session has expired.",
        )

    return payload
