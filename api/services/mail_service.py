# api/services/mail_service.py
import os
import logging
import requests

logger = logging.getLogger(__name__)

MAILERSEND_API_URL = "https://api.mailersend.com/v1/email"

MAILERSEND_API_KEY = os.getenv("MAILERSEND_API_KEY")
# MailerSend requires "from" to be on a verified/trial domain. Defaults to the
# trial subdomain issued with the account; override with MAILERSEND_FROM_EMAIL
# once a real sending domain is verified.
MAILERSEND_FROM_EMAIL = os.getenv("MAILERSEND_FROM_EMAIL", "noreply@test-pzkmgq7popml059v.mlsender.net")
MAILERSEND_FROM_NAME = os.getenv("MAILERSEND_FROM_NAME", "AlgoBlocks")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


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
            If the button doesn't work, copy and paste this link into your browser:<br />
            <a href="{reset_link}" style="color: #818cf8; word-break: break-all;">{reset_link}</a>
        </p>
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


def send_password_reset_email(to_email: str, to_name: str, reset_token: str) -> bool:
    """
    Sends the password reset email via the MailerSend API.
    Returns True on success, False on any failure (never raises, so a mail
    provider outage can't leak whether an account exists via a stack trace).
    """
    if not MAILERSEND_API_KEY:
        logger.error("MAILERSEND_API_KEY is not set; cannot send password reset email.")
        return False

    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    payload = {
        "from": {"email": MAILERSEND_FROM_EMAIL, "name": MAILERSEND_FROM_NAME},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": "Reset your AlgoBlocks password",
        "html": _build_reset_email_html(to_name, reset_link),
        "text": _build_reset_email_text(to_name, reset_link),
    }

    headers = {
        "Authorization": f"Bearer {MAILERSEND_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(MAILERSEND_API_URL, json=payload, headers=headers, timeout=10)
        if response.status_code >= 400:
            logger.error(f"MailerSend rejected the request ({response.status_code}): {response.text}")
            return False
        return True
    except requests.RequestException as e:
        logger.error(f"Failed to reach MailerSend API: {e}")
        return False


def _build_verification_email_html(name: str, verify_link: str) -> str:
    safe_name = name or "there"
    return f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0A051A; color: #F5F5F5; border-radius: 16px;">
        <h2 style="color: #F5F5F5; margin-bottom: 8px;">Verify your email</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
            Hi {safe_name},<br /><br />
            Thanks for creating an AlgoBlocks account. Please confirm this is your email address
            by clicking the button below. This link expires in 24 hours.
        </p>
        <div style="text-align: center; margin: 28px 0;">
            <a href="{verify_link}" style="background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; display: inline-block;">
                Verify Email
            </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <a href="{verify_link}" style="color: #818cf8; word-break: break-all;">{verify_link}</a>
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
            If you didn't create this account, you can safely ignore this email.
        </p>
    </div>
    """


def _build_verification_email_text(name: str, verify_link: str) -> str:
    safe_name = name or "there"
    return (
        f"Hi {safe_name},\n\n"
        "Thanks for creating an AlgoBlocks account. Confirm your email using the link below "
        f"(expires in 24 hours):\n\n{verify_link}\n\n"
        "If you didn't create this account, you can safely ignore this email.\n"
    )


def send_verification_email(to_email: str, to_name: str, verification_token: str) -> bool:
    """
    Sends the signup email-verification link via the MailerSend API.
    Returns True on success, False on any failure (never raises).
    """
    if not MAILERSEND_API_KEY:
        logger.error("MAILERSEND_API_KEY is not set; cannot send verification email.")
        return False

    verify_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"

    payload = {
        "from": {"email": MAILERSEND_FROM_EMAIL, "name": MAILERSEND_FROM_NAME},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": "Verify your AlgoBlocks account",
        "html": _build_verification_email_html(to_name, verify_link),
        "text": _build_verification_email_text(to_name, verify_link),
    }

    headers = {
        "Authorization": f"Bearer {MAILERSEND_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(MAILERSEND_API_URL, json=payload, headers=headers, timeout=10)
        if response.status_code >= 400:
            logger.error(f"MailerSend rejected the verification request ({response.status_code}): {response.text}")
            return False
        return True
    except requests.RequestException as e:
        logger.error(f"Failed to reach MailerSend API for verification email: {e}")
        return False
