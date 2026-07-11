from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import random
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut
from app.utils.auth import hash_password, verify_password, create_token, get_current_user
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory OTP store — {email: {otp, expires_at, verified}}
_otp_store: dict[str, dict] = {}


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


def _send_otp_email(to_email: str, name: str, otp: str) -> None:
    """Send OTP using system SMTP credentials from .env (SMTP_USER / SMTP_PASS)."""
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        raise RuntimeError(
            "System SMTP not configured. Set SMTP_USER and SMTP_PASS in the backend .env file."
        )

    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    context = ssl.create_default_context()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "HireFlow — Your Password Reset OTP"
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{from_addr}>"
    msg["To"] = to_email

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#111827;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
              HireFlow <span style="font-size:13px;font-weight:400;opacity:.7;">AI</span>
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">
              Hi <strong style="color:#fff;">{name}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.5);margin:0 0 24px;font-size:14px;">
              We received a request to reset your HireFlow password. Use the OTP below:
            </p>
            <div style="background:#0a0f1e;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
              <span style="font-size:40px;font-weight:800;letter-spacing:14px;color:#818cf8;">{otp}</span>
            </div>
            <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0;">
              This OTP is valid for <strong style="color:rgba(255,255,255,0.6);">10 minutes</strong>.
              If you didn't request a password reset, ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.05);">
            <p style="color:rgba(255,255,255,0.2);font-size:12px;margin:0;">
              Sent by HireFlow AI &middot; Do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    msg.attach(MIMEText(html, "html"))

    if settings.SMTP_ENCRYPTION == "SSL":
        server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=15)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        if settings.SMTP_ENCRYPTION == "TLS":
            server.starttls(context=context)

    server.login(settings.SMTP_USER, settings.SMTP_PASS)
    server.send_message(msg)
    server.quit()


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

    return TokenResponse(
        access_token=create_token(user.id, user.role),
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password or ""):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_token(user.id, user.role),
        user_id=user.id,
        name=user.name,
        role=user.role,
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Generate a 6-digit OTP and send it via the system SMTP configured in .env."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Always return the same message — don't reveal whether email exists
    if not user:
        return {"message": "If that email is registered, an OTP has been sent."}

    otp = _make_otp()
    _otp_store[body.email] = {
        "otp": otp,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "verified": False,
    }

    try:
        _send_otp_email(user.email, user.name, otp)
    except RuntimeError as e:
        _otp_store.pop(body.email, None)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        _otp_store.pop(body.email, None)
        raise HTTPException(status_code=502, detail=f"Failed to send email: {str(e)}")

    return {"message": "If that email is registered, an OTP has been sent."}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOTPRequest):
    """Verify the 6-digit OTP. Returns a short-lived reset_token on success."""
    entry = _otp_store.get(body.email)
    if not entry:
        raise HTTPException(status_code=400, detail="No OTP requested for this email. Request a new one.")

    if datetime.now(timezone.utc) > entry["expires_at"]:
        _otp_store.pop(body.email, None)
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if entry["otp"] != body.otp.strip():
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")

    _otp_store[body.email]["verified"] = True

    reset_token = jwt.encode(
        {
            "sub": body.email,
            "type": "pwd_reset",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return {"reset_token": reset_token, "message": "OTP verified successfully."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Set a new password using the reset_token from /verify-otp."""
    try:
        payload = jwt.decode(body.reset_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "pwd_reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
        email: str = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")

    if not _otp_store.get(email, {}).get("verified"):
        raise HTTPException(status_code=400, detail="OTP not verified. Start over.")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    await db.commit()

    _otp_store.pop(email, None)
    return {"message": "Password reset successful. You can now log in."}
