from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from core.exceptions import QuoteError
from .models import Quote
from .serializers import QuoteSerializer, QuoteListSerializer


class QuoteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    search_fields = ["number", "customer__display_name", "title", "reference"]
    ordering_fields = ["issue_date", "expiry_date", "total", "created_at"]
    ordering = ["-issue_date"]

    def get_queryset(self):
        return Quote.objects.select_related("customer", "created_by").prefetch_related("line_items")

    def get_serializer_class(self):
        if self.action == "list":
            return QuoteListSerializer
        return QuoteSerializer

    def perform_destroy(self, instance):
        if instance.status != Quote.Status.DRAFT:
            raise QuoteError("Only draft quotes can be deleted.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def send(self, request, pk=None):
        quote = self.get_object()
        if quote.status != Quote.Status.DRAFT:
            return Response({"detail": "Only draft quotes can be sent."}, status=status.HTTP_400_BAD_REQUEST)
        quote.status = Quote.Status.SENT
        quote.sent_at = timezone.now()
        quote.save(update_fields=["status", "sent_at"])
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        quote = self.get_object()
        if quote.status != Quote.Status.SENT:
            return Response({"detail": "Only sent quotes can be accepted."}, status=status.HTTP_400_BAD_REQUEST)
        quote.status = Quote.Status.ACCEPTED
        quote.accepted_at = timezone.now()
        quote.save(update_fields=["status", "accepted_at"])
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        quote = self.get_object()
        if quote.status not in (Quote.Status.SENT, Quote.Status.DRAFT):
            return Response({"detail": "Cannot reject this quote."}, status=status.HTTP_400_BAD_REQUEST)
        quote.status = Quote.Status.REJECTED
        quote.rejected_at = timezone.now()
        quote.save(update_fields=["status", "rejected_at"])
        return Response(QuoteSerializer(quote).data)

    @action(detail=True, methods=["post"], url_path="convert-to-invoice")
    def convert_to_invoice(self, request, pk=None):
        quote = self.get_object()
        from invoices.services import InvoiceService
        from invoices.serializers import InvoiceSerializer
        invoice = InvoiceService.convert_quote_to_invoice(quote)
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="generate-pdf")
    def generate_pdf(self, request, pk=None):
        quote = self.get_object()
        from .pdf import render_quote_pdf
        try:
            pdf_path = render_quote_pdf(quote)
            if pdf_path:
                return Response({"detail": "PDF generated.", "pdf_url": f"/media/{pdf_path}"})
            return Response({"detail": "PDF generation failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=["get"], url_path="pdf")
    def get_pdf(self, request, pk=None):
        """Serve existing PDF or generate on-the-fly."""
        quote = self.get_object()
        from .pdf import render_quote_pdf
        import os
        from django.conf import settings
        from pathlib import Path
        pdf_dir = Path(settings.MEDIA_ROOT) / "quotes" / "pdf"
        filename = f"{quote.number.replace('/', '-')}.pdf"
        pdf_path = pdf_dir / filename
        if not pdf_path.exists():
            render_quote_pdf(quote)
        if pdf_path.exists():
            rel = os.path.relpath(str(pdf_path), str(settings.MEDIA_ROOT))
            return Response({"pdf_url": f"/media/{rel}"})
