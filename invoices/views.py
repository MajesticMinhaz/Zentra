import os
import django_filters
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema_view, extend_schema

from core.permissions import IsAccountant
from .models import Invoice, TaxRate, Discount
from .serializers import (
    InvoiceSerializer,
    InvoiceListSerializer,
    TaxRateSerializer,
    DiscountSerializer,
    CreditNoteCreateSerializer,
)
from .services import InvoiceService


class InvoiceFilter(django_filters.FilterSet):
    customer = django_filters.UUIDFilter()
    status = django_filters.ChoiceFilter(choices=Invoice.Status.choices)
    invoice_type = django_filters.ChoiceFilter(choices=Invoice.InvoiceType.choices)
    issue_date_from = django_filters.DateFilter(field_name="issue_date", lookup_expr="gte")
    issue_date_to = django_filters.DateFilter(field_name="issue_date", lookup_expr="lte")
    due_date_from = django_filters.DateFilter(field_name="due_date", lookup_expr="gte")
    due_date_to = django_filters.DateFilter(field_name="due_date", lookup_expr="lte")
    min_total = django_filters.NumberFilter(field_name="total", lookup_expr="gte")
    max_total = django_filters.NumberFilter(field_name="total", lookup_expr="lte")

    class Meta:
        model = Invoice
        fields = ["customer", "status", "invoice_type", "currency"]


@extend_schema_view(
    list=extend_schema(tags=["Invoices"]),
    retrieve=extend_schema(tags=["Invoices"]),
    create=extend_schema(tags=["Invoices"]),
    update=extend_schema(tags=["Invoices"]),
    partial_update=extend_schema(tags=["Invoices"]),
    destroy=extend_schema(tags=["Invoices"]),
)
class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filterset_class = InvoiceFilter
    search_fields = ["number", "customer__display_name", "reference"]
    ordering_fields = ["issue_date", "due_date", "total", "balance_due", "created_at"]
    ordering = ["-issue_date"]

    def get_queryset(self):
        return Invoice.objects.select_related("customer", "created_by").prefetch_related("line_items")

    def get_serializer_class(self):
        if self.action == "list":
            return InvoiceListSerializer
        return InvoiceSerializer

    def perform_destroy(self, instance):
        if instance.status != Invoice.Status.DRAFT:
            from core.exceptions import InvoiceError
            raise InvoiceError("Only draft invoices can be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"], url_path="send")
    def send(self, request, pk=None):
        invoice = self.get_object()
        invoice = InvoiceService.send_invoice(invoice)
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        invoice = InvoiceService.cancel_invoice(invoice)
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"], url_path="credit-note")
    def create_credit_note(self, request, pk=None):
        invoice = self.get_object()
        serializer = CreditNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cn = InvoiceService.create_credit_note(
            invoice,
            serializer.validated_data["amount"],
            serializer.validated_data.get("reason", ""),
            created_by=request.user,
        )
        return Response(InvoiceSerializer(cn).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="generate-pdf")
    def generate_pdf(self, request, pk=None):
        """Generate PDF synchronously and return the URL immediately."""
        invoice = self.get_object()
        invoice = Invoice.objects.select_related("customer", "created_by").prefetch_related(
            "line_items__item"
        ).get(id=invoice.id)
        from .pdf import render_invoice_pdf
        from django.utils import timezone
        try:
            pdf_path = render_invoice_pdf(invoice)
            if pdf_path:
                invoice.pdf_file = pdf_path
                invoice.pdf_generated_at = timezone.now()
                invoice.save(update_fields=["pdf_file", "pdf_generated_at"])
                return Response({
                    "detail": "PDF generated.",
                    "pdf_url": invoice.pdf_file.url,
                })
            return Response({"detail": "PDF generation failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=["get"], url_path="pdf")
    def get_pdf(self, request, pk=None):
        """Always regenerate PDF to ensure the latest data is reflected."""
        invoice = Invoice.objects.select_related("customer", "created_by").prefetch_related(
            "line_items__item"
        ).get(id=self.get_object().id)
        from .pdf import render_invoice_pdf
        from django.utils import timezone
        try:
            pdf_path = render_invoice_pdf(invoice)
            if pdf_path:
                invoice.pdf_file = pdf_path
                invoice.pdf_generated_at = timezone.now()
                invoice.save(update_fields=["pdf_file", "pdf_generated_at"])
                invoice.refresh_from_db(fields=["pdf_file"])  # ← add this line
                return Response({"pdf_url": invoice.pdf_file.url})
            return Response({"detail": "PDF generation failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TaxRateViewSet(viewsets.ModelViewSet):
    queryset = TaxRate.objects.filter(is_active=True)
    serializer_class = TaxRateSerializer
    permission_classes = [IsAccountant]


class DiscountViewSet(viewsets.ModelViewSet):
    queryset = Discount.objects.filter(is_active=True)
    serializer_class = DiscountSerializer
    permission_classes = [IsAccountant]