"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   DESCRIPTION — the twin of Remarks (Round 16)
   ──────────────────────────────────────────────────────────────────────────
   Remarks builds ONE LINE for ONE ITEM. Description builds THE WHOLE BLOCK
   for ONE SORTIE: the profile sentence, the closing, and the «#39. (3) -> (3):»
   emergency-procedures line — one copy-ready UPPERCASE block for the
   squadron's gradesheet software.

   THE ONE RULE THAT DECIDES EVERYTHING (data/descriptions.json → note):
     A PARENTHESIS IN THE PRINTED TEMPLATE MEANS «OPTIONAL», NOT «PRINT THESE
     BRACKETS». The squadron's own photos prove it — the template writes
     "(ELP)" and the filled sample writes "ELP". So every optional element
     renders WITHOUT brackets when it is on, and vanishes when it is off.

   Everything the four photographed templates do NOT prove carries
   status:"draft" in the data and shows a visible «DRAFT — proposed variant»
   marker here. Nothing is ever silently invented.

   Data (all lazy, all cached, all bundled in the offline build):
     data/descriptions.json  grammar: templates · outcomes · EP line · families
                             · categories (item lists) · 133 per-sortie preselects
     data/areas.json         the working areas (closed list + free text)
     data/routes.json        the CPM routes  (closed list + free text)
     data/ep_list.json       the 71 T-6A emergency procedures (the random pool)
     data/flowchart2.json    the sortie roster — the same source the Flowchart
                             and Schedule Validation read, never a second copy

   FEEDBACK rides the house channel unchanged: an <a href=".../issues/new?…">
   in exactly the shape tools/build_offline.py:parseFb() already understands,
   so the closed-network build's local feedback dialog picks it up with ZERO
   builder changes (title "Feedback: <id>", body "**Item:** … · **File:** `…`"
   and a "> " quote of the rendered block).
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const REPO = "Nickkoro21/phase2-remarks";
  const $ = (id) => document.getElementById(id);
  /* Round 16b — the house escaper (currency.js / flowchart.js / scheduler.js all
     carry the same five-character map). The Round 16 body was
     `div.textContent -> innerHTML`, which escapes & < > but leaves BOTH quote
     characters alone: a `"` typed into any free-text blank walked straight out of
     the value="…" it is interpolated into and ate the rest of the input. */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const up = (s) => String(s == null ? "" : s).trim().toUpperCase();

  const CAT_ORDER = ["contact", "instrument", "formation", "vfr_navigation"];

  const st = {
    ready: false, booted: false, loading: false,
    data: null, areas: null, routes: null, eps: null, fc: null, mif: null, flow: null,
    cat: null, band: "flights", sortie: null, tpl: null, fam: null, hint: null,
    q: "",
    head: "sortie",
    on: {}, choice: {}, slot: {}, free: {}, customs: [], nCustom: 0, apprCount: 2,
    outcome: "standard", grade: "VERY GOOD", pct: "",
    ramp: null, soloNext: null,
    tailOn: {}, itemsBy: { fail: [], solo: [] }, seeded: {},
    ep: { on: true, d: "3", a: "3", picks: [], short: false },
    flash: "",
  };

  /* ── data ────────────────────────────────────────────────────────────── */

  async function load() {
    if (st.ready || st.loading) return;
    st.loading = true;
    try {
      const get = async (p) => {
        const r = await fetch(p, { cache: "no-store" });
        if (!r.ok) throw new Error(p);
        return r.json();
      };
      const [d, a, r, e, f, m6, mfs] = await Promise.all([
        get("../data/descriptions.json"), get("../data/areas.json"),
        get("../data/routes.json"), get("../data/ep_list.json"),
        get("../data/flowchart2.json"),
        get("../data/mif/t6a.json"), get("../data/mif/fs.json"),
      ]);
      st.data = d;
      st.areas = a.areas || [];
      st.routes = r.routes || [];
      st.eps = e.procedures || [];
      st.fc = f;
      st.mif = { flights: m6, fs: mfs };
      buildFlow();
      st.ready = true;
    } finally { st.loading = false; }
  }

  /* ── THE FLOW INDEX — Round 16b, the two user addenda of 20/08/2026 ──────
     The MIF tables (data/mif/t6a.json = aircraft, data/mif/fs.json = F/S) are
     the SAME files mifchart.js and app.js already read and the builder already
     bundles: no second copy of a MIF cell is made here, the tables are read.

     Their COLUMNS are the training sections, printed in syllabus order, so the
     concatenated column list of a category IS that category's section order
     (CONTACT aircraft spans two printed tables — pre-solo then post-solo — and
     they concatenate in file order). Sorties are then ordered section-column
     first, sortie code second, which is the flow order the Training Flow Chart
     draws; it differs from the raw flowchart2 array in exactly one place
     (I4701 is printed beside I4603 and lands before it in the array, while its
     own MIF column sits after I4601-03).

     Per band+category the index holds:
       cols   the ordered section columns
       ep     the EP item's MIF per column        → A1, the desired code
       items  every item's MIF per column         → A2, what may be cleared
       order  the sorties of that band+category in flow order  → both */
  function buildFlow() {
    const flow = {};
    for (const band of ["flights", "fs"]) {
      const src = st.mif[band];
      for (const tb of (src.tables || [])) {
        const cat = st.data.categories[tb.category];
        if (!cat) continue;
        const key = band + "." + tb.category;
        const f = flow[key] || (flow[key] = { cols: [], ep: {}, items: {}, order: [] });
        const epRow = tb.items.find((x) => x.sn === cat.ep_item);
        for (const c of tb.columns) {
          f.cols.push(c.unit);
          f.ep[c.unit] = epRow ? epRow.codes[c.unit] : null;
        }
        for (const it of tb.items) {
          const m = f.items[it.sn] || (f.items[it.sn] = {});
          for (const c of tb.columns) m[c.unit] = it.codes[c.unit];
        }
      }
    }
    for (const id of Object.keys(st.data.sorties)) {
      const h = st.data.sorties[id];
      const f = flow[h.band + "." + h.cat];
      if (f) f.order.push(id);
    }
    for (const k of Object.keys(flow)) {
      const f = flow[k];
      f.order.sort((a, b) => {
        const ia = f.cols.indexOf(st.data.sorties[a].section);
        const ib = f.cols.indexOf(st.data.sorties[b].section);
        return ia !== ib ? ia - ib : (a < b ? -1 : (a > b ? 1 : 0));
      });
    }
    st.flow = flow;
  }

  const flowOf = (h) => (st.flow && h) ? st.flow[h.band + "." + h.cat] : null;

  /* A1 — «Για τα emergency procedures ο κωδικας θα ειναι οτι υπηρχε στην
     προηγουμενη ενοτητα … Στην τελευταια πτηση πρεπει να πιασει κωδικα τελους
     ενοτητας.» (user, 20/08/2026). So the DESIRED code of the «#N. (x) -> (y)»
     line does NOT ramp per sortie: every sortie of a section is preset to the EP
     item's MIF of the PREVIOUS section, and only the category's LAST FLIGHT is
     preset to the end-of-section MIF (the last column of the category).
     The first section of a category has no previous one — it presets to its own
     starting MIF. Hand-editable everywhere, both bands. */
  function epRamp(id) {
    const h = st.data.sorties[id];
    const f = flowOf(h);
    if (!f || !f.cols.length) {
      const own = h && h.ep_mif && h.ep_mif !== "null" ? String(h.ep_mif) : "3";
      return { preset: own, own: own, prevSec: null, prevCode: null,
               endSec: null, endCode: null, lastOfCat: false };
    }
    const i = f.cols.indexOf(h.section);
    const endSec = f.cols[f.cols.length - 1];
    const prevSec = i > 0 ? f.cols[i - 1] : null;
    const lastOfCat = f.order[f.order.length - 1] === id;
    const own = f.ep[h.section];
    const preset = lastOfCat ? f.ep[endSec] : (prevSec ? f.ep[prevSec] : f.ep[f.cols[0]]);
    return {
      preset: preset == null ? (own == null ? "3" : String(own)) : String(preset),
      own: own == null ? null : String(own),
      prevSec: prevSec, prevCode: prevSec ? String(f.ep[prevSec]) : null,
      endSec: endSec, endCode: f.ep[endSec] == null ? null : String(f.ep[endSec]),
      lastOfCat: lastOfCat,
    };
  }

  /* A2 — «για πτησεις που επιτρεπεται solo στην επομενη πρεπει να γραφουμε οτι
     τον εξουσιοδοτουμε και ποια item μπορει να κανει στο solo» (user,
     20/08/2026). flowchart2 carries no node of kind «solo»: the syllabus marks a
     potential SOLO with a GREEN FRAME on the sortie itself, digitised as
     solo_candidate / first_solo (legend.notes of flowchart2 says exactly that).
     So «followed by a solo» = the NEXT sortie in flow order wears a green frame.
       · the current sortie is NOT itself green-framed → it is a DUAL before a
         SOLO: the clearance is auto-surfaced (outcome preset + banner);
       · the current sortie IS green-framed too (a run of candidates inside one
         section) → the app cannot know whether THIS one was flown dual or solo,
         so it only says so in a line and preselects nothing. */
  function soloNext(id) {
    const h = st.data.sorties[id];
    const f = flowOf(h);
    if (!f) return null;
    const i = f.order.indexOf(id);
    const nx = f.order[i + 1];
    if (!nx) return null;
    const g = (x) => {
      const s = (st.fc.sorties || []).find((y) => y.id === x);
      return !!(s && (s.solo_candidate || s.first_solo));
    };
    if (!g(nx)) return null;
    const n = st.data.sorties[nx] || {};
    return { next: nx, name: n.name || "", first: !!n.first_solo, self: g(id) };
  }

  /* A2, the picker — three levels: category (the item list) → training section
     (an item with NO MIF yet at this section never appears) → the flight (the
     empty cells of this very column are greyed «not planned»). `mif` is the
     STANDING desired level: the last non-empty cell up to and including this
     section, which is what 3-01 §21α reads off the previous grade sheets. */
  function itemLevels(h) {
    const f = flowOf(h);
    const cat = st.data.categories[h.cat];
    const out = [];
    if (!f) {
      for (const it of cat.items) out.push({ n: it.n, label: it.gs || it.label, mif: null, here: null });
      return out;
    }
    const i = f.cols.indexOf(h.section);
    for (const it of cat.items) {
      const row = f.items[it.n] || {};
      let standing = null;
      for (let j = 0; j <= i; j++) {
        const v = row[f.cols[j]];
        if (v != null) standing = String(v);
      }
      if (standing === null) continue;                 // no MIF yet — not offered
      const here = row[h.section];
      out.push({ n: it.n, label: it.gs || it.label, mif: standing,
                 here: here == null ? null : String(here) });
    }
    return out;
  }

  /* «2» is the minimum performance code that allows a maneuver to be flown solo
     (3-01 §28θ) — «E» and «0»/«1» are below it. */
  const soloReady = (code) => code === "2" || code === "3" || code === "4";

  /* ── number ranges — «#1-3, #5, #22-24, #34-38» ───────────────────────── */

  function ranges(nums) {
    const a = Array.from(new Set(nums)).map(Number).filter((n) => !isNaN(n)).sort((x, y) => x - y);
    const out = [];
    let i = 0;
    while (i < a.length) {
      let j = i;
      while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
      out.push(i === j ? String(a[i]) : a[i] + "-" + a[j]);
      i = j + 1;
    }
    return out;
  }

  /* "6-20,25-33,35" -> [6..20,25..33,35] */
  function expand(spec) {
    const out = [];
    for (const part of String(spec || "").split(",")) {
      const p = part.trim();
      if (!p) continue;
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
      if (m) { for (let n = +m[1]; n <= +m[2]; n++) out.push(n); }
      else if (/^\d+$/.test(p)) out.push(+p);
    }
    return out;
  }

  /* ── lists ────────────────────────────────────────────────────────────── */

  function listOf(name) {
    if (!name) return [];
    if (name === "areas") return st.areas.map((a) => ({ v: a.name, label: a.full }));
    if (name === "routes") return st.routes.map((r) => ({ v: r.n, label: r.label }));
    const l = st.data.lists[name];
    return l ? l.values.map((x) => ({ v: x.v, label: x.label || x.v, status: x.status })) : [];
  }

  /* ── the part model ───────────────────────────────────────────────────── */

  const pkey = (elKey, choiceId, p) =>
    elKey + "::" + (choiceId ? choiceId + "." : "") + (p.id || "");

  function slotVal(key, p) {
    if (!p.list) return up(st.free[key]);          // pure free-text blank (SID, custom)
    let v = st.slot[key];
    if (v === undefined) v = p.def !== undefined ? p.def : (p.empty ? "__none" : "");
    if (v === "__none") return "";
    if (v === "__free") return up(st.free[key]);
    return v;
  }

  function itemsText(fmt) {
    const rs = ranges(st.itemsBy[st.outcome === "fail" ? "fail" : "solo"] || []);
    if (!rs.length) return "#__";
    return fmt === "lead" ? "#" + rs.join(", ") : rs.map((x) => "#" + x).join(", ");
  }

  function partText(p, key) {
    if (p.t === "lit") return p.v;
    if (p.t === "items") return itemsText(p.fmt);
    const v = slotVal(key, p);
    if (!v) return p.empty ? "" : (p.ph || "____");
    return (p.pre || "") + v + (p.post || "");
  }

  function activeChoice(e) {
    if (!e.choice) return null;
    const id = st.choice[e._key] === undefined ? e.def : st.choice[e._key];
    return e.choice.find((c) => c.id === id) || e.choice[0];
  }

  function elParts(e) {
    const c = activeChoice(e);
    return c ? c.parts : (e.parts || []);
  }

  function elText(e) {
    const c = activeChoice(e);
    return elParts(e).map((p) => partText(p, pkey(e._key, c && c.id, p))).join("");
  }

  /* ── the profile: canon elements + repeats + custom elements ──────────── */

  function canonFlat() {
    const out = [];
    for (const e of st.tpl.profile) {
      if (e.kind === "repeat") {
        for (let i = 1; i <= st.apprCount; i++) {
          for (const b of e.block) {
            const on = (b.on_first !== undefined && i === 1) ? b.on_first : b.on;
            out.push(Object.assign({}, b, {
              _key: e.id + i + "." + b.id, _inst: i, _rep: e.id,
              _label: "#" + i + " " + b.label, on,
            }));
          }
        }
      } else {
        out.push(Object.assign({}, e, { _key: e.id, _label: e.label }));
      }
    }
    return out;
  }

  function profileEls() {
    const base = canonFlat();
    /* splice from the back so earlier positions stay valid; on a tie the one
       added LAST is spliced first, so two customs at the same position keep the
       order they were typed in. */
    const cs = st.customs.map((c, i) => Object.assign({ _i: i }, c))
      .sort((a, b) => (b.pos - a.pos) || (b._i - a._i));
    for (const c of cs) {
      base.splice(Math.max(0, Math.min(base.length, c.pos)), 0, {
        id: c.key, _key: c.key, _custom: true, opt: true, on: true,
        _label: up(st.free[c.key + "::txt"]) || "CUSTOM",
        status: "draft", parts: [{ t: "slot", id: "txt", list: null, free: true, ph: "CUSTOM TEXT" }],
      });
    }
    return base;
  }

  /* post = the sentences that follow the profile («__ OUT - __ BACK.», «SP
     OCCUPIED REAR COCKPIT.»). Same element shape, so they get the same _key. */
  function postEls() {
    return (st.tpl.post || []).map((e) => Object.assign({}, e, { _key: e.id, _label: e.label }));
  }

  const isOn = (e) => (st.on[e._key] === undefined ? !!e.on : !!st.on[e._key]);

  function joinEls(els) {
    if (!els.length) return "";
    let out = elText(els[0]);
    for (let i = 1; i < els.length; i++) {
      const sep = els[i].join || (i === els.length - 1 ? " & " : ", ");
      out += sep + elText(els[i]);
    }
    return out + ".";
  }

  const dot = (s) => (/[.!?]\s*$/.test(s) ? s : s + ".");

  function headText() {
    const h = st.tpl.head;
    if (!h) return "";
    const v = h.variants.find((x) => x.id === st.head);
    return v ? v.text : "";
  }

  const outcomeObj = () => st.data.outcomes.find((o) => o.id === st.outcome) || st.data.outcomes[0];

  const tailKey = (t) => "out." + st.outcome + "." + t.id;
  const tailIsOn = (t) => (st.tailOn[tailKey(t)] === undefined ? !!t.on : !!st.tailOn[tailKey(t)]);

  function overallText() {
    const o = outcomeObj();
    if (o.overall_override) return o.overall_override;
    const g = o.force_grade || st.grade;
    let s = st.tpl.overall.replace("{grade}", g);
    if (st.pct !== "") s = s.replace(/\.$/, " (" + st.pct + "%).");
    return s;
  }

  function tailSentences() {
    const o = outcomeObj();
    return (o.tail || []).filter(tailIsOn).map((t) =>
      dot(t.parts.map((p) => partText(p, "out." + o.id + "." + t.id + "::" + (p.id || ""))).join("")));
  }

  function descText() {
    const out = [];
    const h = headText();
    if (h) out.push(h);
    const pf = joinEls(profileEls().filter(isOn));
    if (pf) out.push(pf);
    for (const e of postEls()) if (isOn(e)) out.push(dot(elText(e)));
    out.push(st.tpl.graded);
    out.push(overallText());
    for (const s of tailSentences()) out.push(s);
    return out.join(" ");
  }

  function epNames() {
    return st.ep.picks.map((id) => {
      const p = st.eps.find((x) => x.id === id);
      if (!p) return id;
      return st.ep.short && p.short ? p.short : p.name;
    });
  }

  function epText() {
    if (!st.ep.on) return "";
    const names = epNames();
    if (!names.length) return "";
    const cat = st.data.categories[st.cat];
    return st.data.ep_line.fmt
      .replace("{n}", String(cat.ep_item))
      .replace("{d}", st.ep.d)
      .replace("{arrow}", st.data.arrow)
      .replace("{a}", st.ep.a)
      .replace("{list}", names.join(st.data.ep_line.sep));
  }

  function blockText() {
    const e = epText();
    return e ? descText() + "\n\n" + e : descText();
  }

  /* ── EP randomiser ────────────────────────────────────────────────────── */

  function rollEp() {
    const pool = st.eps;
    if (!pool.length) { st.ep.picks = []; return; }
    const range = st.data.ep_line.picks || [2, 3];
    const lo = range[0], hi = range[range.length - 1];
    const n = Math.min(pool.length, lo + Math.floor(Math.random() * (hi - lo + 1)));
    const bag = pool.slice();
    const picks = [];
    while (picks.length < n && bag.length) {
      picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0].id);
    }
    st.ep.picks = picks;
  }

  /* ── selection ────────────────────────────────────────────────────────── */

  function sortieList() {
    if (!st.cat) return [];
    const hints = st.data.sorties;
    const q = st.q.trim().toLowerCase();
    return (st.fc.sorties || [])
      .filter((s) => {
        const h = hints[s.id];
        if (!h || h.cat !== st.cat) return false;
        if (h.band !== st.band) return false;
        if (!q) return true;
        return (s.id + " " + (h.name || "") + " " + (h.section || "")).toLowerCase().includes(q);
      })
      .map((s) => Object.assign({}, st.data.sorties[s.id], { id: s.id, label: s.label_verbatim || s.id }));
  }

  function pickCategory(cat) {
    st.cat = cat;
    st.sortie = null; st.tpl = null; st.hint = null; st.fam = null;
    st.ramp = null; st.soloNext = null;
    st.q = "";
    render();
  }

  function pickBand(band) {
    st.band = band;
    st.sortie = null; st.tpl = null; st.hint = null; st.fam = null;
    st.ramp = null; st.soloNext = null;
    render();
  }

  function pickSortie(id) {
    const h = st.data.sorties[id];
    if (!h) return;
    const fam = st.data.families[h.family];
    st.sortie = id;
    st.hint = h;
    st.fam = fam;
    st.tpl = st.data.templates[fam.tpl];

    /* fresh composition state, then the preselects the research proved */
    st.on = {}; st.choice = {}; st.slot = {}; st.free = {};
    st.customs = []; st.nCustom = 0;
    st.apprCount = 2;
    st.tailOn = {}; st.itemsBy = { fail: [], solo: [] }; st.seeded = {};
    st.outcome = "standard"; st.pct = "";
    st.grade = "VERY GOOD";
    /* the opening sentence. Round 16b: the F/S test used to swallow the night
       test, so I3601 — the F/S night sortie — opened «INSTRUMENT F/S SORTIE.»
       while §6 of the spec promised the night wording. The combined variant
       exists now and is tried FIRST, in both the family override and here. */
    st.head = fam.head || st.tpl.head.def;
    const hasV = (v) => st.tpl.head.variants.some((x) => x.id === v);
    if (!fam.head) {
      if (h.band === "fs" && h.night && hasV("fs_night")) st.head = "fs_night";
      else if (h.band === "fs" && hasV("fs")) st.head = "fs";
      else if (h.night && hasV("night")) st.head = "night";
      else if (h.checkride && hasV("checkride")) st.head = "checkride";
    }

    if (fam.all_off) for (const e of canonFlat()) st.on[e._key] = false;
    if (fam.on) for (const k of Object.keys(fam.on)) st.on[k] = fam.on[k];
    if (fam.choice) for (const k of Object.keys(fam.choice)) st.choice[k] = fam.choice[k];

    /* per-sortie preselects the research derived, applied only where the family
       has not already spoken: take-off type · area-vs-route · low level · ELP ·
       end-of-block · the EP desired code (the MIF of that item in this column). */
    const has = (id) => st.tpl.profile.some((e) => e.id === id);
    if (has("to") && h.to && h.to !== "NONE") st.slot["to::to_type"] = h.to;
    if (has("work") && st.choice.work === undefined) {
      st.choice.work = String(h.work || "").indexOf("ROUTE") === 0 ? "route" : "area";
    }
    if (has("low") && st.on.low === undefined) st.on.low = h.work === "ROUTE_LOW";
    if (has("elp") && st.on.elp === undefined) st.on.elp = !!h.elp;
    st.tailOn["out.standard.eob"] = !!h.end_of_block;
    st.tailOn["out.solo.eob"] = !!h.end_of_block;

    /* A1 — the desired code is the PREVIOUS section's MIF for the EP item, and
       the end-of-section MIF on the category's last flight. The achieved code
       starts equal to it (both filled samples print «(3) -> (3)» / «(1) -> (1)»)
       and both stay hand-editable. */
    st.ramp = epRamp(id);
    const mif = st.ramp.preset;
    st.ep = { on: true, d: mif, a: mif, picks: [], short: false };

    /* A2 — a DUAL flown immediately before a green-framed SOLO must carry the
       authorization, so the clearance outcome is preset here and announced by
       the banner in buildHtml(). One click on «Standard» undoes it. */
    st.soloNext = soloNext(id);
    if (st.soloNext && !st.soloNext.self) st.outcome = "solo";

    rollEp();
    render();
  }

  /* Seed the SOLO picker ONCE, the first time the clearance sentence is shown.
     Once, not "whenever it is empty" — otherwise «clear» would be undone by the
     very next render, and an empty clearance is a legitimate state. */
  function seedItems(which) {
    if (which !== "solo" || st.seeded.solo) return;
    st.seeded.solo = true;
    const h = st.hint, cat = st.data.categories[st.cat];
    const banned = new Set(expand(h.not_planned).concat(cat.solo_forbidden || []));
    /* the seed can never reach outside the offered set (Round 16b, A2) */
    const offered = new Set(itemLevels(h).map((x) => x.n));
    st.itemsBy.solo = expand(h.solo_seed).filter((n) => !banned.has(n) && offered.has(n));
  }

  /* ── draft markers ────────────────────────────────────────────────────── */

  function draftNotes() {
    const out = [];
    if (st.fam && st.fam.draft) out.push(st.fam.draft);
    const h = st.tpl.head;
    const hv = h && h.variants.find((x) => x.id === st.head);
    if (hv && hv.status === "draft" && hv.why && out.indexOf(hv.why) < 0) out.push(hv.why);
    for (const e of profileEls()) {
      if (isOn(e) && e.status === "draft" && e.why && out.indexOf(e.why) < 0) out.push(e.why);
    }
    for (const e of postEls()) {
      if (isOn(e) && e.status === "draft" && e.why && out.indexOf(e.why) < 0) out.push(e.why);
    }
    const o = outcomeObj();
    if (o.status === "draft" && o.why && out.indexOf(o.why) < 0) out.push(o.why);
    if (profileEls().some((e) => isOn(e) && e._custom)) {
      out.push("This block carries CUSTOM wording that no printed template contains — check it "
             + "reads the way the squadron writes it before pasting.");
    }
    return out;
  }

  /* ── rendering: the interactive sentence ──────────────────────────────── */

  function slotHtml(p, key) {
    const ph = p.ph || "____";
    let sel = "";
    let cur = "__free";
    if (p.list) {
      cur = st.slot[key];
      if (cur === undefined) cur = p.def !== undefined ? p.def : (p.empty ? "__none" : "");
      const opts = [p.empty
        ? '<option value="__none"' + (cur === "__none" ? " selected" : "") + ">" + esc(p.empty) + "</option>"
        : '<option value=""' + (cur === "" ? " selected" : "") + ">" + esc(ph) + "</option>"];
      for (const o of listOf(p.list)) {
        opts.push('<option value="' + esc(o.v) + '"' + (o.v === cur ? " selected" : "") + ">"
          + esc(o.label) + (o.status === "draft" ? " ·draft" : "") + "</option>");
      }
      if (p.free) opts.push('<option value="__free"' + (cur === "__free" ? " selected" : "") + ">✎ type…</option>");
      sel = '<select class="desc-slot" data-slot="' + esc(key) + '">' + opts.join("") + "</select>";
    }
    const inp = cur === "__free"
      ? '<input class="desc-freein" type="text" data-free="' + esc(key) + '" value="'
        + esc(st.free[key] || "") + '" placeholder="' + esc(ph) + '" size="'
        + Math.max(10, ph.length) + '" spellcheck="false" autocomplete="off">'
      : "";
    return '<span class="desc-slotwrap">' + sel + inp + "</span>";
  }

  function partHtml(p, key) {
    if (p.t === "lit") return esc(p.v);
    if (p.t === "items") return '<b class="desc-items">' + esc(itemsText(p.fmt)) + "</b>";
    return slotHtml(p, key);
  }

  function elHtml(e) {
    const c = activeChoice(e);
    let inner = "";
    if (e.choice) {
      inner += '<select class="desc-slot desc-choice" data-choice="' + esc(e._key) + '">'
        + e.choice.map((x) => '<option value="' + esc(x.id) + '"' + (c && x.id === c.id ? " selected" : "")
          + ">" + esc(x.label) + "</option>").join("") + "</select> ";
    }
    inner += elParts(e).map((p) => partHtml(p, pkey(e._key, c && c.id, p))).join("");
    return '<span class="desc-el' + (e.status === "draft" ? " is-draft" : "")
      + '" data-el="' + esc(e._key) + '">' + inner + "</span>";
  }

  function sentenceHtml() {
    const h = st.tpl.head;
    let out = "";
    if (h) {
      out += '<select class="desc-slot desc-head" data-head="1">'
        + h.variants.map((v) => '<option value="' + esc(v.id) + '"' + (v.id === st.head ? " selected" : "")
          + ">" + esc(v.label) + (v.status === "draft" ? " ·draft" : "") + "</option>").join("")
        + "</select> ";
    }
    const els = profileEls().filter(isOn);
    els.forEach((e, i) => {
      if (i) out += '<span class="desc-sep">' + esc(e.join || (i === els.length - 1 ? " & " : ", ")) + "</span>";
      out += elHtml(e);
    });
    if (els.length) out += '<span class="desc-sep">.</span> ';
    for (const e of postEls()) if (isOn(e)) out += elHtml(e) + '<span class="desc-sep"> </span>';
    out += '<span class="desc-fixed">' + esc(st.tpl.graded) + "</span> ";

    const o = outcomeObj();
    if (o.overall_override) {
      out += '<span class="desc-fixed">' + esc(o.overall_override) + "</span> ";
    } else {
      const g = o.force_grade;
      const parts = st.tpl.overall.split("{grade}");
      out += '<span class="desc-fixed">' + esc(parts[0]) + "</span>";
      if (g) out += '<b class="desc-grade is-fail">' + esc(g) + "</b>";
      else {
        out += '<select class="desc-slot desc-gradesel" data-grade="1">'
          + st.data.grades.map((x) => '<option value="' + esc(x.en) + '"' + (x.en === st.grade ? " selected" : "")
            + ">" + esc(x.en) + " · " + x.band[0] + "-" + x.band[1] + "%</option>").join("")
          + "</select>";
      }
      out += '<span class="desc-fixed">' + esc(st.pct === "" ? "" : " (" + st.pct + "%)") + esc(parts[1] || "") + "</span> ";
    }
    for (const t of (o.tail || [])) {
      if (!tailIsOn(t)) continue;
      out += '<span class="desc-el" data-el="' + esc(tailKey(t)) + '">'
        + t.parts.map((p) => partHtml(p, "out." + o.id + "." + t.id + "::" + (p.id || ""))).join("")
        + "</span> ";
    }
    return out;
  }

  /* ── rendering: chips ─────────────────────────────────────────────────── */

  function chipsHtml() {
    const els = profileEls();
    let out = "";
    let rep = null;
    els.forEach((e) => {
      if (e._rep && e._inst !== rep) {
        rep = e._inst;
        out += '<span class="desc-grp">block ' + rep + "</span>";
      } else if (!e._rep) { rep = null; }
      const cls = ["desc-chip"];
      if (!isOn(e)) cls.push("off");
      if (e.opt) cls.push("opt");
      if (e.status === "draft") cls.push("draft");
      out += '<button class="' + cls.join(" ") + '" data-tog="' + esc(e._key) + '"'
        + (e.note ? ' title="' + esc(e.note) + '"' : "") + ">"
        + esc(e._label) + (e.note ? ' <i class="desc-i">ⓘ</i>' : "")
        + (e._custom ? ' <i class="desc-x" data-del="' + esc(e._key) + '">✕</i>'
            + '<i class="desc-x" data-mv="' + esc(e._key) + '|-1">◀</i>'
            + '<i class="desc-x" data-mv="' + esc(e._key) + '|1">▶</i>' : "")
        + "</button>";
    });
    for (const e of postEls()) {
      out += '<button class="desc-chip post' + (isOn(e) ? "" : " off") + (e.opt ? " opt" : "")
        + (e.status === "draft" ? " draft" : "") + '" data-tog="' + esc(e._key) + '"'
        + (e.note ? ' title="' + esc(e.note) + '"' : "") + ">"
        + esc(e._label) + (e.note ? ' <i class="desc-i">ⓘ</i>' : "") + "</button>";
    }
    return out;
  }

  /* ── rendering: item picker ───────────────────────────────────────────── */

  /* Round 16b — for the SOLO clearance the grid is the THREE-LEVEL set of A2:
     category → training section → this flight. Items the syllabus has not
     introduced by this section have no MIF to clear and are not drawn at all;
     what is drawn carries its standing MIF, so «below Code 2» is visible.
     The FAIL grid is unchanged: it is about the items of THIS sortie, and the
     empty cells of this column are already greyed. */
  function pickerHtml(which) {
    const cat = st.data.categories[st.cat];
    const solo = which === "solo";
    const np = new Set(expand(st.hint.not_planned));
    const forbidden = new Set(solo ? (cat.solo_forbidden || []) : []);
    const chosen = new Set(st.itemsBy[which]);
    const lv = itemLevels(st.hint);
    const byN = {};
    for (const x of lv) byN[x.n] = x;
    const rows = solo ? lv : cat.items.map((it) => byN[it.n]
      || { n: it.n, label: it.gs || it.label, mif: null, here: null });
    let grid = "";
    for (const r of rows) {
      const n = r.n;
      const off = np.has(n);
      const ban = forbidden.has(n);
      const low = solo && !ban && !soloReady(r.mif);
      const cls = ["desc-num"];
      if (chosen.has(n)) cls.push("on");
      if (off) cls.push("np");
      if (ban) cls.push("ban");
      if (low) cls.push("low");
      const tip = "#" + n + " " + r.label
        + (r.mif ? " — MIF " + r.mif + " at " + st.hint.section : "")
        + (off ? " · not planned in this sortie" : "")
        + (ban ? " · never cleared for SOLO (Syllabus §14b(6))" : "")
        + (low ? " · below the Code «2» SOLO minimum (3-01 §28θ)" : "");
      grid += '<button class="' + cls.join(" ") + '" data-num="' + n + '" title="' + esc(tip) + '">'
        + n + "</button>";
    }
    const hidden = solo ? cat.items.length - rows.length : 0;
    return '<div class="desc-numgrid">' + grid + "</div>"
      + '<p class="hint desc-numlegend">Grey = not planned in this sortie (MIF cell empty) · '
      + 'struck = never cleared for SOLO · '
      + (solo ? 'dashed = standing MIF below Code «2» · ' : "")
      + 'click to include. '
      + '<button class="desc-mini" data-numclear="1">clear</button>'
      + (solo ? ' <button class="desc-mini" data-numseed="1">re-seed from MIF ≥ 2</button>' : "")
      + (hidden > 0
          ? ' <span class="desc-hidden">' + hidden + " item"
            + (hidden === 1 ? "" : "s") + " of the " + cat.items.length
            + " hidden: no MIF yet at " + esc(st.hint.section) + " — nothing to clear.</span>"
          : "")
      + "</p>";
  }

  /* ── rendering: the whole build panel ─────────────────────────────────── */

  function buildHtml() {
    const h = st.hint;
    const o = outcomeObj();
    const drafts = draftNotes();
    let out = "";

    out += '<div class="desc-sortiebar">'
      + '<span class="desc-code">' + esc(st.sortie) + "</span>"
      + '<span class="badge">' + esc(st.tpl.label) + " template</span>"
      + (h.checkride ? '<span class="badge is-chk">checkride</span>' : "")
      + (h.night ? '<span class="badge is-night">night</span>' : "")
      + (h.first_solo ? '<span class="badge is-solo">1st solo</span>' : "")
      + (h.solo_candidate ? '<span class="badge is-solo">solo candidate</span>' : "")
      + (st.soloNext ? '<span class="badge is-solo">solo next: ' + esc(st.soloNext.next) + "</span>" : "")
      + (h.end_of_block ? '<span class="badge">end of block</span>' : "")
      + (h.band === "fs" ? '<span class="badge">F/S</span>' : "")
      + '<button class="info-btn" id="desc-canon-btn" title="The printed template this sentence is built from, verbatim">ℹ Template</button>'
      + "</div>"
      + '<p class="hint desc-sortiename">' + esc(h.name || "")
      + (h.note ? " — " + esc(h.note) : "") + "</p>";

    if (drafts.length) {
      out += '<div class="desc-draft"><b>DRAFT — proposed variant.</b><ul>'
        + drafts.map((d) => "<li>" + esc(d) + "</li>").join("") + "</ul></div>";
    }

    /* A2 — the authorization is never left to memory */
    if (st.soloNext && !st.soloNext.self) {
      out += '<div class="desc-solonext"><b>SOLO NEXT.</b> The next sortie of this '
        + "category, <b>" + esc(st.soloNext.next) + "</b>"
        + (st.soloNext.first ? " — the 1st SOLO" : "")
        + ", is flown SOLO, so this grade sheet has to say that the SP is authorized "
        + "and exactly which items he may execute. The outcome below is preset to "
        + "<b>Solo clearance</b> and the item picker offers only what is clearable at "
        + esc(h.section) + ". One click on <b>Standard</b> undoes it.</div>";
    } else if (st.soloNext) {
      out += '<div class="desc-solonext is-soft"><b>SOLO NEXT — if this one was flown DUAL.</b> '
        + esc(st.sortie) + " and " + esc(st.soloNext.next)
        + " are both green-framed in the flow chart (one of the run is the SOLO), so the app "
        + "cannot tell which seat was filled. If you flew it, pick <b>Solo clearance</b> "
        + "and the picker will offer what is clearable at " + esc(h.section) + ".</div>";
    }

    out += '<label class="lbl">The sentence — click a blank to fill it</label>'
      + '<p class="desc-sent" id="desc-sent">' + sentenceHtml() + "</p>";

    out += '<label class="lbl">Profile elements — on = in the sentence</label>'
      + '<div class="desc-chips" id="desc-chips">' + chipsHtml() + "</div>"
      + '<div class="desc-chiptools">'
      + '<button class="desc-mini" data-custom="1">+ custom element</button>'
      + (st.tpl.profile.some((e) => e.kind === "repeat")
          ? '<span class="desc-mini-lbl">approach blocks</span>'
            + '<button class="desc-mini" data-appr="-1">−</button>'
            + '<b class="desc-mini-n">' + st.apprCount + "</b>"
            + '<button class="desc-mini" data-appr="1">+</button>'
          : "")
      + '<button class="desc-mini" data-reset="1">↺ template defaults</button>'
      + "</div>";

    if (h.approach_hint) {
      out += '<p class="hint desc-aphint">Syllabus for this section: ' + esc(h.approach_hint) + "</p>";
    }

    /* outcome */
    out += '<label class="lbl">Outcome</label><div class="desc-chips">'
      + st.data.outcomes.map((x) => '<button class="desc-chip pick'
        + (x.id === st.outcome ? " on" : "") + (x.status === "draft" ? " draft" : "")
        + '" data-out="' + esc(x.id) + '" title="' + esc(x.hint || "") + '">'
        + esc(x.label) + "</button>").join("")
      + "</div>";

    if (!o.overall_override) {
      out += '<div class="desc-row"><label class="lbl">Overall</label>'
        + (o.force_grade
            ? '<b class="desc-grade is-fail">' + esc(o.force_grade) + "</b>"
            : '<select class="desc-slot" data-grade="1">'
              + st.data.grades.map((x) => '<option value="' + esc(x.en) + '"' + (x.en === st.grade ? " selected" : "")
                + ">" + esc(x.en) + " (" + esc(x.code) + ") · " + x.band[0] + "-" + x.band[1] + "%</option>").join("")
              + "</select>")
        + '<input class="desc-pct" id="desc-pct" type="text" inputmode="numeric" maxlength="3" placeholder="%" value="'
        + esc(st.pct) + '" title="The printed grade sheets carry «OVERALL GRADE … %» — optional here">'
        + "</div>";
      const g = st.data.grades.find((x) => x.en === (o.force_grade || st.grade));
      if (st.pct !== "" && g && (+st.pct < g.band[0] || +st.pct > g.band[1])) {
        out += '<p class="desc-warn">' + esc(st.pct) + "% is outside the " + esc(g.en)
          + " band (" + g.band[0] + "-" + g.band[1] + "%) — 3-01 §29.</p>";
      }
      if (h.checkride && st.pct !== "" && +st.pct < st.data.pass_threshold) {
        out += '<p class="desc-warn">A checkride below ' + st.data.pass_threshold
          + "% starts the ΠΔ 29/2020 route (3-01 §58β) — no re-fly in Phase II.</p>";
      }
    }

    for (const t of (o.tail || [])) {
      out += '<button class="desc-chip' + (tailIsOn(t) ? "" : " off") + (t.opt ? " opt" : "")
        + (t.status === "draft" ? " draft" : "") + '" data-tail="' + esc(t.id) + '"'
        + (t.note ? ' title="' + esc(t.note) + '"' : "") + ">"
        + esc(t.label) + (t.note ? ' <i class="desc-i">ⓘ</i>' : "") + "</button>";
    }
    if ((o.tail || []).some((t) => t.picker === "items" && tailIsOn(t))) {
      const which = st.outcome === "fail" ? "fail" : "solo";
      if (which === "solo") seedItems("solo");
      out += '<label class="lbl">Items ' + (which === "fail" ? "NOT achieved" : "cleared for SOLO")
        + ' <span class="count">' + ranges(st.itemsBy[which]).length + " group(s) · "
        + st.itemsBy[which].length + " item(s)</span></label>" + pickerHtml(which);
    }

    /* EP line */
    const cat = st.data.categories[st.cat];
    out += '<label class="lbl">Emergency procedures line — gradesheet item #' + cat.ep_item
      + ' <span class="count">' + esc(cat.items[cat.ep_item - 1].gs || cat.items[cat.ep_item - 1].label)
      + "</span></label>"
      + '<div class="desc-row">'
      + '<button class="desc-chip' + (st.ep.on ? "" : " off") + '" data-eptog="1">#'
      + cat.ep_item + " LINE</button>"
      + '<span class="desc-mini-lbl">(</span>'
      + '<select class="desc-slot" data-epd="1">' + st.data.codes.map((c) =>
          '<option' + (c === st.ep.d ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</select>"
      + '<span class="desc-mini-lbl">) ' + esc(st.data.arrow) + " (</span>"
      + '<select class="desc-slot" data-epa="1">' + st.data.codes.map((c) =>
          '<option' + (c === st.ep.a ? " selected" : "") + ">" + esc(c) + "</option>").join("") + "</select>"
      + '<span class="desc-mini-lbl">)</span>'
      + '<button class="desc-mini" data-eproll="1" title="Draw a fresh 2-3 from the 71 T-6A emergency procedures">↻ reroll</button>'
      + '<button class="desc-mini" data-epadd="1" title="Add one more procedure">+</button>'
      + '<button class="desc-mini' + (st.ep.short ? " on" : "") + '" data-epshort="1" title="Squadron short form — only the four proven by the sample photos have one">short form</button>'
      + "</div>";
    /* A1 — the whole ramp on one line, so the preset is checkable at a glance */
    const rp = st.ramp || epRamp(st.sortie);
    out += '<p class="hint desc-epmif">MIF ramp for item #' + cat.ep_item + " — "
      + (rp.prevSec
          ? "previous section <b>" + esc(rp.prevSec) + "</b> = <b>" + esc(rp.prevCode) + "</b>"
          : "<b>first section of the category</b>, no previous one")
      + " · this section " + esc(st.hint.section) + " = <b>" + esc(rp.own || "—") + "</b>"
      + (rp.endSec ? " · end of " + esc(cat.label) + " (" + esc(rp.endSec) + ") = <b>"
          + esc(rp.endCode) + "</b>" : "")
      + ". Desired preset <b>" + esc(rp.preset) + "</b> — "
      + (rp.lastOfCat
          ? "the LAST FLIGHT of the category, so it has to reach the end-of-section code"
          : (rp.prevSec ? "the code that stood in the previous section"
                        : "the section's own starting MIF"))
      + ". Change either code by hand whenever the sortie says otherwise.</p>";
    out += '<div class="desc-eplist">' + st.ep.picks.map((id, i) =>
      '<span class="desc-eprow"><select class="desc-slot desc-epsel" data-epsel="' + i + '">'
      + st.eps.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === id ? " selected" : "") + ">"
        + esc(p.n + ". " + p.name) + "</option>").join("")
      + '</select><button class="desc-mini" data-epdel="' + i + '" title="Remove">✕</button></span>').join("")
      + "</div>";

    return out;
  }

  /* ── rendering: the output panel ──────────────────────────────────────── */

  function outHtml() {
    const desc = descText();
    const ep = epText();
    return '<div class="desc-block" id="desc-block">'
      + '<p class="desc-blocktext" id="desc-blocktext">' + esc(desc) + "</p>"
      + (ep ? '<p class="desc-blocktext desc-blockep" id="desc-blockep">' + esc(ep) + "</p>" : "")
      + "</div>"
      + '<div class="desc-outtools">'
      + '<span class="count">' + (desc.length + (ep ? ep.length + 2 : 0)) + " characters</span>"
      + '<a class="fb-btn" href="' + fbUrl() + '" target="_blank" rel="noopener" '
      + 'title="Report a wrong wording or suggest a correction for this template">Feedback</a>'
      + '<button class="copy-btn" id="desc-print">🖨 Print</button>'
      + '<button class="copy-btn" id="desc-copy">Copy block</button>'
      + '<span class="desc-flash" id="desc-flash">' + esc(st.flash) + "</span>"
      + "</div>";
  }

  function fbUrl() {
    const h = st.hint || {};
    const title = "Feedback: desc-" + st.tpl.id + "-" + st.sortie;
    const body = [
      "**Item:** " + st.tpl.label + " description template · " + st.sortie + " " + (h.name || "")
        + " · **File:** `data/descriptions.json`",
      "**Template:** `" + st.tpl.id + "` · **Family:** `" + (h.family || "") + "` · **Outcome:** `"
        + st.outcome + "` · **Head:** `" + st.head + "`",
      "",
      "> " + descText(),
      epText() ? "> " + epText() : "",
      "",
      "**What is wrong / suggested correction:**",
      "",
    ].join("\n");
    return "https://github.com/" + REPO + "/issues/new?title=" + encodeURIComponent(title)
      + "&labels=feedback&body=" + encodeURIComponent(body);
  }

  /* ── the ⓘ Template modal — the canon, verbatim ───────────────────────── */

  function showCanon() {
    const t = st.tpl, h = st.hint;
    const cat = st.data.categories[st.cat];
    const rp = st.ramp || epRamp(st.sortie);
    const f = flowOf(h) || { cols: [], ep: {} };
    const offered = itemLevels(h);
    $("info-title").textContent = t.label + " — the printed template";
    let html = "<h4>Template, verbatim</h4><p class=\"verbatim\">" + esc(t.canon) + "</p>"
      + '<p class="req-src">📄 ' + esc(t.canon_source) + "</p>"
      + "<h4>How it is read</h4><p class=\"hint\">" + esc(st.data.note) + "</p>"
      + "<h4>This sortie</h4>"
      + '<table class="spec-table"><tbody>'
      + "<tr><td>Sortie</td><td>" + esc(st.sortie) + " · " + esc(h.name || "") + "</td></tr>"
      + "<tr><td>Section</td><td>" + esc(h.section) + " · " + esc(h.band === "fs" ? "F/S" : "aircraft") + "</td></tr>"
      + "<tr><td>Family</td><td>" + esc(h.family) + "</td></tr>"
      + "<tr><td>EP gradesheet item</td><td>#" + cat.ep_item + " · MIF in this section: "
        + esc(h.ep_mif || "—") + "</td></tr>"
      + "<tr><td>EP desired code</td><td><b>" + esc(rp.preset) + "</b> — "
        + (rp.lastOfCat
            ? "last flight of the category, so the end-of-section code of " + esc(rp.endSec)
            : (rp.prevSec ? "the MIF of the previous section, " + esc(rp.prevSec)
                          : "first section of the category — its own starting MIF"))
        + " <span class=\"badge\">user ruling 20/08/2026</span></td></tr>"
      + "<tr><td>Section ramp</td><td>" + f.cols.map((c) =>
          esc(c) + " = " + esc(String(f.ep[c])) + (c === h.section ? " ←" : "")).join(" · ")
        + "</td></tr>"
      + "<tr><td>Items planned</td><td>" + cat.items_total + " total"
        + (h.not_planned && h.not_planned !== "-" ? " · not planned here: " + esc(h.not_planned) : "")
        + "</td></tr>"
      + "<tr><td>Offered for SOLO</td><td>" + offered.length + " of " + cat.items.length
        + " item(s) have a MIF by " + esc(h.section)
        + (cat.items.length - offered.length
            ? " · " + (cat.items.length - offered.length) + " not taught yet, hidden from the picker"
            : "")
        + "</td></tr>"
      + (st.soloNext
          ? "<tr><td>Solo next</td><td>" + esc(st.soloNext.next)
            + (st.soloNext.first ? " — 1st SOLO" : "")
            + (st.soloNext.self
                ? " · this sortie is green-framed too, so the clearance is offered, not preset"
                : " · DUAL before a SOLO — the clearance is preset")
            + "</td></tr>"
          : "")
      + (h.solo_seed ? "<tr><td>Cleared at MIF ≥ 2</td><td>" + esc(h.solo_seed) + "</td></tr>" : "")
      + (h.page ? '<tr><td>Syllabus</td><td>PART IV, PDF p.' + esc(String(h.page)) + "</td></tr>" : "")
      + "</tbody></table>"
      + "<h4>Grade scale — 3-01 §29</h4>"
      + '<table class="spec-table"><thead><tr><th>Code</th><th>Greek</th><th>Block word</th><th class="num">Band</th></tr></thead><tbody>'
      + st.data.grades.map((g) => "<tr><td>" + esc(g.code) + "</td><td>" + esc(g.greek) + "</td><td>"
        + esc(g.en) + (g.aliases ? " <span class=\"badge\">alias: " + esc(g.aliases.join(", ")) + "</span>" : "")
        + "</td><td class=\"num\">" + g.band[0] + "-" + g.band[1] + "%</td></tr>").join("")
      + "</tbody></table><p class=\"spec-note\">" + esc(st.data.grades_source) + "</p>";
    const drafts = draftNotes();
    if (drafts.length) {
      html += "<h4>Proposed variants in this block</h4><ul>"
        + drafts.map((d) => "<li>" + esc(d) + "</li>").join("") + "</ul>";
    }
    $("info-body").innerHTML = html;
    $("info-modal").classList.remove("hidden");
  }

  /* ── render ───────────────────────────────────────────────────────────── */

  function render() {
    if (!st.ready) return;

    const grid = $("desc-cat-grid");
    grid.innerHTML = CAT_ORDER.map((c) => {
      const cat = st.data.categories[c];
      const n = Object.keys(st.data.sorties).filter((k) => st.data.sorties[k].cat === c).length;
      return '<button class="cat-card' + (st.cat === c ? " active" : "") + '" data-cat="' + c + '">'
        + "<strong>" + esc(cat.label) + "</strong><span class=\"cat-count\">"
        + n + " sorties · " + cat.items_total + " items · EP #" + cat.ep_item + "</span></button>";
    }).join("");

    $("desc-band").innerHTML = [["flights", "Aircraft"], ["fs", "F/S"]].map(([b, l]) =>
      '<button class="chip' + (st.band === b ? " active" : "") + '" data-band="' + b + '" style="min-width:80px">'
      + esc(l) + "</button>").join("");

    $("panel-desc-sortie").classList.toggle("hidden", !st.cat);
    $("panel-desc-build").classList.toggle("hidden", !st.sortie);
    $("panel-desc-out").classList.toggle("hidden", !st.sortie);

    if (st.cat) {
      const list = sortieList();
      $("desc-sortie-count").textContent = list.length + (list.length === 1 ? " sortie" : " sorties");
      $("desc-sortie-search").disabled = false;
      $("desc-sortie-list").innerHTML = list.length
        ? list.map((s) => '<button class="item-btn' + (st.sortie === s.id ? " active" : "")
            + '" data-sortie="' + esc(s.id) + '"><span class="sn">' + esc(s.id) + "</span>"
            + esc(s.name || "") + '<span class="obs-n">'
            + (s.checkride ? "CHK " : "") + (s.night ? "NGT " : "") + (s.first_solo ? "1st SOLO" : "")
            + "</span></button>").join("")
        : '<p class="hint">No ' + (st.band === "fs" ? "F/S" : "aircraft") + " sorties match.</p>";
    }

    if (st.sortie) {
      $("desc-build").innerHTML = buildHtml();
      $("desc-out").innerHTML = outHtml();
      const pr = $("desc-print-sheet");
      if (pr) pr.textContent = blockText();
    } else {
      /* the panels are hidden, but a hidden panel holding the PREVIOUS sortie's
         block is a trap: Copy and Print read the DOM. Empty them. */
      $("desc-build").innerHTML = "";
      $("desc-out").innerHTML = "";
      const pr = $("desc-print-sheet");
      if (pr) pr.textContent = "";
    }
  }

  /* ── events (attach once, delegated) ──────────────────────────────────── */

  function flash(msg) {
    st.flash = msg;
    const el = $("desc-flash");
    if (el) el.textContent = msg;
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { st.flash = ""; const e = $("desc-flash"); if (e) e.textContent = ""; }, 2200);
  }

  async function copyBlock() {
    const txt = blockText();
    try {
      await navigator.clipboard.writeText(txt);
      flash("Copied ✓");
    } catch (e) {
      const r = document.createRange();
      r.selectNodeContents($("desc-block"));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      flash("Selected — press Ctrl+C");
    }
  }

  function printBlock() {
    let sheet = $("desc-print-sheet");
    if (!sheet) {
      sheet = document.createElement("pre");
      sheet.id = "desc-print-sheet";
      document.body.appendChild(sheet);
    }
    sheet.textContent = blockText();
    document.documentElement.classList.add("desc-printing");
    const off = () => document.documentElement.classList.remove("desc-printing");
    window.addEventListener("afterprint", off, { once: true });
    setTimeout(off, 4000);
    window.print();
  }

  function wire() {
    const view = $("view-description");

    view.addEventListener("click", (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const hit = (sel) => t.closest(sel);
      let el;

      if ((el = hit("[data-cat]"))) return pickCategory(el.dataset.cat);
      if ((el = hit("[data-band]"))) return pickBand(el.dataset.band);
      if ((el = hit("[data-sortie]"))) return pickSortie(el.dataset.sortie);
      if (t.id === "desc-canon-btn") return showCanon();
      if (t.id === "desc-copy") return copyBlock();
      if (t.id === "desc-print") return printBlock();

      if ((el = hit("[data-del]"))) {
        ev.stopPropagation();
        st.customs = st.customs.filter((c) => c.key !== el.dataset.del);
        return render();
      }
      if ((el = hit("[data-mv]"))) {
        ev.stopPropagation();
        const [key, d] = el.dataset.mv.split("|");
        const c = st.customs.find((x) => x.key === key);
        /* Round 16b — clamp at BOTH ends on write. profileEls() already clamps
           the read to the length of the canon list, so an unclamped write let ▶
           run off the end: ten over-clicks banked ten invisible steps and the
           first ◀ moved nothing. Same bound as the read, so ◀ answers at once. */
        if (c) c.pos = Math.max(0, Math.min(canonFlat().length, c.pos + Number(d)));
        return render();
      }
      if ((el = hit("[data-tog]"))) {
        const k = el.dataset.tog;
        const cur = st.on[k];
        const src = profileEls().concat(postEls()).find((x) => x._key === k);
        st.on[k] = cur === undefined ? !(src && src.on) : !cur;
        return render();
      }
      if ((el = hit("[data-custom]"))) {
        st.nCustom++;
        st.customs.push({ key: "custom" + st.nCustom, pos: canonFlat().length });
        return render();
      }
      if ((el = hit("[data-appr]"))) {
        const rep = st.tpl.profile.find((x) => x.kind === "repeat");
        st.apprCount = Math.max(rep.min, Math.min(rep.max, st.apprCount + Number(el.dataset.appr)));
        return render();
      }
      if ((el = hit("[data-reset]"))) return pickSortie(st.sortie);
      if ((el = hit("[data-out]"))) { st.outcome = el.dataset.out; return render(); }
      if ((el = hit("[data-tail]"))) {
        const o = outcomeObj();
        const t2 = (o.tail || []).find((x) => x.id === el.dataset.tail);
        const k = tailKey(t2);
        st.tailOn[k] = st.tailOn[k] === undefined ? !t2.on : !st.tailOn[k];
        return render();
      }
      if ((el = hit("[data-num]"))) {
        const which = st.outcome === "fail" ? "fail" : "solo";
        const n = Number(el.dataset.num);
        const i = st.itemsBy[which].indexOf(n);
        if (i < 0) st.itemsBy[which].push(n); else st.itemsBy[which].splice(i, 1);
        return render();
      }
      if (hit("[data-numclear]")) {
        st.itemsBy[st.outcome === "fail" ? "fail" : "solo"] = [];
        return render();
      }
      if (hit("[data-numseed]")) { st.seeded.solo = false; seedItems("solo"); return render(); }
      if (hit("[data-eptog]")) { st.ep.on = !st.ep.on; return render(); }
      if (hit("[data-eproll]")) { rollEp(); return render(); }
      if (hit("[data-epshort]")) { st.ep.short = !st.ep.short; return render(); }
      if (hit("[data-epadd]")) {
        const free = st.eps.filter((p) => st.ep.picks.indexOf(p.id) < 0);
        if (free.length) st.ep.picks.push(free[Math.floor(Math.random() * free.length)].id);
        return render();
      }
      if ((el = hit("[data-epdel]"))) { st.ep.picks.splice(Number(el.dataset.epdel), 1); return render(); }
    });

    view.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const d = t.dataset;
      if (d.slot !== undefined) { st.slot[d.slot] = t.value; return render(); }
      if (d.choice !== undefined) { st.choice[d.choice] = t.value; return render(); }
      if (d.head !== undefined) { st.head = t.value; return render(); }
      if (d.grade !== undefined) { st.grade = t.value; return render(); }
      if (d.epd !== undefined) { st.ep.d = t.value; return render(); }
      if (d.epa !== undefined) { st.ep.a = t.value; return render(); }
      if (d.epsel !== undefined) { st.ep.picks[Number(d.epsel)] = t.value; return render(); }
    });

    /* free text and % — a full re-render on every keystroke keeps the sentence,
       the warnings and the copy block in lockstep; the caret is put back after. */
    view.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (t.id === "desc-sortie-search") { st.q = t.value; return render(); }
      let sel = null;
      if (t.dataset.free !== undefined) {
        st.free[t.dataset.free] = t.value;
        sel = '[data-free="' + t.dataset.free + '"]';
      } else if (t.id === "desc-pct") {
        st.pct = t.value.replace(/[^0-9]/g, "");
        sel = "#desc-pct";
      } else return;
      let pos = null;
      try { pos = t.selectionStart; } catch (e) { pos = null; }
      render();
      const n = view.querySelector(sel);
      if (n) {
        n.focus();
        if (pos !== null) { try { n.setSelectionRange(pos, pos); } catch (e) {} }
      }
    });

    /* hovering the sentence lights up the chip that owns it, and back */
    view.addEventListener("mouseover", (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      const el = t && t.closest("[data-el]");
      view.querySelectorAll(".desc-chip.hot, .desc-el.hot").forEach((x) => x.classList.remove("hot"));
      if (!el) return;
      el.classList.add("hot");
      const chip = view.querySelector('[data-tog="' + el.dataset.el + '"]');
      if (chip) chip.classList.add("hot");
    });
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */

  async function boot() {
    if (!st.booted) { wire(); st.booted = true; }
    if (st.ready) { render(); return; }
    $("desc-cat-grid").innerHTML = '<p class="hint">Loading the templates…</p>';
    try {
      await load();
    } catch (e) {
      $("desc-cat-grid").innerHTML = '<p class="hint">Failed to load data/descriptions.json.</p>';
      return;
    }
    render();
  }

  window.descInit = boot;
})();
