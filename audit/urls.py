from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .serializers import AuditLogViewSet

router = DefaultRouter()
router.register(r"audit-logs", AuditLogViewSet, basename="audit-logs")

urlpatterns = [path("", include(router.urls))]
