// UI: Add Customer & Add Event moved to modals; everything else inline as before.

// Auto-detect API base
let API = ""; // same-origin default
try {
  if (location.port !== "3000") API = "http://localhost:3000/api";
} catch {}

// HTTP helper
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

// Helpers
function debounce(fn, wait = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}
function normalizeTree(node) {
  if (!node || typeof node !== "object") return node;
  if (!Array.isArray(node.children)) node.children = [];
  node.children = node.children.map(normalizeTree);
  return node;
}
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
function hexToRgba(hex, a = 0.06) {
  const h = hex.replace("#", "");
  const v = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16
  );
  const r = (v >> 16) & 255,
    g = (v >> 8) & 255,
    b = v & 255;
  return `rgba(${r},${g},${b},${a})`;
}
function escAttr(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

// Elements
const customerSearch = document.getElementById("customerSearch");
const btnClearSearch = document.getElementById("btnClearSearch");
const customerResults = document.getElementById("customerResults");
const searchHint = document.getElementById("searchHint");

const detailCard = document.getElementById("detailCard");
const custName = document.getElementById("custName");
const custEditName = document.getElementById("custEditName");
const custEditNotes = document.getElementById("custEditNotes");
const btnSaveCustomer = document.getElementById("btnSaveCustomer");
const btnDeleteCustomer = document.getElementById("btnDeleteCustomer");

const eventSelect = document.getElementById("eventSelect");
const eventList = document.getElementById("eventList");

const flowsBox = document.getElementById("flowsBox");
const flowName = document.getElementById("flowName");
const flowLink = document.getElementById("flowLink");
const flowDesc = document.getElementById("flowDesc");
const btnAddFlow = document.getElementById("btnAddFlow");

const btnAddCustomerTop = document.getElementById("btnAddCustomerTop");
const btnAddEventTop = document.getElementById("btnAddEventTop");
const btnDownloadMap = document.getElementById("btnDownloadMap");
const btnResetView = document.getElementById("btnResetView");

const svg = document.getElementById("mindmap");
const previewTitle = document.getElementById("previewTitle");

const modalBackdrop = document.getElementById("modalBackdrop");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

// State
let selectedCustomerId = null;
let currentData = null; // {customer, events, flows}
let mm = null;

// ---- Modal utils (used only for Add Customer / Add Event) ----
function openModal(title, bodyEl) {
  modalTitle.textContent = title;
  modalBody.innerHTML = "";
  if (bodyEl) modalBody.appendChild(bodyEl);
  modalBackdrop.classList.add("show");
  modal.classList.add("show");
  modalBackdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
}
function closeModal() {
  modalBackdrop.classList.remove("show");
  modal.classList.remove("show");
  setTimeout(() => {
    modalBackdrop.classList.add("hidden");
    modal.classList.add("hidden");
  }, 150);
}
modalClose.onclick = closeModal;
modalBackdrop.onclick = (e) => {
  if (e.target === modalBackdrop) closeModal();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
});

// ---- Search-first UX (list stays inline) ----
async function searchCustomers(term) {
  const q = (term || "").trim();
  if (!q) {
    customerResults.innerHTML = "";
    searchHint.style.display = "block";
    return;
  }
  searchHint.style.display = "none";
  let rs = [];
  try {
    rs = await api(`/customers?q=${encodeURIComponent(q)}`);
  } catch (e) {
    console.error(e);
  }
  customerResults.innerHTML = "";
  if (!rs.length) {
    const li = document.createElement("li");
    li.textContent = "No matches";
    li.className = "muted";
    customerResults.appendChild(li);
    return;
  }
  rs.forEach((c) => {
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "row";
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = c.name;
    a.onclick = () => selectCustomer(c.id);
    left.appendChild(a);
    const right = document.createElement("div");
    right.className = "row";
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "ID " + c.id;
    right.appendChild(badge);
    li.appendChild(left);
    li.appendChild(right);
    customerResults.appendChild(li);
  });
}
const doSearch = debounce(searchCustomers, 250);
customerSearch.addEventListener("input", (e) => doSearch(e.target.value));
customerSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch(customerSearch.value);
});
btnClearSearch.onclick = () => {
  customerSearch.value = "";
  customerResults.innerHTML = "";
  searchHint.style.display = "block";
  customerSearch.focus();
};

// ---- Customer load & edit (inline)
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
  if (customerSearch.value.trim()) doSearch(customerSearch.value);
};
btnDeleteCustomer.onclick = async () => {
  if (selectedCustomerId == null) return;
  if (!confirm("Delete this customer and all its events/flows?")) return;
  await api(`/customers/${selectedCustomerId}`, { method: "DELETE" });
  selectedCustomerId = null;
  detailCard.style.display = "none";
  await renderMarkmap();
  if (customerSearch.value.trim()) doSearch(customerSearch.value);
  else customerResults.innerHTML = "";
};

