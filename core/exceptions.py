from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    # Handle our business logic errors before DRF's handler
    from core.exceptions import BusinessLogicError
    if isinstance(exc, BusinessLogicError):
        return Response(
            {"detail": exc.message},
            status=status.HTTP_400_BAD_REQUEST,
        )

    response = exception_handler(exc, context)

    if response is None:
        logger.exception("Unhandled exception in view %s", context.get("view"))
        return Response(
            {"detail": "An internal server error occurred. Please try again later."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Standardize error format
    if isinstance(response.data, dict):
        if "detail" not in response.data:
            response.data = {"detail": response.data}
    elif isinstance(response.data, list):
        response.data = {"detail": response.data}

    return response


class BusinessLogicError(Exception):
    """Raised when a business rule is violated."""
    def __init__(self, message, code=None):
        self.message = message
        self.code = code
        super().__init__(message)


class InvoiceError(BusinessLogicError):
    pass


class PaymentError(BusinessLogicError):
    pass


class QuoteError(BusinessLogicError):
    pass


class SubscriptionError(BusinessLogicError):
    pass