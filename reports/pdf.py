"""
PDF generation for reports using WeasyPrint.
Saves to /media/reports/pdf/ and returns a relative path — same pattern as invoices.
"""
import os
import logging
from pathlib import Path
from django.template.loader import render_to_string
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

PDF_OUTPUT_DIR = Path(settings.MEDIA_ROOT) / "reports" / "pdf"


def _get_org_context():
    """Build company context from the default active org, falling back to settings."""
    from organizations.models import Organization
    org = (
        Organization.objects.filter(is_default=True, is_active=True).first()
        or Organization.objects.filter(is_active=True).first()
    )
    if org:
        logo_path = ""
        if org.logo:
            try:
                logo_path = Path(org.logo.path).as_uri()
            except Exception:
                logo_path = ""
        return {
            "company_name":       org.name,
            "company_tagline":    org.tagline or "",
            "company_logo":       logo_path,
            "company_email":      org.email or "",
            "company_phone":      org.phone or "",
            "company_address":    org.full_address or "",
            "company_tax_number": org.tax_number or "",
            "default_report_notes": getattr(org, "default_report_notes", ""),
            "organization":       org,
        }
    return {
        "company_name":         getattr(settings, "COMPANY_NAME", ""),
        "company_tagline":      "",
        "company_logo":         getattr(settings, "COMPANY_LOGO", ""),
        "company_email":        "",
        "company_phone":        "",
        "company_address":      "",
        "company_tax_number":   "",
        "default_report_notes": "",
        "organization":         None,
    }


def _render(template_name, context, filename):
    """Render a template to PDF, save to disk, return relative media path."""
    try:
        from weasyprint import HTML
    except ImportError:
        logger.error("WeasyPrint is not installed. PDF generation skipped.")
        return ""

    PDF_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PDF_OUTPUT_DIR / filename

    html_string = render_to_string(template_name, {
        **_get_org_context(),
        "generated_at": timezone.now(),
        **context,
    })

    HTML(string=html_string, base_url=str(settings.MEDIA_ROOT)).write_pdf(
        target=str(output_path),
    )

    relative = os.path.relpath(str(output_path), str(settings.MEDIA_ROOT))
    logger.info("Report PDF saved: %s", output_path)
    return relative


def render_revenue_report_pdf(year, monthly_data, total_revenue, total_outstanding):
    return _render(
        "reports/pdf_report.html",
        {
            "year":              year,
            "monthly_data":      monthly_data,
            "total_revenue":     total_revenue,
            "total_outstanding": total_outstanding,
        },
        f"revenue-report-{year}.pdf",
    )


def render_outstanding_report_pdf(invoices, total_outstanding, total_overdue, by_status):
    return _render(
        "reports/pdf_outstanding.html",
        {
            "invoices":          invoices,
            "total_outstanding": total_outstanding,
            "total_overdue":     total_overdue,
            "by_status":         by_status,
        },
        "outstanding-invoices-report.pdf",
    )


def render_tax_summary_pdf(date_from, date_to, total_revenue, total_tax, total_discount, invoice_count):
    return _render(
        "reports/pdf_tax_summary.html",
        {
            "date_from":      date_from,
            "date_to":        date_to,
            "total_revenue":  total_revenue,
            "total_tax":      total_tax,
            "total_discount": total_discount,
            "invoice_count":  invoice_count,
        },
        "tax-summary-report.pdf",
    )