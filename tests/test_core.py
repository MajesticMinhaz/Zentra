"""
Core test suite for Zentra.
Covers: Auth, Customers, Invoices, Payments, Quotes, Subscriptions.
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.urls import reverse
from rest_framework import status

from users.models import User
from customers.models import Customer
from invoices.models import Invoice
from payments.models import Payment
from quotes.models import Quote, QuoteLineItem
from subscriptions.models import Subscription, SubscriptionItem
from invoices.services import InvoiceService
from core.exceptions import InvoiceError, PaymentError, QuoteError


# ─────────────────────────────────────────────────────────────────────────────
# Authentication Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestAuthentication:
    def test_login_success(self, api_client, admin_user):
        response = api_client.post("/api/v1/auth/login/", {
            "email": "admin@test.com",
            "password": "Test1234!",
        })
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["role"] == "admin"

    def test_login_wrong_password(self, api_client, admin_user):
        response = api_client.post("/api/v1/auth/login/", {
            "email": "admin@test.com",
            "password": "wrongpassword",
        })
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_unauthenticated_request_denied(self, api_client):
        response = api_client.get("/api/v1/customers/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_me_endpoint(self, auth_client, admin_user):
        response = auth_client.get("/api/v1/users/me/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == admin_user.email


# ─────────────────────────────────────────────────────────────────────────────
# Customer Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestCustomers:
    def test_create_customer(self, auth_client):
        response = auth_client.post("/api/v1/customers/", {
            "customer_type": "company",
            "display_name": "New Corp",
            "email": "billing@newcorp.com",
            "currency": "USD",
        })
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["display_name"] == "New Corp"

    def test_list_customers(self, auth_client, customer):
        response = auth_client.get("/api/v1/customers/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_soft_delete_customer(self, auth_client, customer):
        response = auth_client.delete(f"/api/v1/customers/{customer.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        customer.refresh_from_db()
        # Re-fetch via all_objects since soft delete hides from default manager
        refreshed = Customer.all_objects.get(pk=customer.id)
        assert refreshed.is_deleted

    def test_customer_not_in_list_after_delete(self, auth_client, customer):
        auth_client.delete(f"/api/v1/customers/{customer.id}/")
        response = auth_client.get("/api/v1/customers/")
        ids = [c["id"] for c in response.data["results"]]
        assert str(customer.id) not in ids

    def test_restore_customer(self, auth_client, customer):
        auth_client.delete(f"/api/v1/customers/{customer.id}/")
        response = auth_client.post(f"/api/v1/customers/{customer.id}/restore/")
        assert response.status_code == status.HTTP_200_OK
        refreshed = Customer.all_objects.get(pk=customer.id)
        assert not refreshed.is_deleted


# ─────────────────────────────────────────────────────────────────────────────
# Invoice Service Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestInvoiceService:
    def test_create_invoice_calculates_totals(self, draft_invoice, item):
        """2 units × $100 + 10% tax = $220"""
        assert draft_invoice.subtotal == Decimal("200.00")
        assert draft_invoice.tax_amount == Decimal("20.00")
        assert draft_invoice.total == Decimal("220.00")
        assert draft_invoice.balance_due == Decimal("220.00")

    def test_invoice_number_generated(self, draft_invoice):
        assert draft_invoice.number.startswith("INV-")

    def test_send_invoice(self, draft_invoice):
        invoice = InvoiceService.send_invoice(draft_invoice)
        assert invoice.status == Invoice.Status.SENT
        assert invoice.sent_at is not None

    def test_cannot_send_already_sent_invoice(self, draft_invoice):
        InvoiceService.send_invoice(draft_invoice)
        with pytest.raises(InvoiceError):
            InvoiceService.send_invoice(draft_invoice)

    def test_apply_partial_payment(self, draft_invoice):
        InvoiceService.send_invoice(draft_invoice)
        invoice = InvoiceService.apply_payment(draft_invoice, Decimal("100.00"))
        assert invoice.status == Invoice.Status.PARTIALLY_PAID
        assert invoice.amount_paid == Decimal("100.00")
        assert invoice.balance_due == Decimal("120.00")

    def test_apply_full_payment_marks_paid(self, draft_invoice):
        InvoiceService.send_invoice(draft_invoice)
        invoice = InvoiceService.apply_payment(draft_invoice, draft_invoice.total)
        assert invoice.status == Invoice.Status.PAID
        assert invoice.balance_due == Decimal("0.00")
        assert invoice.paid_at is not None

    def test_create_credit_note(self, draft_invoice, admin_user):
        InvoiceService.send_invoice(draft_invoice)
        cn = InvoiceService.create_credit_note(draft_invoice, Decimal("50.00"), "Partial refund", admin_user)
        assert cn.invoice_type == Invoice.InvoiceType.CREDIT_NOTE
        assert cn.total == Decimal("50.00")
        draft_invoice.refresh_from_db()
        assert draft_invoice.amount_paid == Decimal("50.00")

    def test_credit_note_exceeds_total_raises_error(self, draft_invoice, admin_user):
        with pytest.raises(InvoiceError):
            InvoiceService.create_credit_note(draft_invoice, Decimal("9999.00"), "Excess refund", admin_user)

    def test_cancel_invoice(self, draft_invoice):
        invoice = InvoiceService.cancel_invoice(draft_invoice)
        assert invoice.status == Invoice.Status.CANCELLED

    def test_cannot_cancel_paid_invoice(self, draft_invoice, admin_user):
        InvoiceService.send_invoice(draft_invoice)
        InvoiceService.apply_payment(draft_invoice, draft_invoice.total)
        with pytest.raises(InvoiceError):
            InvoiceService.cancel_invoice(draft_invoice)

    def test_overdue_check(self, customer, item, admin_user):
        data = {
            "invoice_type": Invoice.InvoiceType.SALES,
            "customer": customer,
            "issue_date": date.today() - timedelta(days=40),
            "due_date": date.today() - timedelta(days=10),
            "currency": "USD",
            "line_items": [
                {"item": item, "description": "Test", "quantity": Decimal("1"), "unit_price": Decimal("50"), "tax_rate": Decimal("0")}
            ],
        }
        inv = InvoiceService.create_invoice(data, created_by=admin_user)
        inv.status = Invoice.Status.SENT
        inv.save(update_fields=["status"])
        count = InvoiceService.check_overdue_invoices()
        assert count >= 1
        inv.refresh_from_db()
        assert inv.status == Invoice.Status.OVERDUE


# ─────────────────────────────────────────────────────────────────────────────
# Payment Service Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestPaymentService:
    def test_payment_exceeding_balance_raises_error(self, draft_invoice, admin_user):
        from payments.services import PaymentService
        InvoiceService.send_invoice(draft_invoice)
        with pytest.raises(PaymentError):
            PaymentService.create_payment({
                "invoice": draft_invoice,
                "amount": Decimal("9999.00"),
                "payment_method": Payment.PaymentMethod.CASH,
                "payment_date": date.today(),
            }, created_by=admin_user)

    def test_payment_on_cancelled_invoice_raises_error(self, draft_invoice, admin_user):
        from payments.services import PaymentService
        InvoiceService.cancel_invoice(draft_invoice)
        with pytest.raises(PaymentError):
            PaymentService.create_payment({
                "invoice": draft_invoice,
                "amount": Decimal("100.00"),
                "payment_method": Payment.PaymentMethod.CASH,
                "payment_date": date.today(),
            }, created_by=admin_user)

    def test_refund_payment(self, draft_invoice, admin_user):
        from payments.services import PaymentService
        InvoiceService.send_invoice(draft_invoice)
        payment = PaymentService.create_payment({
            "invoice": draft_invoice,
            "amount": draft_invoice.total,
            "payment_method": Payment.PaymentMethod.BANK_TRANSFER,
            "payment_date": date.today(),
            "transaction_reference": "TXN-123",
        }, created_by=admin_user)
        assert payment.status == Payment.PaymentStatus.COMPLETED

        refunded = PaymentService.refund_payment(payment, "Customer request")
        assert refunded.status == Payment.PaymentStatus.REFUNDED
        draft_invoice.refresh_from_db()
        assert draft_invoice.status == Invoice.Status.SENT


# ─────────────────────────────────────────────────────────────────────────────
# Quote Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestQuotes:
    def test_create_quote_via_api(self, auth_client, customer, item):
        response = auth_client.post("/api/v1/quotes/", {
            "customer": str(customer.id),
            "issue_date": str(date.today()),
            "expiry_date": str(date.today() + timedelta(days=30)),
            "currency": "USD",
            "line_items": [
                {
                    "item": str(item.id),
                    "description": "Consulting",
                    "quantity": "5.000",
                    "unit_price": "100.00",
                    "tax_rate": "10.00",
                }
            ],
        }, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["number"].startswith("QUO-")
        assert Decimal(response.data["total"]) == Decimal("550.00")  # 500 + 50 tax

    def test_cannot_edit_accepted_quote(self, auth_client, customer, item):
        # Create + accept quote
        q = Quote.objects.create(
            number="QUO-99999",
            customer=customer,
            status=Quote.Status.ACCEPTED,
            issue_date=date.today(),
        )
        response = auth_client.patch(f"/api/v1/quotes/{q.id}/", {"title": "New title"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_convert_accepted_quote_to_invoice(self, auth_client, customer, item, admin_user):
        from core.utils import generate_document_number
        from django.conf import settings
        q = Quote.objects.create(
            number=generate_document_number(settings.QUOTE_NUMBER_PREFIX, Quote),
            customer=customer,
            status=Quote.Status.SENT,
            issue_date=date.today(),
        )
        QuoteLineItem.objects.create(
            quote=q,
            item=item,
            description="Work",
            quantity=Decimal("1"),
            unit_price=Decimal("200.00"),
            tax_rate=Decimal("10.00"),
        )
        q.recalculate_totals()
        # Accept first
        auth_client.post(f"/api/v1/quotes/{q.id}/accept/")
        response = auth_client.post(f"/api/v1/quotes/{q.id}/convert-to-invoice/")
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["invoice_type"] == "sales"
        assert response.data["number"].startswith("INV-")


# ─────────────────────────────────────────────────────────────────────────────
# Subscription Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestSubscriptions:
    def test_cancel_subscription(self, db, customer, item, admin_user):
        sub = Subscription.objects.create(
            customer=customer,
            name="Test Plan",
            billing_cycle=Subscription.BillingCycle.MONTHLY,
            start_date=date.today(),
            next_billing_date=date.today() + timedelta(days=30),
            amount=Decimal("99.00"),
            created_by=admin_user,
        )
        sub.cancel("No longer needed")
        assert sub.status == Subscription.Status.CANCELLED
        assert sub.cancelled_at is not None

    def test_pause_and_resume_subscription(self, db, customer, admin_user):
        sub = Subscription.objects.create(
            customer=customer,
            name="Test Plan",
            billing_cycle=Subscription.BillingCycle.MONTHLY,
            start_date=date.today(),
            next_billing_date=date.today() + timedelta(days=30),
            amount=Decimal("49.00"),
            created_by=admin_user,
        )
        sub.pause()
        assert sub.status == Subscription.Status.PAUSED
        sub.resume()
        assert sub.status == Subscription.Status.ACTIVE
        assert sub.paused_at is None

    def test_advance_billing_date_monthly(self, db, customer, admin_user):
        from dateutil.relativedelta import relativedelta
        billing = date(2024, 1, 15)
        sub = Subscription.objects.create(
            customer=customer,
            name="Monthly",
            billing_cycle=Subscription.BillingCycle.MONTHLY,
            start_date=billing,
            next_billing_date=billing,
            amount=Decimal("99.00"),
            created_by=admin_user,
        )
        sub.advance_billing_date()
        assert sub.next_billing_date == date(2024, 2, 15)


# ─────────────────────────────────────────────────────────────────────────────
# RBAC Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestRBAC:
    def test_staff_cannot_access_reports(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        response = api_client.get("/api/v1/reports/revenue/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_accountant_can_access_reports(self, api_client, accountant_user):
        api_client.force_authenticate(user=accountant_user)
        response = api_client.get("/api/v1/reports/revenue/")
        assert response.status_code == status.HTTP_200_OK

    def test_staff_cannot_create_users(self, api_client, staff_user):
        api_client.force_authenticate(user=staff_user)
        response = api_client.post("/api/v1/users/", {
            "email": "new@test.com",
            "password": "Test1234!",
            "confirm_password": "Test1234!",
            "first_name": "New",
            "last_name": "User",
        }, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN
