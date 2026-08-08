"use strict";
/* Schedule Validation — pick ANY single sortie of the phase (F/S or flight) and
   see what the syllabus requires before it: Lessons → Ground exam → F/S → Flight.

   MODEL (data/flowchart2.json, schema flowchart-v2)
     · nodes  = the 133 sorties + the 20 ground / exam groups, addressed by uid
                ("s:I4701" / "g:FO190") — 13 ids exist as BOTH a group and a
                sortie, so a bare id is never used as a key.
     · edges  = the 174 sortie-level edges + ground_chain_edges, MERGED on
                (from,to): the same pair is written twice with a different kind
                (e.g. prereq + ground_entry) and counts once.

   RULE
     1. EXPLICIT edges of the sortie itself (prereq · feed · before ·
        ground_entry) come first, quoted verbatim.
     2. The drawn SEQUENCE predecessor is reported as "Position in sequence".
     3. Rows still empty are filled by walking the flow BACKWARDS (nearest
        ancestor of each kind). A transitive F/S or Flight ancestor only counts
        inside the sortie's own category — ground academics and exams cascade
        across categories because they gate the whole phase.
     4. Where the syllabus draws no edge at all: previous sortie of the same
        Training Section, else the last sortie of the preceding section of the
        category ("inferred from the category sequence").
     5. Anything never defined is stated as such.                             */

