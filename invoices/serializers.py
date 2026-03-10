from rest_framework import serializers
from .models import Invoice, InvoiceLineItem, TaxRate, Discount


class TaxRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRate
        fields = ["id", "name", "rate", "is_default", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class DiscountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discount
        fields = ["id", "name", "discount_type", "value", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            "id", "item", "description", "quantity", "unit_price",
            "tax_rate", "tax_amount", "line_total", "sort_order",
        ]
        read_only_fields = ["id", "tax_amount", "line_total"]


class InvoiceSerializer(serializers.ModelSerializer):
    line_items = InvoiceLineItemSerializer(many=True)
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    is_overdue = serializers.SerializerMethodField()

    def get_is_overdue(self, obj):
        from django.utils import timezone
        if not obj.due_date:
            return False
        if obj.status in (Invoice.Status.PAID, Invoice.Status.CANCELLED):
            return False
        return obj.due_date < timezone.now().date()

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_type", "number", "status", "is_overdue", "organization", "organization_name",
            "customer", "customer_name",
            "reference", "issue_date", "due_date",
            "subtotal", "discount_type", "discount_value", "discount_amount",
            "tax_amount", "total", "amount_paid", "balance_due", "currency",
            "retainer_amount", "retainer_remaining",
            "linked_invoice", "source_quote",
            "notes", "terms", "pdf_file",
            "sent_at", "paid_at",
            "line_items", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "number", "subtotal", "discount_amount", "tax_amount",
            "total", "amount_paid", "balance_due",
            "sent_at", "paid_at", "created_at", "updated_at",
        ]

    def create(self, validated_data):
        from .services import InvoiceService
        request = self.context["request"]
        return InvoiceService.create_invoice(validated_data, created_by=request.user)

    def update(self, instance, validated_data):
        from .services import InvoiceService
        return InvoiceService.update_invoice(instance, validated_data)


class InvoiceListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    is_overdue = serializers.SerializerMethodField()

    def get_is_overdue(self, obj):
        from django.utils import timezone
        if not obj.due_date:
            return False
        if obj.status in (Invoice.Status.PAID, Invoice.Status.CANCELLED):
            return False
        return obj.due_date < timezone.now().date()

    class Meta:
        model = Invoice
        fields = [
            "id", "invoice_type", "number", "status", "is_overdue", "organization", "organization_name",
            "customer", "customer_name",
            "issue_date", "due_date", "total", "amount_paid", "balance_due", "currency", "created_at",
        ]


class CreditNoteCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reason = serializers.CharField(required=False, default="")