// ---- Events (inline select/list; Add Event moved to modal)
function renderEvents() {
  // fill dropdown
  eventSelect.innerHTML = "";
  currentData.events.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.name;
    eventSelect.appendChild(opt);
  });
  if (!eventSelect.value && currentData.events[0])
    eventSelect.value = currentData.events[0].id;

  // list with rename/delete
  eventList.innerHTML = "";
  currentData.events.forEach((e) => {
    const li = document.createElement("li");
    li.innerHTML = `${e.name} <span class="badge">#${e.id}</span>`;
    const right = document.createElement("div");
    right.className = "row";
    const btnEdit = document.createElement("button");
    btnEdit.textContent = "Rename";
    btnEdit.className = "secondary";
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
eventSelect.onchange = () => renderFlows();

// ---- Flows (inline)
function renderFlows() {
  flowsBox.innerHTML = "";
  const selectedEventId = Number(
    eventSelect.value || (currentData.events[0]?.id ?? 0)
  );
  if (!selectedEventId) {
    const p = document.createElement("p");
    p.textContent = "Add or select an event to manage flows.";
    p.className = "muted";
    flowsBox.appendChild(p);
    btnAddFlow.onclick = () => alert("Please add/select an event first.");
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
  const colorByTopId = new Map();
  top.forEach((f, i) => colorByTopId.set(f.id, COLORS[i % COLORS.length]));

  function row(f, level = 0, inheritColor) {
    const color = inheritColor || colorByTopId.get(f.id) || COLORS[0];
    const el = document.createElement("div");
    el.className = "flow";
    el.style.marginLeft = level * 16 + "px";
    el.style.borderLeftColor = color;
    el.style.background = hexToRgba(color, 0.06);
    el.innerHTML = `
      <input value="${escAttr(f.name)}" data-field="name"/>
      <input value="${escAttr(f.link || "")}" data-field="link"/>
      <textarea data-field="description">${escAttr(
        f.description || ""
      )}</textarea>
      <div>
        <button data-action="save">Save</button>
        <button data-action="addsub">Add Subflow</button>
        <button data-action="delete" class="danger">Delete</button>
      </div>
    `;
    el.querySelector('[data-action="save"]').onclick = async () => {
      const name = el.querySelector('[data-field="name"]').value.trim();
      const link = el.querySelector('[data-field="link"]').value.trim();
      const description = el
        .querySelector('[data-field="description"]')
        .value.trim();
      await api("/flows/" + f.id, {
        method: "PUT",
        body: { name, link: link || null, description: description || null },
      });
      await selectCustomer(selectedCustomerId);
      await renderMarkmap();
    };
    el.querySelector('[data-action="addsub"]').onclick = async () => {
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
    el.querySelector('[data-action="delete"]').onclick = async () => {
      if (!confirm("Delete this flow and all its subflows?")) return;
      await api("/flows/" + f.id, { method: "DELETE" });
      await selectCustomer(selectedCustomerId);
      await renderMarkmap();
    };
    flowsBox.appendChild(el);
    (childrenByParent.get(f.id) || []).forEach((ch) =>
      row(ch, level + 1, color)
    );
  }
  top.forEach((f) => row(f, 0, colorByTopId.get(f.id)));

  btnAddFlow.onclick = async () => {
    const name = (flowName.value || "").trim();
    if (!name) {
      alert("Enter a flow name");
      flowName.focus();
      return;
    }
    const link = (flowLink.value || "").trim() || null;
    const description = (flowDesc.value || "").trim() || null;
    try {
      await api(`/events/${selectedEventId}/flows`, {
        method: "POST",
        body: { name, link, description },
      });
    } catch (e) {
      alert("Add flow failed.\n" + e.message);
      return;
    }
    flowName.value = "";
    flowLink.value = "";
    flowDesc.value = "";
    await selectCustomer(selectedCustomerId);
    await renderMarkmap();
  };
}

// ---- Markmap preview (unchanged)
function colorizeMarkmapData(data) {
  if (!data?.children) return data;
  data.children.forEach((eventNode) => {
    const topFlows = eventNode.children || [];
    topFlows.forEach((flowNode, i) => {
      const color = COLORS[i % COLORS.length];
      const chip = `<span class="mm-chip" style="background:${color}"></span>`;
      const apply = (n) => {
        if (typeof n.content === "string" && !n.content.includes("mm-chip"))
          n.content = chip + n.content;
        (n.children || []).forEach(apply);
      };
      apply(flowNode);
    });
  });
  return data;
}
async function renderMarkmap() {
  svg.replaceChildren();
  if (!selectedCustomerId) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "16");
    t.setAttribute("y", "28");
    t.textContent = "Select a customer to preview.";
    svg.appendChild(t);
    return;
  }
  let data = await api(`/customers/${selectedCustomerId}/markup`);
  data = colorizeMarkmapData(normalizeTree(data));
  try {
    mm = window.markmap.Markmap.create(svg, null, data);
  } catch (err) {
    console.error("Markmap error", err);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "16");
    t.setAttribute("y", "28");
    t.textContent = "Failed to render map.";
    svg.appendChild(t);
  }
}
btnResetView.onclick = () => {
  if (mm && typeof mm.fit === "function") mm.fit();
};
svg.addEventListener("dblclick", () => {
  if (mm && typeof mm.fit === "function") mm.fit();
});
btnDownloadMap.onclick = () => {
  if (!selectedCustomerId) {
    alert("Select a customer first");
    return;
  }
  const base = API ? API.replace(/\/api$/, "") : "";
  window.open(
    `${base}/api/customers/${selectedCustomerId}/markup.html`,
    "_blank"
  );
};

// ---- Add Customer (modal)
btnAddCustomerTop.onclick = () => {
  const box = document.createElement("div");
  box.className = "section";
  box.innerHTML = `
    <div class="row">
      <input id="m_custName" placeholder="Customer name" style="min-width:280px;"/>
      <input id="m_custNotes" placeholder="Notes (optional)" style="min-width:280px;"/>
    </div>
    <div class="row">
      <button id="m_save">Create</button>
    </div>
  `;
  box.querySelector("#m_save").onclick = async () => {
    const name = box.querySelector("#m_custName").value.trim();
    const notes = box.querySelector("#m_custNotes").value.trim() || null;
    if (!name) {
      alert("Enter a customer name");
      return;
    }
    const c = await api("/customers", {
      method: "POST",
      body: { name, notes },
    });
    closeModal();
    await selectCustomer(c.id);
    if (customerSearch.value.trim()) doSearch(customerSearch.value);
  };
  openModal("Add Customer", box);
};

// ---- Add Event (modal) — uses selected customer if present; otherwise lets you pick
btnAddEventTop.onclick = async () => {
  // load standard events
  let std = [];
  try {
    std = await api("/standard-events");
  } catch (e) {
    console.error(e);
  }
  const box = document.createElement("div");
  box.className = "section";
  box.innerHTML = `
    <div class="row">
      <label style="min-width:120px;">Customer</label>
      <select id="m_eventCustomer" style="min-width:300px;"></select>
      <input id="m_eventCustSearch" placeholder="Search customers…" style="min-width:220px;" />
    </div>
    <div class="row">
      <label style="min-width:120px;">Event</label>
      <select id="m_eventStd" style="min-width:280px;">
        <option value="" selected disabled>Choose a standard event…</option>
        ${std
          .map(
            (s) =>
              `<option value="${escAttr(s.name)}">${escAttr(s.name)}</option>`
          )
          .join("")}
        <option value="__OTHER__">Other…</option>
      </select>
      <input id="m_eventName" placeholder="Custom event name" style="display:none; min-width:280px;"/>
    </div>
    <div class="row">
      <button id="m_addEvent">Add Event</button>
    </div>
  `;
  const selCustomer = box.querySelector("#m_eventCustomer");
  const inpSearch = box.querySelector("#m_eventCustSearch");

  async function fillCustomers(term) {
    let rows = [];
    try {
      rows = await api(
        `/customers${term ? `?q=${encodeURIComponent(term)}` : ""}`
      );
    } catch {}
    selCustomer.innerHTML = "";
    if (selectedCustomerId && currentData?.customer?.name) {
      const opt = document.createElement("option");
      opt.value = String(selectedCustomerId);
      opt.textContent = `${currentData.customer.name} (selected)`;
      selCustomer.appendChild(opt);
    }
    rows.forEach((c) => {
      if (String(c.id) === String(selectedCustomerId)) return;
      const opt = document.createElement("option");
      opt.value = String(c.id);
      opt.textContent = c.name;
      selCustomer.appendChild(opt);
    });
  }
  await fillCustomers("");
  inpSearch.addEventListener(
    "input",
    debounce(() => fillCustomers(inpSearch.value), 250)
  );

  const stdSel = box.querySelector("#m_eventStd");
  const nameInp = box.querySelector("#m_eventName");
  stdSel.addEventListener("change", () => {
    if (stdSel.value === "__OTHER__") {
      nameInp.style.display = "";
      nameInp.focus();
    } else {
      nameInp.style.display = "none";
      nameInp.value = "";
    }
  });

  box.querySelector("#m_addEvent").onclick = async () => {
    const cid = Number(selCustomer.value || 0);
    if (!cid) {
      alert("Pick a customer");
      return;
    }
    let name = "";
    if (stdSel.value === "__OTHER__") {
      name = (nameInp.value || "").trim();
      if (!name) {
        alert("Enter a custom event name");
        return;
      }
    } else {
      name = (stdSel.value || "").trim();
      if (!name) {
        alert("Choose a standard event or Other…");
        return;
      }
    }
    await api(`/customers/${cid}/events`, { method: "POST", body: { name } });
    closeModal();
    if (cid === selectedCustomerId) await selectCustomer(cid);
  };

  openModal("Add Event", box);
};

// ---- Init
customerSearch.focus();
