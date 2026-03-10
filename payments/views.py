from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.permissions import IsAccountant
from .models import Payment
from .serializers import PaymentSerializer, PaymentListSerializer
from .services import PaymentService


class PaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAccountant]
    search_fields = ["invoice__number", "customer__display_name", "transaction_reference"]
    ordering_fields = ["payment_date", "amount", "created_at"]
    ordering = ["-payment_date"]

    def get_queryset(self):
        return Payment.objects.select_related("invoice", "customer", "created_by")

    def get_serializer_class(self):
        if self.action == "list":
            return PaymentListSerializer
        return PaymentSerializer

    def perform_destroy(self, instance):
        from core.exceptions import PaymentError
        raise PaymentError("Payments cannot be deleted. Use refund instead.")

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        payment = self.get_object()
        reason = request.data.get("reason", "")
        payment = PaymentService.refund_payment(payment, reason)
        return Response(PaymentSerializer(payment).data)
