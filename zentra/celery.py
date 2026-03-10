"""
Celery configuration for Zentra.
"""
import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "zentra.settings.prod")

app = Celery("zentra")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


# Periodic tasks schedule
app.conf.beat_schedule = {
    # Check overdue invoices every 5 minutes
    "check-overdue-invoices": {
        "task": "invoices.tasks.check_overdue_invoices",
        "schedule": 60,  # every 60 seconds
    },
    # Process due subscriptions every day at 06:00 UTC
    "process-due-subscriptions": {
        "task": "subscriptions.tasks.process_due_subscriptions",
        "schedule": 60 # every 60 seconds,
    },
}

app.conf.task_routes = {
    "invoices.tasks.*": {"queue": "invoices"},
    "subscriptions.tasks.*": {"queue": "subscriptions"},
}

app.conf.task_default_queue = "default"
app.conf.task_acks_late = True
app.conf.worker_prefetch_multiplier = 1