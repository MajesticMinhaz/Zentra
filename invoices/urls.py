from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InvoiceViewSet, TaxRateViewSet, DiscountViewSet

router = DefaultRouter()
router.register(r"invoices", InvoiceViewSet, basename="invoices")
router.register(r"tax-rates", TaxRateViewSet, basename="tax-rates")
router.register(r"discounts", DiscountViewSet, basename="discounts")

urlpatterns = [path("", include(router.urls))]
