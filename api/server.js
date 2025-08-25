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

app.get("/api/customers/:id/document.html", async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send("Invalid customer id");

    const graph = await fetchCustomerGraph(pool, id);
    if (!graph) return res.status(404).send("Customer not found");

    const html = buildCustomerDocumentHtml(graph);
    const fname = `${slugify(graph.customer.name)}-workflows.html`;
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("document.html error", err);
    return res.status(500).send("Failed to generate document");
  }
});

async function fetchGraph(customerId) {
  const [[customer]] = await pool.query(
    "SELECT id, name, notes FROM Customer WHERE id = ?",
    [customerId]
  );
  if (!customer) return null;

  const [events] = await pool.query(
    "SELECT id, name FROM Event WHERE customerId = ? ORDER BY name",
    [customerId]
  );

  const eventIds = events.map((e) => e.id);
  let flows = [];
  if (eventIds.length) {
    const [rows] = await pool.query(
      "SELECT id, eventId, parentFlowId, name, description, link FROM Flow WHERE eventId IN (?) ORDER BY id",
      [eventIds]
    );
    flows = rows;
  }
  return { customer, events, flows };
}

const U =
  globalThis.__U ||
  (globalThis.__U = {
    likeEscape: (s = "") => String(s).replace(/[\\%_]/g, (c) => "\\" + c),
    esc: (s = "") =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    slug: (s = "") =>
      String(s)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "document",
    nl2p: (s = "") =>
      s.trim()
        ? s
            .trim()
            .split(/\n{2,}/)
            .map((p) => `<p>${U.esc(p).replace(/\n/g, "<br/>")}</p>`)
            .join("\n")
        : "",
  });

app.get("/api/customers/:id/document.pdf", async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!id) return res.status(400).send("Invalid customer id");

  try {
    // Lazy-load puppeteer so server can run without it until this endpoint is used
    const { default: puppeteer } = await import("puppeteer");

    const graph = await fetchGraph(id);
    if (!graph) return res.status(404).send("Customer not found");

    const html = buildCustomerDocumentHtml(graph); // reuse your HTML generator
    const fname = `${U.slug(graph.customer.name)}-workflows.pdf`;

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // helpful on many Linux hosts
    });
    const page = await browser.newPage();

    // Prefer screen CSS; wait for any fonts etc. (there are none external, but safe)
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    return res.send(pdf);
  } catch (err) {
    // Friendly errors for missing puppeteer or chromium issues
    const msg = (err && String(err)) || "PDF error";
    console.error("document.pdf error", err);
    if (msg.includes("Cannot find module") || msg.includes("dynamic import")) {
      return res
        .status(501)
        .send(
          'PDF generation is not available. Install "puppeteer" on the server.'
        );
    }
    return res.status(500).send("Failed to generate PDF");
  }
});

