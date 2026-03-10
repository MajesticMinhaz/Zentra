from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal
from core.models import BaseModel


class Item(BaseModel):
    class ItemType(models.TextChoices):
        PRODUCT = "product", "Product"
        SERVICE = "service", "Service"

    class UnitOfMeasure(models.TextChoices):
        UNIT = "unit", "Unit"
        HOUR = "hour", "Hour"
        DAY = "day", "Day"
        MONTH = "month", "Month"
        YEAR = "year", "Year"
        KG = "kg", "Kilogram"
        LB = "lb", "Pound"
        METER = "meter", "Meter"
        LITER = "liter", "Liter"

    item_type = models.CharField(max_length=20, choices=ItemType, default=ItemType.SERVICE)
    name = models.CharField(max_length=255, db_index=True)
    sku = models.CharField(max_length=100, unique=True, blank=True, null=True)
    description = models.TextField(blank=True)
    unit_price = models.DecimalField(
        max_digits=12, decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))]
    )
    currency = models.CharField(max_length=3, default="USD")
    unit_of_measure = models.CharField(max_length=20, choices=UnitOfMeasure, default=UnitOfMeasure.UNIT)
    tax_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text="Tax rate as a percentage (e.g. 10 for 10%)"
    )
    is_taxable = models.BooleanField(default=True)
    is_recurring = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)

    created_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, related_name="items_created"
    )

    class Meta:
        db_table = "items"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["sku"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku or 'no-sku'})"
