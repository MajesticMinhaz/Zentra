import json
import logging
import time

logger = logging.getLogger(__name__)

AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SKIP_PATHS = {"/api/schema/", "/admin/jsi18n/"}


class AuditLogMiddleware:
    """
    Logs write operations for auditing purposes.
    Actual AuditLog records are created via signals in each app.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.time()
        response = self.get_response(request)
        duration = time.time() - start

        if request.method in AUDIT_METHODS and request.path not in SKIP_PATHS:
            user = getattr(request, "user", None)
            user_id = str(user.id) if user and user.is_authenticated else "anonymous"
            logger.info(
                "AUDIT method=%s path=%s status=%s user=%s duration=%.3fs",
                request.method,
                request.path,
                response.status_code,
                user_id,
                duration,
            )

        return response
