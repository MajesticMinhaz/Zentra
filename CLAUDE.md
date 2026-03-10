# Zentra — Claude Scaffold

Zentra is a self-hosted SaaS billing platform (customers, invoices, payments, subscriptions, reporting). Backend: Django 6 + DRF. Frontend: React 18 + Vite. Queue: Celery + Redis. DB: PostgreSQL 16.

---

## Recent Changes (v2)

The following features were added:

**Authentication:**
- `POST /api/v1/auth/register/` — public self-registration endpoint (creates `STAFF` role, returns tokens immediately)
- `POST /api/v1/auth/logout/` — properly blacklists the refresh token server-side
- Frontend: `/register` page with full form validation and password show/hide toggle
- Login page now links to registration

**Quotes:**
- `POST /api/v1/quotes/{id}/generate-pdf/` — generate PDF on-demand
- `GET /api/v1/quotes/{id}/pdf/` — retrieve PDF URL (auto-generates if missing)
- Frontend: full edit mode for draft quotes, send/accept/reject/convert-to-invoice actions, PDF download button per row

**Invoices:**
- Frontend: "Download PDF" button in invoice summary sidebar (triggers Celery job → polls → opens PDF)

**Reports:**
- `GET /api/v1/reports/revenue-pdf/?year=YYYY` — streams a WeasyPrint PDF revenue report
- Frontend: "Export PDF" button on Reports page

**PDF Templates (fully redesigned):**
- `templates/invoices/pdf_invoice.html` — dark header band, meta strip, professional line-items table, totals box
- `templates/quotes/pdf_quote.html` — teal accent colour, validity notice block, distinct from invoices
- `templates/reports/pdf_report.html` — indigo gradient, KPI cards, monthly bar chart table with visual bars

**Bug fixes:**
- `customers/`: statement view used `total_amount` — fixed to `total` (matching `InvoiceListSerializer`)
- `items/`: `unit_of_measure` frontend used `hr` — fixed to `hour` (matching model choices)
- `payments/`: frontend sent invalid method values (`debit_card`, `cheque`, `paypal`) — fixed to match backend choices (`bank`, `stripe`, `cash`, `check`, `credit_card`, `other`)
- `AuthContext.logout()` now calls `/api/v1/auth/logout/` to blacklist the token before clearing localStorage
- `invoices/pdf.py` tried to load a non-existent `pdf_invoice.css` template — removed that call

```
zentra-master/
├── zentra/              # Django project config (settings, urls, celery, wsgi)
│   └── settings/
│       ├── base.py      # Shared settings
│       ├── dev.py       # Development overrides (debug toolbar, etc.)
│       └── prod.py      # Production overrides
├── core/                # Shared utilities: base models, pagination, permissions, middleware, exceptions
├── users/               # Custom User model (email-based auth), JWT auth, roles: ADMIN, ACCOUNTANT, STAFF
├── customers/           # Customer & contact management
├── items/               # Product/service catalog
├── quotes/              # Quotes / proposals
├── invoices/            # Invoices, credit notes, line items, tax rates, PDF generation
├── payments/            # Payment tracking & Stripe integration
├── subscriptions/       # Recurring subscription plans
├── reports/             # Financial reporting endpoints
├── audit/               # Audit log middleware + model
├── templates/           # WeasyPrint PDF & email templates (invoices)
├── static/frontend/     # Pre-built React SPA (served by Django/Nginx)
├── frontend/            # React source (Vite, separate Docker service)
├── tests/               # Pytest test suite (conftest.py + test_core.py)
├── scripts/             # seed_data.py — loads demo fixtures
├── docker/nginx/        # Nginx config files (dev + local)
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml       # Python deps managed with `uv`
├── .env                 # Local env vars (git-ignored in real projects)
└── manage.py
```

**URL namespace:** all API routes live under `/api/v1/`. React SPA catches everything else via a catch-all Django view.

**Auth:** JWT (SimpleJWT). Access token: 60 min. Refresh: 7 days, rotated & blacklisted on use. Header: `Authorization: Bearer <token>`.

---

## Development Setup

Everything runs inside Docker — no local Python/Node required.

```bash
# First run
cp .env.example .env          # already present as .env in this repo
docker compose up --build

# Subsequent runs
docker compose up -d
docker compose down
docker compose down --volumes  # wipe DB + Redis
```

**Application URLs (after `docker compose up`):**

| URL | Description |
|-----|-------------|
| http://localhost:8080 | Main app (Nginx → Django + React) |
| http://localhost:8080/api/docs | Swagger UI |
| http://localhost:8080/api/redoc | ReDoc |
| http://localhost:8080/admin | Django admin |
| http://localhost:5173 | React Vite dev server (HMR) |
| http://localhost:8000 | Django direct |

