"""
Notification Service — Email (SendGrid), Push (Firebase), SMS (Twilio)
"""

from loguru import logger
from infrastructure.config import get_settings

settings = get_settings()


class NotificationService:

    async def send_email(self, to: str, subject: str, body: str, html_body: str = None):
        logger.info(f"NotificationService.send_email: to={to}  subject={subject!r}")
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail, To, From, Subject, PlainTextContent, HtmlContent

            sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
            message = Mail(
                from_email=settings.FROM_EMAIL,
                to_emails=to,
                subject=subject,
                plain_text_content=body,
                html_content=html_body or body.replace("\n", "<br>")
            )
            response = sg.send(message)
            logger.info(f"NotificationService.send_email: SUCCESS to={to}  status={response.status_code}")
        except Exception as e:
            logger.error(f"NotificationService.send_email: FAILED to={to}  subject={subject!r}  error={type(e).__name__}: {e}")

    async def send_welcome_email(self, to: str, name: str):
        await self.send_email(
            to=to,
            subject="Welcome to Express Entry PR App!",
            body=f"""
Hi {name},

Welcome to your Express Entry PR assistant! 

Here's how to get started:
1. Complete your profile (personal info, language tests, education, work history)
2. Calculate your CRS score
3. Upload your documents for AI review
4. Set up draw alerts so you never miss an invitation

If you have any questions, our AI assistant is available 24/7 to help.

Good luck on your journey to permanent residence!

Best regards,
Express Entry PR App Team
""",
            html_body=f"""
<h2>Welcome, {name}!</h2>
<p>Your Express Entry journey starts here. Here's what to do next:</p>
<ol>
  <li>Complete your profile</li>
  <li>Calculate your CRS score</li>
  <li>Upload documents for AI review</li>
  <li>Enable draw alerts</li>
</ol>
<p>Good luck! 🍀</p>
"""
        )

    async def send_push(self, token: str, title: str, body: str, data: dict = None):
        logger.info(f"NotificationService.send_push: token={token[:20]}...  title={title!r}")
        try:
            import firebase_admin
            from firebase_admin import messaging, credentials

            if not firebase_admin._apps:
                cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
                firebase_admin.initialize_app(cred)

            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                token=token
            )
            response = messaging.send(message)
            logger.info(f"NotificationService.send_push: SUCCESS  response={response}")
        except Exception as e:
            logger.error(f"NotificationService.send_push: FAILED  token={token[:20]}  error={type(e).__name__}: {e}")

    async def send_sms(self, to: str, body: str):
        logger.info(f"NotificationService.send_sms: to={to}")
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            message = client.messages.create(body=body, from_=settings.TWILIO_PHONE, to=to)
            logger.info(f"NotificationService.send_sms: SUCCESS  sid={message.sid}  to={to}")
        except Exception as e:
            logger.error(f"NotificationService.send_sms: FAILED  to={to}  error={type(e).__name__}: {e}")
