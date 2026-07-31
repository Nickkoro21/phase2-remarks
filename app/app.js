"use strict";

const CAT_LABELS = {
  contact: { name: "Contact", el: "Προσαρμογή" },
  instrument: { name: "Instrument", el: "Όργανα" },
  formation: { name: "Formation", el: "Σχηματισμός" },
  vfr_navigation: { name: "VFR Navigation", el: "Ναυτιλία" },
};
const VARIANT_LABELS = {
  technique: "Technique",
  human_factor: "Human factor",
  marginal: "Marginal @ MIF",
  above: "Above MIF",
};

const state = {
  master: null,
  category: null,
  item: null,      // master index entry
  itemData: null,  // loaded item file
  row: null,       // selected mif_row name or null
  desired: null,
  achieved: null,
};

const $ = (id) => document.getElementById(id);

async function init() {
  try {
    const res = await fetch("/data/observations/master_index.json", { cache: "no-store" });
    state.master = await res.json();
    $("databadge").textContent =
      `${state.master.totals.observations} observations · ${state.master.totals.items} items · index ${state.master.generated_at}`;
    renderCategories();
  } catch (e) {
    $("databadge").textContent = "no index";
    $("cat-grid").innerHTML =
      `<p class="hint">Δεν βρέθηκε το master_index.json.<br>Τρέξε: <code>python tools/build_index.py</code> και κάνε refresh.</p>`;
  }
}

function renderCategories() {
  const grid = $("cat-grid");
  grid.innerHTML = "";
  for (const [key, label] of Object.entries(CAT_LABELS)) {
    const cat = state.master.categories[key];
    const n = cat ? cat.items.length : 0;
    const obs = cat ? cat.observations : 0;
    const btn = document.createElement("button");
    btn.className = "cat-card" + (n === 0 ? " empty" : "");
    btn.innerHTML = `<strong>${label.name}</strong> · ${label.el}
      <span class="cat-count">${n ? `${n} items · ${obs} παρατηρήσεις` : "σε παραγωγή…"}</span>`;
    btn.onclick = () => selectCategory(key, btn);
    grid.appendChild(btn);
  }
}

function selectCategory(key, btn) {
  document.querySelectorAll(".cat-card").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.category = key;
  state.item = state.itemData = state.row = state.desired = state.achieved = null;
  $("item-search").disabled = false;
  $("item-search").value = "";
  renderItems();
  renderCodes();
  renderResults();
}

function renderItems() {
  const list = $("item-list");
  list.innerHTML = "";
  const cat = state.master.categories[state.category];
  if (!cat || !cat.items.length) {
    list.innerHTML = `<p class="hint">Η κατηγορία δεν έχει ακόμη παρατηρήσεις — οι γεννήτριες γράφουν. Τρέξε ξανά το build_index.py αργότερα.</p>`;
    return;
  }
  const q = $("item-search").value.trim().toLowerCase();
  const norm = (s) => s.normalize("NFKD").toLowerCase();
  for (const it of cat.items) {
    if (q && !norm(it.item_name).includes(q) && !it.item_id.includes(q)) continue;
    const btn = document.createElement("button");
    btn.className = "item-btn" + (state.item?.item_id === it.item_id ? " active" : "");
    const sn = it.mif_numbers.length ? it.mif_numbers.join(",") : "—";
    btn.innerHTML = `<span class="sn">#${sn}</span>${it.item_name}<span class="obs-n">${it.observations}</span>`;
    btn.onclick = () => selectItem(it, btn);
    list.appendChild(btn);
  }
  if (!list.children.length) list.innerHTML = `<p class="hint">Κανένα item δεν ταιριάζει.</p>`;
}

