from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from core.permissions import IsAccountant
from .models import Subscription
from .serializers import SubscriptionSerializer


class SubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = SubscriptionSerializer
    permission_classes = [IsAccountant]
    search_fields = ["name", "customer__display_name"]
    ordering_fields = ["created_at", "next_billing_date", "amount"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return Subscription.objects.select_related("customer").prefetch_related("items__item")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        subscription = self.get_object()
        reason = request.data.get("reason", "")
        subscription.cancel(reason)
        return Response(SubscriptionSerializer(subscription).data)

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        subscription = self.get_object()
        subscription.pause()
        return Response(SubscriptionSerializer(subscription).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        subscription = self.get_object()
        subscription.resume()
        return Response(SubscriptionSerializer(subscription).data)
