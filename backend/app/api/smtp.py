from fastapi import APIRouter, Depends, HTTPException, status, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.models.user import User
from app.models.smtp import SmtpConfig
from app.models.smtp_log import SmtpLog
from app.utils.auth import get_current_user
from app.utils.encryption import encrypt_password, decrypt_password
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from email.utils import formataddr, parseaddr
import smtplib
import ssl
import re

router = APIRouter(prefix="/smtp", tags=["smtp"])

# Provider configurations
PROVIDER_CONFIGS = {
    "gmail": {"host": "smtp.gmail.com", "port": 587, "encryption": "TLS"},
    "outlook": {"host": "smtp-mail.outlook.com", "port": 587, "encryption": "TLS"},
    "yahoo": {"host": "smtp.mail.yahoo.com", "port": 587, "encryption": "TLS"},
    "zoho": {"host": "smtp.zoho.com", "port": 587, "encryption": "TLS"},
}

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")

GMAIL_AUTH_GUIDE = (
    "Gmail rejected the App Password. Fix steps:\n"
    "1. Go to myaccount.google.com → Security\n"
    "2. Enable 2-Step Verification (required for App Passwords)\n"
    "3. Search 'App Passwords' → create one for 'Mail'\n"
    "4. Copy the 16-character password Google shows\n"
    "5. Paste that (without spaces) in the Password field here"
)


def _clean_str(v: str | None) -> str:
    return (v or "").strip()


def _clean_password(pw: str | None, provider: str | None) -> str:
    """Strip hidden whitespace. Gmail App Passwords are shown with spaces — remove them all."""
    pw = _clean_str(pw)
    if (provider or "").lower() == "gmail":
        pw = re.sub(r"\s+", "", pw)
    return pw


def _clean_email(value: str | None, fallback: str | None = None) -> str:
    """Extract a bare, valid email from messy input like ' Name <a@b.com> '. Empty string if none."""
    addr = parseaddr(_clean_str(value))[1].strip()
    if EMAIL_RE.match(addr):
        return addr
    fb = parseaddr(_clean_str(fallback))[1].strip()
    return fb if EMAIL_RE.match(fb) else ""


def _open_smtp(host: str, port: int, encryption: str, username: str, password: str):
    """Connect with the correct EHLO → STARTTLS → EHLO → LOGIN sequence, whitespace-safe."""
    host = _clean_str(host)
    username = _clean_str(username)
    password = _clean_str(password)
    context = ssl.create_default_context()
    enc = (encryption or "").upper()

    if enc == "SSL" or int(port) == 465:
        server = smtplib.SMTP_SSL(host, port, context=context, timeout=15)
        server.ehlo()
    else:
        server = smtplib.SMTP(host, port, timeout=15)
        server.ehlo()
        if enc == "TLS":
            server.starttls(context=context)
            server.ehlo()
    server.login(username, password)
    return server


def _classify_smtp_error(e: Exception) -> dict:
    """Map an SMTP exception to a stable error_code + actionable message."""
    if isinstance(e, smtplib.SMTPAuthenticationError):
        return {"error_code": "AUTH_FAILED", "message": GMAIL_AUTH_GUIDE}
    if isinstance(e, smtplib.SMTPSenderRefused):
        return {
            "error_code": "ADDRESS_ERROR",
            "message": (
                f"The server rejected the sender address '{e.sender}'. "
                "Make sure your sender email is a plain address like you@gmail.com — "
                "no display name, brackets, or spaces."
            ),
        }
    if isinstance(e, (smtplib.SMTPRecipientsRefused, smtplib.SMTPDataError)):
        return {
            "error_code": "ADDRESS_ERROR",
            "message": "The server rejected the recipient address. Check it is a plain, valid email like someone@gmail.com.",
        }

    error_msg = str(e)
    err_lower = error_msg.lower()
    if "555" in error_msg or "5.5.2" in error_msg or "syntax" in err_lower:
        return {
            "error_code": "ADDRESS_ERROR",
            "message": (
                "Gmail couldn't parse the sender/recipient address (555 5.5.2 Syntax error). "
                "This happens when the From/To email is empty or malformed. "
                "Re-save your configuration — HireFlow now auto-repairs the sender address — then verify again."
            ),
        }
    if "535" in error_msg or "534" in error_msg or "badcredentials" in err_lower \
            or "username and password" in err_lower or "5.7.8" in error_msg \
            or "authentication" in err_lower or "login" in err_lower:
        return {"error_code": "AUTH_FAILED", "message": GMAIL_AUTH_GUIDE}
    if "tls" in err_lower or "ssl" in err_lower:
        return {"error_code": "TLS_ERROR", "message": "TLS/SSL error. Use port 587 with TLS, or port 465 with SSL."}
    if "timeout" in err_lower or "connection" in err_lower or "refused" in err_lower \
            or "getaddrinfo" in err_lower or "name or service" in err_lower:
        return {"error_code": "CONNECT_FAILED", "message": "Connection failed. Check host and port settings."}
    return {"error_code": "UNKNOWN", "message": f"Connection failed: {error_msg}"}


