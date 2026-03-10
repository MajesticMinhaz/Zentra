from rest_framework import serializers
from .models import Item


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = [
            "id", "item_type", "name", "sku", "description", "unit_price",
            "currency", "unit_of_measure", "tax_rate", "is_taxable",
            "is_recurring", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
