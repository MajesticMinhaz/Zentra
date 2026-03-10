#!/usr/bin/env python
"""
Seed script: populates the DB with realistic sample data for development.
Run with: python scripts/seed_data.py
"""
import os
import sys
import django
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "zentra.settings.dev")
django.setup()

from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone

from users.models import User
from customers.models import Customer, CustomerContact
from items.models import Item
from invoices.models import Invoice, InvoiceLineItem, TaxRate
from quotes.models import Quote, QuoteLineItem
from payments.models import Payment
from subscriptions.models import Subscription, SubscriptionItem
from invoices.services import InvoiceService


def run():
    print("🌱 Seeding database...")

    # ── Users ──────────────────────────────────────────────────────────────────
    admin = User.objects.create_superuser(
        email="admin@zentra.io",
        password="Admin1234!",
        first_name="Alice",
        last_name="Admin",
    )
    accountant = User.objects.create_user(
        email="accountant@zentra.io",
        password="Account1234!",
        first_name="Bob",
        last_name="Books",
        role=User.Role.ACCOUNTANT,
    )
    print(f"  ✓ Users created: {admin.email}, {accountant.email}")

    # ── Tax Rates ──────────────────────────────────────────────────────────────
    tax_std = TaxRate.objects.create(name="Standard VAT", rate=Decimal("20.00"), is_default=True)
    tax_reduced = TaxRate.objects.create(name="Reduced VAT", rate=Decimal("5.00"))
    tax_zero = TaxRate.objects.create(name="Zero Rate", rate=Decimal("0.00"))
    print("  ✓ Tax rates created")

    # ── Items ──────────────────────────────────────────────────────────────────
    item_consulting = Item.objects.create(
        item_type=Item.ItemType.SERVICE,
        name="Consulting Hour",
        sku="SVC-CONSULT-01",
        unit_price=Decimal("150.00"),
        tax_rate=Decimal("20.00"),
        unit_of_measure=Item.UnitOfMeasure.HOUR,
        created_by=admin,
    )
    item_license = Item.objects.create(
        item_type=Item.ItemType.SERVICE,
        name="Software License (Monthly)",
        sku="SVC-LIC-01",
        unit_price=Decimal("99.00"),
        tax_rate=Decimal("20.00"),
        unit_of_measure=Item.UnitOfMeasure.MONTH,
        is_recurring=True,
        created_by=admin,
    )
    item_hardware = Item.objects.create(
        item_type=Item.ItemType.PRODUCT,
        name="Hardware Module",
        sku="HW-MOD-001",
        unit_price=Decimal("450.00"),
        tax_rate=Decimal("20.00"),
        created_by=admin,
    )
    print("  ✓ Items created")

    # ── Customers ──────────────────────────────────────────────────────────────
    customer_acme = Customer.objects.create(
        customer_type=Customer.CustomerType.BUSINESS,
        display_name="Acme Corporation",
        company_name="Acme Corp Ltd",
        email="billing@acme.example.com",
        phone="+1 555 100 2000",
        currency="USD",
        billing_address_line1="100 Business Park",
        billing_city="San Francisco",
        billing_state="CA",
        billing_postal_code="94102",
        billing_country="USA",
        created_by=admin,
    )
    CustomerContact.objects.create(
        customer=customer_acme,
        first_name="Jane",
        last_name="Smith",
        email="jane@acme.example.com",
        job_title="Finance Manager",
        is_primary=True,
    )

    customer_solo = Customer.objects.create(
        customer_type=Customer.CustomerType.INDIVIDUAL,
        display_name="John Doe",
        email="john@example.com",
        phone="+1 555 900 1234",
        currency="USD",
        billing_city="New York",
        billing_state="NY",
        billing_country="USA",
        created_by=admin,
    )
    print("  ✓ Customers created")

    # ── Quote ──────────────────────────────────────────────────────────────────
    from core.utils import generate_document_number
    from django.conf import settings

    quote = Quote.objects.create(
        number=generate_document_number(settings.QUOTE_NUMBER_PREFIX, Quote),
        customer=customer_acme,
        title="Q4 Consulting Package",
        issue_date=date.today(),
        expiry_date=date.today() + timedelta(days=30),
        currency="USD",
        created_by=admin,
    )
    QuoteLineItem.objects.create(
        quote=quote,
        item=item_consulting,
        description="Strategy consulting sessions",
        quantity=Decimal("10.000"),
        unit_price=Decimal("150.00"),
        tax_rate=Decimal("20.00"),
    )
    quote.recalculate_totals()
    print(f"  ✓ Quote created: {quote.number}")

    # ── Paid Invoice ───────────────────────────────────────────────────────────
    invoice_data = {
        "invoice_type": Invoice.InvoiceType.SALES,
        "customer": customer_acme,
        "issue_date": date.today() - timedelta(days=30),
        "due_date": date.today() - timedelta(days=10),
        "currency": "USD",
        "notes": "Net 30 payment terms",
        "line_items": [
            {
                "item": item_consulting,
                "description": "Initial consulting - August",
                "quantity": Decimal("8.000"),
                "unit_price": Decimal("150.00"),
                "tax_rate": Decimal("20.00"),
            },
            {
                "item": item_hardware,
                "description": "Hardware setup",
                "quantity": Decimal("1.000"),
                "unit_price": Decimal("450.00"),
                "tax_rate": Decimal("20.00"),
            },
        ],
    }
    invoice_paid = InvoiceService.create_invoice(invoice_data, created_by=admin)
    invoice_paid.status = Invoice.Status.SENT
    invoice_paid.sent_at = timezone.now()
    invoice_paid.save(update_fields=["status", "sent_at"])

    # Add payment
    payment = Payment.objects.create(
        invoice=invoice_paid,
        customer=customer_acme,
        amount=invoice_paid.total,
        currency="USD",
        payment_date=date.today() - timedelta(days=5),
        payment_method=Payment.PaymentMethod.BANK_TRANSFER,
        transaction_reference="TXN-20240815-001",
        status=Payment.PaymentStatus.COMPLETED,
        created_by=admin,
    )
    InvoiceService.apply_payment(invoice_paid, invoice_paid.total)
    print(f"  ✓ Paid invoice created: {invoice_paid.number}")

    # ── Overdue Invoice ────────────────────────────────────────────────────────
    inv_overdue_data = {
        "invoice_type": Invoice.InvoiceType.SALES,
        "customer": customer_solo,
        "issue_date": date.today() - timedelta(days=45),
        "due_date": date.today() - timedelta(days=15),
        "currency": "USD",
        "line_items": [
            {
                "item": item_license,
                "description": "Software license - July",
                "quantity": Decimal("1.000"),
                "unit_price": Decimal("99.00"),
                "tax_rate": Decimal("20.00"),
            },
        ],
    }
    inv_overdue = InvoiceService.create_invoice(inv_overdue_data, created_by=accountant)
    inv_overdue.status = Invoice.Status.OVERDUE
    inv_overdue.sent_at = timezone.now() - timedelta(days=45)
    inv_overdue.save(update_fields=["status", "sent_at"])
    print(f"  ✓ Overdue invoice created: {inv_overdue.number}")

    # ── Subscription ───────────────────────────────────────────────────────────
    sub = Subscription.objects.create(
        customer=customer_acme,
        name="Enterprise License",
        billing_cycle=Subscription.BillingCycle.MONTHLY,
        start_date=date.today(),
        next_billing_date=date.today() + timedelta(days=30),
        amount=Decimal("299.00"),
        currency="USD",
        auto_invoice=True,
        created_by=admin,
    )
    SubscriptionItem.objects.create(
        subscription=sub,
        item=item_license,
        quantity=Decimal("3.000"),
        unit_price=Decimal("99.00"),
    )
    print(f"  ✓ Subscription created: {sub.name}")

    print("\n✅ Seed data complete!")
    print(f"\n  Admin login: admin@zentra.io / Admin1234!")
    print(f"  Accountant login: accountant@zentra.io / Account1234!")


if __name__ == "__main__":
    run()
