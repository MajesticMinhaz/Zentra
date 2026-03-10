from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from core.models import BaseModel


class Quote(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"

    class DiscountType(models.TextChoices):
        NONE = "none", "No Discount"
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed Amount"

    number = models.CharField(max_length=50, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status, default=Status.DRAFT)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name="quotes",
    )
    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="quotes")
    title = models.CharField(max_length=255, blank=True)
    reference = models.CharField(max_length=100, blank=True)

    issue_date = models.DateField(default=timezone.now)
    expiry_date = models.DateField(null=True, blank=True)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount_type = models.CharField(max_length=20, choices=DiscountType, default=DiscountType.NONE)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="USD")

    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)

    # PDF caching — mirrors invoices.Invoice
    pdf_file = models.FileField(upload_to="quotes/pdf/", null=True, blank=True)
    pdf_generated_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="quotes_created"
    )

    class Meta:
        db_table = "quotes"
        ordering = ["-issue_date", "-created_at"]
        indexes = [
            models.Index(fields=["number"]),
            models.Index(fields=["status"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self):
        return f"{self.number} - {self.customer.display_name}"

    @property
    def is_expired(self):
        if self.expiry_date and self.status not in (self.Status.ACCEPTED, self.Status.REJECTED):
            return self.expiry_date < timezone.now().date()
        return False

    def recalculate_totals(self):
        from django.db.models import Sum
        from core.utils import calculate_discount_amount

        agg = self.line_items.aggregate(
            sub=Sum(models.ExpressionWrapper(
                models.F("quantity") * models.F("unit_price"),
                output_field=models.DecimalField()
            )),
            tax=Sum("tax_amount"),
        )
        self.subtotal = agg["sub"] or Decimal("0.00")

        if self.discount_type != self.DiscountType.NONE:
            self.discount_amount = calculate_discount_amount(
                self.subtotal, self.discount_type, self.discount_value
            )
        else:
            self.discount_amount = Decimal("0.00")

        self.tax_amount = agg["tax"] or Decimal("0.00")
        self.total = self.subtotal - self.discount_amount + self.tax_amount
        self.save(update_fields=["subtotal", "discount_amount", "tax_amount", "total"])


class QuoteLineItem(models.Model):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="line_items")
    item = models.ForeignKey(
        "items.Item", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="quote_line_items"
    )
    description = models.TextField()
    quantity = models.DecimalField(max_digits=10, decimal_places=3, validators=[MinValueValidator(Decimal("0.001"))])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))])
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "quote_line_items"
        ordering = ["sort_order", "id"]

    def save(self, *args, **kwargs):
        subtotal = self.quantity * self.unit_price
        self.tax_amount = (subtotal * self.tax_rate / 100).quantize(Decimal("0.01"))
        self.line_total = subtotal + self.tax_amount
        super().save(*args, **kwargs)
