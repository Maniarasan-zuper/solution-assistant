// Customer workspace: selected event only; flows via modal add/edit; live preview OFF; no PDF button

// ---------- API base ----------
let API = "";
try {
  if (location.port !== "3000") API = "http://localhost:3000/api";
} catch {}

// ---------- helpers ----------
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
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${t}`);
  }
  return res.status === 204 ? null : res.json();
}
function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
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
function escHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
const norm = (s) => (s || "").trim().toLowerCase();

// ---------- elements ----------
const pageTitle = document.getElementById("pageTitle");
const custNameEl = document.getElementById("custName");

const eventSelectRow = document.getElementById("eventSelectRow");
const eventSelect = document.getElementById("eventSelect");
const eventList = document.getElementById("eventList");
const btnAddEventTop = document.getElementById("btnAddEventTop");

const btnAddFlowOpen = document.getElementById("btnAddFlowOpen");
const flowsBox = document.getElementById("flowsBox");

const previewCard = document.getElementById("previewCard");
const svg = document.getElementById("mindmap");
const btnTogglePreview = document.getElementById("btnTogglePreview");
const btnDownloadDoc = document.getElementById("btnDownloadDoc");
const btnDownloadMap = document.getElementById("btnDownloadMap");
const btnResetView = document.getElementById("btnResetView");

const addFlowRow = document.getElementById("addFlowRow");

// Modal
const modalBackdrop = document.getElementById("modalBackdrop");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

// ---------- modal utils ----------
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

// ---------- state ----------
let customerId = Number(getParam("id") || 0);
let currentData = null;
let mm = null;
let livePreview = false; // OFF by default
let preferredEventId = null;

// Initialize preview UI
btnTogglePreview.textContent = "Live Preview: Off";
previewCard.style.display = "none";

// ---------- preview helpers ----------
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
  if (!livePreview) {
    return;
  }
  svg.replaceChildren();
  if (!customerId) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "16");
    t.setAttribute("y", "28");
    t.textContent = "No customer.";
    svg.appendChild(t);
    return;
  }
  let data = await api(`/customers/${customerId}/markup`);
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
btnDownloadMap.onclick = () => {
  if (!customerId) {
    alert("No customer");
    return;
  }
  const base = API ? API.replace(/\/api$/, "") : "";
  window.open(`${base}/api/customers/${customerId}/markup.html`, "_blank");
};
btnDownloadDoc.onclick = () => {
  if (!customerId) {
    alert("No customer");
    return;
  }
  const base = API ? API.replace(/\/api$/, "") : "";
  window.open(`${base}/api/customers/${customerId}/document.html`, "_blank");
};
btnTogglePreview.onclick = () => {
  livePreview = !livePreview;
  btnTogglePreview.textContent = `Live Preview: ${livePreview ? "On" : "Off"}`;
  previewCard.style.display = livePreview ? "" : "none";
  if (livePreview) renderMarkmap();
};

// ---------- selection helpers ----------
function getCurrentSelectedEventId() {
  return Number(eventSelect?.value || 0) || null;
}
function pickEventId(preferId) {
  const ids = (currentData?.events || []).map((e) => Number(e.id));
  if (preferId && ids.includes(Number(preferId))) return Number(preferId);
  return ids.length ? ids[0] : null;
}
function setSelectedEventId(id) {
  preferredEventId = id;
  if (eventSelect && id != null) eventSelect.value = String(id);
}

// ---------- load ----------
async function loadCustomer(forceEventId = null) {
  if (!customerId) {
    location.href = "./";
    return;
  }
  currentData = await api(`/customers/${customerId}`);
  pageTitle.textContent = `Customer — ${currentData.customer.name}`;
  custNameEl.textContent = currentData.customer.name;

  const desired =
    forceEventId ?? preferredEventId ?? getCurrentSelectedEventId();
  preferredEventId = pickEventId(desired);

  renderEvents();
  if (livePreview) await renderMarkmap();
}

// ---------- events UI ----------
function renderEvents() {
  // Do we have any events?
  const hasEvents =
    Array.isArray(currentData?.events) && currentData.events.length > 0;

  // Toggle the "Add Flow" row (starts hidden in HTML)
  if (typeof addFlowRow !== "undefined" && addFlowRow) {
    addFlowRow.style.display = hasEvents ? "" : "none";
  } else if (typeof btnAddFlowOpen !== "undefined" && btnAddFlowOpen) {
    // Fallback if wrapper row was not added
    btnAddFlowOpen.style.display = hasEvents ? "" : "none";
  }

  // When there are NO events: hide selector & list, show the inline "Add Event" CTA, stop here
  if (!hasEvents) {
    if (eventSelectRow) eventSelectRow.style.display = "none";
    if (eventSelect) eventSelect.innerHTML = "";
    eventList.innerHTML = "";
    flowsBox.innerHTML = `
        <div class="empty">
          <p class="muted">No events yet for this customer.</p>
          <div class="row"><button id="btnAddEventInline">Add Event</button></div>
        </div>
      `;
    const inlineBtn = document.getElementById("btnAddEventInline");
    if (inlineBtn) inlineBtn.onclick = () => btnAddEventTop.click();
    return;
  }

  // There ARE events: show the select row and populate it
  if (eventSelectRow) eventSelectRow.style.display = "";

  // Rebuild the dropdown
  eventSelect.innerHTML = "";
  for (const e of currentData.events) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.name;
    eventSelect.appendChild(opt);
  }

  // Keep/restore selection: prefer previously chosen id, else first event
  const existingIds = new Set(currentData.events.map((e) => Number(e.id)));
  let desired = preferredEventId ?? (Number(eventSelect.value) || null);
  if (desired && existingIds.has(Number(desired))) {
    eventSelect.value = String(desired);
  } else {
    eventSelect.value = String(currentData.events[0].id);
    desired = Number(eventSelect.value);
  }
  preferredEventId = Number(desired);

  // Render only the selected event row and its flows
  renderSelectedEventRow();
  renderFlows();
}

eventSelect.onchange = () => {
  preferredEventId = getCurrentSelectedEventId();
  renderSelectedEventRow();
  renderFlows();
};

function renderSelectedEventRow() {
  eventList.innerHTML = "";
  const selectedId = preferredEventId ?? getCurrentSelectedEventId();
  const e = currentData.events.find((x) => Number(x.id) === Number(selectedId));
  if (!e) return;

  const li = document.createElement("li");
  li.innerHTML = `${e.name} <span class="badge">#${e.id}</span>`;
  const right = document.createElement("div");
  right.className = "row";
  const btnEdit = document.createElement("button");
  btnEdit.textContent = "Rename";
  btnEdit.className = "secondary";
  btnEdit.onclick = async () => {
    const name = prompt("Rename event", e.name);
    if (name && name.trim()) {
      const keep = Number(e.id);
      await api("/events/" + e.id, {
        method: "PUT",
        body: { name: name.trim() },
      });
      await loadCustomer(keep);
    }
  };
  const btnDel = document.createElement("button");
  btnDel.textContent = "Delete";
  btnDel.className = "danger";
  btnDel.onclick = async () => {
    if (!confirm("Delete this event and its flows?")) return;
    await api("/events/" + e.id, { method: "DELETE" });
    await loadCustomer(Number(e.id));
  };
  right.appendChild(btnEdit);
  right.appendChild(btnDel);
  li.appendChild(right);
  eventList.appendChild(li);
}