class SmtpCreate(BaseModel):
    provider: str | None = None
    host: str
    port: int = 587
    encryption: str = "TLS"
    username: str
    password: str
    from_name: str
    from_email: str
    reply_email: str | None = None


class SmtpUpdate(BaseModel):
    provider: str | None = None
    host: str | None = None
    port: int | None = None
    encryption: str | None = None
    username: str | None = None
    password: str | None = None
    from_name: str | None = None
    from_email: str | None = None
    reply_email: str | None = None


class SmtpOut(BaseModel):
    id: str
    provider: str | None
    host: str
    port: int
    encryption: str
    username: str
    from_name: str
    from_email: str
    reply_email: str | None
    is_active: bool
    is_primary: bool
    last_tested: datetime | None
    test_status: str | None
    connection_health: int | None
    last_error: str | None
    emails_sent: int
    emails_failed: int
    last_sent: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TestEmailRequest(BaseModel):
    to_email: str


@router.get("/", response_model=list[SmtpOut])
async def list_smtp(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.user_id == user.id))
    return result.scalars().all()


@router.post("/", response_model=SmtpOut, status_code=status.HTTP_201_CREATED)
async def create_smtp(body: SmtpCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # Auto-fill based on provider
    if body.provider and body.provider in PROVIDER_CONFIGS:
        config = PROVIDER_CONFIGS[body.provider]
        body.host = config["host"]
        body.port = config["port"]
        body.encryption = config["encryption"]

    username = _clean_str(body.username)
    from_email = _clean_email(body.from_email, fallback=username) or _clean_str(body.from_email) or username

    smtp = SmtpConfig(
        user_id=user.id,
        provider=body.provider,
        host=_clean_str(body.host),
        port=body.port,
        encryption=body.encryption,
        username=username,
        password_encrypted=encrypt_password(_clean_password(body.password, body.provider)),
        from_name=_clean_str(body.from_name),
        from_email=from_email,
        reply_email=_clean_str(body.reply_email) or None,
    )
    db.add(smtp)
    await db.commit()
    await db.refresh(smtp)
    
    # Log creation
    log = SmtpLog(
        user_id=user.id,
        smtp_id=smtp.id,
        action="config_updated",
        status="success",
        message="SMTP configuration created"
    )
    db.add(log)
    await db.commit()
    
    return smtp


@router.put("/{smtp_id}", response_model=SmtpOut)
async def update_smtp(smtp_id: str, body: SmtpUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == smtp_id, SmtpConfig.user_id == user.id))
    smtp = result.scalar_one_or_none()
    if not smtp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMTP config not found")

    # Auto-fill based on provider
    if body.provider and body.provider in PROVIDER_CONFIGS:
        config = PROVIDER_CONFIGS[body.provider]
        smtp.host = config["host"]
        smtp.port = config["port"]
        smtp.encryption = config["encryption"]
        smtp.provider = body.provider

    if body.host is not None:
        smtp.host = _clean_str(body.host)
    if body.port is not None:
        smtp.port = body.port
    if body.encryption is not None:
        smtp.encryption = body.encryption
    if body.username is not None:
        smtp.username = _clean_str(body.username)
    # Only overwrite password if a non-empty one was actually provided —
    # a blank field means "keep the existing password"
    if body.password is not None and body.password.strip():
        smtp.password_encrypted = encrypt_password(_clean_password(body.password, body.provider or smtp.provider))
    if body.from_name is not None:
        smtp.from_name = _clean_str(body.from_name)
    if body.from_email is not None:
        smtp.from_email = _clean_email(body.from_email, fallback=smtp.username) or _clean_str(body.from_email) or smtp.username
    if body.reply_email is not None:
        smtp.reply_email = _clean_str(body.reply_email) or None

    await db.commit()
    await db.refresh(smtp)
    
    # Log update
    log = SmtpLog(
        user_id=user.id,
        smtp_id=smtp.id,
        action="config_updated",
        status="success",
        message="SMTP configuration updated"
    )
    db.add(log)
    await db.commit()
    
    return smtp


