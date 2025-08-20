// UI with color-coded flows, robust "Add Flow", subflows, and Markmap reset view

// Auto-detect API base
let API = ""; // same-origin default
try {
  const servedByApi = location.port === "3000";
  if (!servedByApi) API = "http://localhost:3000/api";
} catch {}

async function api(path, opts = {}) {
  const base = API || "/api";
  const res = await fetch(base + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let t = "";
    try {
      t = await res.text();
    } catch {}
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${path}: ${t}`);
  }
  return res.status === 204 ? null : res.json();
}

function normalizeTree(node) {
  if (!node || typeof node !== "object") return node;
  if (!Array.isArray(node.children)) node.children = [];
  node.children = node.children.map(normalizeTree);
  return node;
}

// ---- Color helpers ----
const COLORS = [
  "#5B8FF9",
  "#61DDAA",
  "#65789B",
  "#F6BD16",
  "#7262FD",
  "#78D3F8",
  "#9661BC",
  "#F6903D",
  "#E86452",
  "#6DC8EC",
];
function hexToRgba(hex, alpha = 0.08) {
  const h = hex.replace("#", "");
  const bigint = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  const r = (bigint >> 16) & 255,
    g = (bigint >> 8) & 255,
    b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Elements
const customerList = document.getElementById("customerList");
const newCustomerName = document.getElementById("newCustomerName");
const newCustomerNotes = document.getElementById("newCustomerNotes");
const btnAddCustomer = document.getElementById("btnAddCustomer");

const detailCard = document.getElementById("detailCard");
const custName = document.getElementById("custName");
const custEditName = document.getElementById("custEditName");
const custEditNotes = document.getElementById("custEditNotes");
const btnSaveCustomer = document.getElementById("btnSaveCustomer");
const btnDeleteCustomer = document.getElementById("btnDeleteCustomer");

const eventSelect = document.getElementById("eventSelect");
const newEventName = document.getElementById("newEventName");
const btnAddEvent = document.getElementById("btnAddEvent");
const eventList = document.getElementById("eventList");

const flowsBox = document.getElementById("flowsBox");
const flowName = document.getElementById("flowName");
const flowLink = document.getElementById("flowLink");
const flowDesc = document.getElementById("flowDesc");
const btnAddFlow = document.getElementById("btnAddFlow");

const btnDownloadMap = document.getElementById("btnDownloadMap"); // may or may not exist
const svg = document.getElementById("mindmap");

let selectedCustomerId = null;
let currentData = null;
let mm = null; // Markmap instance

// ----- Helpers for Add Flow -----
function getSelectedEventId() {
  const v = Number(eventSelect.value || 0);
  return Number.isFinite(v) ? v : 0;
}
function setAddFlowDisabled() {
  if (btnAddFlow) btnAddFlow.disabled = !getSelectedEventId();
}

// Add a Reset View button next to Download (or create a toolbar if missing)
(function ensureResetButton() {
  const btn = document.createElement("button");
  btn.id = "btnResetView";
  btn.textContent = "Reset View";
  btn.title = "Recenter & fit the Markmap";
  btn.onclick = () => {
    if (mm && typeof mm.fit === "function") mm.fit();
    else renderMarkmap(); // fallback
  };
  if (btnDownloadMap && btnDownloadMap.parentElement) {
    btnDownloadMap.parentElement.appendChild(btn);
  } else {
    const card = document.querySelector(".right .card");
    const bar = document.createElement("div");
    bar.className = "map-toolbar";
    bar.appendChild(btn);
    card.insertBefore(bar, svg);
  }
})();

// Double-click on the canvas resets view
svg.addEventListener("dblclick", () => {
  if (mm && typeof mm.fit === "function") mm.fit();
});

// Customers
async function refreshCustomers() {
  const customers = await api("/customers");
  customerList.innerHTML = "";
  customers.forEach((c) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = c.name;
    a.onclick = () => selectCustomer(c.id);
    const meta = document.createElement("span");
    meta.className = "badge";
    meta.textContent = "ID " + c.id;
    li.appendChild(a);
    li.appendChild(meta);
    customerList.appendChild(li);
  });
}

btnAddCustomer.onclick = async () => {
  if (!newCustomerName.value.trim()) {
    alert("Enter a customer name");
    return;
  }
  const c = await api("/customers", {
    method: "POST",
    body: {
      name: newCustomerName.value.trim(),
      notes: newCustomerNotes.value.trim() || null,
    },
  });
  newCustomerName.value = "";
  newCustomerNotes.value = "";
  await refreshCustomers();
  await selectCustomer(c.id);
};

async function selectCustomer(id) {
  selectedCustomerId = id;
  currentData = await api(`/customers/${id}`);
  detailCard.style.display = "block";
  custName.textContent = currentData.customer.name;
  custEditName.value = currentData.customer.name || "";
  custEditNotes.value = currentData.customer.notes || "";

  renderEvents();
  await renderMarkmap();
}

btnSaveCustomer.onclick = async () => {
  if (selectedCustomerId == null) return;
  await api(`/customers/${selectedCustomerId}`, {
    method: "PUT",
    body: { name: custEditName.value, notes: custEditNotes.value },
  });
  await selectCustomer(selectedCustomerId);
  await refreshCustomers();
};

btnDeleteCustomer.onclick = async () => {
  if (selectedCustomerId == null) return;
  if (!confirm("Delete this customer and all its events/flows?")) return;
  await api(`/customers/${selectedCustomerId}`, { method: "DELETE" });
  selectedCustomerId = null;
  detailCard.style.display = "none";
  await refreshCustomers();
};

// Events
function renderEvents() {
  // Dropdown
  eventSelect.innerHTML = "";
  currentData.events.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.name;
    eventSelect.appendChild(opt);
  });
  // Auto-select first event if none selected
  if (!eventSelect.value && currentData.events[0]) {
    eventSelect.value = currentData.events[0].id;
  }
  setAddFlowDisabled();

  // List
  eventList.innerHTML = "";
  currentData.events.forEach((e) => {
    const li = document.createElement("li");
    li.innerHTML = `${e.name} <span class="badge">#${e.id}</span>`;
    const right = document.createElement("div");
    const btnEdit = document.createElement("button");
    btnEdit.textContent = "Rename";
    btnEdit.onclick = async () => {
      const name = prompt("New name", e.name);
      if (name && name.trim()) {
        await api("/events/" + e.id, {
          method: "PUT",
          body: { name: name.trim() },
        });
        await selectCustomer(selectedCustomerId);
      }
    };
    const btnDel = document.createElement("button");
    btnDel.textContent = "Delete";
    btnDel.className = "danger";
    btnDel.onclick = async () => {
      if (!confirm("Delete this event and its flows?")) return;
      await api("/events/" + e.id, { method: "DELETE" });
      await selectCustomer(selectedCustomerId);
    };
    right.appendChild(btnEdit);
    right.appendChild(btnDel);
    li.appendChild(right);
    eventList.appendChild(li);
  });
  renderFlows();
}
btnAddEvent.onclick = async () => {
  if (selectedCustomerId == null) return;
  if (!newEventName.value.trim()) {
    alert("Enter an event name");
    return;
  }
  await api(`/customers/${selectedCustomerId}/events`, {
    method: "POST",
    body: { name: newEventName.value.trim() },
  });
  newEventName.value = "";
  await selectCustomer(selectedCustomerId);
};
eventSelect.onchange = () => {
  renderFlows();
  setAddFlowDisabled();
};