// ---------- Flow Modals ----------
function flowForm({ title, defaults = {}, onSubmit }) {
  const box = document.createElement("div");
  box.className = "grid-form";
  box.innerHTML = `
    <div class="row">
      <label class="lbl" style="width:auto;min-width:84px;">Title</label>
      <input id="f_name" placeholder="e.g., User sign-up journey" value="${(
        defaults.name || ""
      ).replace(/"/g, "&quot;")}" />
    </div>
    <div class="row">
      <label class="lbl" style="width:auto;min-width:84px;">Link</label>
      <input id="f_link" placeholder="https://docs.example.com/spec (optional)" value="${(
        defaults.link || ""
      ).replace(/"/g, "&quot;")}" />
    </div>
    <div class="row">
      <label class="lbl" style="width:auto;min-width:84px;">Description</label>
<textarea id="f_desc" class="wiki-editor" placeholder="Describe the flow. Use headings, bullet points, and steps.">${
    defaults.description || ""
  }</textarea>


    </div>
    <div class="row">
      <button id="f_save">Save</button>
      <button id="f_cancel" class="secondary" type="button">Cancel</button>
    </div>
    <div class="hint">Tip: You can paste multiple lines; they’ll be preserved.</div>
  `;
  box.querySelector("#f_cancel").onclick = closeModal;
  box.querySelector("#f_save").onclick = async () => {
    const name = box.querySelector("#f_name").value.trim();
    const link = box.querySelector("#f_link").value.trim();
    const description = box.querySelector("#f_desc").value.trim();
    if (!name) {
      alert("Enter a title for the flow");
      return;
    }
    try {
      await onSubmit({
        name,
        link: link || null,
        description: description || null,
      });
    } catch (e) {
      alert(e.message || "Failed");
      return;
    }
    closeModal();
  };
  // Auto-resize the description like a wiki editor
  const ta = box.querySelector("#f_desc");
  function autoResizeTA(el) {
    const max = 900; // px cap to avoid runaway growth
    el.style.height = "auto";
    el.style.height = Math.min(max, el.scrollHeight + 2) + "px";
  }
  ["input", "change"].forEach((ev) =>
    ta.addEventListener(ev, () => autoResizeTA(ta))
  );
  setTimeout(() => autoResizeTA(ta), 0); // initialize after DOM paint

  openModal(title, box);
}

