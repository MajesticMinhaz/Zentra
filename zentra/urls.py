from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from core.views import health

urlpatterns = [
    path("api/v1/health/", health, name="health"),
    path("admin/", admin.site.urls),
    # API Schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # API v1
    path("api/v1/", include("users.urls")),
    path("api/v1/", include("organizations.urls")),
    path("api/v1/", include("customers.urls")),
    path("api/v1/", include("items.urls")),
    path("api/v1/", include("quotes.urls")),
    path("api/v1/", include("invoices.urls")),
    path("api/v1/", include("payments.urls")),
    path("api/v1/", include("subscriptions.urls")),
    path("api/v1/", include("reports.urls")),
    path("api/v1/", include("audit.urls")),
]

if settings.DEBUG and "debug_toolbar" in settings.INSTALLED_APPS:
    import debug_toolbar
    urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# Catch-all: serve React SPA for any non-API route
urlpatterns += [
    re_path(
        r"^(?!api/|admin/|static/|media/).*$",
        TemplateView.as_view(template_name="index.html"),
        name="spa",
    ),
]
