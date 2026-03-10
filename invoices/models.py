"""
Invoice models: Sales Invoice, Retainer Invoice, Credit Note, Sales Receipt.
"""
from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from core.models import BaseModel


class TaxRate(BaseModel):
    name = models.CharField(max_length=100)
    rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percentage e.g. 10 = 10%")
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "tax_rates"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.rate}%)"

    def save(self, *args, **kwargs):
        if self.is_default:
            TaxRate.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


class Discount(BaseModel):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed Amount"

    name = models.CharField(max_length=100)
    discount_type = models.CharField(max_length=20, choices=DiscountType.choices)
    value = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "discounts"

    def __str__(self):
        suffix = "%" if self.discount_type == self.DiscountType.PERCENTAGE else ""
        return f"{self.name} ({self.value}{suffix})"


class Invoice(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        CANCELLED = "cancelled", "Cancelled"

    class InvoiceType(models.TextChoices):
        SALES = "sales", "Sales Invoice"
        RETAINER = "retainer", "Retainer Invoice"
        CREDIT_NOTE = "credit_note", "Credit Note"
        RECEIPT = "receipt", "Sales Receipt"

    class DiscountType(models.TextChoices):
        NONE = "none", "No Discount"
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed Amount"

    # Core
    invoice_type = models.CharField(max_length=20, choices=InvoiceType, default=InvoiceType.SALES)
    number = models.CharField(max_length=50, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status, default=Status.DRAFT)
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name="invoices",
    )
    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="invoices")
    reference = models.CharField(max_length=100, blank=True, help_text="Customer PO / reference")

    # Dates
    issue_date = models.DateField(default=timezone.now)
    due_date = models.DateField(null=True, blank=True)

    # Amounts
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    discount_type = models.CharField(max_length=20, choices=DiscountType, default=DiscountType.NONE)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    balance_due = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=3, default="USD")

    # Retainer-specific
    retainer_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    retainer_remaining = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    # Credit note — tracks how much of this credit note is still available to apply
    # Set to total when the credit note is paid; drawn down as credit is applied to invoices
    credit_remaining = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))

    # Credit note
    linked_invoice = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="credit_notes", limit_choices_to={"invoice_type": InvoiceType.SALES}
    )

    # Quote conversion
    source_quote = models.ForeignKey(
        "quotes.Quote", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoices"
    )

    # Subscription
    subscription = models.ForeignKey(
        "subscriptions.Subscription", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoices"
    )

    # Notes
    notes = models.TextField(blank=True)
    terms = models.TextField(blank=True)

    # PDF
    pdf_file = models.FileField(upload_to="invoices/pdf/", null=True, blank=True)
    pdf_generated_at = models.DateTimeField(null=True, blank=True)

    # Meta
    sent_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="invoices_created"
    )

    class Meta:
        db_table = "invoices"
        ordering = ["-issue_date", "-created_at"]
        indexes = [
            models.Index(fields=["number"]),
            models.Index(fields=["status"]),
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["due_date"]),
            models.Index(fields=["issue_date"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total__gte=0),
                name="invoice_total_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(balance_due__gte=0),
                name="invoice_balance_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.number} - {self.customer.display_name}"

    @property
    def is_overdue(self):
        if self.due_date and self.status not in (self.Status.PAID, self.Status.CANCELLED):
            return self.due_date < timezone.now().date()
        return False

    def recalculate_totals(self):
        """Recalculate subtotal, tax, discount and total from line items."""
        from django.db.models import Sum
        agg = self.line_items.aggregate(
            sub=Sum(models.ExpressionWrapper(
                models.F("quantity") * models.F("unit_price"),
                output_field=models.DecimalField()
            )),
            tax=Sum("tax_amount"),
        )
        self.subtotal = agg["sub"] or Decimal("0.00")

        from core.utils import calculate_discount_amount
        if self.discount_type != self.DiscountType.NONE:
            self.discount_amount = calculate_discount_amount(
                self.subtotal, self.discount_type, self.discount_value
            )
        else:
            self.discount_amount = Decimal("0.00")

        self.tax_amount = agg["tax"] or Decimal("0.00")
        self.total = self.subtotal - self.discount_amount + self.tax_amount
        self.balance_due = self.total - self.amount_paid
        self.save(update_fields=["subtotal", "discount_amount", "tax_amount", "total", "balance_due"])


class InvoiceLineItem(models.Model):
    id = models.AutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    item = models.ForeignKey(
        "items.Item", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invoice_line_items"
    )
    description = models.TextField()
    quantity = models.DecimalField(
        max_digits=10, decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))]
    )
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))])
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    line_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "invoice_line_items"
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"Line {self.id} - {self.description[:40]}"

    def save(self, *args, **kwargs):
        subtotal = self.quantity * self.unit_price
        self.tax_amount = (subtotal * self.tax_rate / 100).quantize(Decimal("0.01"))
        self.line_total = subtotal + self.tax_amount
        super().save(*args, **kwargs)