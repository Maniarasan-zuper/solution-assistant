# Workflow Markup API (MySQL) — Subflows + Download

## Fresh setup
```bash
mysql -u root -p < api/schema.sql
cd api
cp .env.example .env   # set DB creds
npm install
npm run dev            # http://localhost:3000
```

## Existing DB migration
```bash
mysql -u root -p < api/migration_add_parentFlow.sql
```

## New endpoints
- POST `/api/flows/:flowId/subflows` → add child flow under a flow
- GET  `/api/customers/:id/markup.html` → download Markmap HTML
