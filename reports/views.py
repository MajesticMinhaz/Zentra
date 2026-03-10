"""
Reports API — Revenue, Outstanding, Customer Balances, Tax Summary, MRR.
All reports are read-only aggregations.
"""
from decimal import Decimal
from pathlib import Path
from datetime import date
from django.db.models import Sum, Count, Q, F
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, OpenApiParameter

from core.permissions import IsAccountant
from invoices.models import Invoice
from payments.models import Payment
from subscriptions.models import Subscription
from customers.models import Customer


class RevenueByMonthReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(
        tags=["Reports"],
        parameters=[
            OpenApiParameter("year", int, description="Filter by year", required=False),
        ]
    )
    def get(self, request):
        year = request.query_params.get("year", timezone.now().year)
        data = (
            Payment.objects.filter(
                status=Payment.PaymentStatus.COMPLETED,
                payment_date__year=year,
            )
            .annotate(month=TruncMonth("payment_date"))
            .values("month")
            .annotate(
                total_revenue=Sum("amount"),
                payment_count=Count("id"),
            )
            .order_by("month")
        )
        return Response({
            "year": year,
            "data": [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "total_revenue": row["total_revenue"],
                    "payment_count": row["payment_count"],
                }
                for row in data
            ],
        })


class OutstandingInvoicesReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        outstanding = Invoice.objects.filter(
            status__in=[Invoice.Status.SENT, Invoice.Status.PARTIALLY_PAID, Invoice.Status.OVERDUE]
        ).select_related("customer")

        total_outstanding = outstanding.aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")
        overdue = outstanding.filter(status=Invoice.Status.OVERDUE)
        total_overdue = overdue.aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")

        breakdown = (
            outstanding.values("status")
            .annotate(count=Count("id"), amount=Sum("balance_due"))
            .order_by("status")
        )

        return Response({
            "total_outstanding": total_outstanding,
            "total_overdue": total_overdue,
            "by_status": list(breakdown),
        })


class CustomerBalanceReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        customers = (
            Customer.objects.filter(outstanding_balance__gt=0)
            .order_by("-outstanding_balance")
            .values("id", "display_name", "email", "outstanding_balance", "credit_balance")
        )
        total = Customer.objects.aggregate(total=Sum("outstanding_balance"))["total"] or Decimal("0.00")

        return Response({
            "total_outstanding": total,
            "customers": list(customers),
        })


class TaxSummaryReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(
        tags=["Reports"],
        parameters=[
            OpenApiParameter("date_from", str, description="Start date YYYY-MM-DD"),
            OpenApiParameter("date_to", str, description="End date YYYY-MM-DD"),
        ]
    )
    def get(self, request):
        qs = Invoice.objects.filter(
            status__in=[Invoice.Status.PAID, Invoice.Status.PARTIALLY_PAID],
        )
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        if date_from:
            qs = qs.filter(issue_date__gte=date_from)
        if date_to:
            qs = qs.filter(issue_date__lte=date_to)

        agg = qs.aggregate(
            total_revenue=Sum("total"),
            total_tax=Sum("tax_amount"),
            total_discount=Sum("discount_amount"),
            invoice_count=Count("id"),
        )
        return Response(agg)


class MRRReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        """Monthly Recurring Revenue from active subscriptions."""
        active_subs = Subscription.objects.filter(status=Subscription.Status.ACTIVE)

        mrr = Decimal("0.00")
        for sub in active_subs:
            if sub.billing_cycle == Subscription.BillingCycle.MONTHLY:
                mrr += sub.amount
            elif sub.billing_cycle == Subscription.BillingCycle.QUARTERLY:
                mrr += sub.amount / 3
            elif sub.billing_cycle == Subscription.BillingCycle.YEARLY:
                mrr += sub.amount / 12

        arr = mrr * 12

        return Response({
            "mrr": round(mrr, 2),
            "arr": round(arr, 2),
            "active_subscriptions": active_subs.count(),
        })


class RevenueReportPDF(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        """Generate and stream a revenue summary PDF report."""
        try:
            from weasyprint import HTML
        except ImportError:
            return Response({"detail": "WeasyPrint not installed."}, status=500)

        from django.conf import settings
        from django.template.loader import render_to_string
        from django.http import HttpResponse
        from organizations.models import Organization

        year = request.query_params.get("year", timezone.now().year)

        # ── Monthly revenue data ──────────────────────────────────────────────
        monthly_qs = (
            Payment.objects.filter(
                status=Payment.PaymentStatus.COMPLETED,
                payment_date__year=year,
            )
            .annotate(month=TruncMonth("payment_date"))
            .values("month")
            .annotate(total_revenue=Sum("amount"), payment_count=Count("id"))
            .order_by("month")
        )

        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        monthly_data = [
            {
                "month": month_names[int(r["month"].strftime("%m")) - 1],
                "total_revenue": r["total_revenue"],
                "payment_count": r["payment_count"],
            }
            for r in monthly_qs
        ]

        total_revenue = (
            sum(r["total_revenue"] for r in monthly_data)
            if monthly_data else Decimal("0.00")
        )

        outstanding = (
            Invoice.objects.filter(
                status__in=[Invoice.Status.SENT, Invoice.Status.PARTIALLY_PAID, Invoice.Status.OVERDUE]
            ).aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")
        )

        # ── Organisation branding ─────────────────────────────────────────────
        org = (
            Organization.objects.filter(is_default=True, is_active=True).first()
            or Organization.objects.filter(is_active=True).first()
        )

        # Convert logo to file:// URI so WeasyPrint can embed it (same pattern
        # as invoices/pdf.py and quotes/pdf.py)
        company_logo = ""
        if org and org.logo:
            try:
                company_logo = Path(org.logo.path).as_uri()
            except Exception:
                company_logo = ""
        elif not org:
            company_logo = getattr(settings, "COMPANY_LOGO", "")

        # ── Render template ───────────────────────────────────────────────────
        html_string = render_to_string("reports/pdf_report.html", {
            "year": year,
            "monthly_data": monthly_data,
            "total_revenue": total_revenue,
            "total_outstanding": outstanding,
            "company_name": org.name if org else getattr(settings, "COMPANY_NAME", ""),
            "company_tagline": org.tagline if org else "",
            "company_logo": company_logo,
            "company_address": org.full_address if org else "",
            "company_email": org.email if org else "",
            "company_phone": org.phone if org else "",
            "company_tax_number": org.tax_number if org else "",
            "default_report_notes": org.default_report_notes if org else "",
            "organization": org,
            "generated_at": timezone.now(),
        })

        # base_url lets WeasyPrint resolve any remaining relative paths
        pdf_bytes = HTML(
            string=html_string,
            base_url=str(settings.MEDIA_ROOT),
        ).write_pdf()

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="revenue-report-{year}.pdf"'
        return response
