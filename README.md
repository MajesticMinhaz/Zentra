# Zentra — Business Finance & Billing Platform

> A self-hosted, multi-organisation invoicing and billing platform built with Django REST Framework and React.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Stack** | Django 6.0 · React 18 · PostgreSQL 16 · Redis 7 |
| **Python** | 3.13 |
| **Deployment** | Docker Compose |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Apps & Data Models](#4-apps--data-models)
5. [API Reference](#5-api-reference)
6. [Authentication & Roles](#6-authentication--roles)
7. [Background Jobs (Celery)](#7-background-jobs-celery)
8. [Environment Variables](#8-environment-variables)
9. [Getting Started (Development)](#9-getting-started-development)
10. [Docker Compose (Production)](#10-docker-compose-production)
11. [Database Backup & Restore](#11-database-backup--restore)
12. [Management Commands](#12-management-commands)
13. [PDF Generation](#13-pdf-generation)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Project Overview

Zentra is a self-hosted, multi-organisation business finance and billing platform. It handles the complete invoicing lifecycle — from creating quotes to recording payments and generating professional PDFs — with a clean React frontend backed by a Django REST API.

### Core Capabilities

- Multi-organisation support with per-organisation branding, banking details, and document defaults
- Full invoicing lifecycle: Quotes → Invoices → Payments → Credit Notes → Receipts
- Recurring subscriptions with automatic invoice generation via Celery Beat
- Real-time overdue detection — invoices auto-flip to overdue status every 5 minutes
- Professional PDF generation using WeasyPrint with custom HTML/CSS templates
- Role-based access control: Admin, Accountant, Staff
- Complete audit log of all API mutations
- JWT authentication with refresh token rotation and blacklisting
- OpenAPI 3.0 schema with Swagger UI and ReDoc interfaces

### Technology Stack

| Layer | Technology |
|---|---|
| Backend | Django 6.0.3, Django REST Framework, Python 3.13 |
| Frontend | React 18, served via Nginx as a Single Page Application |
| Database | PostgreSQL 16 |
| Cache / Broker | Redis 7 (Celery tasks and Django cache) |
| Task Queue | Celery with django-celery-beat for periodic tasks |
| PDF Engine | WeasyPrint with fontTools for font subsetting |
| Auth | JWT via djangorestframework-simplejwt |
| Containerisation | Docker Compose with multi-stage Dockerfile |
| Web Server | Gunicorn (WSGI) + Nginx reverse proxy |
| Package Manager | uv (fast Python package manager) |

---

## 2. Architecture

Zentra runs as six Docker services that communicate over two internal networks.

### Service Map

| Service | Port | Role |
|---|---|---|
| `nginx` | 8080 → 80 | Reverse proxy. Serves static/media files directly, forwards `/api/` to Gunicorn. Builds React SPA at image build time. |
| `web` | 8000 (internal) | Gunicorn WSGI server running Django. 3 workers by default. |
| `celery_worker` | — | Processes async tasks: PDF generation, email sending. Listens on `default`, `invoices`, `subscriptions` queues. |
| `celery_beat` | — | Scheduler. Triggers overdue check every 5 minutes and subscription processing on a configurable schedule. |
| `db` | 5432 (internal) | PostgreSQL 16. Data persisted in `postgres_data` Docker volume. |
| `redis` | 6379 (internal) | Celery message broker and Django cache backend. Data persisted in `redis_data` volume. |

### Request Flow

```
Browser
  └─▶ Nginx (:8080)
        ├─▶ /static/* and /media/*  →  served directly by Nginx
        ├─▶ /api/*                  →  proxied to web:8000 (Gunicorn → Django)
        └─▶ all other routes        →  returns index.html (React SPA)

Django (web)
  └─▶ async work (PDF, email)  →  enqueues Celery task  →  Redis  →  celery_worker
```

### Networks

| Network | Services |
|---|---|
| `backend` | db, redis, web, celery_worker, celery_beat, nginx |
| `frontend` | nginx only (isolates the public-facing proxy) |

---

## 3. Project Structure

```
zentra/
├── zentra/                  # Django project package
│   ├── settings/
│   │   ├── base.py          # Shared settings
│   │   ├── dev.py           # Development overrides
│   │   └── prod.py          # Production settings
│   ├── urls.py              # Root URL configuration
│   └── celery.py            # Celery app + beat schedule
├── core/                    # Shared utilities
│   ├── exceptions.py        # BusinessLogicError hierarchy + custom handler
│   ├── middleware.py        # Audit log middleware
│   ├── pagination.py        # Standard pagination class
│   └── permissions.py       # IsAdmin / IsAccountant / IsStaff
├── users/                   # Custom user model + auth views
├── organizations/           # Multi-org management
├── customers/               # Customer + contact management
├── items/                   # Product/service catalogue
├── quotes/                  # Quote lifecycle
├── invoices/                # Invoice lifecycle + PDF generation
├── payments/                # Payment recording + refunds
├── subscriptions/           # Recurring billing
├── reports/                 # Analytics endpoints
├── audit/                   # Audit log viewer
├── templates/
│   ├── invoices/pdf_invoice.html
│   └── quotes/pdf_quote.html
├── frontend/                # React SPA source
│   └── src/pages/           # Page components
├── docker/
│   └── nginx/               # Nginx Dockerfile + config
├── media/                   # User uploads (gitignored)
├── static/                  # Compiled frontend assets
├── Dockerfile               # Multi-stage backend image
├── docker-compose.yml
└── pyproject.toml           # Python dependencies (uv)
```

---

## 4. Apps & Data Models

### 4.1 users

Custom user model extending `AbstractBaseUser`. Authentication is email-based (no username field).

| Field | Description |
|---|---|
| `id` | UUID primary key |
| `email` | Unique login identifier |
| `role` | `admin` \| `accountant` \| `staff` |
| `organization` | FK → Organization (optional) |
| `first_name` / `last_name` | Display name fields |
| `is_active` / `is_staff` | Account and admin access flags |
| `timezone` | User's local timezone (default: UTC) |
| `avatar` | Profile image upload |

---

### 4.2 organizations

Each organisation represents a company entity that issues invoices. Multiple organisations can coexist in one Zentra instance.

| Field | Description |
|---|---|
| `name` / `legal_name` | Trading name and legal registered name |
| `logo` | Image upload used in PDF headers |
| `tagline` | Subtitle shown under logo in PDFs |
| `invoice_prefix` / `quote_prefix` | Prefix for auto-generated document numbers |
| `currency` | Default billing currency |
| `tax_number` / `registration_number` | Tax ID and company registration |
| `bank_*` | Banking details printed on invoices |
| `default_invoice_notes/terms` | Auto-filled when creating invoices |
| `default_quote_notes/terms` | Auto-filled when creating quotes |
| `is_default` | Whether this is the active organisation |

---

### 4.3 customers

Represents a client or counterparty. `outstanding_balance` and `credit_balance` are maintained by a Django signal that fires on every invoice save.

| Field | Description |
|---|---|
| `display_name` | Primary name shown throughout the UI |
| `company_name` | Optional legal entity name |
| `email` / `phone` | Primary contact details |
| `billing_address_*` | Full billing address (6 fields) |
| `tax_number` | Customer VAT/Tax ID printed on invoices |
| `currency` | Preferred billing currency |
| `outstanding_balance` | Live sum of `balance_due` across open invoices |
| `credit_balance` | Available credit from unspent credit notes |
| `is_active` | Soft-delete flag |
| `CustomerContact` | Related model — multiple named contacts per customer |

> **Signal:** `invoices/signals.py` fires on every `Invoice` post_save and recalculates the customer's `outstanding_balance` and `credit_balance` using aggregate queries — safe under concurrent writes.

---

### 4.4 items

The product and service catalogue. Items are selected when building invoice and quote line items.

| Field | Description |
|---|---|
| `name` | Display name |
| `sku` | Optional stock-keeping unit |
| `item_type` | `service` \| `product` \| `expense` \| `other` |
| `unit_price` | Default price (overridable per line item) |
| `tax_rate` | FK → TaxRate (optional default tax) |
| `unit` | Unit of measure (hrs, days, units, etc.) |
| `is_active` | Soft-delete flag |

---

### 4.5 invoices

The central model. An invoice tracks the full document lifecycle from draft through to paid or cancelled.

**Invoice Types**

| Type | Description |
|---|---|
| `sales` | Standard sales invoice (default) |
| `retainer` | Retainer / advance payment request |
| `credit_note` | Negative invoice to reverse or reduce a previous invoice |
| `receipt` | Payment confirmation document |

**Invoice Statuses**

| Status | Description |
|---|---|
| `draft` | Created, not yet sent to the customer |
| `sent` | Dispatched to the customer, balance is now outstanding |
| `partially_paid` | One or more payments recorded but balance remains |
| `paid` | Fully settled |
| `overdue` | Past due date with unpaid balance. Auto-set by Celery every 5 min for `sent` invoices. `partially_paid` invoices keep their status and surface overdue via the `is_overdue` computed field |
| `cancelled` | Voided. Excluded from all financial totals |

**Key Fields**

| Field | Description |
|---|---|
| `number` | Auto-generated sequential number (e.g. `INV-00023`) |
| `invoice_type` | `sales` \| `retainer` \| `credit_note` \| `receipt` |
| `status` | Current lifecycle state |
| `is_overdue` | Computed field: `true` if `due_date < today` and not paid/cancelled |
| `total` / `subtotal` | Computed from line items, tax, discount |
| `amount_paid` | Running total of payments applied |
| `balance_due` | `total − amount_paid` |
| `linked_invoice` | FK to parent invoice (for credit notes and receipts) |
| `source_quote` | FK to originating quote |
| `pdf_file` | Cached generated PDF path |
| `InvoiceLineItem` | Related model — each line has item, quantity, unit_price, tax |
| `TaxRate` | Reusable tax rate definitions |
| `Discount` | Reusable discount definitions (percentage or fixed) |

---

### 4.6 quotes

Quotes follow a separate lifecycle and can be converted into invoices in one action.

| Field | Description |
|---|---|
| `status` | `draft` \| `sent` \| `accepted` \| `declined` \| `expired` \| `converted` |
| `valid_until` | Expiry date |
| `source_quote` | Self-reference for quote revisions |
| `QuoteLineItem` | Mirrors InvoiceLineItem structure |

---

### 4.7 payments

Each `Payment` record represents a single payment event applied against an invoice.

| Field | Description |
|---|---|
| `invoice` | FK → Invoice |
| `customer` | FK → Customer (denormalised for reporting) |
| `amount` | Payment amount (must not exceed `balance_due`) |
| `payment_method` | `bank` \| `stripe` \| `cash` \| `check` \| `credit_card` \| `other` |
| `status` | `completed` \| `pending` \| `failed` \| `refunded` |
| `transaction_reference` | External reference or transaction ID |
| `refunded_at` / `refund_reason` | Set when a refund is processed |

> **Rules:**
> - Payments cannot be deleted — use the refund action instead.
> - Overpayment is blocked at both the API level (`PaymentError` → HTTP 400) and in the UI (`max` attribute on the amount input).
> - Credit application payments use `transaction_reference = "Credit applied"` and are excluded from `total_paid` calculations.

---

### 4.8 subscriptions

Subscriptions auto-generate invoices on a recurring schedule.

| Field | Description |
|---|---|
| `billing_cycle` | `monthly` \| `quarterly` \| `yearly` |
| `status` | `active` \| `trial` \| `paused` \| `cancelled` |
| `next_billing_date` | Date the next invoice will be auto-generated |
| `auto_invoice` | Toggle — disable to pause generation without cancelling |
| `SubscriptionItem` | Related model — links to catalogue items with quantity and price |

---

## 5. API Reference

All endpoints are prefixed with `/api/v1/`. Authentication requires a `Bearer` JWT token in the `Authorization` header.

**Interactive docs:**
- Swagger UI: `http://your-host/api/docs/`
- ReDoc: `http://your-host/api/redoc/`
- OpenAPI JSON: `http://your-host/api/schema/`

### Endpoint Overview

| Endpoint | Description |
|---|---|
| `POST /auth/login/` | Obtain access + refresh JWT token pair |
| `POST /auth/refresh/` | Refresh an expired access token |
| `POST /auth/logout/` | Blacklist the refresh token |
| `GET/POST /users/` | User management (admin only for create/delete) |
| `GET/POST /organizations/` | Organisation CRUD + `set-default` action |
| `GET/POST /customers/` | Customer CRUD with balance fields |
| `GET/POST /items/` | Service/product catalogue CRUD |
| `GET/POST /quotes/` | Quote CRUD + `send` / `accept` / `decline` / `convert` actions |
| `GET/POST /invoices/` | Invoice CRUD + `send` / `cancel` / `generate-pdf` / `apply-credit` actions |
| `GET/POST /payments/` | Payment recording + `refund` action |
| `GET/POST /subscriptions/` | Subscription CRUD |
| `GET /reports/` | Financial summary and analytics |
| `GET /audit/` | Audit log viewer (admin only) |
| `GET /health/` | Health check — no auth required |

### Error Format

All errors return a consistent JSON shape:

```json
{ "detail": "Human-readable error message" }
```

Business logic errors (`PaymentError`, `InvoiceError`, etc.) return **HTTP 400**. Unhandled exceptions return **HTTP 500** with a generic message — never a stack trace in production.

---

## 6. Authentication & Roles

### JWT Flow

```
POST /api/v1/auth/login/
Body: { "email": "user@example.com", "password": "..." }

Response:
{
  "access":  "<token>",   # valid 60 minutes
  "refresh": "<token>"    # valid 7 days
}
```

Include the access token in every subsequent request:
```
Authorization: Bearer <access_token>
```

When the access token expires, refresh it:
```
POST /api/v1/auth/refresh/
Body: { "refresh": "<refresh_token>" }
```
The old refresh token is blacklisted and a new pair is returned.

### Role Permissions

| Action | Admin | Accountant | Staff |
|---|:---:|:---:|:---:|
| Manage users | ✅ | ❌ | ❌ |
| Manage organisations | ✅ | ❌ | ❌ |
| Create / edit invoices | ✅ | ✅ | ❌ |
| Record payments | ✅ | ✅ | ❌ |
| View invoices / quotes | ✅ | ✅ | ✅ |
| View customers | ✅ | ✅ | ✅ |
| View audit log | ✅ | ❌ | ❌ |

---

## 7. Background Jobs (Celery)

Celery handles all async and scheduled work. Two processes run: `celery_worker` (task execution) and `celery_beat` (scheduler). Both use Redis as the message broker.

### Scheduled Tasks

| Task | Schedule | What It Does |
|---|---|---|
| `check_overdue_invoices` | Every 5 minutes | Finds all `SENT` invoices whose `due_date < today` and sets their status to `OVERDUE`. `PARTIALLY_PAID` invoices are not touched — their overdue state surfaces via the `is_overdue` computed field. |
| `process_due_subscriptions` | Daily at 06:00 UTC | Finds active subscriptions whose `next_billing_date <= today`, creates invoices for each, and advances `next_billing_date` by the billing cycle. |
| `send_invoice_email` | On demand | Triggered when an invoice is sent. Runs async to avoid blocking the API response. |
| `generate_invoice_pdf` | On demand | Triggered from the `generate-pdf` endpoint. Renders the HTML template via WeasyPrint and saves the file. |

### Queues

| Queue | Used For |
|---|---|
| `default` | General tasks |
| `invoices` | Invoice PDF and email tasks |
| `subscriptions` | Subscription processing tasks |

### Changing Schedules

Edit `zentra/celery.py`:

```python
# Frequency-based (every N seconds)
"check-overdue-invoices": {
    "task": "invoices.tasks.check_overdue_invoices",
    "schedule": 300,  # every 5 minutes
},

# Time-based (specific time of day)
"process-due-subscriptions": {
    "task": "subscriptions.tasks.process_due_subscriptions",
    "schedule": crontab(hour=6, minute=0),  # daily at 6am UTC
},
```

After any change, restart the scheduler:
```bash
docker compose restart celery_beat
```

---

## 8. Environment Variables

Copy `.env.example` to `.env` and fill in your values before starting.

### Required

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | *(none)* | Django secret key. Generate with: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DB_NAME` | `zentra` | PostgreSQL database name |
| `DB_USER` | `zentra` | PostgreSQL username |
| `DB_PASSWORD` | `zentra` | PostgreSQL password — **change in production** |
| `ALLOWED_HOSTS` | *(none)* | Comma-separated hostnames e.g. `yourdomain.com,www.yourdomain.com` |
| `CORS_ALLOWED_ORIGINS` | *(none)* | Comma-separated origins e.g. `https://yourdomain.com` |

### Optional

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `DB_HOST` | `db` | PostgreSQL host (Docker service name) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DEBUG` | `False` | Enable Django debug mode — **never `True` in production** |
| `EMAIL_BACKEND` | `console` | Use `django.core.mail.backends.smtp.EmailBackend` for real email |
| `EMAIL_HOST` | *(none)* | SMTP server hostname |
| `EMAIL_PORT` | `587` | SMTP port |
| `EMAIL_HOST_USER` | *(none)* | SMTP username |
| `EMAIL_HOST_PASSWORD` | *(none)* | SMTP password |
| `DEFAULT_FROM_EMAIL` | `noreply@zentra.io` | Sender address for outgoing emails |
| `NGINX_PORT_EXPOSED` | `8080` | Host port that maps to Nginx :80 |
| `PGADMIN_DEFAULT_EMAIL` | `admin@zentra.local` | pgAdmin login email |
| `PGADMIN_DEFAULT_PASSWORD` | `admin` | pgAdmin login password |

---

## 9. Getting Started (Development)

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Node.js 22+ *(only needed if editing frontend outside Docker)*
- Python 3.13+ with `uv` *(only needed for local backend work)*

### First-Time Setup

**Step 1 — Clone and configure:**
```bash
git clone https://github.com/your-org/zentra.git
cd zentra
cp .env.example .env
# Edit .env — set SECRET_KEY and DB_PASSWORD at minimum
```

**Step 2 — Build and start all services:**
```bash
docker compose up --build
```
The `migrate` service runs automatically on first start, applying all migrations and collecting static files.

**Step 3 — Create a superuser (first time only):**
```bash
docker compose exec web python manage.py createsuperuser
```

**Step 4 — Open the application:**

| URL | Description |
|---|---|
| `http://localhost:8080` | Main application |
| `http://localhost:8080/admin/` | Django admin |
| `http://localhost:8080/api/docs/` | Swagger UI |

### Useful Development Commands

```bash
# View logs from all services
docker compose logs -f

# View logs from a specific service
docker compose logs -f web
docker compose logs -f celery_worker

# Run a Django management command
docker compose exec web python manage.py <command>

# Open Django shell
docker compose exec web python manage.py shell

# Run migrations after model changes
docker compose exec web python manage.py makemigrations
docker compose exec web python manage.py migrate

# Rebuild a single service after code changes
docker compose up --build web

# Start pgAdmin (database GUI)
docker compose --profile admin up pgadmin
# Then visit: http://localhost:5050
```

---

## 10. Docker Compose (Production)

### Starting & Stopping

```bash
# Start all services in the background
docker compose up -d

# Stop all services (data is preserved in volumes)
docker compose down

# ⚠️  DESTRUCTIVE — Stop and delete all data volumes
docker compose down -v

# Restart a single service
docker compose restart web
docker compose restart celery_beat
```

> **Warning:** Never run `docker compose down -v` in production. This destroys the `postgres_data` volume and all your data permanently. Always use `docker compose down` (without `-v`).

### Updating the Application

```bash
# Pull latest code
git pull

# Rebuild images
docker compose build

# Apply any new migrations
docker compose run --rm migrate

# Restart services with new images
docker compose up -d
```

### Volumes

| Volume | Contains |
|---|---|
| `postgres_data` | All PostgreSQL data — **back this up regularly** |
| `redis_data` | Redis persistence (Celery results, cache) |
| `media_data` | User uploads: logos, avatars, generated PDFs |
| `static_data` | Compiled frontend assets and Django static files |
| `pgadmin_data` | pgAdmin configuration (admin profile only) |

---

## 11. Database Backup & Restore

Zentra's data lives in the `postgres_data` Docker volume. The recommended backup tool is `pg_dump` in custom compressed format (`-F c`), which produces a smaller binary file and supports selective table restores.

> **Why not `dumpdata`?** `django manage.py dumpdata` is fine for development fixtures but is slow on large datasets, does not preserve sequences correctly, and cannot be restored into a clean database without extra steps. `pg_dump` is the industry standard.

---

### 11.1 Manual Backup

Run this from your local machine in the directory where your `docker-compose.yml` lives. The `.dump` file is saved directly on your local machine — outside Docker.

```bash
docker compose exec db pg_dump -U zentra -d zentra -F c > zentra_backup_$(date +%Y%m%d_%H%M%S).dump
```

This creates a file like `zentra_backup_20260310_143022.dump` in your current directory.

> **What is `-F c`?** Custom compressed format. It is binary (not plain SQL), compressed, and the only format that supports `pg_restore --table` for selective restores. Typically 5–10× smaller than plain SQL.

---

### 11.2 Restore from a Backup

```bash
docker compose exec -T db pg_restore \
  -U zentra \
  -d zentra \
  --clean \
  --if-exists \
  < zentra_backup_20260310_143022.dump
```

> **Warning:** `--clean` drops and recreates all tables. Always stop the app services before restoring to prevent active connections interfering:
> ```bash
> docker compose stop web celery_worker celery_beat
> # (run restore here)
> docker compose start web celery_worker celery_beat
> ```

---

### 11.3 Automated Daily Backup (Cron)

**Step 1 — Create the backup directory:**
```bash
mkdir -p ~/zentra-backups
```

**Step 2 — Open your crontab:**
```bash
crontab -e
```

**Step 3 — Add this line** (runs every day at 2am, keeps 30 days of backups):
```
0 2 * * * cd /path/to/your/zentra && docker compose exec -T db pg_dump -U zentra -d zentra -F c > ~/zentra-backups/zentra_$(date +\%Y\%m\%d).dump && find ~/zentra-backups -name '*.dump' -mtime +30 -delete
```

**Verify it is registered:**
```bash
crontab -l
```

---

### 11.4 Restore to a Fresh Machine

If you need to move Zentra to a new server or rebuild from scratch:

**Step 1 — Copy your `.dump` file to the new machine, then start only the database:**
```bash
docker compose up -d db
sleep 5  # wait for Postgres to initialise
```

**Step 2 — Restore the data:**
```bash
docker compose exec -T db pg_restore \
  -U zentra \
  -d zentra \
  --clean \
  --if-exists \
  < zentra_backup_20260310_143022.dump
```

**Step 3 — Start all remaining services:**
```bash
docker compose up -d
```

All your organisations, customers, invoices, and settings will be restored exactly as they were.

---

### 11.5 Backup the Media Volume

Generated PDFs, organisation logos, and user avatars live in the `media_data` volume. Back them up alongside the database:

```bash
# Create a tar archive of the media volume
docker run --rm \
  -v zentra_media_data:/media \
  -v $(pwd):/backup \
  alpine tar czf /backup/zentra_media_$(date +%Y%m%d).tar.gz -C /media .

# Restore media volume from archive
docker run --rm \
  -v zentra_media_data:/media \
  -v $(pwd):/backup \
  alpine tar xzf /backup/zentra_media_20260310.tar.gz -C /media
```

---

### 11.6 Backup Checklist

- [ ] Test a restore on a spare machine at least once before relying on it
- [ ] Keep backups in at least two locations (local + cloud: S3, Backblaze B2, Google Drive)
- [ ] Back up the `media_data` volume alongside the database
- [ ] Store your `.env` file securely and separately from the database backup
- [ ] Verify your cron job is running: `crontab -l` and check `~/zentra-backups/`

---

## 12. Management Commands

All commands run via:
```bash
docker compose exec web python manage.py <command>
```

### `recalculate_balances`

Recalculates `outstanding_balance` and `credit_balance` for all customers from scratch using aggregate queries. Use if any customer balance appears incorrect or went negative.

```bash
docker compose exec web python manage.py recalculate_balances
# Output: Recalculated balances for 3 customers.
```

### `mark_overdue`

Immediately marks all `SENT` invoices past their due date as `OVERDUE` without waiting for the Celery Beat schedule. Useful after first deploy or if Celery Beat was temporarily down.

```bash
docker compose exec web python manage.py mark_overdue
# Output: Marked 5 invoice(s) as overdue.
```

### Standard Django Commands

```bash
# Apply database migrations
docker compose exec web python manage.py migrate

# Create a new superuser
docker compose exec web python manage.py createsuperuser

# Collect static files
docker compose exec web python manage.py collectstatic --noinput

# Open Django shell
docker compose exec web python manage.py shell

# Check for configuration issues (run before going live)
docker compose exec web python manage.py check --deploy
```

---

## 13. PDF Generation

PDFs are generated server-side using WeasyPrint, a Python HTML-to-PDF renderer. Each invoice and quote has a `generate-pdf` API action that renders the appropriate Django template and saves the output to `media/invoices/pdf/` or `media/quotes/pdf/`.

### Templates

| Document | Template Path |
|---|---|
| Invoice / Receipt / Retainer / Credit Note | `templates/invoices/pdf_invoice.html` |
| Quote | `templates/quotes/pdf_quote.html` |

### Template Context Variables

| Variable | Source |
|---|---|
| `invoice` / `quote` | Full model instance |
| `line_items` | Queryset of line items |
| `company_name`, `company_logo`, `company_email`, `company_phone` | Organisation record |
| `company_address`, `company_tax_number`, `company_registration_number` | Organisation record |
| `company_bank_name`, `company_bank_account_number`, `company_bank_sort_code`, `company_bank_swift_iban` | Organisation banking details |

### Regenerating Cached PDFs

After editing a PDF template, delete the cached files so they are regenerated on the next request:

```bash
docker compose exec web find media/invoices/pdf -name "*.pdf" -delete
docker compose exec web find media/quotes/pdf -name "*.pdf" -delete
```

### Fontconfig Warning

WeasyPrint may log the following in Docker environments:
```
Fontconfig error: No writable cache directories
```
This is **harmless** — PDFs are generated correctly. To silence it, add to your `Dockerfile`:
```dockerfile
RUN mkdir -p /var/cache/fontconfig && chmod 777 /var/cache/fontconfig
```

---

## 14. Troubleshooting

### Invoices not showing as overdue

The Celery Beat scheduler must be running. Check its status:
```bash
docker compose ps celery_beat
docker compose logs celery_beat
```
To fix immediately without waiting for the schedule:
```bash
docker compose exec web python manage.py mark_overdue
```

---

### Customer outstanding balance is wrong or negative

Run the balance recalculation command:
```bash
docker compose exec web python manage.py recalculate_balances
```

---

### PDF not updating after template edit

PDFs are cached as files on disk. Delete them to force regeneration:
```bash
docker compose exec web find media/invoices/pdf -name "*.pdf" -delete
```

---

### PaymentError shown as 500 debug page instead of a toast

Ensure `core/exceptions.py` contains the `BusinessLogicError` handler at the top of `custom_exception_handler`. This converts `PaymentError`, `InvoiceError`, and `QuoteError` into clean `HTTP 400` JSON responses.

---

### Services not starting — database not ready

The `migrate` service has a `depends_on: db: condition: service_healthy` check. If Postgres is slow to start, increase the retries in `docker-compose.yml`:

```yaml
healthcheck:
  retries: 20        # increase from 10
  start_period: 30s  # give more time to initialise
```

---

### Celery tasks not processing

Check that both Redis and the worker are healthy:
```bash
docker compose ps
docker compose logs celery_worker
docker compose exec redis redis-cli ping   # should return: PONG
```

---

### Frontend changes not visible

The React SPA is compiled into the Nginx image at build time. After editing frontend source files you must rebuild the Nginx image:
```bash
docker compose build nginx
docker compose up -d nginx
```

---

*Zentra Technical Documentation — v1.0.0*