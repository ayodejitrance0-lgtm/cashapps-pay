from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth_router, health_router, payment_links_router
from app.core.config import get_settings
from app.core.database import initialize_database

settings = get_settings()
initialize_database()

app = FastAPI(
    title="Cash App Payment Link API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(payment_links_router, prefix="/api")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"name": "Cash App Payment Link API", "environment": settings.app_env}
