import sqlite3
from collections.abc import Iterator
from pathlib import Path

from app.core.config import get_settings


def get_database_path() -> Path:
    configured_path = Path(get_settings().database_path)
    if configured_path.is_absolute():
        return configured_path
    return Path.cwd() / configured_path


def get_connection() -> sqlite3.Connection:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS payment_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                full_name TEXT NOT NULL DEFAULT '',
                cashtag TEXT NOT NULL DEFAULT '',
                wallet_name TEXT NOT NULL DEFAULT '',
                lightning_invoice TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )


def database_session() -> Iterator[sqlite3.Connection]:
    with get_connection() as connection:
        yield connection