(() => {
  const ROWS = [
    { key: "theory", label: "Lessons" },
    { key: "exam",   label: "Ground exam" },
    { key: "fs",     label: "F/S (Simulator)" },
    { key: "flight", label: "Flight" },
  ];
  const EXPLICIT = ["prereq", "feed", "before", "ground_entry"];
  const SEQUENCE = ["sequence", "ground_sequence"];
  const TRACK_LABEL = {
    contact: "Contact", instrument: "Instrument", formation: "Formation",
    vfr_navigation: "VFR Navigation", shared: "Shared ground",
  };

  const st = { fc: null, open: false, node: new Map(), rev: new Map(), fwd: new Map(), byGroup: new Map(), groups: [] };
  const $id = (x) => document.getElementById(x);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const fmtH = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");

  const CSS = `
  .sv-modal{position:fixed;inset:0;background:rgba(5,10,18,.78);display:flex;align-items:center;justify-content:center;z-index:62}
  .sv-modal.hidden{display:none}
  .sv-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;width:min(760px,94vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.55)}
  .sv-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
  .sv-head h3{font-size:15px;margin-right:auto}
  .sv-body{padding:14px 16px 18px;overflow-y:auto}
  .sv-sel{width:100%;padding:8px 10px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:Consolas,monospace}
  .sv-target{margin-top:12px;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--panel-2)}
  .sv-target h4{font-family:Consolas,monospace;font-size:14px;color:var(--accent);display:inline-block;margin-right:8px}
  .sv-target .sv-name{font-size:12.5px}
  .sv-grid{display:flex;flex-direction:column;gap:10px;margin-top:12px}
  .sv-row{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 12px;background:var(--panel-2)}
  .sv-row.missing{border-left-color:var(--warn)}
  .sv-row.explicit{border-left-color:var(--good)}
  .sv-k{flex:0 0 130px;font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);padding-top:3px}
  .sv-v{flex:1;min-width:0}
  .sv-hit{margin-bottom:8px}
  .sv-hit:last-child{margin-bottom:0}
  .sv-chip{display:inline-block;font-family:Consolas,monospace;font-size:13px;font-weight:700;color:var(--accent);margin-right:8px}
  .sv-name{font-size:12.5px;color:var(--text)}
  .sv-meta{font-size:11.5px;color:var(--muted);margin-top:2px;font-family:Consolas,monospace}
  .sv-vb{font-size:12px;color:var(--text);opacity:.9;border-left:2px solid var(--line);padding-left:8px;margin-top:4px;font-style:italic}
  .sv-src{font-size:11px;color:var(--muted);margin-top:2px;font-family:Consolas,monospace}
  .sv-seq{font-size:12px;color:var(--muted);margin-top:6px;padding-top:6px;border-top:1px dashed var(--line)}
  .sv-seq b{color:var(--text);font-family:Consolas,monospace}
  .sv-tag{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.6px;border:1px solid var(--line);border-radius:999px;padding:0 6px;margin-left:6px;color:var(--muted)}
  .sv-tag.ok{color:var(--good);border-color:var(--good)}
  .sv-tag.night{color:var(--bad);border-color:var(--bad)}
  .sv-tag.ckr{color:var(--warn);border-color:var(--warn)}
  .sv-miss{font-size:12.5px;color:var(--warn)}
  .sv-note{margin-top:12px;font-size:11.5px;color:var(--muted);line-height:1.5}
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
          <h3>Schedule validation — prerequisites per sortie</h3>
          <button class="sv-btn" id="sv-close">✕ Close</button>
        </div>
        <div class="sv-body">
          <select class="sv-sel" id="sv-sel"></select>
          <div class="sv-grid" id="sv-grid"><p class="sv-note">Pick a sortie to see what must precede it.</p></div>
          <p class="sv-note">Rule: the sortie's own explicit restrictions first (quoted verbatim), then the
          drawn sequence, then the nearest ancestor of each kind walking the stage flow backwards. Where the
          syllabus draws nothing, the order is inferred from the category's own sequence and labelled as such.
          Anything the syllabus never defines is stated as not defined.</p>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) closeSv(); });
    $id("sv-close").onclick = closeSv;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.open) closeSv(); });
    $id("sv-sel").onchange = () => renderResult($id("sv-sel").value);
  }
  function closeSv() { st.open = false; $id("sv-modal").classList.add("hidden"); }

  /* ── ΦΟΡΤΩΣΗ + ΔΕΙΚΤΗΣ ─────────────────────────────────────────────────── */
  async function loadFc() {
    if (st.fc) return;
    const r = await fetch("../data/flowchart2.json", { cache: "no-store" });
    st.fc = await r.json();
    const fc = st.fc;
    st.groups = fc.groups || [];
    for (const g of st.groups) st.node.set(g.uid, g);
    for (const s of (fc.sorties || [])) {
      st.node.set(s.uid, s);
      if (!st.byGroup.has(s.group)) st.byGroup.set(s.group, []);
      st.byGroup.get(s.group).push(s);
    }
    // ΕΝΩΣΗ των διπλών (from,to): ίδιο ζεύγος, διαφορετικό kind = μία σχέση.
    const seen = new Map();
    for (const e of [].concat(fc.edges || [], fc.ground_chain_edges || [])) {
      if (!st.node.has(e.from_ref) || !st.node.has(e.to_ref)) continue;
      const key = e.from_ref + ">" + e.to_ref;
      let m = seen.get(key);
      if (!m) {
        m = { from: e.from_ref, to: e.to_ref, kinds: [], ev: [] };
        seen.set(key, m);
        if (!st.rev.has(e.to_ref)) st.rev.set(e.to_ref, []);
        st.rev.get(e.to_ref).push(m);
        if (!st.fwd.has(e.from_ref)) st.fwd.set(e.from_ref, []);
        st.fwd.get(e.from_ref).push(m);
      }
      if (m.kinds.indexOf(e.kind) < 0) m.kinds.push(e.kind);
      m.ev.push(e);
    }
  }

  const isSortie = (uid) => String(uid).charAt(0) === "s";
  const nodeOf = (uid) => st.node.get(uid) || null;
  const labelOf = (n) => (n.label_verbatim || n.label || n.id);
  const trackOf = (n) => n.track || "shared";
  const has = (arr, list) => arr.some((k) => list.indexOf(k) >= 0);

  function rowOf(n) {
    if (!isSortie(n.uid)) {
      if (n.kind === "theory") return "theory";
      if (n.kind === "ground_exam") return "exam";
      return null;                       // F/S & flight groups never sit on an edge
    }
    return n.band === "fs" ? "fs" : "flight";
  }

  /* Fallback: προηγούμενο sortie ίδιου section, αλλιώς το τελευταίο sortie του
     προηγούμενου section της ίδιας κατηγορίας/ζώνης.                         */
  function fallbackPred(uid) {
    const s = nodeOf(uid);
    if (!s || !isSortie(uid)) return null;
    const sibs = st.byGroup.get(s.group) || [];
    const i = sibs.indexOf(s);
    if (i > 0) return { node: sibs[i - 1], how: "prev-in-section", group: s.group };
    const line = st.groups.filter((g) => g.band === s.band && g.track === s.track);
    const gi = line.map((g) => g.id).indexOf(s.group);
    if (gi <= 0) return null;
    const prevG = line[gi - 1];
    const list = st.byGroup.get(prevG.id) || [];
    if (!list.length) return null;
    return { node: list[list.length - 1], how: "prev-section", group: prevG.id, siblings: list };
  }

  /* Αντίστροφες ακμές· αν ο κόμβος δεν έχει καμία, μπαίνει η εικονική ακμή
     της σειράς της κατηγορίας ώστε η αναδρομή να μη σταματά στο κενό.        */
  function revOf(uid) {
    const r = st.rev.get(uid);
    if (r && r.length) return r;
    const fb = fallbackPred(uid);
    if (!fb) return [];
    return [{ from: fb.node.uid, to: uid, kinds: ["inferred"], ev: [], fb: fb }];
  }

  function prerequisites(uid) {
    const tgt = nodeOf(uid);
    const cat = trackOf(tgt);
    const out = { explicit: {}, seq: null, soft: {}, bfs: {} };

    for (const m of revOf(uid)) {
      const src = nodeOf(m.from);
      if (!src) continue;
      const row = rowOf(src);
      if (has(m.kinds, SEQUENCE) && !out.seq) out.seq = { node: src, m: m, row: row };
      if (!row) continue;
      if (has(m.kinds, EXPLICIT)) {
        (out.explicit[row] = out.explicit[row] || []).push({ node: src, m: m, via: "explicit" });
      } else if (has(m.kinds, SEQUENCE)) {
        if (!out.soft[row]) out.soft[row] = { node: src, m: m, via: "sequence" };
      } else if (m.kinds.indexOf("inferred") >= 0) {
        if (!out.soft[row]) out.soft[row] = { node: src, m: m, via: "inferred", fb: m.fb };
      }
    }

    // BFS ανάποδα — ο κοντινότερος πρόγονος κάθε είδους
    const seen = new Set([uid]);
    let frontier = [uid], depth = 0;
    while (frontier.length && depth < 60) {
      depth++;
      const next = [];
      for (const cur of frontier) {
        for (const m of revOf(cur)) {
          if (seen.has(m.from)) continue;
          seen.add(m.from);
          next.push(m.from);
          if (depth < 2) continue;                       // το βάθος 1 μετρήθηκε ήδη
          const src = nodeOf(m.from);
          if (!src) continue;
          const row = rowOf(src);
          if (!row || out.explicit[row] || out.soft[row] || out.bfs[row]) continue;
          /* Οι ρητοί περιορισμοί μιας ΑΛΛΗΣ εξόδου δεν κληρονομούνται από
             κατηγορία σε κατηγορία· τα ground academics/exams κληρονομούνται
             γιατί είναι πύλες ολόκληρου του σταδίου.                        */
          if ((row === "fs" || row === "flight") && trackOf(src) !== cat && trackOf(src) !== "shared") continue;
          out.bfs[row] = { node: src, m: m, via: "flow", depth: depth };
        }
      }
      frontier = next;
    }

    const res = {};
    for (const r of ROWS) {
      const k = r.key;
      if (out.explicit[k]) res[k] = out.explicit[k];
      else if (out.soft[k]) res[k] = [out.soft[k]];
      else if (out.bfs[k]) res[k] = [out.bfs[k]];
      else res[k] = null;
    }
    return { rows: res, seq: out.seq };
  }

  /* ── SELECT: ΜΕΜΟΝΩΜΕΝΕΣ ΕΞΟΔΟΙ, ομαδοποιημένες ανά track / section ───── */
  function fillSelect() {
    const sel = $id("sv-sel");
    const parts = [`<option value="">— select a sortie —</option>`];
    for (const g of st.groups) {
      if (g.band !== "fs" && g.band !== "flights") continue;
      const list = st.byGroup.get(g.id) || [];
      if (!list.length) continue;
      const head = (TRACK_LABEL[g.track] || g.track) + " · " + (g.band === "fs" ? "F/S" : "FLIGHTS")
        + " · " + g.id + (g.name ? " — " + g.name : "");
      parts.push(`<optgroup label="${esc(head)}">` + list.map((s) => {
        const tag = (s.checkride ? " ◆" : "") + (s.first_solo ? " ★" : (s.solo_candidate ? " ☆" : "")) + (s.night ? " ☾" : "");
        return `<option value="${esc(s.uid)}">${esc(labelOf(s) + tag + " — " + (s.name || ""))}</option>`;
      }).join("") + `</optgroup>`);
    }
    sel.innerHTML = parts.join("");
  }

  /* ── ΕΜΦΑΝΙΣΗ ─────────────────────────────────────────────────────────── */
  function tags(n) {
    let h = "";
    if (n.checkride) h += `<span class="sv-tag ckr">checkride</span>`;
    if (n.first_solo) h += `<span class="sv-tag ok">1st solo</span>`;
    else if (n.solo_candidate) h += `<span class="sv-tag ok">solo candidate</span>`;
    if (n.night) h += `<span class="sv-tag night">night</span>`;
    return h;
  }

  function metaOf(n) {
    const bits = [];
    if (isSortie(n.uid)) {
      if (n.hours != null) bits.push(fmtH(n.hours) + " h");
      bits.push("section " + n.group);
      bits.push(n.band === "fs" ? "F/S" : "flight");
    } else {
      if (n.periods != null) bits.push(n.periods + (n.periods === 1 ? " period" : " periods"));
      if (n.periods_foreign != null) bits.push(n.periods_foreign + " foreign");
      bits.push(n.kind === "ground_exam" ? "ground exam ≥80%" : "ground academics");
    }
    bits.push(TRACK_LABEL[trackOf(n)] || trackOf(n));
    return bits.join(" · ");
  }

  function viaText(hit) {
    if (hit.via === "explicit") return "explicit restriction · " + hit.m.kinds.join(" + ");
    if (hit.via === "sequence") return "position in sequence — the step drawn immediately before it";
    if (hit.via === "inferred") {
      const fb = hit.fb || {};
      if (fb.how === "prev-in-section") return "previous sortie of section " + fb.group + " · inferred from the category sequence";
      const sib = (fb.siblings || []).map(labelOf).join(" · ");
      return "last sortie of the preceding section " + fb.group + (sib ? " (" + sib + ")" : "")
        + " · inferred from the category sequence";
    }
    return "from the stage flow · " + hit.depth + " step" + (hit.depth === 1 ? "" : "s") + " back";
  }

  function hitHtml(hit) {
    const n = hit.node;
    let vb = "";
    const seen = {};
    for (const e of (hit.m.ev || [])) {
      if (!e.verbatim || seen[e.verbatim]) continue;
      seen[e.verbatim] = 1;
      vb += `<p class="sv-vb">“${esc(e.verbatim)}”</p>`
          + (e.source ? `<p class="sv-src">📄 ${esc(e.source)}</p>` : "");
    }
    return `<div class="sv-hit">
      <span class="sv-chip">${esc(labelOf(n))}</span><span class="sv-name">${esc(n.name || "")}</span>${tags(n)}
      <div class="sv-meta">${esc(metaOf(n))} · ${esc(viaText(hit))}</div>
      ${vb}
    </div>`;
  }

  function renderResult(uid) {
    const grid = $id("sv-grid");
    if (!uid || !nodeOf(uid)) {
      grid.innerHTML = `<p class="sv-note">Pick a sortie to see what must precede it.</p>`;
      return;
    }
    const x = nodeOf(uid);
    const g = st.node.get("g:" + x.group);
    const { rows, seq } = prerequisites(uid);

    const head = `<div class="sv-target">
      <h4>${esc(labelOf(x))}</h4><span class="sv-name">${esc(x.name || "")}</span>${tags(x)}
      <div class="sv-meta">${esc(metaOf(x))}${g && g.name ? " · " + esc(g.name) : ""}${x.page_pdf ? " · PDF p." + esc(String(x.page_pdf)) : ""}</div>
    </div>`;

    const body = ROWS.map((r) => {
      const hits = rows[r.key];
      const seqHere = seq && seq.row === r.key ? seq : null;
      const seqIsPrimary = !!(seqHere && hits && hits.length === 1 && hits[0].node === seqHere.node);
      const seqLine = seqHere && !seqIsPrimary
        ? `<div class="sv-seq">Position in sequence: after <b>${esc(labelOf(seqHere.node))}</b></div>` : "";
      if (!hits) {
        return `<div class="sv-row missing">
          <div class="sv-k">${esc(r.label)}</div>
          <div class="sv-v"><span class="sv-miss">Not defined in the syllabus before ${esc(labelOf(x))}.</span>${seqLine}</div>
        </div>`;
      }
      const cls = hits[0].via === "explicit" ? " explicit" : "";
      return `<div class="sv-row${cls}">
        <div class="sv-k">${esc(r.label)}</div>
        <div class="sv-v">${hits.map(hitHtml).join("")}${seqLine}</div>
      </div>`;
    }).join("");

    grid.innerHTML = head + `<div class="sv-grid">${body}</div>`;
  }

  window.openSchedVal = async (uid) => {
    ensureDom();
    await loadFc();
    fillSelect();
    st.open = true;
    $id("sv-modal").classList.remove("hidden");
    if (uid && nodeOf(uid)) { $id("sv-sel").value = uid; renderResult(uid); }
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
