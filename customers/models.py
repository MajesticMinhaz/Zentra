from django.db import models
from core.models import BaseModel


class Customer(BaseModel):
    class CustomerType(models.TextChoices):
        INDIVIDUAL = "individual", "Individual"
        BUSINESS = "business", "Business"

    class Currency(models.TextChoices):
        USD = "USD", "US Dollar"
        EUR = "EUR", "Euro"
        GBP = "GBP", "British Pound"
        BDT = "BDT", "Bangladeshi Taka"
        CAD = "CAD", "Canadian Dollar"
        AUD = "AUD", "Australian Dollar"

    customer_type = models.CharField(max_length=20, choices=CustomerType, default=CustomerType.INDIVIDUAL)
    display_name = models.CharField(max_length=255, db_index=True)
    company_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True, db_index=True)
    phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(blank=True)
    tax_number = models.CharField(max_length=50, blank=True, help_text="VAT / Tax ID")
    currency = models.CharField(max_length=3, choices=Currency, default=Currency.USD)
    notes = models.TextField(blank=True)

    # Balance tracking (updated via signals)
    outstanding_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Billing address
    billing_address_line1 = models.CharField(max_length=255, blank=True)
    billing_address_line2 = models.CharField(max_length=255, blank=True)
    billing_city = models.CharField(max_length=100, blank=True)
    billing_state = models.CharField(max_length=100, blank=True)
    billing_postal_code = models.CharField(max_length=20, blank=True)
    billing_country = models.CharField(max_length=100, blank=True)

    # Shipping address
    shipping_address_line1 = models.CharField(max_length=255, blank=True)
    shipping_address_line2 = models.CharField(max_length=255, blank=True)
    shipping_city = models.CharField(max_length=100, blank=True)
    shipping_state = models.CharField(max_length=100, blank=True)
    shipping_postal_code = models.CharField(max_length=20, blank=True)
    shipping_country = models.CharField(max_length=100, blank=True)

    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True,
        related_name="customers_created"
    )

    class Meta:
        db_table = "customers"
        ordering = ["display_name"]
        indexes = [
            models.Index(fields=["display_name"]),
            models.Index(fields=["email"]),
            models.Index(fields=["deleted_at"]),
        ]

    def __str__(self):
        return self.display_name

    @property
    def billing_address(self):
        parts = filter(bool, [
            self.billing_address_line1,
            self.billing_address_line2,
            self.billing_city,
            self.billing_state,
            self.billing_postal_code,
            self.billing_country,
        ])
        return ", ".join(parts)


class CustomerContact(BaseModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="contacts")
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    job_title = models.CharField(max_length=100, blank=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        db_table = "customer_contacts"
        ordering = ["-is_primary", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.customer.display_name})"

    def save(self, *args, **kwargs):
        if self.is_primary:
            CustomerContact.objects.filter(customer=self.customer, is_primary=True).exclude(pk=self.pk).update(
                is_primary=False
            )
        super().save(*args, **kwargs)