// Flows (nested, color-coded)
function renderFlows() {
  flowsBox.innerHTML = "";
  const selectedEventId = getSelectedEventId();
  if (!selectedEventId) {
    const p = document.createElement("p");
    p.textContent = "Add or select an event to manage flows.";
    p.style.color = "#666";
    flowsBox.appendChild(p);
    return;
  }

  const flows = currentData.flows.filter((f) => f.eventId === selectedEventId);
  const childrenByParent = new Map();
  for (const f of flows) {
    const key = f.parentFlowId || 0;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(f);
  }
  const top = childrenByParent.get(0) || [];
  // Assign a distinct color to each top-level flow
  const colorByTopId = new Map();
  top.forEach((f, i) => colorByTopId.set(f.id, COLORS[i % COLORS.length]));

  function renderRow(f, level = 0, inheritColor) {
    const color = inheritColor || colorByTopId.get(f.id) || COLORS[0];

    const row = document.createElement("div");
    row.className = "flow";
    row.style.marginLeft = level * 16 + "px";
    row.style.borderLeftColor = color;
    row.style.background = hexToRgba(color, 0.06);

    row.innerHTML = `
      <input value="${f.name}" data-field="name"/>
      <input value="${f.link || ""}" data-field="link"/>
      <textarea data-field="description">${f.description || ""}</textarea>
      <div>
        <button data-action="save">Save</button>
        <button data-action="addsub">Add Subflow</button>
        <button data-action="delete" class="danger">Delete</button>
      </div>
    `;

    row.querySelector('[data-action="save"]').onclick = async () => {
      const name = row.querySelector('[data-field="name"]').value.trim();
      const link = row.querySelector('[data-field="link"]').value.trim();
      const description = row
        .querySelector('[data-field="description"]')
        .value.trim();
      await api("/flows/" + f.id, {
        method: "PUT",
        body: { name, link: link || null, description: description || null },
      });
      await selectCustomer(selectedCustomerId);
      await renderMarkmap();
    };
    row.querySelector('[data-action="addsub"]').onclick = async () => {
      const name = prompt("Subflow name");
      if (!name || !name.trim()) return;
      const link = prompt("Link (optional)") || "";
      const description = prompt("Description (optional)") || "";
      await api("/flows/" + f.id + "/subflows", {
        method: "POST",
        body: {
          name: name.trim(),
          link: link.trim() || null,
          description: description.trim() || null,
        },
      });
      await selectCustomer(selectedCustomerId);
      await renderMarkmap();
    };
    row.querySelector('[data-action="delete"]').onclick = async () => {
      if (!confirm("Delete this flow and all its subflows?")) return;
      await api("/flows/" + f.id, { method: "DELETE" });
      await selectCustomer(selectedCustomerId);
      await renderMarkmap();
    };
    flowsBox.appendChild(row);

    (childrenByParent.get(f.id) || []).forEach((child) =>
      renderRow(child, level + 1, color)
    );
  }

  top.forEach((f) => renderRow(f, 0, colorByTopId.get(f.id)));
}

