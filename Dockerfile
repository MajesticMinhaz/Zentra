# =============================================================================
# Zentra — Backend Dockerfile  (multi-stage)
#
# Stages
# ──────
#   uv-binary  Pulls the pinned uv binary from the official distroless image.
#              Named stage needed because Docker does not support variable
#              expansion in --from (e.g. --from=image:${ARG} is invalid).
#
#   builder    Installs all Python deps with uv into an isolated /app/.venv.
#              All build-time tooling (gcc, libpq-dev, …) stays here and
#              never reaches the final image.
#
#   runtime    Copies only the compiled venv + app source onto a clean slim
#              base. Runs as a non-root user with the minimum OS packages.
#
# Build arguments (all have safe defaults)
# ─────────────────────────────────────────
#   PYTHON_VERSION  Python release to use          (default: 3.13)
#   UV_VERSION      uv release to pin exactly      (default: 0.6.6)
#   APP_PORT        Port gunicorn binds to          (default: 8000)
#   APP_UID         UID for the non-root app user   (default: 1000)
#   APP_GID         GID for the non-root app group  (default: 1000)
#
# Typical usage
# ─────────────
#   docker build -t zentra-backend .
#   docker build --build-arg UV_VERSION=0.6.6 --build-arg PYTHON_VERSION=3.13 .
# =============================================================================

# Declare all ARGs before the first FROM so they are available in global scope.
# Each stage that needs them must re-declare with ARG <name> (no default needed
# — the global value is inherited automatically).
ARG PYTHON_VERSION=3.13
ARG UV_VERSION=0.6.6
ARG APP_PORT=8000
ARG APP_UID=1000
ARG APP_GID=1000


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 0 — uv-binary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Docker forbids variable expansion in --from, so we cannot write:
#   COPY --from=ghcr.io/astral-sh/uv:${UV_VERSION} ...
# The workaround: create a named stage whose FROM resolves the ARG, then
# COPY --from=uv-binary (a plain name) in the next stage.
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv-binary
# Nothing to do here — we only need the /uv binary from this image.


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 1 — builder
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM python:${PYTHON_VERSION}-slim AS builder

# Re-declare ARGs consumed in this stage (global values are inherited).
ARG UV_VERSION

# ── System build dependencies ──────────────────────────────────────────────
# Compile-time only — none of these appear in the final runtime image.
#
#   gcc / libpq-dev   → C extensions; keeps the Dockerfile valid if someone
#                        switches from psycopg2-binary to plain psycopg2
#   libffi-dev        → cffi, required by WeasyPrint / cryptography
#   libssl-dev        → OpenSSL headers for the cryptography wheel
#   libpango/cairo    → WeasyPrint resolves pkg-config paths at install time
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        libffi-dev \
        libssl-dev \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-xlib-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ── Copy the pinned uv binary from stage 0 ────────────────────────────────
COPY --from=uv-binary /uv /usr/local/bin/uv

# ── uv environment ─────────────────────────────────────────────────────────
ENV UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_PROGRESS=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# ── Dependency install — isolated cache layer ──────────────────────────────
# Copy only the dependency manifest first. This layer is invalidated only
# when pyproject.toml or uv.lock change — not on every source code edit.
COPY pyproject.toml uv.lock .python-version ./

RUN uv sync \
        --frozen \
        --no-dev \
        --no-install-project \
    && find /app/.venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stage 2 — runtime
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM python:${PYTHON_VERSION}-slim AS runtime

ARG APP_PORT
ARG APP_UID
ARG APP_GID

# ── Runtime system packages ────────────────────────────────────────────────
# No build tools here — only what the running process actually needs.
#
#   libpango/cairo/gdk-pixbuf  → WeasyPrint PDF rendering at runtime
#   libpq5                     → psycopg2 shared library (.so)
#   postgresql-client          → pg_isready used by backup scripts
#   curl                       → Docker HEALTHCHECK / liveness probes
#   ca-certificates            → HTTPS from Python (requests / urllib3)
#   tini                       → PID 1: signal forwarding + zombie reaping
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-xlib-2.0-0 \
        libpq5 \
        postgresql-client \
        curl \
        ca-certificates \
        tini \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Non-root user ──────────────────────────────────────────────────────────
# Created before files are copied so --chown in COPY instructions works.
# Fixed UID/GID keeps bind-mount permissions predictable on Linux hosts.
RUN groupadd --gid ${APP_GID} zentra \
    && useradd \
        --uid ${APP_UID} \
        --gid ${APP_GID} \
        --no-create-home \
        --shell /sbin/nologin \
        zentra

WORKDIR /app

# ── Copy compiled venv from builder ───────────────────────────────────────
# Only the installed packages cross the stage boundary — no build tools,
# no source tarballs, no apt cache.
COPY --from=builder --chown=zentra:zentra /app/.venv /app/.venv

# ── Copy application source ────────────────────────────────────────────────
# .dockerignore controls what lands here (no .env, no node_modules, …)
COPY --chown=zentra:zentra . .

# ── Runtime writable directories ──────────────────────────────────────────
# Created as root then chowned so the unprivileged user can write to them.
RUN mkdir -p /app/media /app/staticfiles /app/celerybeat \
    && chown -R zentra:zentra /app/media /app/staticfiles /app/celerybeat

# ── Environment variables ──────────────────────────────────────────────────
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    DJANGO_SETTINGS_MODULE=zentra.settings.prod \
    WEB_CONCURRENCY=2 \
    GUNICORN_TIMEOUT=120 \
    APP_PORT=${APP_PORT}

USER zentra

EXPOSE ${APP_PORT}

# ── Health check ───────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:${APP_PORT}/api/v1/health/ | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status') == 'ok' else 1)"

# ── Entrypoint ─────────────────────────────────────────────────────────────
# tini as PID 1 forwards SIGTERM for graceful Gunicorn shutdown and reaps
# any zombie processes spawned by Celery sub-processes.
ENTRYPOINT ["/usr/bin/tini", "--"]

# ── Default command ────────────────────────────────────────────────────────
# docker-compose.yml overrides this for: migrate, runserver, celery worker/beat.
CMD ["sh", "-c", \
     "gunicorn zentra.wsgi:application \
      --bind 0.0.0.0:${APP_PORT} \
      --workers ${WEB_CONCURRENCY} \
      --timeout ${GUNICORN_TIMEOUT} \
      --worker-class sync \
      --worker-tmp-dir /dev/shm \
      --log-level info \
      --access-logfile - \
      --error-logfile - \
      --forwarded-allow-ips='*'"]
