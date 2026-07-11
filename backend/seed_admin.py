"""Seed a super admin account.

Usage:
    python3 seed_admin.py                       # uses defaults below
    ADMIN_EMAIL=x@y.com ADMIN_PASSWORD=secret python3 seed_admin.py

Idempotent — if the email already exists, it is promoted to admin
and the password is reset.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select

from app.database import AsyncSessionLocal, create_tables
from app.models.user import User
from app.utils.auth import hash_password

ADMIN_NAME = os.getenv("ADMIN_NAME", "Ansh Gupta")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "ansh.gupta0625@gmail.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@1234")


async def seed():
    await create_tables()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        user = result.scalar_one_or_none()

        if user:
            user.role = "admin"
            user.hashed_password = hash_password(ADMIN_PASSWORD)
            user.onboarding_complete = True
            user.is_active = True
            action = "promoted to admin (password reset)"
        else:
            user = User(
                name=ADMIN_NAME,
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                role="admin",
                onboarding_complete=True,
            )
            db.add(user)
            action = "created"

        await db.commit()
        print(f"✅ Super admin {action}")
        print(f"   Email:    {ADMIN_EMAIL}")
        print(f"   Password: {ADMIN_PASSWORD}")
        print(f"   Role:     admin")


if __name__ == "__main__":
    asyncio.run(seed())