// Add Flow (top-level under selected event) — hardened
btnAddFlow.onclick = async () => {
  const eventId = getSelectedEventId();
  if (!eventId) {
    alert("Please create/select an event first.");
    return;
  }

  const name = (flowName.value || "").trim();
  if (!name) {
    alert("Enter a flow name");
    flowName.focus();
    return;
  }

  const link = (flowLink.value || "").trim() || null;
  const description = (flowDesc.value || "").trim() || null;

  try {
    await api(`/events/${eventId}/flows`, {
      method: "POST",
      body: { name, link, description },
    });
  } catch (e) {
    console.error("Add flow failed:", e);
    alert(
      "Add flow failed. Details:\n" +
        e.message +
        "\n\nIf it shows 404, ensure your server exposes POST /api/events/:eventId/flows and you are opening http://localhost:3000 (same origin)."
    );
    return;
  }

  // Clear and refresh
  flowName.value = "";
  flowLink.value = "";
  flowDesc.value = "";
  await selectCustomer(selectedCustomerId);
  await renderMarkmap();
};

// Download HTML (if button exists in your HTML)
if (btnDownloadMap) {
  btnDownloadMap.onclick = () => {
    if (!selectedCustomerId) {
      alert("Select a customer first");
      return;
    }
    const base = API ? API.replace(/\/api$/, "") : "";
    const url = `${base}/api/customers/${selectedCustomerId}/markup.html`;
    window.open(url, "_blank");
  };
}

// Markmap: colorize the tree by top-level flow (adds a small chip before labels)
function colorizeMarkmapData(data) {
  if (!data?.children) return data;
  data.children.forEach((eventNode) => {
    const topFlows = eventNode.children || [];
    topFlows.forEach((flowNode, i) => {
      const color = COLORS[i % COLORS.length];
      applyChip(flowNode, color);
    });
  });
  return data;

  function applyChip(node, color) {
    const chip = `<span class="mm-chip" style="background:${color}"></span>`;
    if (typeof node.content === "string" && !node.content.includes("mm-chip")) {
      node.content = chip + node.content;
    }
    if (Array.isArray(node.children))
      node.children.forEach((ch) => applyChip(ch, color));
  }
}

async function renderMarkmap() {
  if (!selectedCustomerId) return;
  let data = await api(`/customers/${selectedCustomerId}/markup`);
  data = normalizeTree(data);
  data = colorizeMarkmapData(data);

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  try {
    // Keep a global instance to call fit()
    mm = window.markmap.Markmap.create(svg, null, data);
  } catch (err) {
    console.error("Markmap render error:", err, data);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "12");
    t.setAttribute("y", "24");
    t.textContent = "Failed to render map. Check console for details.";
    svg.appendChild(t);
  }
}

// Init
refreshCustomers();
