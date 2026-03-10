"""
Payment service — validates and applies payments to invoices.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from core.exceptions import PaymentError
from .models import Payment
from invoices.models import Invoice
from invoices.services import InvoiceService


class PaymentService:
    @staticmethod
    @transaction.atomic
    def create_payment(data: dict, created_by) -> Payment:
        invoice = data.get("invoice")
        amount = data.get("amount")

        if invoice.status == Invoice.Status.CANCELLED:
            raise PaymentError("Cannot apply payment to a cancelled invoice.")
        if invoice.status == Invoice.Status.DRAFT:
            raise PaymentError("Cannot apply payment to a draft invoice. Send it first.")
        if invoice.status == Invoice.Status.PAID:
            raise PaymentError("Invoice is already fully paid.")
        if amount > invoice.balance_due:
            raise PaymentError(
                f"Payment amount ({amount}) exceeds invoice balance due ({invoice.balance_due})."
            )

        data["customer"] = invoice.customer
        data["created_by"] = created_by
        data.setdefault("currency", invoice.currency)
        data.setdefault("payment_date", timezone.now().date())

        payment = Payment.objects.create(**data)

        # Update invoice
        InvoiceService.apply_payment(invoice, amount)

        return payment

    @staticmethod
    @transaction.atomic
    def apply_credit(customer, invoice: Invoice, amount: Decimal, created_by) -> Payment:
        """
        Apply some or all of a customer's credit balance to a specific invoice.

        This:
          1. Validates there is enough credit available.
          2. Draws down the credit notes (oldest first) by reducing their balance_due.
          3. Creates a Payment record with method='credit' for the audit trail.
          4. Calls InvoiceService.apply_payment to update the invoice.
        The signal on Invoice automatically recalculates customer.credit_balance.
        """
        from customers.models import Customer

        # Refresh customer to get latest credit_balance
        customer.refresh_from_db()

        if customer.credit_balance <= Decimal("0.00"):
            raise PaymentError("This customer has no available credit balance.")

        if invoice.customer_id != customer.pk:
            raise PaymentError("Invoice does not belong to this customer.")

        if invoice.status in (Invoice.Status.PAID, Invoice.Status.CANCELLED):
            raise PaymentError("Cannot apply credit to a paid or cancelled invoice.")

        max_applicable = min(amount, invoice.balance_due, customer.credit_balance)
        if max_applicable <= Decimal("0.00"):
            raise PaymentError("No applicable credit amount.")

        # Draw down credit notes oldest-first using credit_remaining
        remaining = max_applicable
        credit_notes = Invoice.objects.filter(
            customer=customer,
            invoice_type=Invoice.InvoiceType.CREDIT_NOTE,
            credit_remaining__gt=Decimal("0.00"),
        ).order_by("issue_date", "created_at")

        for cn in credit_notes:
            if remaining <= Decimal("0.00"):
                break
            use = min(remaining, cn.credit_remaining)
            cn.credit_remaining -= use
            cn.save(update_fields=["credit_remaining"])
            remaining -= use

        applied = max_applicable - remaining

        # Record the credit application as a payment for full auditability
        payment = Payment.objects.create(
            invoice=invoice,
            customer=customer,
            amount=applied,
            currency=invoice.currency,
            payment_date=timezone.now().date(),
            payment_method=Payment.PaymentMethod.OTHER,
            transaction_reference="Credit applied",
            notes=f"Credit balance applied: {applied}",
            status=Payment.PaymentStatus.COMPLETED,
            created_by=created_by,
        )

        # Update the invoice
        InvoiceService.apply_payment(invoice, applied)

        return payment

    @staticmethod
    @transaction.atomic
    def refund_payment(payment: Payment, reason: str = "") -> Payment:
        if payment.status == Payment.PaymentStatus.REFUNDED:
            raise PaymentError("Payment is already refunded.")
        if payment.status != Payment.PaymentStatus.COMPLETED:
            raise PaymentError("Only completed payments can be refunded.")

        payment.status = Payment.PaymentStatus.REFUNDED
        payment.notes = f"REFUNDED: {reason}\n{payment.notes}".strip()
        payment.save(update_fields=["status", "notes"])

        # Reverse the payment on invoice
        invoice = payment.invoice
        invoice.amount_paid -= payment.amount
        invoice.balance_due = invoice.total - invoice.amount_paid
        if invoice.amount_paid <= Decimal("0.00"):
            invoice.amount_paid = Decimal("0.00")
            invoice.status = Invoice.Status.SENT
            invoice.paid_at = None
        else:
            invoice.status = Invoice.Status.PARTIALLY_PAID
        invoice.save(update_fields=["amount_paid", "balance_due", "status", "paid_at"])

        return payment