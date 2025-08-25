// ui/customer.js — Markdown description + clean UX (no reorder)

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
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
const norm = (s) => (s || "").trim().toLowerCase();

// ---------- Markdown (client-side, safe) ----------
const MD = window.markdownit
  ? window.markdownit({ html: false, linkify: true, breaks: true })
  : null;
function renderMarkdownSafe(txt = "") {
  if (!MD) return escHtml(txt);
  const raw = MD.render(String(txt || ""));
  return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
}

// ---------- elements ----------
const pageTitle = document.getElementById("pageTitle");
const custNameEl = document.getElementById("custName");

const eventSelectRow = document.getElementById("eventSelectRow");
const eventSelect = document.getElementById("eventSelect");
const eventList = document.getElementById("eventList");
const btnAddEventTop = document.getElementById("btnAddEventTop");

const addFlowRow = document.getElementById("addFlowRow");
const btnAddFlowOpen = document.getElementById("btnAddFlowOpen");
const flowsBox = document.getElementById("flowsBox");

const previewCard = document.getElementById("previewCard");
const svg = document.getElementById("mindmap");
const btnTogglePreview = document.getElementById("btnTogglePreview");
const btnDownloadDoc = document.getElementById("btnDownloadDoc");
const btnDownloadMap = document.getElementById("btnDownloadMap");
const btnResetView = document.getElementById("btnResetView");

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

// actions (outside/right, below the card)
const actions = document.createElement("div");
actions.className = "flow-actions-out";
actions.innerHTML = `
  <button class="icon secondary" data-edit>Edit</button>
  <button class="icon" data-move title="Move this flow (and subflows)">Move</button>
  <button class="icon" data-addsub>Add Sub-workflow</button>
  <button class="icon danger" data-delete>Delete</button>
`;
actions.querySelector("[data-move]").onclick = () => showMoveModal(f);

function showMoveModal(flow) {
  // Build destination EVENT select
  const evSel = document.createElement("select");
  evSel.className = "select-wide";
  (currentData.events || []).forEach((ev) => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = ev.name;
    if (Number(ev.id) === Number(flow.eventId)) opt.selected = true;
    evSel.appendChild(opt);
  });

  // Build PARENT select (top level + flows in selected event)
  const parentSel = document.createElement("select");
  parentSel.className = "select-wide";

  function fillParents(eventId) {
    parentSel.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(Top level)";
    parentSel.appendChild(none);

    const flows = currentData.flows.filter(
      (x) => Number(x.eventId) === Number(eventId)
    );
    // flat list, indented by depth; exclude the flow itself to avoid cycles
    const childrenByParent = new Map();
    for (const fl of flows) {
      const k = fl.parentFlowId || 0;
      (childrenByParent.get(k) || childrenByParent.set(k, []).get(k)).push(fl);
    }
    // breadth-first over the hierarchy
    const queue = (childrenByParent.get(0) || []).map((f) => ({ f, depth: 0 }));
    while (queue.length) {
      const { f, depth } = queue.shift();
      if (f.id === flow.id) continue;
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = `${"  ".repeat(Math.min(depth, 3))}${f.name}`;
      parentSel.appendChild(opt);
      (childrenByParent.get(f.id) || []).forEach((ch) =>
        queue.push({ f: ch, depth: depth + 1 })
      );
    }
  }
  fillParents(Number(evSel.value));
  evSel.onchange = () => fillParents(Number(evSel.value));

  // Modal body
  const box = document.createElement("div");
  box.className = "grid-form";
  box.innerHTML = `
    <div class="row">
      <label class="lbl" style="width:auto;min-width:84px;">Event</label>
    </div>
  `;
  box.appendChild(evSel);
  const row2 = document.createElement("div");
  row2.className = "row";
  row2.innerHTML = `<label class="lbl" style="width:auto;min-width:84px;">Parent</label>`;
  box.appendChild(row2);
  box.appendChild(parentSel);
  const row3 = document.createElement("div");
  row3.className = "row";
  const bMove = document.createElement("button");
  bMove.textContent = "Move";
  const bCancel = document.createElement("button");
  bCancel.textContent = "Cancel";
  bCancel.className = "secondary";
  row3.appendChild(bMove);
  row3.appendChild(bCancel);
  box.appendChild(row3);

  bCancel.onclick = closeModal;
  bMove.onclick = async () => {
    const toEventId = Number(evSel.value);
    const parentFlowId = parentSel.value ? Number(parentSel.value) : null;
    try {
      await api(`/flows/${flow.id}/move`, {
        method: "POST",
        body: { toEventId, parentFlowId },
      });
    } catch (e) {
      alert(e.message || "Move failed");
      return;
    }
    closeModal();
    // Show the destination event after move
    preferredEventId = toEventId;
    await loadCustomer(toEventId);
    if (livePreview) await renderMarkmap();
  };

  openModal("Move Flow", box);
}

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
  const hasEvents = !!(currentData.events && currentData.events.length);

  // Toggle "Add Flow" row visibility
  if (addFlowRow) addFlowRow.style.display = hasEvents ? "" : "none";

  if (!hasEvents) {
    if (eventSelectRow) eventSelectRow.style.display = "none";
    eventSelect.innerHTML = "";
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

  if (eventSelectRow) eventSelectRow.style.display = "";
  eventSelect.innerHTML = "";
  currentData.events.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.name;
    eventSelect.appendChild(opt);
  });
  setSelectedEventId(preferredEventId);

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
  li.innerHTML = `${escHtml(e.name)} <span class="badge">#${e.id}</span>`;
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

