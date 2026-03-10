from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from drf_spectacular.utils import extend_schema_view, extend_schema

from core.permissions import IsAdmin
from .models import Organization
from .serializers import OrganizationSerializer, OrganizationListSerializer


@extend_schema_view(
    list=extend_schema(tags=["Organizations"]),
    retrieve=extend_schema(tags=["Organizations"]),
    create=extend_schema(tags=["Organizations"]),
    update=extend_schema(tags=["Organizations"]),
    partial_update=extend_schema(tags=["Organizations"]),
    destroy=extend_schema(tags=["Organizations"]),
)
class OrganizationViewSet(viewsets.ModelViewSet):
    """
    CRUD for organizations. Logo upload uses multipart/form-data.
    Setting is_default=true will automatically unset any other default.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return Organization.objects.filter(is_active=True).order_by("-is_default", "name")

    def get_serializer_class(self):
        if self.action == "list":
            return OrganizationListSerializer
        return OrganizationSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "set_default"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def _clean_request_data(self, request):
        """
        Merge request.data + request.FILES, but drop the logo key entirely
        when it is not a real uploaded file (empty string, 'undefined', etc.).
        This prevents the 'submitted data was not a file' error from DRF's
        ImageField when the client sends logo='' in a multipart form.
        """
        data = request.data.copy()
        logo_file = request.FILES.get("logo")
        if logo_file:
            data["logo"] = logo_file
        else:
            # Remove any non-file logo value so ImageField is not triggered
            data.pop("logo", None)
        return data

    def create(self, request, *args, **kwargs):
        data = self._clean_request_data(request)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        data = self._clean_request_data(request)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def perform_destroy(self, instance):
        """Soft-delete — just mark inactive."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=True, methods=["post"], url_path="set-default")
    def set_default(self, request, pk=None):
        org = self.get_object()
        Organization.objects.filter(is_default=True).exclude(pk=org.pk).update(is_default=False)
        org.is_default = True
        org.save(update_fields=["is_default"])
        return Response(OrganizationSerializer(org, context={"request": request}).data)

    @action(detail=False, methods=["get"], url_path="default")
    def get_default(self, request):
        org = Organization.objects.filter(is_default=True, is_active=True).first()
        if not org:
            org = Organization.objects.filter(is_active=True).first()
        if not org:
            return Response({"detail": "No organization found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(OrganizationSerializer(org, context={"request": request}).data)

    @action(detail=True, methods=["delete"], url_path="logo")
    def delete_logo(self, request, pk=None):
        org = self.get_object()
        if org.logo:
            org.logo.delete(save=False)
            org.logo = None
            org.save(update_fields=["logo"])
        return Response(OrganizationSerializer(org, context={"request": request}).data)