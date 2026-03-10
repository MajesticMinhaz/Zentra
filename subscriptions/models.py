from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from dateutil.relativedelta import relativedelta
from core.models import BaseModel


class Subscription(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"
        TRIAL = "trial", "Trial"

    class BillingCycle(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        YEARLY = "yearly", "Yearly"

    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="subscriptions")
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name="subscriptions",
    )
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    billing_cycle = models.CharField(max_length=20, choices=BillingCycle.choices, default=BillingCycle.MONTHLY)

    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    trial_end_date = models.DateField(null=True, blank=True)
    next_billing_date = models.DateField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)

    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))])
    currency = models.CharField(max_length=3, default="USD")
    auto_invoice = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="subscriptions_created"
    )

    class Meta:
        db_table = "subscriptions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["next_billing_date"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.customer.display_name} ({self.get_billing_cycle_display()})"

    def advance_billing_date(self):
        """Advance next_billing_date by one billing cycle."""
        delta_map = {
            self.BillingCycle.MONTHLY: relativedelta(months=1),
            self.BillingCycle.QUARTERLY: relativedelta(months=3),
            self.BillingCycle.YEARLY: relativedelta(years=1),
        }
        self.next_billing_date = self.next_billing_date + delta_map[self.billing_cycle]
        self.save(update_fields=["next_billing_date"])

    def cancel(self, reason: str = ""):
        self.status = self.Status.CANCELLED
        self.cancelled_at = timezone.now()
        self.notes = f"Cancelled: {reason}\n{self.notes}".strip()
        self.save(update_fields=["status", "cancelled_at", "notes"])

    def pause(self):
        self.status = self.Status.PAUSED
        self.paused_at = timezone.now()
        self.save(update_fields=["status", "paused_at"])

    def resume(self):
        self.status = self.Status.ACTIVE
        self.paused_at = None
        self.save(update_fields=["status", "paused_at"])


class SubscriptionItem(models.Model):
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey("items.Item", on_delete=models.PROTECT, related_name="subscription_items")
    description = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=3, default=Decimal("1.000"))
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "subscription_items"

    def __str__(self):
        return f"{self.item.name} x{self.quantity} @ {self.unit_price}"
