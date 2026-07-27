#!/usr/bin/env python3
"""
Create admin user script - Run this to set up the initial admin account.
Usage: python create_admin.py
"""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select
from app.database import AsyncSessionLocal, create_tables
from app.models.user import User
from app.utils.auth import hash_password


async def create_admin_user():
    """Create the admin user with specified credentials."""
    await create_tables()
    
    async with AsyncSessionLocal() as db:
        # Check if admin already exists
        result = await db.execute(
            select(User).where(User.email == "mittalprakhar504@gmail.com")
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"Admin user already exists: {existing_user.email}")
            print(f"Current role: {existing_user.role}")
            
            # Update to admin if not already
            if existing_user.role != "admin":
                existing_user.role = "admin"
                await db.commit()
                print("✓ Updated user role to admin")
            else:
                print("✓ User is already admin")
            
            # Update password if needed
            new_password = input("Enter new password (or press Enter to skip): ").strip()
            if new_password:
                existing_user.hashed_password = hash_password(new_password)
                await db.commit()
                print("✓ Password updated")
            
            return existing_user
        
        # Create new admin user
        password = input("Enter admin password: ").strip()
        if not password:
            print("Password is required!")
            sys.exit(1)
        
        if len(password) < 8:
            print("Password must be at least 8 characters!")
            sys.exit(1)
        
        admin = User(
            name="Prakhar Mittal",
            email="mittalprakhar504@gmail.com",
            hashed_password=hash_password(password),
            role="admin",
            is_active=True,
            onboarding_complete=True,
        )
        
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        
        print(f"✓ Admin user created successfully!")
        print(f"  Email: {admin.email}")
        print(f"  Role: {admin.role}")
        print(f"  ID: {admin.id}")
        print("\nYou can now log in with these credentials.")
        
        return admin


if __name__ == "__main__":
    print("=== HireFlow Admin User Setup ===\n")
    asyncio.run(create_admin_user())
