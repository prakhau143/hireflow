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
from app.models.smtp import SmtpConfig
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut
from app.utils.auth import hash_password, verify_password, create_token, get_current_user
from app.utils.encryption import decrypt_password
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


async def _find_smtp(email: str, db: AsyncSession) -> SmtpConfig | None:
    """Return SMTP config: try user's own first, fall back to any admin config."""
    user_res = await db.execute(select(User).where(User.email == email))
    user = user_res.scalar_one_or_none()

    if user:
        res = await db.execute(
            select(SmtpConfig).where(SmtpConfig.user_id == user.id).limit(1)
        )
        smtp = res.scalar_one_or_none()
        if smtp:
            return smtp

    # Fallback: use admin's SMTP
    admin_res = await db.execute(select(User).where(User.role == "admin").limit(1))
    admin = admin_res.scalar_one_or_none()
    if admin:
        res = await db.execute(
            select(SmtpConfig).where(SmtpConfig.user_id == admin.id).limit(1)
        )
        return res.scalar_one_or_none()

    return None


def _send_otp_email(smtp: SmtpConfig, to_email: str, name: str, otp: str) -> None:
    password = decrypt_password(smtp.password_encrypted)
    context = ssl.create_default_context()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "HireFlow — Your Password Reset OTP"
    msg["From"] = f"{smtp.from_name} <{smtp.from_email}>"
    msg["To"] = to_email

    html = f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">HireFlow <span style="font-size:13px;font-weight:400;opacity:.7;">AI</span></h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:rgba(255,255,255,0.7);margin:0 0 8px;">Hi <strong style="color:#fff;">{name}</strong>,</p>
            <p style="color:rgba(255,255,255,0.5);margin:0 0 24px;font-size:14px;">
              We received a request to reset your HireFlow password. Use the OTP below:
            </p>
            <div style="background:#0a0f1e;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
              <span style="font-size:40px;font-weight:800;letter-spacing:14px;color:#818cf8;">{otp}</span>
            </div>
            <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0;">
              ⏱ This OTP is valid for <strong style="color:rgba(255,255,255,0.6);">10 minutes</strong>.
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.05);">
            <p style="color:rgba(255,255,255,0.2);font-size:12px;margin:0;">
              Sent by HireFlow AI · Do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""
    msg.attach(MIMEText(html, "html"))

    if smtp.encryption == "SSL":
        server = smtplib.SMTP_SSL(smtp.host, smtp.port, context=context, timeout=15)
    else:
        server = smtplib.SMTP(smtp.host, smtp.port, timeout=15)
        if smtp.encryption == "TLS":
            server.starttls(context=context)

    server.login(smtp.username, password)
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
    """Generate OTP and send to user's email via their SMTP config (or admin's)."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Always return same message — don't reveal whether email exists
    if not user:
        return {"message": "If that email is registered, an OTP has been sent."}

    smtp = await _find_smtp(body.email, db)
    if not smtp:
        raise HTTPException(
            status_code=503,
            detail="Email service not configured. Ask your admin to set up an SMTP account first.",
        )

    otp = _make_otp()
    _otp_store[body.email] = {
        "otp": otp,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "verified": False,
    }

    try:
        _send_otp_email(smtp, user.email, user.name, otp)
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

    # Mark verified so reset-password endpoint can trust it
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
    """Set new password using the reset_token from verify-otp."""
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
