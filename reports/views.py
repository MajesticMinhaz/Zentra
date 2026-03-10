"""
Reports API — Revenue, Outstanding, Customer Balances, Tax Summary, MRR.
All reports are read-only aggregations.
"""
from decimal import Decimal
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
        """Generate revenue PDF, save to media, return pdf_url — same pattern as invoices."""
        from .pdf import render_revenue_report_pdf

        year = request.query_params.get("year", timezone.now().year)

        monthly = (
            Payment.objects.filter(
                status=Payment.PaymentStatus.COMPLETED,
                payment_date__year=year,
            )
            .annotate(month=TruncMonth("payment_date"))
            .values("month")
            .annotate(total_revenue=Sum("amount"), payment_count=Count("id"))
            .order_by("month")
        )

        month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        monthly_data = [
            {
                "month": month_names[int(r["month"].strftime("%m")) - 1],
                "total_revenue": r["total_revenue"],
                "payment_count": r["payment_count"],
            }
            for r in monthly
        ]

        total_revenue = sum(r["total_revenue"] for r in monthly_data) if monthly_data else Decimal("0.00")

        outstanding = Invoice.objects.filter(
            status__in=[Invoice.Status.SENT, Invoice.Status.PARTIALLY_PAID, Invoice.Status.OVERDUE]
        ).aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")

        try:
            from django.conf import settings
            relative_path = render_revenue_report_pdf(year, monthly_data, total_revenue, outstanding)
            if not relative_path:
                return Response({"detail": "PDF generation failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            from django.core.files.storage import default_storage
            pdf_url = settings.MEDIA_URL + relative_path
            return Response({"pdf_url": pdf_url})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PaymentMethodBreakdownReport(APIView):
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
            .values("payment_method")
            .annotate(total=Sum("amount"), count=Count("id"))
            .order_by("-total")
        )
        grand_total = sum(r["total"] for r in data) or 1
        return Response({
            "year": year,
            "data": [
                {
                    "method": row["payment_method"],
                    "total": row["total"],
                    "count": row["count"],
                    "share": round(float(row["total"]) / float(grand_total) * 100, 1),
                }
                for row in data
            ],
        })


class TopCustomersByRevenueReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(
        tags=["Reports"],
        parameters=[
            OpenApiParameter("year", int, description="Filter by year", required=False),
            OpenApiParameter("limit", int, description="Number of customers to return", required=False),
        ]
    )
    def get(self, request):
        year = request.query_params.get("year", timezone.now().year)
        limit = int(request.query_params.get("limit", 10))
        data = (
            Payment.objects.filter(
                status=Payment.PaymentStatus.COMPLETED,
                payment_date__year=year,
            )
            .values("customer__id", "customer__display_name", "customer__email")
            .annotate(total=Sum("amount"), payment_count=Count("id"))
            .order_by("-total")[:limit]
        )
        return Response({
            "year": year,
            "data": [
                {
                    "customer_id": row["customer__id"],
                    "customer_name": row["customer__display_name"],
                    "customer_email": row["customer__email"],
                    "total": row["total"],
                    "payment_count": row["payment_count"],
                }
                for row in data
            ],
        })


class InvoiceFunnelReport(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        from invoices.models import Invoice
        statuses = [
            Invoice.Status.DRAFT,
            Invoice.Status.SENT,
            Invoice.Status.PARTIALLY_PAID,
            Invoice.Status.PAID,
            Invoice.Status.OVERDUE,
            Invoice.Status.CANCELLED,
        ]
        data = (
            Invoice.objects.filter(
                invoice_type__in=[
                    Invoice.InvoiceType.SALES,
                    Invoice.InvoiceType.RETAINER,
                    Invoice.InvoiceType.RECEIPT,
                ]
            )
            .values("status")
            .annotate(count=Count("id"), amount=Sum("total"))
            .order_by("status")
        )
        by_status = {row["status"]: row for row in data}
        result = []
        for s in statuses:
            row = by_status.get(s, {"count": 0, "amount": Decimal("0.00")})
            result.append({"status": s, "count": row["count"], "amount": row["amount"] or Decimal("0.00")})
        return Response({"data": result})


class OutstandingInvoicesReportPDF(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        """Generate outstanding PDF, save to media, return pdf_url — same pattern as invoices."""
        from .pdf import render_outstanding_report_pdf

        outstanding = Invoice.objects.filter(
            status__in=[Invoice.Status.SENT, Invoice.Status.PARTIALLY_PAID, Invoice.Status.OVERDUE]
        ).select_related("customer").order_by("-balance_due")

        total_outstanding = outstanding.aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")
        total_overdue = outstanding.filter(status=Invoice.Status.OVERDUE).aggregate(total=Sum("balance_due"))["total"] or Decimal("0.00")

        breakdown = (
            outstanding.values("status")
            .annotate(count=Count("id"), amount=Sum("balance_due"))
            .order_by("status")
        )

        invoices_data = [
            {
                "number": inv.number,
                "customer": inv.customer.display_name,
                "issue_date": inv.issue_date,
                "due_date": inv.due_date,
                "status": inv.status,
                "total": inv.total,
                "balance_due": inv.balance_due,
            }
            for inv in outstanding[:50]
        ]

        try:
            from django.conf import settings
            relative_path = render_outstanding_report_pdf(invoices_data, total_outstanding, total_overdue, list(breakdown))
            if not relative_path:
                return Response({"detail": "PDF generation failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            pdf_url = settings.MEDIA_URL + relative_path
            return Response({"pdf_url": pdf_url})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TaxSummaryReportPDF(APIView):
    permission_classes = [IsAccountant]

    @extend_schema(tags=["Reports"])
    def get(self, request):
        """Generate tax summary PDF, save to media, return pdf_url — same pattern as invoices."""
        from .pdf import render_tax_summary_pdf

        date_from = request.query_params.get("date_from", "")
        date_to   = request.query_params.get("date_to",   "")

        qs = Invoice.objects.filter(
            status__in=[Invoice.Status.PAID, Invoice.Status.PARTIALLY_PAID],
        )
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

        try:
            from django.conf import settings
            relative_path = render_tax_summary_pdf(
                date_from,
                date_to,
                agg["total_revenue"]  or Decimal("0.00"),
                agg["total_tax"]      or Decimal("0.00"),
                agg["total_discount"] or Decimal("0.00"),
                agg["invoice_count"]  or 0,
            )
            if not relative_path:
                return Response({"detail": "PDF generation failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            pdf_url = settings.MEDIA_URL + relative_path
            return Response({"pdf_url": pdf_url})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)