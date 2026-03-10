from rest_framework import serializers
from .models import Subscription, SubscriptionItem


class SubscriptionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionItem
        fields = ["id", "item", "description", "quantity", "unit_price"]
        read_only_fields = ["id"]


class SubscriptionSerializer(serializers.ModelSerializer):
    items = SubscriptionItemSerializer(many=True, required=False)
    customer_name = serializers.CharField(source="customer.display_name", read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id", "customer", "customer_name", "name", "status",
            "billing_cycle", "start_date", "end_date", "trial_end_date",
            "next_billing_date", "cancelled_at", "paused_at",
            "amount", "currency", "auto_invoice", "notes",
            "items", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "cancelled_at", "paused_at", "created_at", "updated_at"]

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        validated_data["created_by"] = self.context["request"].user
        subscription = Subscription.objects.create(**validated_data)
        for item in items_data:
            SubscriptionItem.objects.create(subscription=subscription, **item)
        return subscription

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            for item in items_data:
                SubscriptionItem.objects.create(subscription=instance, **item)
        return instance