function slugify(s = "") {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "document"
  );
}
function nl2p(s = "") {
  const t = String(s).trim();
  if (!t) return "";
  // simple paragraphs (double newline) + line breaks
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

async function fetchCustomerGraph(pool, customerId) {
  const [[customer]] = await pool.query(
    "SELECT id, name, notes FROM Customer WHERE id = ?",
    [customerId]
  );
  if (!customer) return null;

  const [events] = await pool.query(
    "SELECT id, name FROM Event WHERE customerId = ? ORDER BY name",
    [customerId]
  );

  const eventIds = events.map((e) => e.id);
  let flows = [];
  if (eventIds.length) {
    const [rows] = await pool.query(
      "SELECT id, eventId, parentFlowId, name, description, link FROM Flow WHERE eventId IN (?) ORDER BY id",
      [eventIds]
    );
    flows = rows;
  }
  return { customer, events, flows };
}

function buildFlowTree(flows) {
  const byParent = new Map();
  flows.forEach((f) => {
    const key = f.parentFlowId || 0;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(f);
  });
  const top = byParent.get(0) || [];
  const children = (id) => byParent.get(id) || [];
  return { top, children };
}

function renderFlowTreeHtml(tree) {
  const { top, children } = tree;

  function renderNode(f) {
    const hasChildren = children(f.id).length > 0;
    const title = escapeHtml(f.name || "");
    const desc = nl2p(f.description || "");
    const link = f.link
      ? `<div class="flow-link"><a href="${escapeHtml(
          f.link
        )}" target="_blank" rel="noopener">Link</a></div>`
      : "";

    const body = `
      <div class="flow-item">
        <div class="flow-title">${title}</div>
        ${desc ? `<div class="flow-desc">${desc}</div>` : ""}
        ${link}
      </div>
    `;

    if (!hasChildren) return `<li>${body}</li>`;
    return `
      <li>
        ${body}
        <ul>
          ${children(f.id).map(renderNode).join("\n")}
        </ul>
      </li>
    `;
  }

  if (!top.length)
    return '<p class="muted">No flows documented for this event.</p>';

  return `<ul class="flow-list">
    ${top.map(renderNode).join("\n")}
  </ul>`;
}

function buildCustomerDocumentHtml(graph) {
  const { customer, events, flows } = graph;

  const sections = events
    .map((ev) => {
      const evFlows = flows.filter((f) => f.eventId === ev.id);
      const tree = buildFlowTree(evFlows);
      const listHtml = renderFlowTreeHtml(tree);
      return `
      <section class="event">
        <h2>${escapeHtml(ev.name)}</h2>
        ${listHtml}
      </section>
    `;
    })
    .join("\n");

  const notesBlock = customer.notes
    ? `<section><h3>Notes</h3>${nl2p(customer.notes)}</section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(customer.name)} — Workflow Document</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
 <style>
  :root{--ink:#222;--muted:#666;--border:#e7e9f2;--bg:#fff;--accent:#2f6cea;}
  /* Universal safety for overflow */
  *,*::before,*::after{ box-sizing:border-box; }
  html,body{ max-width:100%; }
  body{
    font-family:system-ui,Arial,sans-serif;
    background:#fafbff; color:var(--ink); margin:0; padding:24px;
    overflow-wrap:anywhere;          /* allow breaks everywhere */
    word-break:break-word;           /* fallback for older engines */
  }

  .doc{
    width:min(100%, 960px);
    margin:0 auto; background:var(--bg);
    border:1px solid var(--border); border-radius:12px;
    box-shadow:0 4px 22px rgba(0,0,0,.06); padding:24px;
    overflow-wrap:anywhere; word-break:break-word;
  }

  header h1{ margin:0 0 4px 0; font-size:24px; }
  header .muted{ color:var(--muted); }

  h2{ margin:24px 0 8px 0; border-bottom:1px solid var(--border); padding-bottom:6px; }
  h3{ margin:16px 0 8px 0; }

  /* TOC & common text should wrap safely */
  .toc{ border:1px dashed var(--border); padding:12px; border-radius:10px; background:#fff; }
  .toc, .toc a, .doc, .flow-list, .flow-item, .flow-title, .flow-desc, .flow-link, .flow-link a, li {
    overflow-wrap:anywhere; word-break:break-word;
  }
  /* URLs sometimes need more aggressive breaking */
  .flow-link a{ color:var(--accent); text-decoration:none; word-break:break-all; }
  .flow-link a:hover{ text-decoration:underline; }

  .flow-list{ list-style:none; padding-left:0; }
  .flow-list>li{
    border-left:3px solid #dde6ff; background:#f6f8ff;
    margin:8px 0; padding:8px 8px 8px 12px; border-radius:8px;
  }
  .flow-list li ul{ list-style:none; padding-left:16px; margin-top:6px; }

  .flow-item{ display:grid; gap:6px; }
  .flow-title{ font-weight:600; }
  .flow-desc p{ margin:0 0 6px 0; line-height:1.45; }

  /* Optional watermark support (left as-is; your function injects when provided) */
  /* body::before{ ... } */

  /* Images inside descriptions, if any, should never overflow */
  img{ max-width:100%; height:auto; }
</style>

</head>
<body>
  <div class="doc">
    <header>
      <h1>${escapeHtml(customer.name)} — Workflow Document</h1>
      <div class="muted">Generated on ${new Date().toLocaleString()}</div>
    </header>

    ${notesBlock}

    <section class="toc">
      <strong>Contents</strong>
      <ul>
        ${events
          .map(
            (e) => `<li><a href="#event-${e.id}">${escapeHtml(e.name)}</a></li>`
          )
          .join("\n")}
      </ul>
    </section>

    ${events
      .map(
        (e) => `
      <section class="event" id="event-${e.id}">
        <h2>${escapeHtml(e.name)}</h2>
        ${renderFlowTreeHtml(
          buildFlowTree(flows.filter((f) => f.eventId === e.id))
        )}
      </section>
    `
      )
      .join("\n")}
  </div>
</body>
</html>`;
}

function buildCustomerDocumentMarkdown(graph) {
  const { customer, events, flows } = graph;
  function mdesc(s) {
    return (s || "").trim()
      ? "\n\n" + s.trim().replace(/\n{2,}/g, "\n\n") + "\n"
      : "\n";
  }
  function renderFlowMd(tree, level = 0) {
    const { top, children } = tree;
    if (!top.length) return "_No flows documented for this event._\n";
    function row(f, depth) {
      const bullets = "  ".repeat(depth) + "- ";
      const link = f.link ? ` [link](${f.link})` : "";
      const desc = (f.description || "").trim()
        ? `\n${"  ".repeat(depth + 1)}${f.description
            .trim()
            .split("\n")
            .map((l) => "  ".repeat(depth + 1) + l)
            .join("\n")}`
        : "";
      const kids = children(f.id)
        .map((ch) => row(ch, depth + 1))
        .join("");
      return `${bullets}**${f.name}**${link}${desc}\n${kids}`;
    }
    return top.map((f) => row(f, level)).join("");
  }
  let md = `# ${customer.name} — Workflow Document\n\n`;
  if (customer.notes) md += `## Notes\n${mdesc(customer.notes)}`;
  if (events.length) {
    md += `## Contents\n`;
    events.forEach((e) => {
      md += `- [${e.name}](#${slugify(e.name)})\n`;
    });
    md += `\n`;
  }
  events.forEach((e) => {
    const evFlows = flows.filter((f) => f.eventId === e.id);
    const tree = buildFlowTree(evFlows);
    md += `## ${e.name}\n\n`;
    md += renderFlowMd(tree);
    md += `\n`;
  });
  return md;
}

app.get("/api/customers/:id/document.md", async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).send("Invalid customer id");

    const graph = await fetchCustomerGraph(pool, id);
    if (!graph) return res.status(404).send("Customer not found");

    const md = buildCustomerDocumentMarkdown(graph);
    const fname = `${slugify(graph.customer.name)}-workflows.md`;
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    return res.send(md);
  } catch (err) {
    console.error("document.md error", err);
    return res.status(500).send("Failed to generate markdown document");
  }
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
