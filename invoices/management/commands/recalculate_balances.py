"""
Management command to recalculate all customer outstanding_balance and
credit_balance from scratch, fixing any that went negative due to the
cancelled-invoice double-subtraction bug.

Usage: python manage.py recalculate_balances
"""
from django.core.management.base import BaseCommand
from django.db.models import Sum, Q
from customers.models import Customer
from invoices.models import Invoice


class Command(BaseCommand):
    help = "Recalculate outstanding_balance and credit_balance for all customers"

    def handle(self, *args, **options):
        customers = Customer.all_objects.all()
        fixed = 0

        for customer in customers:
            outstanding = Invoice.objects.filter(
                customer=customer,
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
            ).aggregate(total=Sum("balance_due"))["total"] or 0

            credit = Invoice.objects.filter(
                customer=customer,
                invoice_type=Invoice.InvoiceType.CREDIT_NOTE,
                credit_remaining__gt=0,
            ).aggregate(total=Sum("credit_remaining"))["total"] or 0

            Customer.all_objects.filter(pk=customer.pk).update(
                outstanding_balance=outstanding,
                credit_balance=credit,
            )
            fixed += 1

        self.stdout.write(self.style.SUCCESS(
            f"Recalculated balances for {fixed} customers."
        ))