// ---------- flows UI ----------
btnAddFlowOpen.onclick = () => {
  const selectedEventId = preferredEventId ?? getCurrentSelectedEventId();
  if (!selectedEventId) {
    alert("Add an event first");
    return;
  }
  const keep = selectedEventId;
  flowForm({
    title: "Add Flow",
    onSubmit: async ({ name, link, description }) => {
      await api(`/events/${keep}/flows`, {
        method: "POST",
        body: { name, link, description },
      });
      await loadCustomer(keep);
      if (livePreview) await renderMarkmap();
    },
  });
};

function renderFlows() {
  flowsBox.innerHTML = "";
  const selectedEventId =
    preferredEventId ??
    getCurrentSelectedEventId() ??
    currentData.events[0]?.id ??
    null;
  if (!selectedEventId) {
    const p = document.createElement("p");
    p.textContent = "Select an event to manage flows.";
    p.className = "muted";
    flowsBox.appendChild(p);
    return;
  }

  const flows = currentData.flows.filter(
    (f) => Number(f.eventId) === Number(selectedEventId)
  );
  const childrenByParent = new Map();
  for (const f of flows) {
    const key = f.parentFlowId || 0;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(f);
  }
  const top = childrenByParent.get(0) || [];
  const colorByTopId = new Map();
  top.forEach((f, i) => colorByTopId.set(f.id, COLORS[i % COLORS.length]));

  function makeRow(f, level = 0, inheritColor) {
    const color = inheritColor || colorByTopId.get(f.id) || COLORS[0];

    const wrap = document.createElement("div");
    wrap.className = "flow-wrap";
    wrap.style.marginLeft = level * 16 + "px";

    const card = document.createElement("div");
    card.className = "flow";
    card.style.borderLeftColor = color;
    card.style.background = hexToRgba(color, 0.06);

    const hasLink = !!(f.link && String(f.link).trim());
    const descHtml = f.description
      ? escHtml(f.description)
      : '<span class="muted">—</span>';
    const linkHtml = hasLink
      ? `<a href="${escHtml(f.link)}" target="_blank" rel="noopener">${escHtml(
          f.link
        )}</a>`
      : `<span class="muted">No link</span>`;

    card.innerHTML = `
      <div class="kv">
        <div class="k">Name</div>
        <div class="v"><div class="title">${escHtml(f.name)}</div></div>
  
        <!-- ✨ Full-width DESCRIPTION -->
        <div class="k k-desc">Description</div>
        <div class="v v-desc"><div class="desc">${descHtml}</div></div>
  
        <div class="k">Link</div>
        <div class="v"><div class="link">${linkHtml}</div></div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "flow-actions-out";
    actions.innerHTML = `
      <button class="icon secondary" data-edit title="Edit this flow">Edit</button>
      <button class="icon" data-addsub title="Add a sub-workflow">Add Sub-workflow</button>
      <button class="icon danger" data-delete title="Delete this flow">Delete</button>
    `;

    actions.querySelector("[data-edit]").onclick = () => {
      const keep = preferredEventId ?? getCurrentSelectedEventId();
      flowForm({
        title: "Edit Flow",
        defaults: {
          name: f.name,
          link: f.link || "",
          description: f.description || "",
        },
        onSubmit: async ({ name, link, description }) => {
          await api("/flows/" + f.id, {
            method: "PUT",
            body: { name, link, description },
          });
          await loadCustomer(keep);
          if (livePreview) await renderMarkmap();
        },
      });
    };

    actions.querySelector("[data-addsub]").onclick = () => {
      const keep = preferredEventId ?? getCurrentSelectedEventId();
      flowForm({
        title: "Add Sub-workflow",
        onSubmit: async ({ name, link, description }) => {
          await api("/flows/" + f.id + "/subflows", {
            method: "POST",
            body: { name, link, description },
          });
          await loadCustomer(keep);
          if (livePreview) await renderMarkmap();
        },
      });
    };

    actions.querySelector("[data-delete]").onclick = async () => {
      const keep = preferredEventId ?? getCurrentSelectedEventId();
      if (!confirm("Delete this flow and all its subflows?")) return;
      await api("/flows/" + f.id, { method: "DELETE" });
      await loadCustomer(keep);
      if (livePreview) await renderMarkmap();
    };

    wrap.appendChild(card);
    wrap.appendChild(actions);
    flowsBox.appendChild(wrap);

    (childrenByParent.get(f.id) || []).forEach((ch) =>
      makeRow(ch, level + 1, color)
    );
  }

  if (top.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No flows yet. Use “Add Flow” to create the first one.";
    p.className = "muted";
    flowsBox.appendChild(p);
  } else {
    top.forEach((f) => makeRow(f, 0, colorByTopId.get(f.id)));
  }
}

// ---------- Add Event (modal) with duplicate guard ----------
btnAddEventTop.onclick = async () => {
  const existing = new Set(
    (currentData?.events || []).map((e) => norm(e.name))
  );
  let std = [];
  try {
    std = await api("/standard-events");
  } catch (e) {
    console.error(e);
  }
  const box = document.createElement("div");
  box.className = "grid-form";
  box.innerHTML = `
    <div class="row">
      <label class="lbl" style="width:auto;min-width:84px;">Event</label>
      <select id="m_eventStd" style="min-width:280px;">
        <option value="" selected disabled>Choose a standard event…</option>
        ${std
          .map(
            (s) =>
              `<option value="${(s.name || "").replace(/"/g, "&quot;")}">${(
                s.name || ""
              ).replace(/</g, "&lt;")}</option>`
          )
          .join("")}
        <option value="__OTHER__">Other…</option>
      </select>
    </div>
    <div class="row" id="otherRow" style="display:none;">
      <label class="lbl" style="width:auto;min-width:84px;">Custom</label>
      <input id="m_eventName" placeholder="e.g., Quarterly review with stakeholders" style="min-width:280px;"/>
    </div>
    <div class="row">
      <button id="m_addEvent">Add Event</button>
      <button id="m_cancel" class="secondary" type="button">Cancel</button>
    </div>
  `;
  box.querySelector("#m_cancel").onclick = closeModal;

  const stdSel = box.querySelector("#m_eventStd");
  const otherRow = box.querySelector("#otherRow");
  const nameInp = box.querySelector("#m_eventName");
  stdSel.addEventListener("change", () => {
    if (stdSel.value === "__OTHER__") {
      otherRow.style.display = "";
      nameInp.focus();
    } else {
      otherRow.style.display = "none";
      nameInp.value = "";
    }
  });

  box.querySelector("#m_addEvent").onclick = async () => {
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
    if (existing.has(norm(name))) {
      alert("This event already exists for the customer.");
      return;
    }

    await api(`/customers/${customerId}/events`, {
      method: "POST",
      body: { name },
    });
    closeModal();
    await loadCustomer();
    const added = (currentData.events || []).find(
      (ev) => norm(ev.name) === norm(name)
    );
    if (added) {
      setSelectedEventId(Number(added.id));
      renderSelectedEventRow();
      renderFlows();
    }
  };

  openModal("Add Event", box);
};

// ---------- init ----------
if (!customerId) {
  location.href = "./";
} else {
  loadCustomer();
}
