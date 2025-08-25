// Home page: default customer grid + search + add customer modal

// API base
let API = "";
try {
  if (location.port !== "3000") API = "http://localhost:3000/api";
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
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${t}`);
  }
  return res.status === 204 ? null : res.json();
}
function debounce(fn, wait = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

// Elements
const customerSearch = document.getElementById("customerSearch");
const btnClearSearch = document.getElementById("btnClearSearch");
const customerGrid = document.getElementById("customerGrid");
const gridHint = document.getElementById("gridHint");
const btnAddCustomerTop = document.getElementById("btnAddCustomerTop");

const modalBackdrop = document.getElementById("modalBackdrop");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

// Modal utils
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

// Render grid
function renderGrid(rows) {
  customerGrid.innerHTML = "";
  if (!rows || !rows.length) {
    customerGrid.innerHTML = '<p class="muted">No customers yet.</p>';
    return;
  }
  rows.forEach((c) => {
    const card = document.createElement("div");
    card.className = "grid-item";
    card.innerHTML = `
      <h4>${(c.name || "").replace(/</g, "&lt;")}</h4>
      <div class="row">
        <button class="secondary" data-open>Open</button>
        <span class="badge">ID ${c.id}</span>
      </div>
    `;
    card.querySelector("[data-open]").onclick = () =>
      (location.href = `customer.html?id=${encodeURIComponent(c.id)}`);
    customerGrid.appendChild(card);
  });
}

// Initial load (default grid)
async function loadInitial() {
  let rows = [];
  try {
    rows = await api("/customers");
  } catch (e) {
    console.error(e);
  }
  renderGrid(rows);
}
loadInitial();

// Search (updates grid)
async function searchCustomers(term) {
  const q = (term || "").trim();
  if (!q) {
    gridHint.textContent =
      "Showing recent customers. Use search to filter, or add a new customer.";
    return loadInitial();
  }
  gridHint.textContent = "Search results:";
  let rows = [];
  try {
    rows = await api(`/customers?q=${encodeURIComponent(q)}`);
  } catch (e) {
    console.error(e);
  }
  renderGrid(rows);
}
const doSearch = debounce(searchCustomers, 250);
customerSearch.addEventListener("input", (e) => doSearch(e.target.value));
customerSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch(customerSearch.value);
});
btnClearSearch.onclick = () => {
  customerSearch.value = "";
  doSearch("");
  customerSearch.focus();
};

// Add Customer (modal)
btnAddCustomerTop.onclick = () => {
  const box = document.createElement("div");
  box.className = "section";
  box.innerHTML = `
    <div class="row">
      <label class="lbl">Name</label>
      <input id="m_custName" placeholder="Customer name" style="min-width:280px;" />
    </div>
    <div class="row">
      <label class="lbl">Notes</label>
      <input id="m_custNotes" placeholder="Notes (optional)" style="min-width:280px;" />
    </div>
    <div class="row">
      <button id="m_save">Create & Open</button>
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
    location.href = `customer.html?id=${encodeURIComponent(c.id)}`;
  };
  openModal("Add Customer", box);
};

// Focus search by default
customerSearch.focus();
