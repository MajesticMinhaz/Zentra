"""
Subscription Celery tasks: auto-generate invoices for due subscriptions.
"""
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def process_due_subscriptions():
    """
    Daily task: find all active subscriptions due today or past-due and
    generate invoices for them, then advance the billing date.
    """
    from subscriptions.models import Subscription

    today = timezone.now().date()
    due_subs = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE,
        next_billing_date__lte=today,
        auto_invoice=True,
    ).select_related("customer")

    count = 0
    for subscription in due_subs:
        try:
            generate_subscription_invoice.delay(str(subscription.id))
            count += 1
        except Exception as exc:
            logger.error("Failed to queue invoice for subscription %s: %s", subscription.id, exc)

    logger.info("Queued %d subscription invoices", count)
    return count


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def generate_subscription_invoice(self, subscription_id: str):
    """Generate an invoice for a single subscription and advance the billing date."""
    try:
        from subscriptions.models import Subscription
        from invoices.models import Invoice, InvoiceLineItem
        from invoices.services import InvoiceService
        from core.utils import generate_document_number
        from django.conf import settings
        from decimal import Decimal

        subscription = Subscription.objects.select_related("customer").prefetch_related("items__item").get(
            id=subscription_id
        )

        if subscription.status != Subscription.Status.ACTIVE:
            logger.warning("Subscription %s is not active, skipping.", subscription_id)
            return

        # Build invoice data
        line_items = [
            {
                "item": sub_item.item,
                "description": sub_item.description or sub_item.item.name,
                "quantity": sub_item.quantity,
                "unit_price": sub_item.unit_price,
                "tax_rate": sub_item.item.tax_rate if sub_item.item.is_taxable else Decimal("0.00"),
            }
            for sub_item in subscription.items.all()
        ]

        today = timezone.now().date()
        data = {
            "invoice_type": Invoice.InvoiceType.SALES,
            "customer": subscription.customer,
            "subscription": subscription,
            "issue_date": today,
            "due_date": today,  # due on issue for subscriptions
            "currency": subscription.currency,
            "notes": f"Subscription: {subscription.name} ({subscription.get_billing_cycle_display()})",
            "line_items": line_items,
        }

        invoice = InvoiceService.create_invoice(data, created_by=None)

        # Advance the billing cycle
        subscription.advance_billing_date()

        logger.info(
            "Generated invoice %s for subscription %s (next billing: %s)",
            invoice.number, subscription.name, subscription.next_billing_date,
        )
        return str(invoice.id)

    except Exception as exc:
        logger.error("Failed to generate invoice for subscription %s: %s", subscription_id, exc)
        raise self.retry(exc=exc)
