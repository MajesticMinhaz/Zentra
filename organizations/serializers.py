from rest_framework import serializers
from .models import Organization


class FlexibleImageField(serializers.ImageField):
    """
    ImageField that silently ignores empty-string / non-file values
    instead of raising 'submitted data was not a file'.
    This happens when a multipart form is submitted without a logo file
    but the logo key is still present in the form data as an empty string.
    """
    def to_internal_value(self, data):
        if data == "" or data is None:
            return None
        return super().to_internal_value(data)


class OrganizationSerializer(serializers.ModelSerializer):
    logo = FlexibleImageField(required=False, allow_null=True)
    logo_url = serializers.SerializerMethodField()
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = Organization
        fields = [
            # Identity
            "id", "name", "legal_name", "tagline", "logo", "logo_url",
            "is_default", "is_active",
            # Contact
            "email", "phone", "website",
            # Address
            "address_line1", "address_line2", "city", "state", "postal_code", "country",
            "full_address",
            # Tax & Registration
            "tax_number", "registration_number",
            # Banking
            "bank_name", "bank_account_name", "bank_account_number",
            "bank_sort_code", "bank_swift_iban", "bank_instructions",
            # Defaults
            "default_currency", "invoice_prefix", "quote_prefix",
            # Default notes & terms
            "default_invoice_notes", "default_invoice_terms",
            "default_retainer_notes", "default_retainer_terms",
            "default_credit_note_notes", "default_credit_note_terms",
            "default_receipt_notes", "default_receipt_terms",
            "default_quote_notes", "default_quote_terms",
            "default_report_notes",
            # Meta
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "logo_url", "full_address", "created_at", "updated_at"]
        extra_kwargs = {
            "logo": {"write_only": True, "required": False},
        }

    def get_logo_url(self, obj):
        request = self.context.get("request")
        if obj.logo:
            url = obj.logo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None

    def validate_logo(self, value):
        if value:
            if value.size > 2 * 1024 * 1024:
                raise serializers.ValidationError("Logo must be smaller than 2 MB.")
            content_type = getattr(value, "content_type", "")
            if content_type not in ("image/png", "image/jpeg", "image/jpg"):
                raise serializers.ValidationError("Logo must be a PNG or JPEG image.")
        return value

    def update(self, instance, validated_data):
        # If logo is explicitly None (not just absent), don't overwrite existing logo
        if "logo" in validated_data and validated_data["logo"] is None:
            validated_data.pop("logo")
        return super().update(instance, validated_data)


class OrganizationListSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ["id", "name", "legal_name", "logo_url", "is_default", "is_active",
                  "email", "phone", "default_currency", "invoice_prefix", "quote_prefix",
                  "default_invoice_notes", "default_invoice_terms",
                  "default_retainer_notes", "default_retainer_terms",
                  "default_credit_note_notes", "default_credit_note_terms",
                  "default_receipt_notes", "default_receipt_terms",
                  "default_quote_notes", "default_quote_terms",
                  "default_report_notes",
                  "created_at"]

    def get_logo_url(self, obj):
        request = self.context.get("request")
        if obj.logo:
            url = obj.logo.url
            if request:
                return request.build_absolute_uri(url)
            return url
        return None