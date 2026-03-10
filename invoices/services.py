"""
Invoice service layer — all business logic lives here, not in views or models.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from core.exceptions import InvoiceError
from core.utils import generate_document_number
from django.conf import settings
from .models import Invoice, InvoiceLineItem, TaxRate


class InvoiceService:
    @staticmethod
    @transaction.atomic
    def create_invoice(data: dict, created_by) -> Invoice:
        line_items_data = data.pop("line_items", [])

        # Resolve organization — use provided or fall back to default
        from organizations.models import Organization
        organization = data.get("organization")
        if not organization:
            organization = Organization.objects.filter(is_default=True, is_active=True).first()
            if not organization:
                organization = Organization.objects.filter(is_active=True).first()
        data["organization"] = organization

        # Auto-generate number using org prefix or settings fallback
        invoice_type = data.get("invoice_type", Invoice.InvoiceType.SALES)
        if invoice_type == Invoice.InvoiceType.SALES:
            prefix = (organization.invoice_prefix if organization else None) or settings.INVOICE_NUMBER_PREFIX
        elif invoice_type == Invoice.InvoiceType.RETAINER:
            prefix = "RET"
        elif invoice_type == Invoice.InvoiceType.CREDIT_NOTE:
            prefix = "CN"
        else:
            prefix = "REC"

        data["number"] = generate_document_number(prefix, Invoice)
        data["created_by"] = created_by

        invoice = Invoice(**data)
        invoice.save()

        for li_data in line_items_data:
            InvoiceLineItem.objects.create(invoice=invoice, **li_data)

        invoice.recalculate_totals()

        # For receipts, auto-mark as paid
        if invoice_type == Invoice.InvoiceType.RECEIPT:
            InvoiceService.record_immediate_payment(invoice)

        return invoice

    @staticmethod
    @transaction.atomic
    def update_invoice(invoice: Invoice, data: dict) -> Invoice:
        if invoice.status not in (Invoice.Status.DRAFT,):
            raise InvoiceError("Only draft invoices can be fully edited.")

        line_items_data = data.pop("line_items", None)

        for field, value in data.items():
            setattr(invoice, field, value)
        invoice.save()

        if line_items_data is not None:
            invoice.line_items.all().delete()
            for li_data in line_items_data:
                InvoiceLineItem.objects.create(invoice=invoice, **li_data)

        invoice.recalculate_totals()
        return invoice

    @staticmethod
    def send_invoice(invoice: Invoice) -> Invoice:
        if invoice.status != Invoice.Status.DRAFT:
            raise InvoiceError("Only draft invoices can be sent.")
        invoice.status = Invoice.Status.SENT
        invoice.sent_at = timezone.now()
        invoice.save(update_fields=["status", "sent_at"])
        # Trigger email task
        from invoices.tasks import send_invoice_email
        send_invoice_email.delay(str(invoice.id))
        return invoice

    @staticmethod
    def cancel_invoice(invoice: Invoice) -> Invoice:
        if invoice.status == Invoice.Status.PAID:
            raise InvoiceError("Cannot cancel a fully paid invoice. Create a credit note instead.")
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status"])
        # Signal (invoices/signals.py) recalculates customer outstanding_balance automatically
        return invoice

    @staticmethod
    def apply_payment(invoice: Invoice, amount: Decimal) -> Invoice:
        """Called from payment service after a payment is recorded."""
        if invoice.status == Invoice.Status.CANCELLED:
            raise InvoiceError("Cannot apply payment to a cancelled invoice.")

        invoice.amount_paid += amount
        invoice.balance_due = invoice.total - invoice.amount_paid

        if invoice.balance_due <= Decimal("0.00"):
            invoice.balance_due = Decimal("0.00")
            invoice.status = Invoice.Status.PAID
            invoice.paid_at = timezone.now()
            # When a credit note is fully paid, add the paid amount to credit_remaining
            if invoice.invoice_type == Invoice.InvoiceType.CREDIT_NOTE:
                invoice.credit_remaining += amount
        else:
            if invoice.amount_paid > Decimal("0.00"):
                invoice.status = Invoice.Status.PARTIALLY_PAID
            # Partial payment on credit note also adds to available credit
            if invoice.invoice_type == Invoice.InvoiceType.CREDIT_NOTE:
                invoice.credit_remaining += amount

        invoice.save(update_fields=["amount_paid", "balance_due", "status", "paid_at", "credit_remaining"])
        return invoice

    @staticmethod
    def record_immediate_payment(invoice: Invoice):
        """Mark a sales receipt as immediately paid."""
        invoice.amount_paid = invoice.total
        invoice.balance_due = Decimal("0.00")
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=["amount_paid", "balance_due", "status", "paid_at"])

    @staticmethod
    @transaction.atomic
    def convert_quote_to_invoice(quote) -> Invoice:
        from quotes.models import Quote
        if quote.status != Quote.Status.ACCEPTED:
            raise InvoiceError("Only accepted quotes can be converted to invoices.")

        invoice = Invoice(
            invoice_type=Invoice.InvoiceType.SALES,
            customer=quote.customer,
            organization=quote.organization,
            source_quote=quote,
            issue_date=timezone.now().date(),
            due_date=quote.expiry_date,
            notes=quote.notes,
            terms=quote.terms,
            discount_type=quote.discount_type,
            discount_value=quote.discount_value,
            currency=quote.currency,
        )
        inv_prefix = (quote.organization.invoice_prefix if quote.organization else None) or settings.INVOICE_NUMBER_PREFIX
        invoice.number = generate_document_number(inv_prefix, Invoice)
        invoice.save()

        for li in quote.line_items.all():
            InvoiceLineItem.objects.create(
                invoice=invoice,
                item=li.item,
                description=li.description,
                quantity=li.quantity,
                unit_price=li.unit_price,
                tax_rate=li.tax_rate,
                sort_order=li.sort_order,
            )

        invoice.recalculate_totals()
        quote.status = Quote.Status.ACCEPTED
        quote.save(update_fields=["status"])
        return invoice

    @staticmethod
    @transaction.atomic
    def create_credit_note(invoice: Invoice, amount: Decimal, reason: str = "", created_by=None) -> Invoice:
        if invoice.invoice_type != Invoice.InvoiceType.SALES:
            raise InvoiceError("Can only create credit notes for sales invoices.")
        if amount > invoice.total:
            raise InvoiceError("Credit note amount cannot exceed invoice total.")

        cn = Invoice(
            invoice_type=Invoice.InvoiceType.CREDIT_NOTE,
            customer=invoice.customer,
            organization=invoice.organization,
            linked_invoice=invoice,
            notes=reason,
            issue_date=timezone.now().date(),
            currency=invoice.currency,
            created_by=created_by,
        )
        cn.number = generate_document_number("CN", Invoice)
        cn.subtotal = amount
        cn.total = amount
        cn.balance_due = amount
        cn.status = Invoice.Status.DRAFT  # starts as draft, must be sent then paid to unlock credit
        cn.save()

        return cn

    @staticmethod
    def check_overdue_invoices():
        """Celery periodic task: mark overdue invoices. Runs every 5 minutes.
        Only SENT → OVERDUE. PARTIALLY_PAID keeps its status; overdue state
        is surfaced via the is_overdue computed field on the serializer.
        """
        today = timezone.now().date()
        updated = Invoice.objects.filter(
            status=Invoice.Status.SENT,
            due_date__lt=today,
        ).update(status=Invoice.Status.OVERDUE)
        return updated