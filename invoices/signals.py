"""
Invoice signals — update customer outstanding balance and credit balance.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db.models import Sum
from .models import Invoice


@receiver(post_save, sender=Invoice)
def update_customer_balances(sender, instance, **kwargs):
    """
    Recalculate customer outstanding_balance and credit_balance whenever
    an invoice changes.  Uses queryset aggregates for concurrency safety.
    """
    from customers.models import Customer

    # Outstanding: sum of balance_due on all open non-credit-note invoices
    outstanding_agg = Invoice.objects.filter(
        customer=instance.customer,
        invoice_type__in=[
            Invoice.InvoiceType.SALES,
            Invoice.InvoiceType.RETAINER,
            Invoice.InvoiceType.RECEIPT,
        ],
        status__in=[
            Invoice.Status.SENT,
            Invoice.Status.PARTIALLY_PAID,
            Invoice.Status.OVERDUE,
        ],
    ).aggregate(total=Sum("balance_due"))
    outstanding = outstanding_agg["total"] or 0

    # Credit balance: sum of credit_remaining on credit notes that have been
    # at least partially paid. credit_remaining accumulates as payments are made
    # and is drawn down as credit is applied to invoices.
    credit_agg = Invoice.objects.filter(
        customer=instance.customer,
        invoice_type=Invoice.InvoiceType.CREDIT_NOTE,
        credit_remaining__gt=0,
    ).aggregate(total=Sum("credit_remaining"))
    credit = credit_agg["total"] or 0

    Customer.all_objects.filter(pk=instance.customer_id).update(
        outstanding_balance=outstanding,
        credit_balance=credit,
    )