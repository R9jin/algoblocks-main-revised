# api/services/mail_service.py
import os
import re
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Safety net: ensure .env is loaded even if this module is imported before
# database.py's load_dotenv() has run.
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

# --- SMTP configuration (Gmail) -------------------------------------------
# Read lazily (not at import time) so tests / scripts that set the env vars
# after import still work, and so a missing var doesn't crash the module.


def _get_smtp_host():
    return os.getenv("SMTP_HOST", "smtp.gmail.com")


def _get_smtp_port():
    try:
        return int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        return 587


def _get_smtp_username():
    return os.getenv("SMTP_USERNAME")


def _get_smtp_password():
    return os.getenv("SMTP_PASSWORD")


def _get_from_email():
    return os.getenv("SMTP_FROM_EMAIL", _get_smtp_username())


def _get_from_name():
    return os.getenv("SMTP_FROM_NAME", "AlgoBlocks")


# How long a verification link stays valid for.
VERIFICATION_TOKEN_TTL_HOURS = 24

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

_ALLOWED_FRONTEND_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://algoblocks-main-revised.vercel.app",
}
_ALLOWED_FRONTEND_ORIGIN_REGEX = re.compile(
    r"^https://algoblocks-main-revised(-[a-zA-Z0-9-]+)?\.vercel\.app$"
)


def _resolve_frontend_url(origin: str = None) -> str:
    """
    Picks the link base for an outgoing email. Prefers the caller-supplied
    Origin (the frontend origin that actually made the API request), but
    only if it matches the same allowlist/regex the CORS middleware trusts
    -- so this can never be used to inject an arbitrary link into an email
    (e.g. via a spoofed Origin header) even if some upstream proxy forwards
    an unexpected value. Falls back to FRONTEND_URL when Origin is missing
    or untrusted.
    """
    if origin:
        origin = origin.rstrip("/")
        if origin in _ALLOWED_FRONTEND_ORIGINS or _ALLOWED_FRONTEND_ORIGIN_REGEX.match(origin):
            return origin
    return FRONTEND_URL


def _send_email(to_email: str, to_name: str, subject: str, html_body: str, text_body: str) -> bool:
    """
    Sends an email via Gmail SMTP (STARTTLS on port 587). Returns True on
    success, False on any failure -- callers should never let a mail
    failure raise, so it can't leak whether an account exists via a
    stack trace, and shouldn't block the underlying account action either.
    """
    username = _get_smtp_username()
    password = _get_smtp_password()

    if not username or not password:
        logger.error("SMTP_USERNAME / SMTP_PASSWORD are not set; cannot send email.")
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{_get_from_name()} <{_get_from_email()}>"
    message["To"] = f"{to_name or to_email} <{to_email}>"

    message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    host = _get_smtp_host()
    port = _get_smtp_port()

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(username, password)
            server.sendmail(_get_from_email(), [to_email], message.as_string())
        return True
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error while sending to {to_email}: {e}")
        return False
    except OSError as e:
        # Covers connection/timeout failures (host unreachable, etc.)
        logger.error(f"Failed to reach SMTP server {host}:{port}: {e}")
        return False


def _build_reset_email_html(name: str, reset_link: str) -> str:
    safe_name = name or "there"
    return f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0A051A; color: #F5F5F5; border-radius: 16px;">
        <h2 style="color: #F5F5F5; margin-bottom: 8px;">Reset your password</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
            Hi {safe_name},<br /><br />
            We received a request to reset the password for your AlgoBlocks account.
            Click the button below to choose a new password. This link expires in 30 minutes.
        </p>
        <div style="text-align: center; margin: 28px 0;">
            <a href="{reset_link}" style="background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
                Reset Password
            </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
            If you didn't request this, you can safely ignore this email — your password will remain unchanged.
        </p>
    </div>
    """


def _build_reset_email_text(name: str, reset_link: str) -> str:
    safe_name = name or "there"
    return (
        f"Hi {safe_name},\n\n"
        "We received a request to reset the password for your AlgoBlocks account.\n"
        f"Use the link below to choose a new password (expires in 30 minutes):\n\n{reset_link}\n\n"
        "If you didn't request this, you can safely ignore this email.\n"
    )


def _build_verification_email_html(name: str, verify_link: str) -> str:
    safe_name = name or "there"
    return f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0A051A; color: #F5F5F5; border-radius: 16px;">
        <h2 style="color: #F5F5F5; margin-bottom: 8px;">Verify your email</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
            Hi {safe_name},<br /><br />
            Thanks for signing up for AlgoBlocks! Click the button below to verify your
            email address and activate your account. This link expires in
            {VERIFICATION_TOKEN_TTL_HOURS} hours.
        </p>
        <div style="text-align: center; margin: 28px 0;">
            <a href="{verify_link}" style="background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
                Verify Email
            </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
            If you didn't create an AlgoBlocks account, you can safely ignore this email.
        </p>
    </div>
    """


def _build_verification_email_text(name: str, verify_link: str) -> str:
    safe_name = name or "there"
    return (
        f"Hi {safe_name},\n\n"
        "Thanks for signing up for AlgoBlocks! Use the link below to verify your "
        f"email address and activate your account (expires in {VERIFICATION_TOKEN_TTL_HOURS} hours):\n\n"
        f"{verify_link}\n\n"
        "If you didn't create an AlgoBlocks account, you can safely ignore this email.\n"
    )


def send_password_reset_email(to_email: str, to_name: str, reset_token: str, origin: str = None) -> bool:
    """
    Sends the password reset email via Gmail SMTP.
    Returns True on success, False on any failure (never raises, so a mail
    provider outage can't leak whether an account exists via a stack trace).
    """
    reset_link = f"{_resolve_frontend_url(origin)}/reset-password?token={reset_token}"

    sent = _send_email(
        to_email=to_email,
        to_name=to_name,
        subject="Reset your AlgoBlocks password",
        html_body=_build_reset_email_html(to_name, reset_link),
        text_body=_build_reset_email_text(to_name, reset_link),
    )

    if not sent:
        # The token itself is already saved server-side regardless of
        # whether the email went out, so this link is fully valid; log it
        # so testing/dev isn't completely blocked while an SMTP issue is
        # sorted out.
        logger.warning(f"Reset link for {to_email} (email delivery failed): {reset_link}")

    return sent


def send_verification_email(to_email: str, to_name: str, verification_token: str, origin: str = None) -> bool:
    """
    Sends the signup email-verification email via Gmail SMTP.
    Returns True on success, False on any failure (never raises).
    """
    verify_link = f"{_resolve_frontend_url(origin)}/verify-email?token={verification_token}"

    sent = _send_email(
        to_email=to_email,
        to_name=to_name,
        subject="Verify your AlgoBlocks email",
        html_body=_build_verification_email_html(to_name, verify_link),
        text_body=_build_verification_email_text(to_name, verify_link),
    )

    if not sent:
        logger.warning(f"Verification link for {to_email} (email delivery failed): {verify_link}")

    return sent
