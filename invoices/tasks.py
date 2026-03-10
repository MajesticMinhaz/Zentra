"""
Invoice Celery tasks: PDF generation, email sending, overdue checks.
"""
import logging
from celery import shared_task
from django.core.mail import EmailMessage
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def generate_invoice_pdf(self, invoice_id: str):
    """Generate PDF for a given invoice and store the file path."""
    try:
        from invoices.models import Invoice
        from invoices.pdf import render_invoice_pdf

        invoice = Invoice.objects.select_related("customer", "created_by").prefetch_related(
            "line_items__item"
        ).get(id=invoice_id)

        pdf_path = render_invoice_pdf(invoice)
        invoice.pdf_file = pdf_path
        from django.utils import timezone
        invoice.pdf_generated_at = timezone.now()
        invoice.save(update_fields=["pdf_file", "pdf_generated_at"])
        logger.info("PDF generated for invoice %s at %s", invoice.number, pdf_path)
        return pdf_path
    except Exception as exc:
        logger.error("PDF generation failed for invoice %s: %s", invoice_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def send_invoice_email(self, invoice_id: str):
    """Send invoice email to the customer."""
    try:
        from invoices.models import Invoice

        invoice = Invoice.objects.select_related("customer").get(id=invoice_id)
        if not invoice.customer.email:
            logger.warning("Customer %s has no email", invoice.customer.display_name)
            return

        subject = f"Invoice {invoice.number} from {invoice.customer.currency}"
        body = render_to_string("invoices/email_invoice.html", {"invoice": invoice})

        email = EmailMessage(
            subject=subject,
            body=body,
            to=[invoice.customer.email],
        )
        email.content_subtype = "html"

        if invoice.pdf_file:
            email.attach_file(invoice.pdf_file.path)

        email.send()
        logger.info("Invoice email sent for %s to %s", invoice.number, invoice.customer.email)
    except Exception as exc:
        logger.error("Invoice email failed for %s: %s", invoice_id, exc)
        raise self.retry(exc=exc)


@shared_task
def check_overdue_invoices():
    """Periodic task: mark past-due invoices as overdue."""
    from invoices.services import InvoiceService
    count = InvoiceService.check_overdue_invoices()
    logger.info("Marked %d invoices as overdue", count)
    return count
