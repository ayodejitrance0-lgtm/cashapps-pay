from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.routes.auth import CurrentUser, get_current_user
from app.core.database import DatabaseConnection, database_session, execute, fetch_one

router = APIRouter(prefix="/payment-link", tags=["payment-link"])
DatabaseSession = Annotated[DatabaseConnection, Depends(database_session)]
AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]


class PaymentLinkPayload(BaseModel):
    full_name: str = ""
    cashtag: str = ""
    wallet_name: str = ""
    lightning_invoice: str = ""


class PaymentLinkResponse(PaymentLinkPayload):
    updated_at: str | None = None


@router.get("", response_model=PaymentLinkResponse)
def read_payment_link(
    current_user: AuthenticatedUser,
    connection: DatabaseSession,
) -> PaymentLinkResponse:
    row = fetch_one(
        connection,
        """
        SELECT full_name, cashtag, wallet_name, lightning_invoice, updated_at
        FROM payment_links
        WHERE user_id = ?
        """,
        (current_user.id,),
    )

    if row is None:
        return PaymentLinkResponse()

    return PaymentLinkResponse(
        full_name=row["full_name"],
        cashtag=row["cashtag"],
        wallet_name=row["wallet_name"],
        lightning_invoice=row["lightning_invoice"],
        updated_at=row["updated_at"],
    )


@router.put("", response_model=PaymentLinkResponse)
def update_payment_link(
    payload: PaymentLinkPayload,
    current_user: AuthenticatedUser,
    connection: DatabaseSession,
) -> PaymentLinkResponse:
    execute(
        connection,
        """
        INSERT INTO payment_links (
            user_id, full_name, cashtag, wallet_name, lightning_invoice, updated_at
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            full_name = excluded.full_name,
            cashtag = excluded.cashtag,
            wallet_name = excluded.wallet_name,
            lightning_invoice = excluded.lightning_invoice,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            current_user.id,
            payload.full_name,
            payload.cashtag,
            payload.wallet_name,
            payload.lightning_invoice,
        ),
    )
    return read_payment_link(current_user=current_user, connection=connection)
