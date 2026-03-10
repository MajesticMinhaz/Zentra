"""
Health check endpoint.

GET /api/v1/health/

Returns 200 when the app, database, and Redis cache are all reachable.
Returns 503 if any dependency is down so Docker / load-balancers can
detect and act on a degraded container.

Intentionally kept dependency-free (no DRF serializers, no auth) so it
works even when the rest of the app is broken.
"""
import time

from django.db import connection, OperationalError as DbError
from django.core.cache import cache
from django.http import JsonResponse


def health(request):
    checks = {}
    status = 200

    # ── Database ──────────────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["database"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except DbError as exc:
        checks["database"] = {"status": "error", "detail": str(exc)}
        status = 503

    # ── Redis / cache ─────────────────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        cache.set("_health", "1", timeout=5)
        assert cache.get("_health") == "1"
        checks["cache"] = {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        checks["cache"] = {"status": "error", "detail": str(exc)}
        status = 503

    return JsonResponse({"status": "ok" if status == 200 else "degraded", "checks": checks}, status=status)
