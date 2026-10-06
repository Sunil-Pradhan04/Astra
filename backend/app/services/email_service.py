import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import settings


async def send_email(to_email: str, subject: str, body_html: str) -> bool:
    """
    Send an email via SMTP.
    Returns True if sent, False if SMTP not configured or failed.
    In demo mode (no SMTP creds), credentials are shown on screen instead.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        # Demo mode: email not sent but credentials shown on UI
        print(f"[DEMO EMAIL] To: {to_email} | Subject: {subject}")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body_html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False


def staff_credentials_email(
    full_name: str,
    staff_id: str,
    plain_password: str,
    role: str,
    hub_name: str,
) -> str:
    """HTML email body for new staff credentials."""
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
      <div style="background:#0a0a0a;padding:24px 32px;">
        <h1 style="color:#fff;font-size:22px;margin:0;letter-spacing:-0.5px;">Astra Healthcare</h1>
        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:6px 0 0;">Your Login Credentials</p>
      </div>
      <div style="padding:32px;">
        <p style="color:#404040;font-size:14px;">Hello <strong>{full_name}</strong>,</p>
        <p style="color:#404040;font-size:14px;">
          You have been added as a <strong>{role}</strong> at <strong>{hub_name}</strong>.
          Use the credentials below to log in to the Astra portal.
        </p>
        <div style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:8px;padding:20px 24px;margin:20px 0;">
          <p style="margin:0 0 10px;font-size:13px;color:#737373;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Credentials</p>
          <p style="margin:6px 0;font-size:15px;color:#0a0a0a;"><strong>ID:</strong> {staff_id}</p>
          <p style="margin:6px 0;font-size:15px;color:#0a0a0a;"><strong>Password:</strong> {plain_password}</p>
        </div>
        <p style="color:#737373;font-size:12px;">Please change your password after first login. Keep these credentials secure.</p>
      </div>
    </div>
    """
