import django_filters
from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema_view, extend_schema

from core.permissions import IsAccountant, IsAdmin
from .models import Customer, CustomerContact
from .serializers import CustomerSerializer, CustomerListSerializer, CustomerContactSerializer


class CustomerFilter(django_filters.FilterSet):
    display_name = django_filters.CharFilter(lookup_expr="icontains")
    email = django_filters.CharFilter(lookup_expr="icontains")
    customer_type = django_filters.ChoiceFilter(choices=Customer.CustomerType.choices)
    currency = django_filters.CharFilter()
    has_balance = django_filters.BooleanFilter(field_name="outstanding_balance", method="filter_has_balance")

    def filter_has_balance(self, queryset, name, value):
        if value:
            return queryset.filter(outstanding_balance__gt=0)
        return queryset.filter(outstanding_balance=0)

    class Meta:
        model = Customer
        fields = ["customer_type", "currency"]


@extend_schema_view(
    list=extend_schema(tags=["Customers"]),
    retrieve=extend_schema(tags=["Customers"]),
    create=extend_schema(tags=["Customers"]),
    update=extend_schema(tags=["Customers"]),
    partial_update=extend_schema(tags=["Customers"]),
    destroy=extend_schema(tags=["Customers"]),
)
class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filterset_class = CustomerFilter
    search_fields = ["display_name", "company_name", "email", "phone"]
    ordering_fields = ["display_name", "created_at", "outstanding_balance"]
    ordering = ["display_name"]

    def get_queryset(self):
        return Customer.objects.prefetch_related("contacts")

    def get_serializer_class(self):
        if self.action == "list":
            return CustomerListSerializer
        return CustomerSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.delete()  # Soft delete

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        customer = Customer.all_objects.get(pk=pk)
        customer.restore()
        return Response(CustomerSerializer(customer).data)

    @action(detail=True, methods=["get"], url_path="statement")
    def statement(self, request, pk=None):
        """Return customer statement with invoice history."""
        from invoices.models import Invoice
        customer = self.get_object()
        invoices = Invoice.objects.filter(customer=customer).order_by("-issue_date")
        from invoices.serializers import InvoiceListSerializer
        return Response({
            "customer": CustomerSerializer(customer).data,
            "invoices": InvoiceListSerializer(invoices, many=True).data,
        })

    @action(detail=True, methods=["post"], url_path="apply-credit")
    def apply_credit(self, request, pk=None):
        """
        Apply customer credit balance to a specific invoice.
        Body: { "invoice_id": "<uuid>", "amount": <decimal> }
        """
        from payments.services import PaymentService
        from payments.serializers import PaymentSerializer
        from invoices.models import Invoice
        from core.exceptions import PaymentError

        customer = self.get_object()

        invoice_id = request.data.get("invoice_id")
        amount_raw = request.data.get("amount")

        if not invoice_id:
            return Response({"detail": "invoice_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not amount_raw:
            return Response({"detail": "amount is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return Response({"detail": "Invalid amount."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice = Invoice.objects.get(pk=invoice_id, customer=customer)
        except Invoice.DoesNotExist:
            return Response({"detail": "Invoice not found for this customer."}, status=status.HTTP_404_NOT_FOUND)

        try:
            payment = PaymentService.apply_credit(customer, invoice, amount, created_by=request.user)
        except PaymentError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    list=extend_schema(tags=["Customers"]),
    create=extend_schema(tags=["Customers"]),
    update=extend_schema(tags=["Customers"]),
    destroy=extend_schema(tags=["Customers"]),
)
class CustomerContactViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerContactSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CustomerContact.objects.filter(customer_id=self.kwargs["customer_pk"])

    def perform_create(self, serializer):
        customer = Customer.objects.get(pk=self.kwargs["customer_pk"])
        serializer.save(customer=customer)