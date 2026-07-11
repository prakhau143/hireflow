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
import smtplib
import ssl

router = APIRouter(prefix="/smtp", tags=["smtp"])

# Provider configurations
PROVIDER_CONFIGS = {
    "gmail": {"host": "smtp.gmail.com", "port": 587, "encryption": "TLS"},
    "outlook": {"host": "smtp-mail.outlook.com", "port": 587, "encryption": "TLS"},
    "yahoo": {"host": "smtp.mail.yahoo.com", "port": 587, "encryption": "TLS"},
    "zoho": {"host": "smtp.zoho.com", "port": 587, "encryption": "TLS"},
}


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

    smtp = SmtpConfig(
        user_id=user.id,
        provider=body.provider,
        host=body.host,
        port=body.port,
        encryption=body.encryption,
        username=body.username,
        password_encrypted=encrypt_password(body.password),
        from_name=body.from_name,
        from_email=body.from_email,
        reply_email=body.reply_email,
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
        smtp.host = body.host
    if body.port is not None:
        smtp.port = body.port
    if body.encryption is not None:
        smtp.encryption = body.encryption
    if body.username is not None:
        smtp.username = body.username
    if body.password is not None:
        smtp.password_encrypted = encrypt_password(body.password)
    if body.from_name is not None:
        smtp.from_name = body.from_name
    if body.from_email is not None:
        smtp.from_email = body.from_email
    if body.reply_email is not None:
        smtp.reply_email = body.reply_email

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

    try:
        password = decrypt_password(smtp.password_encrypted)
        
        # Create SSL context
        context = ssl.create_default_context()
        
        server = smtplib.SMTP(smtp.host, smtp.port, timeout=10)
        
        if smtp.encryption == "TLS":
            server.starttls(context=context)
        elif smtp.encryption == "SSL":
            server = smtplib.SMTP_SSL(smtp.host, smtp.port, context=context, timeout=10)
        
        server.login(smtp.username, password)
        
        # Send a test email to verify
        msg = MIMEText("This is a test email from HireFlow to verify your SMTP configuration.")
        msg["Subject"] = "HireFlow SMTP Verification"
        msg["From"] = f"{smtp.from_name} <{smtp.from_email}>"
        msg["To"] = smtp.from_email
        server.send_message(msg)
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
        if "authentication" in error_msg.lower() or "login" in error_msg.lower():
            return {"status": "failed", "message": "Authentication failed. Check your email and app password."}
        elif "tls" in error_msg.lower() or "ssl" in error_msg.lower():
            return {"status": "failed", "message": "TLS/SSL error. Check encryption settings."}
        elif "timeout" in error_msg.lower() or "connection" in error_msg.lower():
            return {"status": "failed", "message": "Connection timeout. Check host and port."}
        else:
            return {"status": "failed", "message": f"Connection failed: {error_msg}"}


@router.post("/{smtp_id}/send-test")
async def send_test_email(smtp_id: str, body: TestEmailRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Send a test email to any address."""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == smtp_id, SmtpConfig.user_id == user.id))
    smtp = result.scalar_one_or_none()
    if not smtp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SMTP config not found")

    try:
        password = decrypt_password(smtp.password_encrypted)
        
        context = ssl.create_default_context()
        server = smtplib.SMTP(smtp.host, smtp.port, timeout=10)
        
        if smtp.encryption == "TLS":
            server.starttls(context=context)
        elif smtp.encryption == "SSL":
            server = smtplib.SMTP_SSL(smtp.host, smtp.port, context=context, timeout=10)
        
        server.login(smtp.username, password)
        
        msg = MIMEText("""
This is a test email from HireFlow.

Your SMTP configuration is working correctly! 
You can now send job application emails directly from the platform.

Best regards,
HireFlow Team
""")
        msg["Subject"] = "HireFlow Test Email"
        msg["From"] = f"{smtp.from_name} <{smtp.from_email}>"
        msg["To"] = body.to_email
        server.send_message(msg)
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
        
        return {"status": "success", "message": f"Test email sent to {body.to_email}"}
        
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
        
        return {"status": "failed", "message": str(e)}


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
