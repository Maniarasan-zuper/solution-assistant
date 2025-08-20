// server.js — Express API + static UI, with customer search (?q=) + subflows + HTML download
import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// Simple logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// CSP to allow Markmap assets from jsdelivr
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.jsdelivr.net/npm; connect-src 'self' http://localhost:3000"
  );
  next();
});

app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get("/health", (_req, res) => res.json({ ok: true }));

// DB helpers
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
async function execute(sql, params = []) {
  const [res] = await pool.execute(sql, params);
  return res;
}

// LIKE-escape helper using ESCAPE '!'
function escapeLike(s = "") {
  return String(s).replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_");
}

// ---------- Customers (SEARCH-ENABLED) ----------
app.get("/api/customers", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const rows = await query(
      "SELECT id, name, notes FROM Customer WHERE name LIKE ? ESCAPE '!' ORDER BY name LIMIT 50",
      [like]
    );
    return res.json(rows);
  }
  // default: top 50 (or return [] if you prefer pure search-only)
  const rows = await query(
    "SELECT id, name, notes FROM Customer ORDER BY name LIMIT 50"
  );
  res.json(rows);
});

app.get("/api/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [customer] = await query(
    "SELECT id, name, notes FROM Customer WHERE id=?",
    [id]
  );
  if (!customer) return res.status(404).json({ error: "Not found" });

  const events = await query(
    "SELECT id, name FROM Event WHERE customerId=? ORDER BY name",
    [id]
  );
  const eventIds = events.map((e) => e.id);
  let flows = [];
  if (eventIds.length) {
    const placeholders = eventIds.map(() => "?").join(",");
    flows = await query(
      `SELECT id, eventId, parentFlowId, name, description, link
       FROM Flow WHERE eventId IN (${placeholders}) ORDER BY name`,
      eventIds
    );
  }
  res.json({ customer, events, flows });
});

app.post("/api/customers", async (req, res) => {
  const { name, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const r = await execute("INSERT INTO Customer(name, notes) VALUES(?, ?)", [
      name,
      notes || null,
    ]);
    res.status(201).json({ id: r.insertId, name, notes: notes || null });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Customer name must be unique" });
    console.error(e);
    res.status(500).json({ error: "Insert failed", detail: e.message });
  }
});

app.put("/api/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, notes } = req.body || {};
  await execute("UPDATE Customer SET name=?, notes=? WHERE id=?", [
    name,
    notes || null,
    id,
  ]);
  res.json({ id, name, notes: notes || null });
});

app.delete("/api/customers/:id", async (req, res) => {
  await execute("DELETE FROM Customer WHERE id=?", [Number(req.params.id)]);
  res.status(204).end();
});

// ---------- Events ----------
app.get("/api/customers/:id/events", async (req, res) => {
  res.json(
    await query("SELECT id, name FROM Event WHERE customerId=? ORDER BY name", [
      Number(req.params.id),
    ])
  );
});

app.post("/api/customers/:id/events", async (req, res) => {
  const customerId = Number(req.params.id);
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const r = await execute("INSERT INTO Event(customerId, name) VALUES(?, ?)", [
    customerId,
    name,
  ]);
  res.status(201).json({ id: r.insertId, customerId, name });
});

app.put("/api/events/:eventId", async (req, res) => {
  await execute("UPDATE Event SET name=? WHERE id=?", [
    req.body?.name,
    Number(req.params.eventId),
  ]);
  res.json({ id: Number(req.params.eventId), name: req.body?.name });
});

app.delete("/api/events/:eventId", async (req, res) => {
  await execute("DELETE FROM Event WHERE id=?", [Number(req.params.eventId)]);
  res.status(204).end();
});

// ---------- Flows (with subflows) ----------
app.get("/api/events/:eventId/flows", async (req, res) => {
  res.json(
    await query(
      "SELECT id, parentFlowId, name, description, link FROM Flow WHERE eventId=? ORDER BY name",
      [Number(req.params.eventId)]
    )
  );
});

app.post("/api/events/:eventId/flows", async (req, res) => {
  const eventId = Number(req.params.eventId);
  const { name, description, link } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const r = await execute(
    "INSERT INTO Flow(eventId, parentFlowId, name, description, link) VALUES(?, NULL, ?, ?, ?)",
    [eventId, name, description || null, link || null]
  );
  res.status(201).json({
    id: r.insertId,
    eventId,
    parentFlowId: null,
    name,
    description: description || null,
    link: link || null,
  });
});

