# api/scripts/test_mailersend.py
"""
Standalone MailerSend connectivity check.

The backend deliberately swallows MailerSend failures (forgot-password and
resend-verification always return the same generic "success" response
regardless of whether the email actually sent, so the endpoint can't be
used to enumerate accounts -- see AuthService.forgot_password). That's
correct behavior for the API, but it also means you can't tell from the
app itself *why* an email didn't arrive. This script sends one real test
email directly through MailerSend and prints the raw response, so you can
see the actual reason.

Usage:
    cd api
    python scripts/test_mailersend.py you@example.com
    python scripts/test_mailersend.py someone-else@example.com

Run it with TWO DIFFERENT email addresses back to back. If the first
succeeds and the second fails with something mentioning "trial" or
"recipient", that confirms the diagnosis below.

Most common reason verification emails aren't arriving: MAILERSEND_API_KEY
belongs to a Trial-plan account. MailerSend's Trial plan caps outgoing
mail at 2 DISTINCT RECIPIENT ADDRESSES TOTAL, for the life of the account
(https://www.mailersend.com/pricing: "The Trial plan lets you send up to
100 emails/month to 2 recipients"). That's why forgot-password can look
totally fine (you've probably only ever tested it against 1-2 of your own
addresses) while account verification fails for almost every new signup
(each one is a brand-new recipient). This is a MailerSend account setting,
not something fixable in this codebase. To fix it:
  1. Log in to https://app.mailersend.com
  2. Go to Domains -> add and verify a real domain (or Plan & billing ->
     upgrade to Hobby, 3,000 emails/month free but requires billing info
     and a verified domain).
  3. Re-run this script with two different addresses -- both should now
     succeed.

In the meantime, an admin can manually verify a user stuck by this from
Admin > User Management in the app (the "unverified" badge has a
"manually verify" action next to it), instead of leaving them locked out.
"""
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from services.mail_service import (
    _get_api_key,
    _get_from_email,
    _get_from_name,
    MAILERSEND_API_URL,
)


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/test_mailersend.py you@example.com")
        sys.exit(1)

    to_email = sys.argv[1]
    api_key = _get_api_key()
    from_email = _get_from_email()

    print(f"MAILERSEND_FROM_EMAIL : {from_email}")
    print(f"MAILERSEND_API_KEY    : {'set (' + api_key[:8] + '...)' if api_key else 'NOT SET'}")
    print(f"Sending test email to : {to_email}")
    print("-" * 60)

    if not api_key:
        print("MAILERSEND_API_KEY is not set in your environment/.env -- stopping.")
        sys.exit(1)

    payload = {
        "from": {"email": from_email, "name": _get_from_name()},
        "to": [{"email": to_email, "name": to_email}],
        "subject": "AlgoBlocks MailerSend test",
        "text": "If you got this, your MailerSend setup is working correctly.",
        "html": "<p>If you got this, your MailerSend setup is working correctly.</p>",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    response = requests.post(MAILERSEND_API_URL, json=payload, headers=headers, timeout=10)

    print(f"HTTP status: {response.status_code}")
    print(f"Response body: {response.text}")
    print("-" * 60)

    if response.status_code < 400:
        print("SUCCESS -- MailerSend accepted the email. Check the inbox (and spam folder).")
        print("Try it again with a SECOND, DIFFERENT email address -- if that one fails")
        print("mentioning \"trial\" or a recipient limit, that confirms the 2-recipient cap.")
    else:
        print("FAILED -- MailerSend rejected the request. See the response body above for")
        print("the exact reason. If it mentions \"trial\" or a recipient limit, see the note")
        print("at the top of this file.")


if __name__ == "__main__":
    main()