// ---------- Flow Modal (Write / Preview with Markdown) ----------
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
      <div class="md-tabs">
        <button type="button" class="tab active" id="tabWrite">Write</button>
        <button type="button" class="tab" id="tabPreview">Preview</button>
      </div>
      <textarea id="f_desc" class="wiki-editor" placeholder="Use **Markdown**: headings, lists, code, links, etc.">${
        defaults.description || ""
      }</textarea>
      <div id="f_preview" class="md-preview" style="display:none;"></div>
    </div>
    <div class="row">
      <button id="f_save">Save</button>
      <button id="f_cancel" class="secondary" type="button">Cancel</button>
    </div>
    <div class="hint">Tip: Use Markdown. Example: <code>- Step 1</code>, <code>**bold**</code>, <code>\`code\`</code>, <code>[text](https://...)</code></div>
  `;

  const nameEl = box.querySelector("#f_name");
  const linkEl = box.querySelector("#f_link");
  const descEl = box.querySelector("#f_desc");
  const prevEl = box.querySelector("#f_preview");
  const tWrite = box.querySelector("#tabWrite");
  const tPrev = box.querySelector("#tabPreview");

  // Auto-resize textarea
  function autoResizeTA(el) {
    const max = 900;
    el.style.height = "auto";
    el.style.height = Math.min(max, el.scrollHeight + 2) + "px";
  }
  ["input", "change"].forEach((ev) =>
    descEl.addEventListener(ev, () => {
      autoResizeTA(descEl);
      if (!prevEl.hidden) renderPreview();
    })
  );
  setTimeout(() => autoResizeTA(descEl), 0);

  function renderPreview() {
    prevEl.innerHTML = renderMarkdownSafe(descEl.value);
  }

  function showWrite() {
    tWrite.classList.add("active");
    tPrev.classList.remove("active");
    descEl.style.display = "";
    prevEl.style.display = "none";
    prevEl.hidden = true;
  }
  function showPreview() {
    tPrev.classList.add("active");
    tWrite.classList.remove("active");
    renderPreview();
    prevEl.style.display = "";
    prevEl.hidden = false;
    descEl.style.display = "none";
  }
  tWrite.onclick = showWrite;
  tPrev.onclick = showPreview;

  box.querySelector("#f_cancel").onclick = closeModal;
  box.querySelector("#f_save").onclick = async () => {
    const name = nameEl.value.trim();
    const link = linkEl.value.trim();
    const description = descEl.value; // keep raw markdown
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

  openModal(title, box);
}

// ---------- flows UI ----------
btnAddFlowOpen.onclick = () => {
  const selectedEventId = preferredEventId ?? getCurrentSelectedEventId();
  if (!selectedEventId) {
    // No events yet? Open Add Event modal directly.
    btnAddEventTop.click();
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

    // wrapper carries indentation + keeps actions aligned
    const wrap = document.createElement("div");
    wrap.className = "flow-wrap";
    wrap.style.marginLeft = level * 16 + "px";
    wrap.dataset.flowId = String(f.id);
    wrap.dataset.parentId = String(f.parentFlowId || 0);

    // card body
    const card = document.createElement("div");
    card.className = "flow";
    card.style.borderLeftColor = color;
    card.style.background = hexToRgba(color, 0.06);

    const hasLink = !!(f.link && String(f.link).trim());
    const descHtml =
      f.description && f.description.trim()
        ? renderMarkdownSafe(f.description) // ✅ render Markdown
        : '<span class="muted">—</span>';
    const linkHtml = hasLink
      ? `<a href="${escHtml(f.link)}" target="_blank" rel="noopener">${escHtml(
          f.link
        )}</a>`
      : `<span class="muted">No link</span>`;

    // IMPORTANT: insert descHtml as HTML (not textContent)
    card.innerHTML = `
      <div class="kv">
        <div class="k">Name</div>
        <div class="v"><div class="title">${escHtml(f.name)}</div></div>

        <div class="k k-desc">Description</div>
        <div class="v v-desc"><div class="desc md">${descHtml}</div></div>

        <div class="k">Link</div>
        <div class="v"><div class="link">${linkHtml}</div></div>
      </div>
    `;

    // actions (outside/right, below the card)
    const actions = document.createElement("div");
    actions.className = "flow-actions-out";
    actions.innerHTML = `
  <button class="icon secondary" data-edit>Edit</button>
  <button class="icon" data-move title="Move this flow (and subflows)">Move</button>
  <button class="icon" data-addsub>Add Sub-workflow</button>
  <button class="icon danger" data-delete>Delete</button>
`;

    // handlers (keep your existing edit/addsub/delete; add this line for Move)
    actions.querySelector("[data-move]").onclick = () => showMoveModal(f);

    // mount (keep as-is)
    wrap.appendChild(card);
    wrap.appendChild(actions);
    flowsBox.appendChild(wrap);

    // handlers
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

    // mount
    wrap.appendChild(card);
    wrap.appendChild(actions);
    flowsBox.appendChild(wrap);

    // children
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

// ---------- Add Event (modal) with duplicate guard + standard events ----------
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
