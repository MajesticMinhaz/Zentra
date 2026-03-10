from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers as nested_routers

from .views import CustomerViewSet, CustomerContactViewSet

router = DefaultRouter()
router.register(r"customers", CustomerViewSet, basename="customers")

customers_router = nested_routers.NestedDefaultRouter(router, r"customers", lookup="customer")
customers_router.register(r"contacts", CustomerContactViewSet, basename="customer-contacts")

urlpatterns = [
    path("", include(router.urls)),
    path("", include(customers_router.urls)),
]
