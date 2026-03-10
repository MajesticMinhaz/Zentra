"""
Organization model — represents a business entity that issues invoices, quotes, and reports.
Each user belongs to one organization. All documents are scoped to an organization.
"""
import uuid
from django.db import models
from django.core.validators import RegexValidator
from core.models import BaseModel


class Organization(BaseModel):
    """
    A business entity (company / sole trader / branch) that owns documents.
    Multiple organizations can coexist; one is marked as the default per-install
    but each user is also linked to exactly one organization.
    """

    # ── Identity ──────────────────────────────────────────────────────────────
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True, help_text="Legal registered name if different")
    tagline = models.CharField(max_length=255, blank=True)
    logo = models.ImageField(
        upload_to="organizations/logos/",
        null=True, blank=True,
        help_text="PNG logo, recommended 400×160 px (retina: 800×320 px), max 2 MB",
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Auto-selected when creating new documents; only one org can be default",
    )
    is_active = models.BooleanField(default=True)

    # ── Contact ───────────────────────────────────────────────────────────────
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    website = models.URLField(blank=True)

    # ── Address ───────────────────────────────────────────────────────────────
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)

    # ── Tax & Registration ────────────────────────────────────────────────────
    tax_number = models.CharField(max_length=100, blank=True, help_text="VAT / GST / Tax ID")
    registration_number = models.CharField(max_length=100, blank=True, help_text="Company registration / ABN / EIN")

    # ── Banking ───────────────────────────────────────────────────────────────
    bank_name = models.CharField(max_length=255, blank=True)
    bank_account_name = models.CharField(max_length=255, blank=True)
    bank_account_number = models.CharField(max_length=100, blank=True)
    bank_sort_code = models.CharField(max_length=100, blank=True, help_text="Routing number / Sort code / BSB")
    bank_swift_iban = models.CharField(max_length=100, blank=True, help_text="SWIFT / BIC / IBAN")
    bank_instructions = models.TextField(blank=True, help_text="Additional payment instructions shown on invoices")

    # ── Defaults ──────────────────────────────────────────────────────────────
    default_currency = models.CharField(max_length=3, default="USD")
    invoice_prefix = models.CharField(max_length=10, default="INV")
    quote_prefix = models.CharField(max_length=10, default="QUO")

    # ── Default notes & terms per document type ───────────────────────────────
    default_invoice_notes = models.TextField(blank=True)
    default_invoice_terms = models.TextField(blank=True)
    default_retainer_notes = models.TextField(blank=True)
    default_retainer_terms = models.TextField(blank=True)
    default_credit_note_notes = models.TextField(blank=True)
    default_credit_note_terms = models.TextField(blank=True)
    default_receipt_notes = models.TextField(blank=True)
    default_receipt_terms = models.TextField(blank=True)
    default_quote_notes = models.TextField(blank=True)
    default_quote_terms = models.TextField(blank=True)
    default_report_notes = models.TextField(blank=True)

    class Meta:
        db_table = "organizations"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Ensure only one org is marked as default at a time
        if self.is_default:
            Organization.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    @property
    def full_address(self):
        parts = [
            self.address_line1,
            self.address_line2,
            self.city,
            self.state,
            self.postal_code,
            self.country,
        ]
        return ", ".join(p for p in parts if p)

    def get_default_notes(self, doc_type: str) -> str:
        mapping = {
            "sales": self.default_invoice_notes,
            "retainer": self.default_retainer_notes,
            "credit_note": self.default_credit_note_notes,
            "receipt": self.default_receipt_notes,
            "quote": self.default_quote_notes,
            "report": self.default_report_notes,
        }
        return mapping.get(doc_type, "")

    def get_default_terms(self, doc_type: str) -> str:
        mapping = {
            "sales": self.default_invoice_terms,
            "retainer": self.default_retainer_terms,
            "credit_note": self.default_credit_note_terms,
            "receipt": self.default_receipt_terms,
            "quote": self.default_quote_terms,
        }
        return mapping.get(doc_type, "")