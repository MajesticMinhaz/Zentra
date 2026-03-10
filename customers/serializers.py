from rest_framework import serializers
from django.db.models import Sum
from .models import Customer, CustomerContact


class CustomerContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerContact
        fields = [
            "id", "first_name", "last_name", "email", "phone",
            "job_title", "is_primary", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class CustomerSerializer(serializers.ModelSerializer):
    contacts = CustomerContactSerializer(many=True, read_only=True)
    billing_address_display = serializers.CharField(source="billing_address", read_only=True)
    credit_balance = serializers.SerializerMethodField()
    total_paid = serializers.SerializerMethodField()
    total_invoiced = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = [
            "id", "customer_type", "display_name", "company_name", "email", "phone",
            "website", "tax_number", "currency", "notes",
            "outstanding_balance", "credit_balance", "total_paid", "total_invoiced",
            "billing_address_line1", "billing_address_line2", "billing_city",
            "billing_state", "billing_postal_code", "billing_country",
            "billing_address_display",
            "shipping_address_line1", "shipping_address_line2", "shipping_city",
            "shipping_state", "shipping_postal_code", "shipping_country",
            "contacts", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "outstanding_balance", "credit_balance", "total_paid",
            "total_invoiced", "created_at", "updated_at",
        ]

    def get_credit_balance(self, obj):
        """
        Sum of credit_remaining across all credit notes that have been at least
        partially paid. Matches the signal so the stored field stays consistent.
        """
        from invoices.models import Invoice
        result = Invoice.objects.filter(
            customer=obj,
            invoice_type=Invoice.InvoiceType.CREDIT_NOTE,
            credit_remaining__gt=0,
        ).aggregate(total=Sum("credit_remaining"))
        return result["total"] or 0

    def get_total_paid(self, obj):
        """
        Actual cash received — excludes credit note applications
        which are not real cash payments.
        """
        from payments.models import Payment
        result = Payment.objects.filter(
            customer=obj,
            status=Payment.PaymentStatus.COMPLETED,
        ).exclude(
            transaction_reference="Credit applied"
        ).aggregate(total=Sum("amount"))
        return result["total"] or 0

    def get_total_invoiced(self, obj):
        """
        Sum of all non-cancelled, non-credit-note invoice totals.
        Includes sales, retainer, and receipt types.
        """
        from invoices.models import Invoice
        result = Invoice.objects.filter(
            customer=obj,
            invoice_type__in=[
                Invoice.InvoiceType.SALES,
                Invoice.InvoiceType.RETAINER,
                Invoice.InvoiceType.RECEIPT,
            ],
        ).exclude(
            status=Invoice.Status.CANCELLED,
        ).aggregate(total=Sum("total"))
        return result["total"] or 0


class CustomerListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    class Meta:
        model = Customer
        fields = [
            "id", "customer_type", "display_name", "company_name", "email",
            "phone", "currency", "outstanding_balance", "created_at",
        ]