# Workflow Markup (Node.js + MySQL) — Subflows + HTML Download

Features:
- Customers → Events → Flows
- **Subflows**: flows can have child flows recursively
- Download standalone **Markup HTML**
- Served same-origin to avoid CORS

## Fresh setup
```bash
mysql -u root -p < api/schema.sql
cd api
cp .env.example .env   # set DB creds
npm install
npm run dev
# open http://localhost:3000
```

## Migrate an existing DB
```bash
mysql -u root -p < api/migration_add_parentFlow.sql
```

## Add subflow
- In the UI, click **Add Subflow** on any flow row.
- API: POST /api/flows/:flowId/subflows { name, description?, link? }
