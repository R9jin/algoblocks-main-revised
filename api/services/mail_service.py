# api/services/mail_service.py
import os
import re
import logging
import requests
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Safety net: ensure .env is loaded even if this module is imported before
# database.py's load_dotenv() has run (which is exactly what was happening
# and causing verification emails to silently fail -- MAILERSEND_API_KEY
# was None at import time).
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

MAILERSEND_API_URL = "https://api.mailersend.com/v1/email"


def _get_api_key():
    """Read MAILERSEND_API_KEY lazily so it's always available after .env load."""
    return os.getenv("MAILERSEND_API_KEY")


def _get_from_email():
    return os.getenv("MAILERSEND_FROM_EMAIL", "noreply@test-pzkmgq7popml059v.mlsender.net")


def _get_from_name():
    return os.getenv("MAILERSEND_FROM_NAME", "AlgoBlocks")

# BUG FIX: this used to be the ONLY source for the link base, hardcoded to
# "http://localhost:5173" whenever the FRONTEND_URL env var wasn't set on
# the deployed backend. Every password-reset/verification email sent from
# production then contained a localhost link, since the Vercel deployment
# never had FRONTEND_URL configured. Rather than depend on that env var
# being set correctly for every environment (local dev, this project's
# production domain, and every Vercel preview-deployment subdomain), the
# link is now built from the Origin header of the request that triggered
# the email -- i.e. wherever the person actually clicked "Forgot Password"
# from -- and only falls back to FRONTEND_URL/localhost if that header is
# missing or untrusted. Kept in sync with the CORS allowlist in api/index.py.
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


def send_password_reset_email(to_email: str, to_name: str, reset_token: str, origin: str = None) -> bool:
    """
    Sends the password reset email via the MailerSend API.
    Returns True on success, False on any failure (never raises, so a mail
    provider outage can't leak whether an account exists via a stack trace).
    """
    api_key = _get_api_key()
    if not api_key:
        logger.error("MAILERSEND_API_KEY is not set; cannot send password reset email.")
        return False

    reset_link = f"{_resolve_frontend_url(origin)}/reset-password?token={reset_token}"

    payload = {
        "from": {"email": _get_from_email(), "name": _get_from_name()},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": "Reset your AlgoBlocks password",
        "html": _build_reset_email_html(to_name, reset_link),
        "text": _build_reset_email_text(to_name, reset_link),
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(MAILERSEND_API_URL, json=payload, headers=headers, timeout=10)
        if response.status_code >= 400:
            logger.error(f"MailerSend rejected the request ({response.status_code}): {response.text}")
            # Fallback so testing/dev isn't completely blocked while the
            # MailerSend account issue gets sorted out -- the token itself is
            # already saved server-side regardless of whether the email
            # went out, so this link is fully valid; it's just only
            # reachable here, in the server logs, instead of an inbox.
            logger.warning(f"Reset link for {to_email} (email delivery failed): {reset_link}")
            return False
        return True
    except requests.RequestException as e:
        logger.error(f"Failed to reach MailerSend API: {e}")
        logger.warning(f"Reset link for {to_email} (email delivery failed): {reset_link}")
        return False


# NOTE: signup no longer uses MailerSend at all -- accounts are created via
# Google OAuth (see AuthService.signup_with_google), and a successful Google
# sign-in is treated as sufficient proof of email ownership. There is no
# verification-email sender in this module anymore; MailerSend is now used
# exclusively for the password-reset flow above.
