# api/scripts/test_smtp.py
"""
Standalone Gmail SMTP connectivity check.

The backend deliberately swallows SMTP failures (forgot-password always
returns the same generic "success" response regardless of whether the
email actually sent, so the endpoint can't be used to enumerate accounts --
see AuthService.forgot_password). That's correct behavior for the API, but
it also means you can't tell from the app itself *why* an email didn't
arrive. This script sends one real test email directly through Gmail's
SMTP server and prints exactly what happened.

Usage:
    cd api
    python scripts/test_smtp.py you@example.com

Requires SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD (and
optionally SMTP_FROM_EMAIL / SMTP_FROM_NAME) to be set in api/.env.
SMTP_PASSWORD must be a Gmail *App Password* (16 chars, no spaces), not
your normal Google account password -- Gmail rejects normal passwords for
SMTP. Generate one at https://myaccount.google.com/apppasswords (requires
2-Step Verification to be enabled on the account).
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.mail_service import (
    _get_smtp_host,
    _get_smtp_port,
    _get_smtp_username,
    _get_smtp_password,
    _get_from_email,
    _get_from_name,
    _send_email,
)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/test_smtp.py you@example.com")
        sys.exit(1)

    to_email = sys.argv[1]
    username = _get_smtp_username()
    password = _get_smtp_password()

    print(f"SMTP_HOST       : {_get_smtp_host()}")
    print(f"SMTP_PORT       : {_get_smtp_port()}")
    print(f"SMTP_USERNAME   : {username or 'NOT SET'}")
    print(f"SMTP_PASSWORD   : {'set (' + str(len(password)) + ' chars)' if password else 'NOT SET'}")
    print(f"SMTP_FROM_EMAIL : {_get_from_email()}")
    print(f"SMTP_FROM_NAME  : {_get_from_name()}")
    print(f"Sending test email to: {to_email}")
    print("-" * 60)

    if not username or not password:
        print("SMTP_USERNAME / SMTP_PASSWORD are not set in your environment/.env -- stopping.")
        sys.exit(1)

    sent = _send_email(
        to_email=to_email,
        to_name=to_email,
        subject="AlgoBlocks SMTP test",
        html_body="<p>If you got this, your Gmail SMTP setup is working correctly.</p>",
        text_body="If you got this, your Gmail SMTP setup is working correctly.",
    )

    print("-" * 60)
    if sent:
        print("SUCCESS -- Gmail accepted the email. Check the inbox (and spam folder).")
    else:
        print("FAILED -- see the logged error above for the exact reason. Common causes:")
        print('  - SMTP_PASSWORD is your normal Google password, not an App Password')
        print("  - 2-Step Verification isn't enabled on the Gmail account (required for App Passwords)")
        print("  - SMTP_USERNAME doesn't match the account the App Password was generated for")
        print("  - An outbound firewall/network is blocking port 587")


if __name__ == "__main__":
    main()
