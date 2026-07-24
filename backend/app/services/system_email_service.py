"""Platform-to-user notification emails — DB-editable, admin-managed, always sent
via SYSTEM SMTP (settings.SMTP_USER/PASS), never the user's own SMTP config (that's
reserved for job-application emails; see app/services/application_service.py and
app/api/applications.py).

Each template's html_body/subject may contain {{variable}} placeholders, substituted
at send time by render_template(). Defaults below seed the DB on first run; admins
can edit them freely via /api/admin/system-email-templates without touching code."""
import asyncio
import smtplib
import ssl
import email.utils
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.system_email_template import SystemEmailTemplate

# ── Shared wrapper (brand shell every system email renders inside) ─────────────

_WRAPPER = """<!DOCTYPE html>
<html>
<head>
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
</head>
<body style="margin:0;padding:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:600px;width:100%;background:#0f172a;border-radius:24px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

        <!-- Hero / brand header -->
        <tr>
          <td style="background:__ACCENT__;padding:36px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td>
                  <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.18);display:inline-block;text-align:center;line-height:40px;font-size:20px;font-weight:800;color:#fff;">H</div>
                </td>
              </tr>
            </table>
            <h1 style="margin:16px 0 2px;color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.02em;">HireFlow AI</h1>
            <p style="margin:0;color:rgba(255,255,255,0.75);font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">__BADGE__</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
__BODY__
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.15);">
            <p style="color:rgba(255,255,255,0.35);font-size:12px;margin:0 0 4px;">__FOOTNOTE__</p>
            <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:0;">
              Need help? <a href="mailto:support@hireflow.ai" style="color:#a5b4fc;text-decoration:none;">support@hireflow.ai</a>
              &middot; HireFlow Team
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _wrap(accent: str, badge: str, body: str, footnote: str) -> str:
    return (_WRAPPER
            .replace("__ACCENT__", accent)
            .replace("__BADGE__", badge)
            .replace("__BODY__", body)
            .replace("__FOOTNOTE__", footnote))


# Brand gradients — each notification family gets its own accent, matching the
# "component personality" the theme spec called for (success/warning/celebratory/etc).
_BRAND = "linear-gradient(120deg,#4f46e5 0%,#7c3aed 45%,#6366f1 100%)"
_SUCCESS = "linear-gradient(120deg,#059669 0%,#10b981 50%,#34d399 100%)"
_WARNING = "linear-gradient(120deg,#b45309 0%,#d97706 50%,#f59e0b 100%)"
_SKY = "linear-gradient(120deg,#0369a1 0%,#0284c7 50%,#38bdf8 100%)"
_GOLD = "linear-gradient(120deg,#a16207 0%,#ca8a04 50%,#eab308 100%)"

DEFAULT_TEMPLATES: dict[str, dict] = {

    "welcome": {
        "name": "Welcome Email",
        "subject": "Welcome to HireFlow AI, {{name}}",
        "html_body": _wrap(
            _BRAND, "AI CAREER PLATFORM",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              Welcome to HireFlow AI — your account is ready. From here, our AI parses job posts,
              matches them against your resume, and helps you send personalized applications faster.
            </p>
            <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:20px;padding:24px;margin-bottom:8px;">
              <p style="margin:0 0 14px;color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Get started in 3 steps</p>
              <p style="margin:0 0 10px;color:rgba(255,255,255,0.8);font-size:14px;">1. Complete your profile &amp; upload your resume</p>
              <p style="margin:0 0 10px;color:rgba(255,255,255,0.8);font-size:14px;">2. Import your first job posts</p>
              <p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;">3. Let AI match and help you apply</p>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              Log in anytime to pick up where you left off.
            </p>
            """,
            "You're receiving this because you created a HireFlow AI account."
        ),
    },

    "password_reset_otp": {
        "name": "Password Reset OTP",
        "subject": "Your HireFlow Password Reset Code",
        "html_body": _wrap(
            _BRAND, "AI CAREER PLATFORM",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              We received a request to reset your HireFlow password. Enter this code to continue —
              it's valid for a limited time only.
            </p>
            <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:20px;padding:28px;text-align:center;margin-bottom:8px;">
              <p style="margin:0 0 14px;color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Your verification code</p>
              <div style="font-size:42px;font-weight:800;letter-spacing:10px;color:#a5b4fc;font-family:'SF Mono',Consolas,Menlo,monospace;">{{otp_spaced}}</div>
              <div style="margin-top:16px;display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 14px;">
                <span style="color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:0.06em;">TAP &amp; HOLD TO COPY</span>
              </div>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:14px 0 28px;">
              Expires in <strong style="color:rgba(255,255,255,0.6);">{{expiry_minutes}} minutes</strong>
            </p>
            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;">
              <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0;line-height:1.6;">
                Didn't request this? You can safely ignore this email — your password won't change
                unless this code is used.
              </p>
            </div>
            """,
            "Never share this code with anyone — HireFlow staff will never ask for it."
        ),
    },

    "email_verification": {
        "name": "Email Verification",
        "subject": "Verify your HireFlow email address",
        "html_body": _wrap(
            _BRAND, "VERIFY YOUR EMAIL",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              Please confirm this is your email address so we can keep your account secure.
            </p>
            <div style="text-align:center;margin-bottom:8px;">
              <a href="{{verification_link}}" style="display:inline-block;background:rgba(99,102,241,0.9);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;">Verify Email Address</a>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              This link expires in <strong style="color:rgba(255,255,255,0.6);">{{expiry_minutes}} minutes</strong>.
            </p>
            """,
            "Didn't create a HireFlow account? You can safely ignore this email."
        ),
    },

    "application_sent": {
        "name": "Application Sent",
        "subject": "Application sent — {{job_title}} at {{company}}",
        "html_body": _wrap(
            _SUCCESS, "APPLICATION UPDATE",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              Good news — your application was just sent.
            </p>
            <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:20px;padding:24px;margin-bottom:8px;">
              <p style="margin:0 0 6px;color:#fff;font-size:17px;font-weight:700;">{{job_title}}</p>
              <p style="margin:0;color:rgba(255,255,255,0.55);font-size:14px;">at {{company}}</p>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              Track all your applications from the Jobs dashboard.
            </p>
            """,
            "Sent automatically via your connected SMTP account."
        ),
    },

    "application_failed": {
        "name": "Application Failed",
        "subject": "Application failed — {{job_title}} at {{company}}",
        "html_body": _wrap(
            _WARNING, "APPLICATION UPDATE",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              We ran into a problem sending this application after several attempts.
            </p>
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:20px;padding:24px;margin-bottom:8px;">
              <p style="margin:0 0 6px;color:#fff;font-size:17px;font-weight:700;">{{job_title}}</p>
              <p style="margin:0 0 14px;color:rgba(255,255,255,0.55);font-size:14px;">at {{company}}</p>
              <p style="margin:0;color:rgba(255,255,255,0.4);font-size:12px;">{{error}}</p>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              Check your SMTP settings and resend from the Jobs dashboard.
            </p>
            """,
            "Sent automatically via your connected SMTP account."
        ),
    },

    "interview_reminder": {
        "name": "Interview Reminder",
        "subject": "Reminder: interview for {{job_title}} at {{company}}",
        "html_body": _wrap(
            _SKY, "INTERVIEW REMINDER",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              You have an upcoming interview — here's a quick reminder.
            </p>
            <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:20px;padding:24px;margin-bottom:8px;">
              <p style="margin:0 0 6px;color:#fff;font-size:17px;font-weight:700;">{{job_title}}</p>
              <p style="margin:0 0 14px;color:rgba(255,255,255,0.55);font-size:14px;">at {{company}}</p>
              <p style="margin:0;color:#7dd3fc;font-size:14px;font-weight:600;">{{interview_date}}</p>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              Good luck — you've got this.
            </p>
            """,
            "Manage your interview schedule from the Jobs dashboard."
        ),
    },

    "offer_received": {
        "name": "Offer Received",
        "subject": "Congratulations — offer from {{company}}",
        "html_body": _wrap(
            _GOLD, "CONGRATULATIONS",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              Congratulations — you've received an offer.
            </p>
            <div style="background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.25);border-radius:20px;padding:24px;margin-bottom:8px;">
              <p style="margin:0 0 6px;color:#fff;font-size:17px;font-weight:700;">{{job_title}}</p>
              <p style="margin:0;color:rgba(255,255,255,0.55);font-size:14px;">at {{company}}</p>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              Well earned. Review the details and next steps from your Jobs dashboard.
            </p>
            """,
            "This is an automated notification from your HireFlow job tracker."
        ),
    },

    "subscription": {
        "name": "Subscription Confirmation",
        "subject": "Your HireFlow {{plan_name}} subscription is confirmed",
        "html_body": _wrap(
            _BRAND, "BILLING",
            """
            <p style="color:rgba(255,255,255,0.85);margin:0 0 6px;font-size:15px;">
              Hi <strong style="color:#fff;">{{name}}</strong>,
            </p>
            <p style="color:rgba(255,255,255,0.55);margin:0 0 28px;font-size:14px;line-height:1.6;">
              Thanks for subscribing — here's a summary of your plan.
            </p>
            <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:20px;padding:24px;margin-bottom:8px;">
              <p style="margin:0 0 10px;color:#fff;font-size:17px;font-weight:700;">{{plan_name}}</p>
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.7);font-size:14px;">Amount: {{amount}}</p>
              <p style="margin:0;color:rgba(255,255,255,0.55);font-size:13px;">Renews on {{renewal_date}}</p>
            </div>
            <p style="text-align:center;color:rgba(255,255,255,0.35);font-size:12px;margin:16px 0 0;">
              Manage your subscription anytime from Settings.
            </p>
            """,
            "Questions about billing? Reach out any time."
        ),
    },
}


