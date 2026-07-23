from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from app.config import settings
import sqlite3


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Enable WAL mode + foreign keys for SQLite
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragmas(dbapi_conn, _):
    if isinstance(dbapi_conn, sqlite3.Connection):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def _auto_migrate(sync_conn):
    """SQLite-safe additive migration: add any model columns missing from existing tables."""
    from sqlalchemy import inspect, text
    inspector = inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing_cols:
                continue
            col_type = col.type.compile(sync_conn.dialect)
            sync_conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}'))
            print(f"[DB] Migrated: added {table.name}.{col.name} ({col_type})")


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_auto_migrate)
