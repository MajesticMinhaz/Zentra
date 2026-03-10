"""
Pytest fixtures shared across all test modules.
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from rest_framework.test import APIClient

from users.models import User
from customers.models import Customer
from items.models import Item
from invoices.models import Invoice, InvoiceLineItem, TaxRate


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        email="admin@test.com",
        password="Test1234!",
        first_name="Admin",
        last_name="User",
    )


@pytest.fixture
def accountant_user(db):
    return User.objects.create_user(
        email="accountant@test.com",
        password="Test1234!",
        first_name="Account",
        last_name="User",
        role=User.Role.ACCOUNTANT,
    )


@pytest.fixture
def staff_user(db):
    return User.objects.create_user(
        email="staff@test.com",
        password="Test1234!",
        first_name="Staff",
        last_name="User",
        role=User.Role.STAFF,
    )


@pytest.fixture
def auth_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def tax_rate(db):
    return TaxRate.objects.create(name="Test Tax", rate=Decimal("10.00"), is_default=True)


@pytest.fixture
def customer(db, admin_user):
    return Customer.objects.create(
        customer_type=Customer.CustomerType.COMPANY,
        display_name="Test Corp",
        email="billing@testcorp.com",
        currency="USD",
        created_by=admin_user,
    )


@pytest.fixture
def item(db, admin_user):
    return Item.objects.create(
        item_type=Item.ItemType.SERVICE,
        name="Test Service",
        sku="TST-001",
        unit_price=Decimal("100.00"),
        tax_rate=Decimal("10.00"),
        created_by=admin_user,
    )


@pytest.fixture
def draft_invoice(db, customer, item, admin_user):
    from invoices.services import InvoiceService
    data = {
        "invoice_type": Invoice.InvoiceType.SALES,
        "customer": customer,
        "issue_date": date.today(),
        "due_date": date.today() + timedelta(days=30),
        "currency": "USD",
        "line_items": [
            {
                "item": item,
                "description": "Test service delivery",
                "quantity": Decimal("2.000"),
                "unit_price": Decimal("100.00"),
                "tax_rate": Decimal("10.00"),
            }
        ],
    }
    return InvoiceService.create_invoice(data, created_by=admin_user)
