import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.core.database import database_session
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
DatabaseConnection = Annotated[sqlite3.Connection, Depends(database_session)]
AuthorizationHeader = Annotated[str | None, Header()]


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or "." not in normalized.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address.")
        return normalized


class AuthResponse(BaseModel):
    access_token: str
    email: str
    token_type: str = "bearer"


class CurrentUser(BaseModel):
    id: int
    email: str


def get_current_user(
    authorization: AuthorizationHeader = None,
    connection: DatabaseConnection = None,
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in required.",
        )

    token = authorization.split(" ", 1)[1]
    payload = decode_access_token(token)
    user_id = int(payload["sub"])
    row = connection.execute(
        "SELECT id, email FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    return CurrentUser(id=row["id"], email=row["email"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: AuthRequest, connection: DatabaseConnection) -> AuthResponse:
    password_hash, salt = hash_password(payload.password)

    try:
        cursor = connection.execute(
            "INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)",
            (payload.email.lower(), password_hash, salt),
        )
        user_id = cursor.lastrowid
        connection.execute("INSERT INTO payment_links (user_id) VALUES (?)", (user_id,))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists. Sign in instead.",
        ) from exc

    token = create_access_token(user_id=user_id, email=payload.email.lower())
    return AuthResponse(access_token=token, email=payload.email.lower())


@router.post("/signin", response_model=AuthResponse)
def signin(payload: AuthRequest, connection: DatabaseConnection) -> AuthResponse:
    row = connection.execute(
        "SELECT id, email, password_hash, salt FROM users WHERE email = ?",
        (payload.email.lower(),),
    ).fetchone()

    if row is None or not verify_password(payload.password, row["password_hash"], row["salt"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    token = create_access_token(user_id=row["id"], email=row["email"])
    return AuthResponse(access_token=token, email=row["email"])


@router.get("/me", response_model=CurrentUser)
def read_me(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    return current_user
