from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, CustomTokenObtainPairView, SafeTokenRefreshView, LogoutView, RegisterView

router = DefaultRouter()
router.register(r"users", UserViewSet, basename="users")

urlpatterns = [
    path("auth/login/", CustomTokenObtainPairView.as_view(), name="token-obtain"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/refresh/", SafeTokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("", include(router.urls)),
]