# ── Low-level send (System SMTP only) ───────────────────────────────────────────

def smtp_send_html(to_email: str, subject: str, html: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        raise RuntimeError(
            "System SMTP not configured. Set SMTP_USER and SMTP_PASS in the backend .env file."
        )
    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    context = ssl.create_default_context()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{from_addr}>"
    msg["To"] = to_email
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["Message-ID"] = email.utils.make_msgid(domain=from_addr.split("@")[-1])
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


# ── Template rendering + DB access ──────────────────────────────────────────────

def render_template(subject: str, html_body: str, variables: dict) -> tuple[str, str]:
    rendered_subject, rendered_html = subject, html_body
    for key, value in variables.items():
        token = "{{" + key + "}}"
        rendered_subject = rendered_subject.replace(token, str(value))
        rendered_html = rendered_html.replace(token, str(value))
    return rendered_subject, rendered_html


async def get_or_create_template(db: AsyncSession, type_: str) -> SystemEmailTemplate:
    row = (await db.execute(
        select(SystemEmailTemplate).where(SystemEmailTemplate.type == type_)
    )).scalar_one_or_none()
    if row is None:
        default = DEFAULT_TEMPLATES[type_]
        row = SystemEmailTemplate(
            type=type_, name=default["name"],
            subject=default["subject"], html_body=default["html_body"],
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def seed_all_templates(db: AsyncSession) -> None:
    """Insert any missing template types — never overwrites an admin's edits."""
    existing = set((await db.execute(select(SystemEmailTemplate.type))).scalars().all())
    added = False
    for type_, default in DEFAULT_TEMPLATES.items():
        if type_ not in existing:
            db.add(SystemEmailTemplate(
                type=type_, name=default["name"],
                subject=default["subject"], html_body=default["html_body"],
            ))
            added = True
    if added:
        await db.commit()


async def send_system_email(db: AsyncSession, type_: str, to_email: str, variables: dict) -> None:
    """Render `type_`'s current DB template with `variables` and send via System SMTP.
    Raises RuntimeError if SMTP isn't configured — callers for non-critical
    notifications (welcome, application status) should catch and log rather
    than let it break the calling flow."""
    template = await get_or_create_template(db, type_)
    if not template.is_active:
        return
    subject, html = render_template(template.subject, template.html_body, variables)
    await asyncio.to_thread(smtp_send_html, to_email, subject, html)
