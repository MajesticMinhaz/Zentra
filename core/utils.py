import re
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone


def round_decimal(value, places=2):
    """Round a Decimal to specified decimal places."""
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    quantize_str = Decimal(10) ** -places
    return value.quantize(quantize_str, rounding=ROUND_HALF_UP)


def calculate_tax_amount(subtotal: Decimal, tax_rate: Decimal) -> Decimal:
    return round_decimal(subtotal * tax_rate / 100)


def calculate_discount_amount(subtotal: Decimal, discount_type: str, discount_value: Decimal) -> Decimal:
    if discount_type == "percentage":
        return round_decimal(subtotal * discount_value / 100)
    return round_decimal(discount_value)


def generate_document_number(prefix: str, model_class, field_name: str = "number") -> str:
    """
    Generate a sequential document number like INV-00042.
    Filters by prefix so CN-, INV-, RET- etc. each have their own sequence.
    Retries on IntegrityError to handle concurrent requests safely.
    """
    import re
    from django.db.models import Max

    for _attempt in range(10):
        last = model_class.all_objects.filter(
            **{f"{field_name}__startswith": f"{prefix}-"}
        ).aggregate(Max(field_name))[f"{field_name}__max"]

        if last:
            match = re.search(r"(\d+)$", last)
            next_num = int(match.group(1)) + 1 if match else 1
        else:
            next_num = 1

        candidate = f"{prefix}-{next_num:05d}"

        # Check it doesn't already exist (handles gaps/manual entries)
        if not model_class.all_objects.filter(**{field_name: candidate}).exists():
            return candidate

        # Already taken — increment and retry
        next_num += 1
        candidate = f"{prefix}-{next_num:05d}"
        if not model_class.all_objects.filter(**{field_name: candidate}).exists():
            return candidate

    raise ValueError(f"Could not generate a unique document number for prefix {prefix} after 10 attempts.")


def get_current_date():
    return timezone.now().date()