**Default credentials (after seed data):**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@zentra.io | Admin1234! |
| Accountant | accountant@zentra.io | Account1234! |

---

## Common Commands

All Django/Python commands run **inside the `web` container** via `docker compose exec web`:

```bash
# Migrations
docker compose exec web uv run python manage.py migrate
docker compose exec web uv run python manage.py makemigrations

# Create superuser
docker compose exec web uv run python manage.py createsuperuser

# Load seed data
docker compose exec web uv run python scripts/seed_data.py

# Collect static files
docker compose exec web uv run python manage.py collectstatic --noinput

# Django shell
docker compose exec web uv run python manage.py shell

# Logs
docker compose logs -f web
docker compose logs -f celery_worker
docker compose logs -f frontend
```

---

## Running Tests

Tests use **pytest-django** and run inside the container:

```bash
# All tests
docker compose exec web uv run pytest

# With coverage
docker compose exec web uv run pytest --cov

# Single file, verbose
docker compose exec web uv run pytest tests/test_core.py -v
```

Test config lives in `pytest.ini`. Shared fixtures are in `tests/conftest.py` — key fixtures: `api_client`, `admin_user`, `auth_client`, `customer`, `item`, `draft_invoice`.

---

## Adding a New App

1. Create the Django app: `docker compose exec web uv run python manage.py startapp <name>`
2. Add to `INSTALLED_APPS` in `zentra/settings/base.py`
3. Inherit models from `core.models.TimeStampedModel` (adds `created_at`, `updated_at`, `created_by`)
4. Use `core.pagination.StandardResultsPagination` for list views
5. Use `core.permissions` for role-based access control
6. Wire URLs in `<app>/urls.py` and include in `zentra/urls.py` under `api/v1/`
7. Run `makemigrations` + `migrate`

---

## Key Patterns

**Models:** Inherit `core.models.TimeStampedModel` for timestamps + `created_by` FK.

**Permissions:** `core.permissions` provides role-based guards (`IsAdmin`, `IsAccountant`, etc.).

**Background tasks:** Add Celery tasks in `<app>/tasks.py`, import in `zentra/celery.py` autodiscover or decorate with `@shared_task`. Periodic tasks are scheduled via the DB scheduler (django-celery-beat).

**PDF generation:** WeasyPrint renders `templates/invoices/pdf_invoice.html`. See `invoices/pdf.py`.

**Signals:** `invoices/signals.py` and `payments/signals.py` handle post-save side effects.

**Environment:** All secrets and config come from `.env` via `python-decouple`. Never hardcode credentials.

---

## Environment Variables

Key variables (see `.env.example` for full list):

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | Django secret key |
| `DJANGO_SETTINGS_MODULE` | e.g. `zentra.settings.dev` |
| `DB_*` | PostgreSQL connection |
| `REDIS_URL` | Redis for Celery + cache |
| `STRIPE_PUBLIC_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe integration |
| `EMAIL_BACKEND` / `EMAIL_HOST` / ... | Email config |
| `COMPANY_NAME` / `INVOICE_NUMBER_PREFIX` / `QUOTE_NUMBER_PREFIX` | Branding |

---

## Frontend

Source lives in `frontend/src/`. Built with React 18 + Vite. Key structure:

```
frontend/src/
├── pages/         # One component per route (Dashboard, Invoices, Customers, etc.)
├── components/    # Shared UI (Layout, etc.)
├── context/       # AuthContext (JWT token management)
└── utils/
    ├── api.js     # Axios instance with JWT interceptors
    └── helpers.js # Formatting utilities
```

The pre-built SPA (`static/frontend/`) is served by Django's static file handler and caught by the catch-all URL route.

---

## Dependency Management

Python deps are managed with **`uv`** (not pip directly):

```bash
# Add a package
docker compose exec web uv add <package>

# Sync after uv.lock changes
docker compose exec web uv sync
```

Frontend deps use standard npm inside the `frontend` container.

---

## Recent Changes (v3)

### Invoice PDF — Synchronous Generation
- `invoices/views.py`: `generate_pdf` and `get_pdf` actions now generate PDFs **synchronously** via `render_invoice_pdf()` instead of queuing a Celery task. This means PDFs work immediately without Celery running.
- `InvoiceFormPage.jsx`: `handleDownloadPdf` updated to use the `pdf_url` returned directly from `generate-pdf` (no 1.2s polling delay).

### Payments — Overdue Invoices
- `PaymentsPage.jsx`: Payment invoice dropdown now also loads `overdue` invoices (in addition to `sent` and `partially_paid`), using `Promise.all` for parallel loading.

### All Previous Changes (v2)
See v2 section above.
