from rest_framework import serializers
from .models import Quote, QuoteLineItem


class QuoteLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuoteLineItem
        fields = [
            "id", "item", "description", "quantity", "unit_price",
            "tax_rate", "tax_amount", "line_total", "sort_order",
        ]
        read_only_fields = ["id", "tax_amount", "line_total"]


class QuoteSerializer(serializers.ModelSerializer):
    line_items = QuoteLineItemSerializer(many=True)
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Quote
        fields = [
            "id", "number", "status",
            "organization", "organization_name",
            "customer", "customer_name",
            "title", "reference", "issue_date", "expiry_date",
            "subtotal", "discount_type", "discount_value", "discount_amount",
            "tax_amount", "total", "currency",
            "notes", "terms", "is_expired",
            "sent_at", "accepted_at", "rejected_at",
            "line_items", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "number", "subtotal", "discount_amount", "tax_amount", "total",
            "sent_at", "accepted_at", "rejected_at", "created_at", "updated_at",
        ]

    def create(self, validated_data):
        line_items_data = validated_data.pop("line_items", [])
        from core.utils import generate_document_number
        from django.conf import settings
        validated_data["number"] = generate_document_number(settings.QUOTE_NUMBER_PREFIX, Quote)
        validated_data["created_by"] = self.context["request"].user
        quote = Quote.objects.create(**validated_data)
        for li in line_items_data:
            QuoteLineItem.objects.create(quote=quote, **li)
        quote.recalculate_totals()
        return quote

    def update(self, instance, validated_data):
        from core.exceptions import QuoteError
        if instance.status == Quote.Status.ACCEPTED:
            raise QuoteError("Accepted quotes cannot be edited.")

        line_items_data = validated_data.pop("line_items", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if line_items_data is not None:
            instance.line_items.all().delete()
            for li in line_items_data:
                QuoteLineItem.objects.create(quote=instance, **li)

        instance.recalculate_totals()
        return instance


class QuoteListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Quote
        fields = [
            "id", "number", "status",
            "organization", "organization_name",
            "customer", "customer_name",
            "title", "issue_date", "expiry_date",
            "total", "currency", "is_expired", "created_at",
        ]
