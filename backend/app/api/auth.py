from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import random

from app.database import get_db
from app.models.user import User
from app.models.password_reset_otp import PasswordResetOTP
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut
from app.utils.auth import hash_password, verify_password, create_token, get_current_user
from app.services.system_email_service import send_system_email
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# Forgot-password tuning — matches HireFlow's professional OTP policy
OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_PER_HOUR = 5


# ── Pydantic models ────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_otp() -> str:
    return str(random.randint(100000, 999999))


async def _send_otp_email(db: AsyncSession, to_email: str, name: str, otp: str) -> None:
    """Send OTP using SYSTEM SMTP credentials from .env (SMTP_USER / SMTP_PASS) —
    never the user's own configured SMTP (that's reserved for job-application
    emails only; see app/services/application_service.py). Content lives in the
    DB-editable 'password_reset_otp' system email template."""
    await send_system_email(db, "password_reset_otp", to_email, {
        "name": name,
        "otp_spaced": " ".join(otp),  # visually group the digits without changing the value
        "expiry_minutes": OTP_EXPIRY_MINUTES,
    })


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    try:
        await send_system_email(db, "welcome", user.email, {"name": user.name})
    except Exception as e:
        print(f"[Auth] welcome email failed for {user.email}: {e}")  # best-effort — never block registration

    return TokenResponse(
        access_token=create_token(user.id, user.role, user.token_version),
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        print(f"[Login] User not found: {body.email}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(body.password, user.hashed_password or ""):
        print(f"[Login] Invalid password for: {body.email}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended — contact the administrator")

    from datetime import datetime, timezone
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    return TokenResponse(
        access_token=create_token(user.id, user.role, user.token_version),
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate a 6-digit OTP (hashed at rest), rate-limited and cooldown-gated,
    sent only via System SMTP — never the user's own SMTP configuration."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Always return the same message — don't reveal whether email exists
    if not user:
        return {"message": "If that email is registered, an OTP has been sent."}

    now = datetime.now(timezone.utc)

    # Resend cooldown — 60s since the last OTP issued to this user
    last = (await db.execute(
        select(PasswordResetOTP).where(PasswordResetOTP.user_id == user.id)
        .order_by(PasswordResetOTP.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if last:
        last_created = last.created_at.replace(tzinfo=timezone.utc) if last.created_at.tzinfo is None else last.created_at
        elapsed = (now - last_created).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            wait = int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)
            raise HTTPException(status_code=429, detail=f"Please wait {wait}s before requesting another OTP.")

    # Rate limit — max 5 OTPs per hour per user
    hour_ago = now - timedelta(hours=1)
    recent_count = (await db.execute(
        select(func.count(PasswordResetOTP.id)).where(
            PasswordResetOTP.user_id == user.id, PasswordResetOTP.created_at >= hour_ago
        )
    )).scalar() or 0
    if recent_count >= OTP_MAX_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please try again in an hour.")

    otp = _make_otp()
    otp_row = PasswordResetOTP(
        user_id=user.id, email=user.email, otp_hash=hash_password(otp),
        expires_at=now + timedelta(minutes=OTP_EXPIRY_MINUTES),
        ip_address=request.client.host if request.client else None,
    )
    db.add(otp_row)

    try:
        await _send_otp_email(db, user.email, user.name, otp)
    except RuntimeError as e:
        await db.rollback()
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        await db.rollback()
        err_lower = str(e).lower()
        if "535" in str(e) or "5.7.8" in str(e) or "badcredentials" in err_lower or "authentication" in err_lower:
            raise HTTPException(
                status_code=502,
                detail=(
                    "System email account rejected the App Password (Gmail 535 error). "
                    "This is the platform's own SMTP_USER/SMTP_PASS in backend/.env, not your personal "
                    "SMTP settings — an admin needs to generate a fresh Gmail App Password "
                    "(myaccount.google.com → Security → App Passwords) and update backend/.env."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Failed to send email: {str(e)}")

    await db.commit()
    return {"message": "If that email is registered, an OTP has been sent.",
            "resend_after_seconds": OTP_RESEND_COOLDOWN_SECONDS}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    """Verify the 6-digit OTP against its hash. Max 5 attempts per code."""
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="No OTP requested for this email. Request a new one.")

    entry = (await db.execute(
        select(PasswordResetOTP).where(
            PasswordResetOTP.user_id == user.id, PasswordResetOTP.used.is_(False)
        ).order_by(PasswordResetOTP.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=400, detail="No OTP requested for this email. Request a new one.")

    now = datetime.now(timezone.utc)
    expires_at = entry.expires_at.replace(tzinfo=timezone.utc) if entry.expires_at.tzinfo is None else entry.expires_at
    if now > expires_at:
        entry.used = True
        await db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if entry.attempts >= OTP_MAX_ATTEMPTS:
        entry.used = True
        await db.commit()
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new OTP.")

    if not verify_password(body.otp.strip(), entry.otp_hash):
        entry.attempts += 1
        remaining = OTP_MAX_ATTEMPTS - entry.attempts
        await db.commit()
        if remaining <= 0:
            entry.used = True
            await db.commit()
            raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new OTP.")
        raise HTTPException(status_code=400, detail=f"Incorrect OTP. {remaining} attempt{'s' if remaining != 1 else ''} remaining.")

    entry.verified = True
    await db.commit()

    reset_token = jwt.encode(
        {
            "sub": body.email,
            "otp_id": entry.id,
            "type": "pwd_reset",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return {"reset_token": reset_token, "message": "OTP verified successfully."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Set a new password using the reset_token from /verify-otp. Invalidates all
    existing sessions (token_version bump) since the credential just changed."""
    try:
        payload = jwt.decode(body.reset_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "pwd_reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
        email: str = payload["sub"]
        otp_id: str | None = payload.get("otp_id")
    except JWTError:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")

    if not otp_id:
        raise HTTPException(status_code=400, detail="Invalid reset token")

    entry = (await db.execute(
        select(PasswordResetOTP).where(PasswordResetOTP.id == otp_id, PasswordResetOTP.email == email)
    )).scalar_one_or_none()
    if not entry or not entry.verified:
        raise HTTPException(status_code=400, detail="OTP not verified. Start over.")
    if entry.used:
        raise HTTPException(status_code=400, detail="This reset link has already been used. Please request a new OTP.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    user.token_version = (user.token_version or 0) + 1  # sign out every existing session
    entry.used = True
    await db.commit()

    return {"message": "Password reset successful. You can now log in."}


@router.post("/seed-admin")
async def seed_admin(db: AsyncSession = Depends(get_db)):
    """Seed or update admin account. For deployment setup only."""
    ADMIN_NAME = "Ansh Gupta"
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "ansh.gupta0625@gmail.com")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@1234")

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
    return {
        "message": f"Super admin {action}",
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "role": "admin"
    }
