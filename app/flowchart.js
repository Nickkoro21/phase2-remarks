"use strict";
/* Phase II flowchart — interactive swimlane diagram.
   Edges are drawn ONLY for the selected node (keeps the picture readable). */

(() => {
  const KIND_COLORS = {
    theory: "#7d8ca3",
    ground_exam: "#ffb454",
    sim: "#3fd0c9",
    flight: "#58b0ff",
    checkride: "#ffd166",
  };
  const CAT_COLORS = {
    contact: "#58b0ff",
    instrument: "#9d8cff",
    formation: "#46d19a",
    vfr_navigation: "#ff9d5c",
  };
  const KIND_LABELS = {
    theory: "Theory",
    ground_exam: "Ground exam",
    sim: "Simulator (F/S)",
    flight: "Flight",
    checkride: "Checkride",
  };
  const EDGE_STYLE = { sequence: "", prereq: "6 4", implied: "2 4" };

  let fc = null;          // flowchart data
  let loaded = false;
  let selected = null;
  const el = (id) => document.getElementById(id);

  function nodeColor(n) {
    if (n.kind === "flight" || n.kind === "checkride") {
      return CAT_COLORS[n.category] || KIND_COLORS.flight;
    }
    return KIND_COLORS[n.kind] || "#7d8ca3";
  }

  function hoursText(n) {
    if (n.hours_total != null) return `${n.hours_total} h`;
    if (n.periods != null) return `${n.periods} periods`;
    return null;
  }

  async function fcInit() {
    if (loaded) return;
    loaded = true;
    try {
      const res = await fetch("../data/flowchart.json", { cache: "no-store" });
      fc = await res.json();
    } catch (e) {
      el("fc-subtitle").textContent = "flowchart.json not found.";
      return;
    }
    const t = fc.totals || {};
    el("fc-subtitle").textContent =
      `${fc.nodes.length} stations · ${fc.edges.length} links — click a station to see its connections, hours and source. Click empty space to clear.`;
    renderLegend();
    renderLanes();
  }
  window.fcInit = fcInit;

  function renderLegend() {
    const wrap = el("fc-legend");
    wrap.innerHTML = "";
    const entries = [
      ...Object.entries(KIND_LABELS).filter(([k]) => k !== "flight").map(([k, v]) => [KIND_COLORS[k], v]),
      ...Object.entries(CAT_COLORS).map(([k, v]) => [v, `Flight — ${k.replace("_", " ")}`]),
      ["#ffd166", "★ SOLO required"],
    ];
    for (const [color, label] of entries) {
      const s = document.createElement("span");
      s.className = "fc-leg";
      s.innerHTML = `<i style="background:${color}"></i>${label}`;
      wrap.appendChild(s);
    }
  }

  function renderLanes() {
    const lanes = el("fc-lanes");
    lanes.innerHTML = "";
    const phases = [...(fc.phases || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const p of phases) {
      const nodes = fc.nodes.filter((n) => n.phase === p.id);
      const col = document.createElement("div");
      col.className = "fc-lane";
      col.innerHTML = `<div class="fc-lane-head">${p.label}<span class="fc-lane-n">${nodes.length}</span></div>`;
      for (const n of nodes) {
        const c = nodeColor(n);
        const card = document.createElement("button");
        card.className = "fc-node" + (n.checkride ? " fc-checkride" : "");
        card.id = `fcn-${n.id}`;
        card.style.borderLeftColor = c;
        const hrs = hoursText(n);
        card.innerHTML = `
          <span class="fc-node-label" style="color:${c}">${n.label}</span>
          ${n.checkride ? `<span class="fc-b fc-b-ckr">CHECKRIDE</span>` : ""}
          ${n.solo_required ? `<span class="fc-b fc-b-solo-req">★ 1st SOLO</span>` :
            (n.solo_allowed ? `<span class="fc-b fc-b-solo">SOLO</span>` : "")}
          ${n.night ? `<span class="fc-b">NIGHT</span>` : ""}
          <span class="fc-node-name">${n.name ?? ""}</span>
          ${hrs ? `<span class="fc-node-hrs">⏱ ${hrs}</span>` : ""}`;
        card.onclick = (e) => { e.stopPropagation(); select(n.id); };
        col.appendChild(card);
      }
      lanes.appendChild(col);
    }
    el("fc-wrap").addEventListener("click", clearSelection);
    el("fc-wrap").addEventListener("scroll", () => { if (selected) drawEdges(selected); });
    window.addEventListener("resize", () => { if (selected) drawEdges(selected); });
  }

  function connections(id) {
    const out = fc.edges.filter((e) => e.from === id);
    const inn = fc.edges.filter((e) => e.to === id);
    return { out, inn };
  }

  function select(id) {
    selected = id;
    const { out, inn } = connections(id);
    const connected = new Set([id, ...out.map((e) => e.to), ...inn.map((e) => e.from)]);
    document.querySelectorAll(".fc-node").forEach((c) => {
      const nid = c.id.slice(4);
      c.classList.toggle("fc-sel", nid === id);
      c.classList.toggle("fc-dim", !connected.has(nid));
    });
    drawEdges(id);
    renderDetail(id, out, inn);
  }

  function clearSelection() {
    selected = null;
    document.querySelectorAll(".fc-node").forEach((c) => c.classList.remove("fc-sel", "fc-dim"));
    el("fc-svg").innerHTML = "";
    el("fc-detail").classList.add("hidden");
  }

  function drawEdges(id) {
    const svg = el("fc-svg");
    const wrap = el("fc-wrap");
    svg.setAttribute("width", wrap.scrollWidth);
    svg.setAttribute("height", wrap.scrollHeight);
    svg.innerHTML = "";
    const wr = wrap.getBoundingClientRect();
    const pos = (nid) => {
      const c = el(`fcn-${nid}`);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return {
        left: r.left - wr.left + wrap.scrollLeft,
        right: r.right - wr.left + wrap.scrollLeft,
        cy: r.top - wr.top + wrap.scrollTop + r.height / 2,
      };
    };
    const { out, inn } = connections(id);
    for (const e of [...inn, ...out]) {
      const a = pos(e.from), b = pos(e.to);
      if (!a || !b) continue;
      const x1 = a.right, y1 = a.cy, x2 = b.left, y2 = b.cy;
      const dx = Math.max(40, (x2 - x1) / 2);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = x2 > x1
        ? `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
        : `M ${a.left} ${y1} C ${a.left - 60} ${y1}, ${b.right + 60} ${y2}, ${b.right} ${y2}`;
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", e.from === id ? "#58b0ff" : "#ffb454");
      path.setAttribute("stroke-width", "2");
      if (EDGE_STYLE[e.kind]) path.setAttribute("stroke-dasharray", EDGE_STYLE[e.kind]);
      path.setAttribute("opacity", "0.85");
      svg.appendChild(path);
    }
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

  function renderDetail(id, out, inn) {
    const n = fc.nodes.find((x) => x.id === id);
    const box = el("fc-detail");
    const name = (nid) => fc.nodes.find((x) => x.id === nid)?.label ?? nid;
    const li = (e, dir) => {
      const nid = dir === "out" ? e.to : e.from;
      return `<li><button class="req-link fc-jump" data-n="${esc(nid)}">${esc(name(nid))}</button> <span class="hint">${esc(e.kind)}${e.note ? " · " + esc(e.note) : ""}</span></li>`;
    };
    box.innerHTML = `
      <div class="obs-head">
        <span class="obs-prefix">${esc(n.label)}</span>
        <span class="badge">${esc(KIND_LABELS[n.kind] ?? n.kind)}</span>
        ${n.category ? `<span class="badge">${esc(n.category.replace("_", " "))}</span>` : ""}
        <button class="copy-btn" id="fc-close">✕</button>
      </div>
      <p class="obs-text">${esc(n.name ?? "")}</p>
      <div class="kv-row">
        ${n.hours_total != null ? `<span class="badge kv">hours: ${n.hours_total}</span>` : ""}
        ${n.hours_per_sortie != null ? `<span class="badge kv">per sortie: ${n.hours_per_sortie}</span>` : ""}
        ${n.periods != null ? `<span class="badge kv">periods: ${n.periods}</span>` : ""}
        ${n.solo_required ? `<span class="badge kv">★ 1st SOLO (mandatory)</span>` : ""}
        ${n.solo_allowed && !n.solo_required ? `<span class="badge kv">solo allowed</span>` : ""}
        ${n.checkride ? `<span class="badge kv">checkride</span>` : ""}
      </div>
      ${n.duration_verbatim ? `<p class="req-src">“${esc(n.duration_verbatim)}”</p>` : ""}
      ${n.source ? `<p class="req-src">📄 ${esc(n.source.file ?? "")}${n.source.page_pdf ? ` · p.${esc(String(n.source.page_pdf))}` : ""}${n.source.ref ? " · " + esc(n.source.ref) : ""}</p>` : ""}
      ${inn.length ? `<h4 class="fc-h4">← Before</h4><ul class="fc-ul">${inn.map((e) => li(e, "in")).join("")}</ul>` : ""}
      ${out.length ? `<h4 class="fc-h4">After →</h4><ul class="fc-ul">${out.map((e) => li(e, "out")).join("")}</ul>` : ""}
      ${(n.flags || []).length ? `<h4 class="fc-h4">Notes</h4><ul class="fc-ul">${n.flags.map((f) => `<li class="hint">${esc(f)}</li>`).join("")}</ul>` : ""}`;
    box.classList.remove("hidden");
    box.querySelector("#fc-close").onclick = (e) => { e.stopPropagation(); clearSelection(); };
    box.querySelectorAll(".fc-jump").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const target = fc.nodes.find((x) => x.id === b.dataset.n);
        if (target) {
          el(`fcn-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          select(target.id);
        }
      };
    });
    box.onclick = (e) => e.stopPropagation();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selected) clearSelection();
  });
})();
