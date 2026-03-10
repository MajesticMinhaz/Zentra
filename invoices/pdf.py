"""
PDF generation for invoices using WeasyPrint.
Company identity is pulled from invoice.organization (falls back to settings).
"""
import os
import logging
from pathlib import Path
from django.template.loader import render_to_string
from django.conf import settings

logger = logging.getLogger(__name__)

PDF_OUTPUT_DIR = Path(settings.MEDIA_ROOT) / "invoices" / "pdf"


def _get_org_context(invoice):
    """Build company context from invoice.organization, falling back to settings."""
    org = getattr(invoice, "organization", None)
    if org:
        logo_path = ""
        if org.logo:
            try:
                logo_path = Path(org.logo.path).as_uri()
            except Exception:
                logo_path = ""
        return {
            "company_name": org.name,
            "company_legal_name": org.legal_name or org.name,
            "company_tagline": org.tagline,
            "company_logo": logo_path,
            "company_email": org.email,
            "company_phone": org.phone,
            "company_website": org.website,
            "company_address": org.full_address,
            "company_tax_number": org.tax_number,
            "company_registration_number": org.registration_number,
            "company_bank_name": org.bank_name,
            "company_bank_account_name": org.bank_account_name,
            "company_bank_account_number": org.bank_account_number,
            "company_bank_sort_code": org.bank_sort_code,
            "company_bank_swift_iban": org.bank_swift_iban,
            "company_bank_instructions": org.bank_instructions,
            "organization": org,
        }
    return {
        "company_name": settings.COMPANY_NAME,
        "company_legal_name": settings.COMPANY_NAME,
        "company_tagline": "",
        "company_logo": settings.COMPANY_LOGO,
        "company_email": "",
        "company_phone": "",
        "company_website": "",
        "company_address": "",
        "company_tax_number": "",
        "company_registration_number": "",
        "company_bank_name": "",
        "company_bank_account_name": "",
        "company_bank_account_number": "",
        "company_bank_sort_code": "",
        "company_bank_swift_iban": "",
        "company_bank_instructions": "",
        "organization": None,
    }


def render_invoice_pdf(invoice) -> str:
    """
    Renders an invoice to PDF using WeasyPrint and saves to disk.
    Returns relative path to the PDF file (suitable for FileField).
    """
    try:
        from weasyprint import HTML
    except ImportError:
        logger.error("WeasyPrint is not installed. PDF generation skipped.")
        return ""

    PDF_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{invoice.number.replace('/', '-')}.pdf"
    output_path = PDF_OUTPUT_DIR / filename

    context = {
        "invoice": invoice,
        "line_items": invoice.line_items.select_related("item").all(),
        "base_url": str(Path(settings.MEDIA_ROOT)),
        **_get_org_context(invoice),
    }

    html_string = render_to_string("invoices/pdf_invoice.html", context)

    HTML(string=html_string, base_url=str(settings.MEDIA_ROOT)).write_pdf(
        target=str(output_path),
    )

    relative = os.path.relpath(str(output_path), str(settings.MEDIA_ROOT))
    logger.info("PDF saved: %s", output_path)
    return relative