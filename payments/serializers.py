from rest_framework import serializers
from .models import Payment


class PaymentSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice", "invoice_number", "customer", "customer_name",
            "amount", "currency", "payment_date", "payment_method", "status",
            "transaction_reference", "notes", "stripe_payment_intent",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "customer", "status", "created_at", "updated_at",
        ]

    def create(self, validated_data):
        from .services import PaymentService
        return PaymentService.create_payment(validated_data, created_by=self.context["request"].user)


class PaymentListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice_number", "customer_name", "amount", "currency",
            "payment_date", "payment_method", "status", "transaction_reference", "created_at",
        ]
