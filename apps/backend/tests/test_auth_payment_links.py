import importlib

from fastapi.testclient import TestClient


def test_signup_signin_and_payment_link(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("BACKEND_DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("BACKEND_SECRET_KEY", "test-secret")

    import app.core.config as config
    import app.main as main

    config.get_settings.cache_clear()
    importlib.reload(main)

    client = TestClient(main.app)

    payload = {"email": "receiver@example.com", "password": "strongpass123"}
    signup_response = client.post("/api/auth/signup", json=payload)
    assert signup_response.status_code == 201
    token = signup_response.json()["access_token"]

    protected_response = client.get("/api/payment-link")
    assert protected_response.status_code == 401

    headers = {"Authorization": f"Bearer {token}"}
    link_payload = {
        "full_name": "Receiver",
        "cashtag": "$receiver",
        "wallet_name": "Cash App Bitcoin",
        "lightning_invoice": "lnbc1testinvoice",
    }
    update_response = client.put("/api/payment-link", json=link_payload, headers=headers)
    assert update_response.status_code == 200
    assert update_response.json()["lightning_invoice"] == "lnbc1testinvoice"

    signin_response = client.post("/api/auth/signin", json=payload)
    assert signin_response.status_code == 200
    signin_token = signin_response.json()["access_token"]

    read_response = client.get(
        "/api/payment-link",
        headers={"Authorization": f"Bearer {signin_token}"},
    )
    assert read_response.status_code == 200
    assert read_response.json()["cashtag"] == "$receiver"
