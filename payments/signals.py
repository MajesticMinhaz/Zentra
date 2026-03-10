"""Payments signals — log payment audit trail."""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Payment


@receiver(post_save, sender=Payment)
def log_payment_audit(sender, instance, created, **kwargs):
    if created:
        from audit.models import AuditLog
        AuditLog.objects.create(
            action=AuditLog.Action.CREATE,
            model_name="Payment",
            object_id=str(instance.id),
            description=f"Payment of {instance.currency} {instance.amount} for invoice {instance.invoice.number}",
            user=instance.created_by,
        )