app.post("/api/flows/:flowId/subflows", async (req, res) => {
  const parentId = Number(req.params.flowId);
  const { name, description, link } = req.body || {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const [parent] = await query("SELECT id, eventId FROM Flow WHERE id=?", [
    parentId,
  ]);
  if (!parent) return res.status(404).json({ error: "Parent flow not found" });
  const r = await execute(
    "INSERT INTO Flow(eventId, parentFlowId, name, description, link) VALUES(?, ?, ?, ?, ?)",
    [parent.eventId, parentId, name, description || null, link || null]
  );
  res.status(201).json({
    id: r.insertId,
    eventId: parent.eventId,
    parentFlowId: parentId,
    name,
    description: description || null,
    link: link || null,
  });
});

app.put("/api/flows/:flowId", async (req, res) => {
  const flowId = Number(req.params.flowId);
  const { name, description, link } = req.body || {};
  await execute("UPDATE Flow SET name=?, description=?, link=? WHERE id=?", [
    name,
    description || null,
    link || null,
    flowId,
  ]);
  res.json({
    id: flowId,
    name,
    description: description || null,
    link: link || null,
  });
});

app.delete("/api/flows/:flowId", async (req, res) => {
  await execute("DELETE FROM Flow WHERE id=?", [Number(req.params.flowId)]);
  res.status(204).end();
});

// ---------- Markmap (recursive) ----------
function escapeHtml(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}
function safeLink(href) {
  const s = (href ?? "").toString().trim();
  if (!/^https?:\/\/\S+$/i.test(s)) return null;
  return s.replace(/"/g, "&quot;");
}

async function buildMarkmapData(customerId) {
  const [customer] = await query("SELECT name FROM Customer WHERE id=?", [
    customerId,
  ]);
  if (!customer) return null;
  const events = await query(
    "SELECT id, name FROM Event WHERE customerId=? ORDER BY name",
    [customerId]
  );
  const eventIds = events.map((e) => e.id);
  let flows = [];
  if (eventIds.length) {
    const placeholders = eventIds.map(() => "?").join(",");
    flows = await query(
      `SELECT id, eventId, parentFlowId, name, description, link
       FROM Flow WHERE eventId IN (${placeholders}) ORDER BY name`,
      eventIds
    );
  }
  const childrenByParent = new Map();
  for (const f of flows) {
    const key = f.parentFlowId ?? `event:${f.eventId}`;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(f);
  }
  const mkNode = (flow) => {
    const name = escapeHtml(flow.name ?? "");
    const href = safeLink(flow.link);
    const linkText = escapeHtml(flow.link ?? "");
    const content = href
      ? `${name}: <a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a>`
      : name;
    const kids = (childrenByParent.get(flow.id) || []).map(mkNode);
    return {
      content,
      payload: { description: flow.description || "" },
      children: kids,
    };
  };
  return {
    content: escapeHtml(customer.name),
    children: events.map((e) => ({
      content: escapeHtml(e.name),
      children: (childrenByParent.get(`event:${e.id}`) || []).map(mkNode),
    })),
  };
}

// List standard events (for Add Event dropdown)
app.get("/api/standard-events", async (_req, res) => {
  const rows = await query("SELECT id, name FROM StandardEvent ORDER BY name");
  res.json(rows);
});

app.get("/api/customers/:id/markup", async (req, res) => {
  const id = Number(req.params.id);
  const markmap = await buildMarkmapData(id);
  if (!markmap) return res.status(404).json({ error: "Not found" });
  res.json(markmap);
});

// Downloadable standalone HTML (Markmap)
app.get("/api/customers/:id/markup.html", async (req, res) => {
  const id = Number(req.params.id);
  const data = await buildMarkmapData(id);
  if (!data) return res.status(404).send("Not found");
  const fileName = `customer-${id}-workflow.html`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Customer ${id} – Workflow</title>
<style>body{font-family:system-ui,Arial,sans-serif;margin:0;padding:16px;background:#fff}h1{margin:0 0 12px}#mm{width:100%;height:80vh;border:1px solid #eee;border-radius:8px}</style>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js"></script></head>
<body><h1>Customer ${id} – Workflow</h1><svg id="mm"></svg>
<script>window.addEventListener('load',()=>{const data=${JSON.stringify(
    data
  ).replace(
    /</g,
    "\\u003c"
  )}; window.markmap.Markmap.create(document.getElementById('mm'),null,data);});</script>
</body></html>`;
  res.send(html);
});

// ---------- Static UI ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiPath = path.resolve(__dirname, "../ui");
app.use(express.static(uiPath));
app.get("/", (_req, res) => res.sendFile(path.join(uiPath, "index.html")));

// Unknown API
app.use("/api", (req, res) =>
  res.status(404).json({
    error: "No such API route",
    method: req.method,
    path: req.originalUrl,
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
