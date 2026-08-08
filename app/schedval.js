"use strict";
/* Schedule Validation — pick any F/S or flight section of the phase and see the
   prerequisites a student must have completed: Lessons -> Ground exam -> F/S -> Flight.
   Logic (per user spec): walk the flow BACKWARDS through explicit edges (nearest
   ancestor of each kind wins); where the syllabus draws no edge, fall back to the
   sequential order of the same category's chain. Anything with no predecessor at
   all is reported explicitly as not defined. */

(() => {
  const ROWS = [
    { key: "theory", label: "Lessons", kinds: ["theory"] },
    { key: "exam", label: "Ground exam", kinds: ["ground_exam"] },
    { key: "sim", label: "F/S (Simulator)", kinds: ["sim"] },
    { key: "flight", label: "Flight", kinds: ["flight", "checkride"] },
  ];
  const st = { fc: null, open: false };
  const $id = (x) => document.getElementById(x);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };

  const CSS = `
  .sv-modal{position:fixed;inset:0;background:rgba(5,10,18,.78);display:flex;align-items:center;justify-content:center;z-index:62}
  .sv-modal.hidden{display:none}
  .sv-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;width:min(720px,94vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.55)}
  .sv-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
  .sv-head h3{font-size:15px;margin-right:auto}
  .sv-body{padding:14px 16px 18px;overflow-y:auto}
  .sv-sel{width:100%;padding:8px 10px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:Consolas,monospace}
  .sv-grid{display:flex;flex-direction:column;gap:10px;margin-top:14px}
  .sv-row{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 12px;background:var(--panel-2)}
  .sv-row.missing{border-left-color:var(--warn)}
  .sv-k{flex:0 0 130px;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding-top:3px}
  .sv-v{flex:1}
  .sv-chip{display:inline-block;font-family:Consolas,monospace;font-size:13px;font-weight:700;color:var(--accent);margin-right:8px}
  .sv-name{font-size:12.5px;color:var(--text)}
  .sv-meta{font-size:11.5px;color:var(--muted);margin-top:2px;font-family:Consolas,monospace}
  .sv-miss{font-size:12.5px;color:var(--warn)}
  .sv-note{margin-top:12px;font-size:11.5px;color:var(--muted)}
  .sv-btn{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:4px 11px;font-size:12px;cursor:pointer}
  .sv-btn:hover{border-color:var(--accent);color:var(--text)}
  `;

  function ensureDom() {
    if ($id("sv-modal")) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const wrap = document.createElement("div");
    wrap.id = "sv-modal";
    wrap.className = "sv-modal hidden";
    wrap.innerHTML = `
      <div class="sv-box">
        <div class="sv-head">
          <h3>Schedule validation — prerequisites</h3>
          <button class="sv-btn" id="sv-close">✕ Close</button>
        </div>
        <div class="sv-body">
          <select class="sv-sel" id="sv-sel"></select>
          <div class="sv-grid" id="sv-grid"><p class="sv-note">Pick a section to see what must precede it.</p></div>
          <p class="sv-note">Rule: nearest predecessor of each kind, walking the stage flow backwards
          (explicit links first, then the category's own sequence). Each requirement carries its own
          predecessors in turn. Anything the syllabus never defines is stated as such.</p>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) closeSv(); });
    $id("sv-close").onclick = closeSv;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.open) closeSv(); });
    $id("sv-sel").onchange = () => renderResult($id("sv-sel").value);
  }
  function closeSv() { st.open = false; $id("sv-modal").classList.add("hidden"); }

  async function loadFc() {
    if (st.fc) return;
    const r = await fetch("../data/flowchart.json", { cache: "no-store" });
    st.fc = await r.json();
    st.rev = {};
    for (const e of st.fc.edges || []) (st.rev[e.to] = st.rev[e.to] || []).push(e.from);
    st.idx = new Map(st.fc.nodes.map((n, i) => [n.id, i]));
  }

  function fillSelect() {
    const sel = $id("sv-sel");
    const groups = {};
    for (const n of st.fc.nodes) {
      if (!["sim", "flight", "checkride"].includes(n.kind)) continue;
      const g = `${(n.category || "general").replace("_", " ")} — ${n.kind === "sim" ? "F/S" : "T-6A"}`;
      (groups[g] = groups[g] || []).push(n);
    }
    sel.innerHTML = `<option value="">— select a section —</option>` +
      Object.entries(groups).map(([g, ns]) =>
        `<optgroup label="${esc(g)}">${ns.map((n) =>
          `<option value="${esc(n.id)}">${esc(n.label)} — ${esc(n.name ?? "")}</option>`).join("")}</optgroup>`).join("");
  }

  /* Nearest ancestor of each kind: BFS over reverse edges; fallback = previous
     same-category node of that kind in the canonical node order. */
  function prerequisites(id) {
    const found = {};
    const seen = new Set([id]);
    let frontier = [id];
    while (frontier.length && Object.keys(found).length < ROWS.length) {
      const next = [];
      for (const cur of frontier) {
        for (const p of st.rev[cur] || []) {
          if (seen.has(p)) continue;
          seen.add(p);
          next.push(p);
          const node = st.fc.nodes[st.idx.get(p)];
          if (!node) continue;
          for (const row of ROWS) {
            if (!found[row.key] && row.kinds.includes(node.kind)) found[row.key] = { node, via: "flow" };
          }
        }
      }
      frontier = next;
    }
    // sequence fallback within the same category
    const x = st.fc.nodes[st.idx.get(id)];
    const xi = st.idx.get(id);
    for (const row of ROWS) {
      if (found[row.key]) continue;
      for (let i = xi - 1; i >= 0; i--) {
        const n = st.fc.nodes[i];
        if (!row.kinds.includes(n.kind)) continue;
        if (n.category && x.category && n.category !== x.category) continue;
        found[row.key] = { node: n, via: "sequence" };
        break;
      }
    }
    return found;
  }

  function renderResult(id) {
    const grid = $id("sv-grid");
    if (!id) { grid.innerHTML = `<p class="sv-note">Pick a section to see what must precede it.</p>`; return; }
    const x = st.fc.nodes[st.idx.get(id)];
    const pre = prerequisites(id);
    grid.innerHTML = ROWS.map((row) => {
      // don't require a predecessor of the node's own kind band beyond itself? (a flight's flight-prereq is meaningful; keep all rows)
      const hit = pre[row.key];
      if (hit) {
        const n = hit.node;
        const hrs = n.hours_total != null ? `${n.hours_total} h` : (n.periods != null ? `${n.periods} periods` : "");
        return `<div class="sv-row">
          <div class="sv-k">${row.label}</div>
          <div class="sv-v">
            <span class="sv-chip">${esc(n.label)}</span><span class="sv-name">${esc(n.name ?? "")}</span>
            <div class="sv-meta">${esc(hrs)}${hit.via === "sequence" ? " · inferred from the category sequence" : ""}${n.checkride ? " · checkride" : ""}</div>
          </div>
        </div>`;
      }
      return `<div class="sv-row missing">
        <div class="sv-k">${row.label}</div>
        <div class="sv-v"><span class="sv-miss">Not defined in the syllabus before ${esc(x.label)}.</span></div>
      </div>`;
    }).join("");
  }

  window.openSchedVal = async () => {
    ensureDom();
    await loadFc();
    fillSelect();
    st.open = true;
    $id("sv-modal").classList.remove("hidden");
  };

  // attach to the flowchart toolbar button when present
  const hook = () => {
    const b = $id("fc-schedval-btn");
    if (b && !b._svWired) { b._svWired = true; b.onclick = () => window.openSchedVal(); }
  };
  document.addEventListener("DOMContentLoaded", hook);
  hook();
  setTimeout(hook, 1500);
})();
