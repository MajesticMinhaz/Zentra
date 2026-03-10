from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from core.models import BaseModel


class Payment(BaseModel):
    class PaymentMethod(models.TextChoices):
        BANK_TRANSFER = "bank", "Bank Transfer"
        STRIPE = "stripe", "Stripe"
        CASH = "cash", "Cash"
        CHECK = "check", "Check"
        CREDIT_CARD = "credit_card", "Credit Card"
        OTHER = "other", "Other"

    class PaymentStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    invoice = models.ForeignKey(
        "invoices.Invoice", on_delete=models.PROTECT, related_name="payments"
    )
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="payments"
    )
    amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))]
    )
    currency = models.CharField(max_length=3, default="USD")
    payment_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=PaymentMethod)
    status = models.CharField(max_length=20, choices=PaymentStatus, default=PaymentStatus.COMPLETED)
    transaction_reference = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    # Stripe-specific
    stripe_payment_intent = models.CharField(max_length=255, blank=True)
    stripe_charge_id = models.CharField(max_length=255, blank=True)

    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="payments_created"
    )

    class Meta:
        db_table = "payments"
        ordering = ["-payment_date", "-created_at"]
        indexes = [
            models.Index(fields=["invoice"]),
            models.Index(fields=["customer"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="payment_amount_positive",
            ),
        ]

    def __str__(self):
        return f"Payment {self.id} - {self.customer.display_name} - {self.amount}"
