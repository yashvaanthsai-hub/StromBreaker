import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker


# --------------------------------------------------
# Database URL
# --------------------------------------------------

raw_db_url = os.getenv(
    "DATABASE_URL",
    "sqlite:///./veritas.db"
).strip()


# Support legacy PostgreSQL connection URLs
if raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace(
        "postgres://",
        "postgresql://",
        1
    )


DATABASE_URL = raw_db_url


# --------------------------------------------------
# Detect database type
# --------------------------------------------------

is_sqlite = DATABASE_URL.startswith("sqlite")


# --------------------------------------------------
# SQLAlchemy Engine Configuration
# --------------------------------------------------

engine_kwargs = {
    "echo": False
}


if is_sqlite:

    # SQLite configuration
    engine_kwargs["connect_args"] = {
        "check_same_thread": False
    }

else:

    # PostgreSQL configuration
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

    # Keep connection pool reasonable for serverless
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 5


# --------------------------------------------------
# Create Engine
# --------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs
)


# --------------------------------------------------
# SQLite Configuration
# --------------------------------------------------

if is_sqlite:

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(
        dbapi_connection,
        connection_record
    ):
        cursor = dbapi_connection.cursor()

        # Enable Write-Ahead Logging
        cursor.execute("PRAGMA journal_mode=WAL;")

        # Enable foreign key constraints
        cursor.execute("PRAGMA foreign_keys=ON;")

        # Wait up to 5 seconds if database is locked
        cursor.execute("PRAGMA busy_timeout=5000;")

        cursor.close()


# --------------------------------------------------
# Session
# --------------------------------------------------

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)
# --------------------------------------------------
# Base Model
# --------------------------------------------------

Base = declarative_base()

# --------------------------------------------------
# Database Dependency
# --------------------------------------------------

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()