@router.post("/{smtp_id}/verify")
async def verify_smtp(smtp_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Verify SMTP connection with real authentication test."""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == smtp_id, SmtpConfig.user_id == user.id))
    smtp = result.scalar_one_or_none()
    if not smtp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMTP config not found")

    # Resolve a guaranteed-valid sender address; auto-repair the stored one.
    # An empty/malformed from_email is what caused Gmail's "555 5.5.2 Syntax error".
    username = _clean_str(smtp.username)
    from_email = _clean_email(smtp.from_email, fallback=username)
    if not from_email:
        smtp.test_status = "failed"
        smtp.last_tested = datetime.now(timezone.utc)
        smtp.last_error = "No valid sender email"
        await db.commit()
        return {
            "status": "failed",
            "error_code": "CONFIG_INVALID",
            "message": "No valid sender email found. Set 'Google Email' to a plain address like you@gmail.com and save again.",
        }
    if smtp.from_email != from_email:
        smtp.from_email = from_email  # heal older configs saved with empty/malformed from_email

    try:
        password = decrypt_password(smtp.password_encrypted)
        server = _open_smtp(smtp.host, smtp.port, smtp.encryption, username, password)

        # Send a test email to verify — explicit envelope addresses, RFC-safe From header
        msg = MIMEText("This is a test email from HireFlow to verify your SMTP configuration.")
        msg["Subject"] = "HireFlow SMTP Verification"
        from_name = _clean_str(smtp.from_name)
        msg["From"] = formataddr((from_name, from_email)) if from_name else from_email
        msg["To"] = from_email
        server.sendmail(from_email, [from_email], msg.as_string())
        server.quit()

        # Update status
        smtp.test_status = "success"
        smtp.last_tested = datetime.now(timezone.utc)
        smtp.connection_health = 98  # High health for successful connection
        smtp.last_error = None
        await db.commit()
        
        # Log success
        log = SmtpLog(
            user_id=user.id,
            smtp_id=smtp.id,
            action="verified",
            status="success",
            message="SMTP connection verified successfully"
        )
        db.add(log)
        await db.commit()
        
        return {"status": "success", "message": "SMTP connection verified successfully. Test email sent."}
        
    except Exception as e:
        error_msg = str(e)
        smtp.test_status = "failed"
        smtp.last_tested = datetime.now(timezone.utc)
        smtp.connection_health = 0
        smtp.last_error = error_msg
        await db.commit()
        
        # Log failure
        log = SmtpLog(
            user_id=user.id,
            smtp_id=smtp.id,
            action="verified",
            status="failed",
            message=f"SMTP verification failed: {error_msg}"
        )
        db.add(log)
        await db.commit()
        
        # Return specific error message
        return {"status": "failed", **_classify_smtp_error(e)}


@router.post("/{smtp_id}/send-test")
async def send_test_email(smtp_id: str, body: TestEmailRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Send a test email to any address."""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == smtp_id, SmtpConfig.user_id == user.id))
    smtp = result.scalar_one_or_none()
    if not smtp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMTP config not found")

    to_email = _clean_email(body.to_email)
    if not to_email:
        raise HTTPException(status_code=400, detail="Invalid recipient email address")

    username = _clean_str(smtp.username)
    from_email = _clean_email(smtp.from_email, fallback=username)
    if not from_email:
        return {
            "status": "failed",
            "error_code": "CONFIG_INVALID",
            "message": "No valid sender email in your configuration. Re-save it with a plain address like you@gmail.com.",
        }

    try:
        password = decrypt_password(smtp.password_encrypted)
        server = _open_smtp(smtp.host, smtp.port, smtp.encryption, username, password)

        msg = MIMEText("""
This is a test email from HireFlow.

Your SMTP configuration is working correctly!
You can now send job application emails directly from the platform.

Best regards,
HireFlow Team
""")
        msg["Subject"] = "HireFlow Test Email"
        from_name = _clean_str(smtp.from_name)
        msg["From"] = formataddr((from_name, from_email)) if from_name else from_email
        msg["To"] = to_email
        server.sendmail(from_email, [to_email], msg.as_string())
        server.quit()
        
        # Update analytics
        smtp.emails_sent += 1
        smtp.last_sent = datetime.now(timezone.utc)
        await db.commit()
        
        # Log success
        log = SmtpLog(
            user_id=user.id,
            smtp_id=smtp.id,
            action="test_sent",
            status="success",
            message=f"Test email sent to {body.to_email}"
        )
        db.add(log)
        await db.commit()
        
        return {"status": "success", "message": f"Test email sent to {to_email}"}

    except Exception as e:
        smtp.emails_failed += 1
        await db.commit()

        log = SmtpLog(
            user_id=user.id,
            smtp_id=smtp.id,
            action="test_sent",
            status="failed",
            message=f"Failed to send test email: {str(e)}"
        )
        db.add(log)
        await db.commit()

        return {"status": "failed", **_classify_smtp_error(e)}


@router.get("/{smtp_id}/logs")
async def get_smtp_logs(smtp_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Get connection logs for SMTP config."""
    result = await db.execute(
        select(SmtpLog)
        .where(SmtpLog.smtp_id == smtp_id, SmtpLog.user_id == user.id)
        .order_by(SmtpLog.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()
