import sqlite3
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from app.core.config import get_settings

DatabaseConnection = Any


def uses_postgres() -> bool:
    return bool(get_settings().database_url.strip())


def get_database_path() -> Path:
    configured_path = Path(get_settings().database_path)
    if configured_path.is_absolute():
        return configured_path
    return Path.cwd() / configured_path


def get_connection() -> DatabaseConnection:
    settings = get_settings()
    if settings.database_url:
        from psycopg import connect
        from psycopg.rows import dict_row

        return connect(settings.database_url, row_factory=dict_row)

    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def format_sql(sql: str) -> str:
    if uses_postgres():
        return sql.replace("?", "%s")
    return sql


def fetch_one(
    connection: DatabaseConnection,
    sql: str,
    params: tuple[Any, ...] = (),
) -> Any:
    return connection.execute(format_sql(sql), params).fetchone()


def execute(
    connection: DatabaseConnection,
    sql: str,
    params: tuple[Any, ...] = (),
) -> Any:
    return connection.execute(format_sql(sql), params)


def insert_user(
    connection: DatabaseConnection,
    email: str,
    password_hash: str,
    salt: str,
) -> int:
    if uses_postgres():
        row = fetch_one(
            connection,
            """
            INSERT INTO users (email, password_hash, salt)
            VALUES (?, ?, ?)
            RETURNING id
            """,
            (email, password_hash, salt),
        )
        return int(row["id"])

    cursor = execute(
        connection,
        "INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)",
        (email, password_hash, salt),
    )
    return int(cursor.lastrowid)


def is_unique_error(exc: Exception) -> bool:
    return isinstance(exc, sqlite3.IntegrityError) or exc.__class__.__name__ == "UniqueViolation"


def initialize_database() -> None:
    with get_connection() as connection:
        if uses_postgres():
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS payment_links (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                    full_name TEXT NOT NULL DEFAULT '',
                    cashtag TEXT NOT NULL DEFAULT '',
                    wallet_name TEXT NOT NULL DEFAULT '',
                    lightning_invoice TEXT NOT NULL DEFAULT '',
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            return

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


def database_session() -> Iterator[DatabaseConnection]:
    with get_connection() as connection:
        yield connection
