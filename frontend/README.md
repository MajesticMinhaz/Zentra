# Zentra Frontend

React + Vite SPA for the Zentra finance platform.

## Development (with hot reload)
```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:3000
# API is proxied to http://localhost:8000
```

## Production Build (embedded in Docker)
The Dockerfile automatically builds the frontend and embeds it in the Django static files.
The built output goes to `static/frontend/` which Django serves as the SPA entry point.

## Manual build
```bash
npm run build
# Then: python manage.py collectstatic
```