async function selectItem(it, btn) {
  document.querySelectorAll(".item-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.item = it;
  state.row = state.desired = state.achieved = null;
  state.itemData = null;
  renderCodes();
  renderResults();
  try {
    const res = await fetch(`/data/observations/${it.file}`, { cache: "no-store" });
    state.itemData = await res.json();
  } catch (e) {
    $("results").innerHTML = `<p class="hint">Αποτυχία φόρτωσης του ${it.file}.</p>`;
    return;
  }
  // Default row: first with data, or null when single/none
  const rows = rowsWithData();
  state.row = rows.length > 1 ? rows[0] : (rows[0] ?? null);
  renderCodes();
  renderResults();
}

function rowsWithData() {
  if (!state.itemData) return [];
  const set = new Set();
  for (const o of state.itemData.observations) if (o.mif_row) set.add(o.mif_row);
  return [...set];
}

function obsPool() {
  if (!state.itemData) return [];
  return state.itemData.observations.filter((o) => (o.mif_row ?? null) === (state.row ?? null));
}

function renderCodes() {
  const rows = rowsWithData();
  const wrap = $("row-select-wrap");
  if (rows.length > 1) {
    wrap.classList.remove("hidden");
    const sel = $("row-select");
    sel.innerHTML = rows.map((r) => `<option${r === state.row ? " selected" : ""}>${r}</option>`).join("");
    sel.onchange = () => { state.row = sel.value; state.desired = state.achieved = null; renderCodes(); renderResults(); };
  } else {
    wrap.classList.add("hidden");
  }

  const pool = obsPool();
  const desiredSet = new Set(pool.map((o) => o.desired));
  const dWrap = $("desired-chips");
  dWrap.innerHTML = "";
  if (!state.itemData) { dWrap.innerHTML = `<p class="hint">—</p>`; }
  else {
    for (let d = 0; d <= 3; d++) {
      const b = document.createElement("button");
      b.className = "chip" + (state.desired === d ? " active" : "");
      b.textContent = d;
      b.disabled = !desiredSet.has(d);
      b.onclick = () => { state.desired = d; state.achieved = null; renderCodes(); renderResults(); };
      dWrap.appendChild(b);
    }
  }

  const aWrap = $("achieved-chips");
  aWrap.innerHTML = "";
  if (state.desired === null) { aWrap.innerHTML = `<p class="hint">Διάλεξε επιθυμητό κώδικα.</p>`; }
  else {
    const achievedSet = new Set(pool.filter((o) => o.desired === state.desired).map((o) => o.achieved));
    for (let a = 0; a <= 4; a++) {
      const b = document.createElement("button");
      b.className = "chip" + (state.achieved === a ? " active" : "");
      b.textContent = a;
      b.disabled = !achievedSet.has(a);
      b.onclick = () => { state.achieved = a; renderCodes(); renderResults(); };
      aWrap.appendChild(b);
    }
  }
}

function prefixFor(o) {
  let sn = "—";
  if (o.mif_row && state.itemData.mif_rows) {
    const row = state.itemData.mif_rows.find((r) => r.row_name === o.mif_row);
    if (row && row.sn != null) sn = row.sn;
  } else if (state.itemData.mif_numbers?.length) {
    sn = state.itemData.mif_numbers[0];
  }
  return `#${sn}. (${o.desired}) → (${o.achieved}):`;
}

function renderResults() {
  const box = $("results");
  $("result-count").textContent = "";
  if (!state.itemData || state.desired === null || state.achieved === null) {
    box.innerHTML = `<p class="hint">${state.itemData
      ? "Διάλεξε επιθυμητό κώδικα και κώδικα επίδοσης."
      : "Διάλεξε κατηγορία, item και κώδικες για να δεις τις διαθέσιμες παρατηρήσεις."}</p>`;
    return;
  }
  const hits = obsPool().filter((o) => o.desired === state.desired && o.achieved === state.achieved);
  if (!hits.length) {
    box.innerHTML = `<p class="hint">Δεν υπάρχει παρατήρηση για τον συνδυασμό (${state.desired}) → (${state.achieved}).</p>`;
    return;
  }
  $("result-count").textContent = `${hits.length} διαθέσιμες`;
  box.innerHTML = "";
  for (const o of hits) {
    const card = document.createElement("div");
    card.className = `obs-card v-${o.variant}`;
    const prefix = prefixFor(o);
    const full = `${prefix} ${o.text}`;
    card.innerHTML = `
      <div class="obs-head">
        <span class="obs-prefix">${prefix}</span>
        <span class="badge">${VARIANT_LABELS[o.variant] ?? o.variant}</span>
        ${o.hf_concept ? `<span class="badge hf">${o.hf_concept}</span>` : ""}
        <button class="copy-btn">Copy</button>
      </div>
      <p class="obs-text"></p>`;
    card.querySelector(".obs-text").textContent = o.text;
    const cbtn = card.querySelector(".copy-btn");
    cbtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(full);
        cbtn.textContent = "Copied ✓"; cbtn.classList.add("copied");
        setTimeout(() => { cbtn.textContent = "Copy"; cbtn.classList.remove("copied"); }, 1600);
      } catch { /* clipboard blocked over http — select fallback */
        const r = document.createRange(); r.selectNodeContents(card.querySelector(".obs-text"));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    };
    box.appendChild(card);
  }
}

$("item-search").addEventListener("input", renderItems);
init();
