from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id", "user", "user_email", "action", "model_name", "object_id",
            "description", "ip_address", "old_value", "new_value", "timestamp",
        ]
        read_only_fields = fields


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ["model_name", "object_id", "user__email", "description"]
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]
    filterset_fields = ["action", "model_name", "user"]
