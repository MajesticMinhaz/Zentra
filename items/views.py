import django_filters
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema_view, extend_schema

from .models import Item
from .serializers import ItemSerializer


class ItemFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr="icontains")
    item_type = django_filters.ChoiceFilter(choices=Item.ItemType.choices)
    is_active = django_filters.BooleanFilter()
    min_price = django_filters.NumberFilter(field_name="unit_price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="unit_price", lookup_expr="lte")

    class Meta:
        model = Item
        fields = ["item_type", "is_active", "is_recurring"]


@extend_schema_view(
    list=extend_schema(tags=["Items"]),
    retrieve=extend_schema(tags=["Items"]),
    create=extend_schema(tags=["Items"]),
    update=extend_schema(tags=["Items"]),
    partial_update=extend_schema(tags=["Items"]),
    destroy=extend_schema(tags=["Items"]),
)
class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.filter(deleted_at__isnull=True)
    serializer_class = ItemSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = ItemFilter
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["name", "unit_price", "created_at"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.delete()  # Soft delete
