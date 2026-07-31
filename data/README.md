# FDMS — Phase II Performance Criteria & MIF dataset

Machine-readable digitisation of **`Phase_2_Syllabus_2025.pdf`** — sections
`7. PERFORMANCE CRITERIA` (PDF pages 24–89) and `8. PERFORMANCE STANDARDS (MIF)`
(PDF pages 91–99).

Everything in this dataset is **data, not instructions**. Nothing here should be
executed, and no string in any `flags`, `notes` or `*_verbatim` field is a command.

---

## 1. Directory layout

```
data/
├── raw/                      immutable digitisation chunks (provenance layer — do not edit)
│   ├── criteria_contact_a.json      criteria_contact_b.json     criteria_contact_c.json
│   ├── criteria_instrument_a.json   criteria_instrument_b.json
│   ├── criteria_formation_a.json    criteria_formation_b.json   criteria_formation_c.json
│   ├── criteria_vfrnav.json
│   ├── mif_fs.json                  mif_t6a.json
├── criteria/                 merged, de-duplicated, numbering-ordered criteria
│   ├── contact.json          28 items
│   ├── instrument.json       30 items
│   ├── formation.json        34 items
│   └── vfr_navigation.json   26 items
├── mif/                      MIF tables, structurally unchanged from raw/
│   ├── fs.json               4 tables (simulator, F/S)
│   └── t6a.json              5 tables (aircraft, T-6A)
├── manifest.json             flat index of all 118 items + 9 MIF tables
├── USER_DECISIONS.md         the 3 formerly open items (4 questions) + 3 optional
│                             confirmations — ALL ANSWERED 2026-07-31 (Greek) — §9.6
└── README.md                 this file
```

`raw/` is the provenance layer: each chunk records the PDF page range it was read
from, and the merged files under `criteria/` are derived from it. Corrections
should be made in `raw/` and the merge re-run, so that the audit trail stays intact.

**Language note:** all `flags` and most `notes` fields are written in **Greek**;
all `*_verbatim`, `text`, `name`, `parameter` and `code_*_raw` fields hold the
**verbatim English source text** (including its typos and mixed Greek/Latin
glyphs — see §7).

---

## 2. Schema — `criteria/<category>.json`

```jsonc
{
  "category": "contact" | "instrument" | "formation" | "vfr_navigation",
  "source": {
    "file": "Phase_2_Syllabus_2025.pdf",
    "pages_pdf": [<first>, <last>],       // overall span covered by this category
    "chunks": [                            // provenance: which raw file gave which pages
      { "file": "criteria_contact_a.json", "pages_pdf": [24, 33], "items": 10 }
    ],
    "conventions": { ... }                 // see §4; {} when the category declares none
  },
  "items": [ <item>, ... ]
}
```

`items` are ordered by **item numbering** (`numbers[0]`, stable within ties).
Unnumbered blocks are placed at the edges: the Contact `GENERAL` preamble block
(`contact-00-general`) first, `CRM` last. This ordering is *not* identical to PDF
reading order in two places — see §7.2.

### 2.1 Item

| field | type | meaning |
|---|---|---|
| `id` | string | stable key, `<category>-<first printed number>`; unnumbered blocks use a suffix (`-crm`, `-00-general`); `formation-24b` is a disambiguator, see §7.2 |
| `numbers` | int[] | every grade-sheet number the printed heading covers. `[]` = unnumbered block. Grouped headings carry all their numbers, e.g. `contact-23` → `[23,25,27,32]` |
| `name` | string | item name, verbatim (trailing periods and source typos preserved) |
| `heading_verbatim` | string | the full printed heading including the `(n)` prefix |
| `pages_pdf` | int[] | `[first, last]` PDF pages the item body spans |
| `execution` | string[] | `(a) EXECUTION` clauses, in printed order |
| `execution_lead_in_verbatim` | string? | present only where a pure lead-in sentence precedes the clauses and was deliberately kept out of `execution[]` |
| `body_verbatim` | string? | present only on items that print no `(a)/(b)/(c)` sub-sections at all |
| `conditions` | string[] | `(b) CONDITIONS` clauses, in printed order |
| `expected_performance` | object | see §2.2 / §2.3 |
| `cross_refs` | string[] | verbatim sentences that point at another item / category / manual |
| `cross_ref_targets` | string[]? | *parallel array* to `cross_refs` (same length, same order) giving the machine-resolvable target id or `null`. Only present where the digitiser resolved them |
| `flags` | string[] | digitisation notes, ambiguities and open questions (Greek) |

### 2.2 `expected_performance.general_criteria`

Flat array of `{ "key": string|null, "text": string }`, in printed order.

* `key` is the printed letter/number (`"a"`, `"b"`, `"1"`, `"7(a)"`, …).
* `key: null` means the source prints **no** marker — typically a lead-in sentence
  or a single unlettered paragraph. It is *not* an extraction failure.
* `key: "preamble"` (Contact only) marks the introductory sentence of a
  `1/ GENERAL CRITERIA` block. **Consumers that enumerate criteria must filter it out.**
* Composite keys (`"a.1"`, `"b.3"`) encode a two-level hierarchy flattened into the
  array. The parent key (`"a"`) then holds only a group title (e.g. `"As Leader"`)
  and is not itself a criterion. See `conventions.synthetic_sub_keys`.
* Keys are **not guaranteed unique** inside an item: `formation-11` repeats `a/ b/ c/`
  under two different group headings. Group-aware handling is required there.

### 2.3 `expected_performance.specific_criteria`

```jsonc
{
  "kind": "none" | "reference" | "table",
  "lead_in_verbatim": "...",     // optional; the printed sentence introducing the table
  "lead_in": "...",              // same role, alternate field name in some chunks
  "table_header_verbatim": "...",// optional; the printed column header row
  "reference_text": string|null, // verbatim text when kind = "reference"
  "reference_target": string|null,// resolved item id, or null when ambiguous
  "parameters": [ <parameter>, ... ] // empty unless kind = "table"
}
```

| `kind` | count | meaning |
|---|---|---|
| `none` | 43 | the source prints no `2/ SPECIFIC CRITERIA` sub-section. Per source rule 7.a(5), general criteria + the Basic A/C Control standards apply |
| `reference` | 37 | the specific criteria are defined elsewhere. 16 of the 37 have `reference_target: null` — see §7.4 |
| `table` | 38 | a numeric table is present in `parameters` (111 parameter rows in total) |

All 80 `none` / `reference` items were subsequently resolved into a derived
`expected_performance.resolved` block that carries the numeric standards actually in
force — including for the 16 `reference_target: null` cases. **See §9.**
`specific_criteria` itself was left untouched: it remains the *printed* layer.

Two chunks use `kind: "reference"` as the *only* available carrier for items whose
**entire body** is one cross-reference sentence (no `(a)/(b)/(c)` sub-sections at all,
e.g. `formation-08`, `formation-30`, `vfr_navigation-02`). In those items the
reference governs the whole item, not just its specific criteria.

### 2.4 Parameter row

```jsonc
{
  "maneuver": string|null,     // phase / sub-table label from a merged cell; null when the
                               // source has no separate phase cell
  "parameter": "ALTITUDE (feet)",
  "unit": "feet",              // normalised; "mixed" is special — see conventions.mixed_units
  "one_sided": "plus"|"minus", // optional; the source states only one side, with no printed 0
  "plus_unit" / "minus_unit": string, // only when unit == "mixed"
  "is_note_row": true,         // optional; the row is an explanatory note, not a new parameter
  "derived_from": 0,           // optional; index of the parameter row the note restates
  "code_1_raw": "± 300΄",      // exactly as extracted, broken glyphs and all
  "code_3_raw": "± 150΄",
  "code_1": { ... },           // normalised, see §2.5
  "code_3": { ... },
  "interpolation": "standard" | "undefined",
  "notes": string|null
}
```

Column assignment (which printed column is “1” and which is “3”) was verified per
table with PyMuPDF x-coordinates and/or the drawn grid lines; the verification is
recorded in each row's `notes` or in the item's `flags`. The column grid shifts
between pages and even between two tables on the same page, so **never infer the
column from reading order.**

### 2.5 Code objects (`code_1` / `code_3`)

| `kind` | fields | count | meaning |
|---|---|---|---|
| `deviation` | `plus`, `minus` | 203 | allowed deviation from the nominal value. The two legs are **independent**; many rows are asymmetric (`+15 / -5`). `null` on a leg = the source defines no limit in that direction (**not** zero) — see `conventions.deviation_null`. An explicit `0` appears only where a literal “0” is printed |
| `nominal_change` | `value`, optional `plus`/`minus` | 12 | the *nominal value itself* changes between codes (e.g. observance angle 50° → 30°, touch-down point 1500′ → 1000′). `value` is always present. Optional `plus`/`minus` hold a tolerance printed around that nominal |
| `range` | `min`, `max` | 6 | an allowed band, not a deviation (e.g. 500′–1500′). Code-1 and code-3 bands do **not** always overlap |
| `qualitative` | `text` | 1 | no number printed (`instrument-24`, code 3: “Slightly above / Slightly below”) |

`interpolation`:

* `"standard"` (101 rows) — code “2” may be derived by interpolating between the
  code-1 and code-3 limits, **per leg, in that leg's own unit**.
* `"undefined"` (10 rows) — interpolation is not meaningful (nominal changes,
  non-overlapping ranges, qualitative values). Code “2” must not be computed.

Units seen: `feet` (41), `degrees` (27), `knots` (25), `NM` (3), `DME` (3), `dots` (3),
`seconds` (2), `KIAS`, `feet_per_min`, `minutes`, `AOA units`, `ship lengths`, `G`,
`mixed` (1). `unit` is free text — there is no closed enum.

---

## 3. Schema — `mif/fs.json`, `mif/t6a.json`

Copied structurally unchanged from `raw/mif_fs.json` and `raw/mif_t6a.json`
(byte-for-byte equal after JSON round-trip).

```jsonc
{ "tables": [ {
  "table_id": "contact_fs",
  "title_verbatim": "CONTACT (F/S)",
  "aircraft": "F/S" | "T-6A",
  "category": "contact" | "instrument" | "formation" | "vfr_navigation",
  "page_pdf": 91,
  "columns": [ {
      "unit": "C2201-02",        // training-unit / sortie-block code (normalised: no inner space)
      "sorties_dual": 2,
      "sorties_solo": 0,
      "solo_green": false,       // the SOLO digit is printed green (meaning undocumented)
      "checkride": false,        // orange header; assigned by cross-reference to §9d p.101
      "means_of_training": "OFP" // simulator tables only; null on all T-6A tables
  } ],
  "row_groups": [ { "name": "LEADER", "sn_from": 1, "sn_to": 6 } ],  // formation only
  "items": [ { "sn": 1, "name": "Ground Procedures",
               "codes": { "<unit>": "0"|"1"|"2"|"3"|"E"|"*"|"**"|null } } ],
  "notes_verbatim": [ ... ],     // printed footnotes, verbatim
  "flags": [ ... ]               // digitisation notes (Greek)
} ] }
```

9 tables, 319 rows, 1 916 cells. Cell value distribution:
`3` ×552, `2` ×417, `1` ×273, `0` ×160, `*` ×31, `E` ×21, `**` ×3, empty (`null`) ×459.
The codes `4` and `D` never appear in any MIF table.

`sn` is the grade-sheet serial number and is the join key to
`criteria/<category>.json` → `items[].numbers`.

---

## 4. `conventions` (inside `source`)

Category-level rules declared by the digitiser. Present for `contact` and
`formation`; `{}` for `instrument` and `vfr_navigation`.

| key | category | summary |
|---|---|---|
| `deviation_null` | contact | `null` on `plus`/`minus` means **the source defines no limit in that direction**, distinct from a printed `0`. Consumers must not read it as zero tolerance nor reject deviations that way |
| `one_sided` | contact | optional row field naming which side is actually measured when only one limit is printed |
| `general_criteria_preamble` | contact | the `key:"preamble"` convention (§2.2) |
| `lead_in_verbatim` | contact | the table lead-in sentence field; absence = the source prints none |
| `cross_ref_targets` | contact | `cross_ref_targets` is parallel to `cross_refs` |
| `mixed_units` | formation | when `unit:"mixed"`, the `+` and `−` legs are in **different units**; `plus_unit`/`minus_unit` are declared both on the row and inside each `code_N`. Interpolate per leg, in its own unit. Only occurrence: `formation-18` → `a/ ROUTE POSITION` → `DISTANCE (span)` (`+200′ feet` / `−1/2 span`) |
| `nominal_change` | formation | `value` always carries the nominal; printed tolerance goes to optional `plus`/`minus` |
| `subsection_role_qualifier` | formation | where the source prints `(AS WINGMAN)` next to a sub-section heading, the qualifier is recorded as a `flag` and **restricts that sub-section to that role**, even when other sub-sections of the same item also have an “As leader” branch |
| `synthetic_sub_keys` | formation | `a.1`/`b.2` denote hierarchy; whether the source actually prints the digit is stated per item in `flags` |
| `role_subsection` | formation | the Formation category is split into `LEADER` (items 1–13 header block), `WINGMAN` and `GENERAL` (items 14–23+); every item carries a `Ρόλος: …` flag |

---

## 5. `manifest.json`

```jsonc
{
  "source_document": "Phase_2_Syllabus_2025.pdf",
  "built_from": { "criteria": [...], "mif": [...], "raw_chunks": [...] },
  "counts": { "criteria_items_total": 118, "criteria_items_by_category": {...},
              "mif_tables": 9, "mif_rows_total": 319,
              "criteria_items_by_resolved_status": { "resolved": 80,
                    "needs_user_decision": 0, "n/a": 38 } },
  "items": [ { "id", "numbers", "name", "category", "specific_kind",
               "reference_target", "resolved_status", "pages_pdf" } ],
  "mif_tables": [ { "table_id", "file", "title_verbatim", "aircraft", "category",
                    "page_pdf", "columns", "column_details", "row_groups", "rows" } ]
}
```

`columns` is the plain list of unit codes; `column_details` carries the full column
objects (sorties, checkride, means of training).

`resolved_status` mirrors `criteria/<category>.json` →
`items[].expected_performance.resolved.status`, with the extra value `"n/a"` for the 38
`specific_kind: "table"` items that carry no `resolved` block. It is the cheap index for
“which items still need a human decision” — the full reasoning stays in the criteria
files. See §9.

---

## 6. Grading code rules

Defined by the source in `7. PERFORMANCE CRITERIA` → `a. GENERAL` (PDF p. 24),
captured verbatim in `contact-00-general.expected_performance.general_criteria`.

| code | rule |
|---|---|
| **1** | Defined by the source. It is the **left / looser** numeric column of every specific-criteria table → `code_1` |
| **3** | Defined by the source. It is the **right / tighter** numeric column → `code_3` |
| **2** | **Not printed.** It is every intermediate deviation between the code-1 and code-3 limits. Derive it by interpolation when `interpolation == "standard"`, **per leg** (`plus` and `minus` separately, because most rows are asymmetric) and, for `unit:"mixed"` rows, in each leg's own unit. When `interpolation == "undefined"`, code 2 **must not** be computed |
| **4** | Performance **better than 3** — deviation smaller than the code-3 limit (source rule 8) |
| **0** | Performance **worse than 1** — deviation larger than the code-1 limit (source rule 8) |
| **0** | **Any IP intervention** required to complete a manoeuvre (source rule 6) |

Source rule 7(b) is the authority for the 1 / 3 / 2 mapping:
the two numeric columns are standards “1” and “3”, and intermediate deviations
define code “2”. Source rule 8 is the authority for 4 and 0.

**`D` and `E` are not used by this dataset.**

* The source's rules 6 and 8 also allow a `"D"` (dangerous handling) grade alongside
  `"0"`. This dataset collapses that branch to **0**: IP intervention → `0`.
* Every specific-criteria table prints a leading `D` column (sometimes typeset as a
  Greek capital `Ε`, U+0395). That column, together with columns `0`, `2` and `4`,
  is **empty in every row of every table** — no value is ever assigned to it.
* Independently of the above, the literal value `"E"` **does occur in 21 MIF cells**
  (`contact_presolo_t6a` ×16, `formation_fs` ×1, `formation_t6a` ×2,
  `instrument_t6a` ×1, `vfr_navigation_t6a` ×1). `E` is **not defined anywhere in the
  source document** and is deliberately left uninterpreted — it is stored verbatim.

Source rule 3 (also verbatim in `contact-00-general`) qualifies all of the above:
instantaneous, non-persistent excursions beyond the limits are acceptable if the
student corrects them immediately, flight safety is not jeopardised, and the
instructor does not need to prompt, intervene or take command.

---

## 7. Known flags and open items — consolidated

414 `flags` entries are attached across the criteria items, plus per-table flags in
the MIF files. The list below aggregates the ones a consumer must act on or be aware
of. Everything else is typography provenance (glyph codepoints, spacing, missing
full stops) recorded so that nothing was “fixed silently”.

### 7.1 Source typography traps (affect string matching)

* **`±` extracted as U+FFFF (`￿`)** — a broken glyph in the PDF itself, on PDF pages
  30, 31, 33, 35 and 84. The `*_raw` fields keep it as extracted; the normalised
  `code_*` objects are correct. Confirmed to be `±` in every case.
* **`±` typeset as `+` with a vector underline** — `formation-18` → `HEIGHT (feet)`
  (PDF p. 72). Text extraction yields `+ 50΄`; it is `±`.
* **Foot marks are inconsistent** — U+0384 GREEK TONOS `΄`, U+2019 `’` and ASCII `'`
  are used interchangeably, sometimes within the same row.
* **Degree signs are inconsistent** — U+00B0 `°`, U+00BA `º` (masculine ordinal) and
  U+03BF `ο` (Greek omicron) all appear.
* **Greek letters inside English words** — e.g. `AΟA` (Greek Ο), `Τ/Ο` (Greek Τ, Ο),
  `Νο1`, `Νº2`, `Ν44ΧΧ`/`Ν45ΧΧ` (= `N44XX`/`N45XX`), `ΜAΙΡ` (= `MAIP`), `Κnows`,
  `κaι` (= “and”), `χάρτες` (= “maps”), `MAΧ` (= `MAX`), `Τ-6A` in every MIF
  `title_verbatim`. **Normalise before any string comparison.**
* In `vfr_navigation-06` criterion `l/`, U+FFFF appears **inside a word** (`IP￿s`) —
  there it is an apostrophe, not `±`.
* Source typos preserved verbatim: `INSTRUMET PROCEDURES`, `INTERGRITY`,
  `EXPECTED PERFOMANCE`, `EXPECTED PREFORMANCE`, `SP perfroms`, `decent check`,
  `continous`, `existed traffic`, `a hypothetically emergency situation`,
  `To fulfill SPecific criteria`, `prop wash..`, `manuals..`.

### 7.2 Numbering, duplication and ordering

* **`contact-34` (GO AROUND) was digitised twice**, at the boundary between
  `criteria_contact_b.json` (pages …–41) and `criteria_contact_c.json` (pages 42–48).
  The merge kept the **fuller** version (from chunk `c`, which includes the
  `key:null` GENERAL CRITERIA lead-in that chunk `b` omitted), unioned both flag
  lists, and prepended a `MERGE/DEDUP: …` flag. It is the **only** duplicate removed.
* **`criteria_instrument_b.json` declares a duplicate that does not exist.** Its
  `instrument-18` flag states the same item is also present in
  `criteria_instrument_a.json` and demands a dedup. It is not: chunk `a` stops at
  `instrument-17`. The ownership flag is stale and was left verbatim; **no** dedup
  was performed for `instrument-18`.
* **`(24)` is printed twice in the Formation category** (PDF p. 76) — once for
  `TACTICAL FORMATION` and once for `(24) – (28) TACTICAL TURNS …`. The expected
  numbering was probably `(25) – (28)`. To avoid an id collision the second item
  carries the synthetic id **`formation-24b`** while `numbers` reproduces the printed
  `[24,25,26,27,28]`. The MIF tables assign `sn 24 = Tactical Formation` and
  `sn 25–28 = the tactical turns`, which supports the “should have been (25)” reading —
  but the source was **not** corrected.
* **`vfr_navigation-15` and `vfr_navigation-20` are a genuine source duplication**:
  both print the same body (“As described in Instrument Category.”) on PDF p. 88,
  `(15)` misspelled `INSTRUMET`, `(20)` spelled correctly. Both are kept as separate
  items — this is **not** a chunk-boundary artefact. The MIF tables likewise carry two
  identical `Instrument Procedures` rows (`sn 15`, `sn 20`) with different values.
* **Numbering order ≠ PDF order** in two places, because `items` is sorted by
  `numbers[0]`: `contact-24` (LANDING, PDF pp. 39–41) is emitted before `contact-29`
  and `contact-30` (PDF pp. 38–39); the same applies to the grouped
  `contact-23` / `contact-24` pair. `pages_pdf` on every item gives true reading order.
* Unnumbered items (`*-crm`, `contact-00-general`) use a suffix id instead of the
  `<category>-<number>` rule.

### 7.3 Interpretations flagged as uncertain (do not treat as settled)

* **`contact-09` (TRAFFIC PATTERN STALLS)** — EXECUTION lists **four** stalls
  (BREAK / Undershooting Final Turn / Overshooting Final Turn / Landing Attitude) but
  the specific-criteria table has only **three** rows and uses the term
  `BASE LEG STALL`, which appears nowhere in EXECUTION. The mapping
  `BASE LEG ↔ Final Turn stalls` is **unconfirmed**.
* **`contact-24` — `DEVIATION FROM CENTER LINE (feet)`** — the values `15` / `5` are
  printed **without `±`**. They were encoded as symmetric `±15` / `±5` on the strength
  of the parameter name alone. **Unconfirmed.**
* **`formation-11` (OVERSHOOT)** — `DISTANCE BEHIND No1` and `ALTITUDE FROM Νο1`
  print bare `200'` / `80'` with no `±`. Whether these are maximum allowed deviations
  or nominal values is **not stated**; encoded as `nominal_change` with
  `interpolation: "undefined"`.
* **`formation-22` — `LONGITUDINAL SEPARATION`** — code 1 = 3–4 ship lengths,
  code 3 = 1–2 ship lengths. The bands **do not overlap** (code 1 is not a superset of
  code 3), and the item's own GENERAL CRITERIA text agrees with code 3, not code 1.
* **`instrument-24` — `MAINTAINING GLIDE PATH`** — code 1 is numeric and asymmetric
  (`+300′ high / −150′ low`), code 3 is purely qualitative
  (“Slightly above / Slightly below”). No numeric code-3 limit exists.
* **`instrument-28` (LANDING) — numeric override inside a `reference`.** The
  reference text *modifies* the Contact touch-down distance limits to
  **±1 000 ft for standard “1”** and **±500 ft for standard “3”** from the projected
  touch-down point. There is no table, so `kind` is `reference` — **downstream code
  must apply this override manually.** (`± 1.000 feet` uses a European thousands
  separator: 1000 ft, not 1.0 ft.)
* **`formation-13`** embeds numeric limits inside GENERAL CRITERIA rather than a
  table: `+ 10' / − 5'` altitude difference from the leader's wing level, not mapped
  to codes 1/3.
* **`formation-20`, `formation-23`** likewise carry absolute limits in prose
  (one A/C length, 10 ft; the 500′ safety bubble) with no per-code differentiation.
* **`contact-07` — `HEADING - BANK (degrees)`** — one label covers two distinct
  parameters sharing a tolerance; may need splitting in the application.
* **`instrument-16`** row 2 is a **note row** (`is_note_row: true`,
  `derived_from: 0`) restating row 1's tolerance in radials instead of DME — it is
  *not* an additional parameter and must be filtered out of parameter counts.
* **`vfr_navigation-12`** — `DEVIATION FROM TURNING POINTS*` carries an asterisk with
  **no footnote printed anywhere on the page**. Unresolved.
* **`instrument-21`** — `GLIDE PATH (GSI) (dots)**` carries a `**` marker with no
  `**` footnote on that page (only `*` exists).
* **`contact-01`** criterion `j/` contains the unexplained token `(BOTH)`.

### 7.4 Unresolved references

16 of the 37 `kind: "reference"` items have `reference_target: null` because the
printed text points at a whole category, or at two/three items at once:

`instrument-25`, `instrument-26` (→ GCA PAR **and** ASR, “correspondingly”),
`instrument-27` (→ Basic A/C Control **and** Normal Landing),
`instrument-28`, `instrument-30` (→ four separate Contact items),
`instrument-34`, `instrument-crm`,
`vfr_navigation-02`, `-03`, `-15`, `-16`, `-17`, `-18`, `-20`, `-21`, `-25`.

Additional unresolved references live inside `cross_refs` rather than
`specific_criteria`: `vfr_navigation-04` (points at three categories at once),
`vfr_navigation-14`, `-22`, `-23`, `-24`, `instrument-19`, `formation-05`.
`vfr_navigation-16` is genuinely ambiguous — the Formation category contains **two**
items named `FORMATION APPROACH` (`formation-06`, leader; `formation-13`, wingman).

> **Superseded in part by §9.** All of the above were subsequently worked through in the
> `resolved` block: all **80** now carry a documented target and its numeric rows; the
> three formerly open items — `instrument-19`, `formation-13` and `vfr_navigation-16` —
> were settled by the user ruling of 2026-07-31 (§9.6).
> `reference_target` itself was **not** back-filled —
> it still says `null` — because the resolution frequently needs *several* donors with
> different scopes, which a single string cannot express.

### 7.5 MIF-specific

* **Empty cells have two different fills** — light yellow (deliberate “no MIF
  defined”) and the row's zebra colour (white/grey). **No printed legend distinguishes
  them.** Both are stored as `null`. Zebra-coloured empties are flagged as suspected
  omissions in the original:
  `contact_fs` #15 @C2401-03, #25/#26/#27/#28 @C1101 · `instrument_fs` #7 @I3401-04 ·
  `contact_presolo_t6a` #10 @C4201-03, #15 @C4401-03 and @C4590 ·
  `contact_t6a` #2 @C4901-05 · `instrument_t6a` #2 @I4101-02, #26 @I4490, #29 @I4101-02 ·
  `vfr_navigation_t6a` #16 @N4690. `formation_t6a` is the only table with no anomaly.
* **`checkride` and `solo_green` have no printed legend.** `checkride` was assigned by
  cross-referencing §9d (PDF p. 101) plus the mission tables; `solo_green` records an
  observed green digit whose meaning the document never explains. In `contact_t6a`
  three columns have a green SOLO digit and one (`C4801-04`, same `3 / 1` pattern)
  has a black one — unexplained.
* **`*` / `**` footnotes.** `*` = “According to the standard of the Training Section
  SP is flying” (printed only on PDF p. 99); `**` = “According to the standard of the
  Contact Training Section SP is flying” (PDF p. 95). `vfr_navigation_fs` (p. 98) uses
  `*` in 15 cells but **prints no footnote** — its `notes_verbatim` is intentionally
  empty and applying p. 99's note by analogy is an assumption, not source text.
* **`F4690` vs `F4790`.** The document contradicts itself on the final Formation
  checkride code: `F4690` on PDF pp. 97, 101 and 221; `F4790` in the mission table on
  PDF p. 207. Not resolved.
* **`Ν4690` with a Greek Ν** in §9d (p. 101) vs Latin `N4690` in the table header.
* `formation_fs` uses single-digit suffixes (`F3101-2`, `F3201-3`) where every other
  table uses two digits. Not normalised.
* `vfr_navigation_fs` #21 `Clearing` = `1 / 3 / 3`, not the `1 / 2 / 3` progression of
  every other row — verified, not a reading error.

### 7.6 Criteria ↔ MIF cross-check

Every MIF row was matched to the criteria item whose `numbers` contains the row's
`sn`. **Names were compared but never harmonised.** Comparison normalises case,
whitespace, punctuation and Greek/Latin lookalikes; anything left over is reported.

**A. MIF rows with no criteria item carrying that number (3):**

| category | MIF `sn` | MIF row name | tables | note |
|---|---|---|---|---|
| `contact` | 31 | ELP Landing | `contact_fs`, `contact_presolo_t6a`, `contact_t6a` | Contact criteria numbering has no `(31)`; it jumps 30 → 32, and 32/33 are absorbed into the grouped `contact-23`/`contact-24` headings. `ELP Landing` has no numbered criteria item. |
| `formation` | 38 | Special Requirements | `formation_fs`, `formation_t6a` | Formation criteria numbering stops at `(37)` + unnumbered CRM. No `(38) SPECIAL REQUIREMENTS` item exists (Contact, Instrument and VFR Navigation all have one). |
| `vfr_navigation` | 26 | Special Requirements | `vfr_navigation_fs`, `vfr_navigation_t6a` | VFR Navigation criteria numbering stops at `(25)` + unnumbered CRM. No `(26) SPECIAL REQUIREMENTS` item exists. |

**B. Criteria items with no MIF row (5):** the four `CRM` items
(`contact-crm`, `instrument-crm`, `formation-crm`, `vfr_navigation-crm`) and the
Contact `GENERAL` preamble block (`contact-00-general`). All five are unnumbered, so
no MIF `sn` can reference them — expected, not an error.

**C. Name mismatches (62).** `GROUPED` marks a criteria item whose single heading
covers several grade-sheet numbers, so the MIF row name is necessarily the name of an
individual manoeuvre while the criteria name is the group heading. These are
structural, not errors. The remaining rows are genuine naming divergences in the
source document.

| category | `sn` | MIF row name | criteria id | criteria name | kind |
|---|---|---|---|---|---|
| `contact` | 2 | T/O | `contact-02` | TAKE OFF | divergent |
| `contact` | 3 | VFR Departure / Transition to Flight Areas | `contact-03` | DEPARTURE / TRANSITION TO FLIGHT AREAS | divergent |
| `contact` | 6 | G-X Awareness | `contact-06` | G –AWARENESS | divergent |
| `contact` | 9 | T/P Stalls | `contact-09` | TRAFFIC PATTERN STALLS | divergent |
| `contact` | 12 | Chandelle | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 13 | Lazy Eight | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 14 | Aileron Roll | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 15 | Barrel Roll | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 16 | Loop | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 17 | Cuban Eight | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 18 | Immelman | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 19 | Split S | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 20 | Cloverleaf | `contact-12` | PRECISION - AEROBATIC MANEUVERS | GROUPED |
| `contact` | 21 | Descend – Traffic Pattern Entry | `contact-21` | DESCENT - TRAFFIC PATTERN ENTRY | divergent |
| `contact` | 22 | Airport’s Traffic Pattern | `contact-22` | AIRPORT TRAFFIC PATTERN | divergent |
| `contact` | 23 | Normal Overhead Pattern | `contact-23` | LANDING PATTERN (NORMAL, NO FLAP, FLAP T/O - AΟA) | GROUPED |
| `contact` | 24 | Normal Landing | `contact-24` | LANDING (FLAPS LDG - FLAPS UP - FLAPS Τ/Ο - ELP - AΟA) | GROUPED |
| `contact` | 25 | No Flap Overhead Pattern | `contact-23` | LANDING PATTERN (NORMAL, NO FLAP, FLAP T/O - AΟA) | GROUPED |
| `contact` | 26 | No-Flap Landing | `contact-24` | LANDING (FLAPS LDG - FLAPS UP - FLAPS Τ/Ο - ELP - AΟA) | GROUPED |
| `contact` | 27 | Flaps TO Overhead Pattern | `contact-23` | LANDING PATTERN (NORMAL, NO FLAP, FLAP T/O - AΟA) | GROUPED |
| `contact` | 28 | Flaps TO Landing | `contact-24` | LANDING (FLAPS LDG - FLAPS UP - FLAPS Τ/Ο - ELP - AΟA) | GROUPED |
| `contact` | 29 | Straight-In Approach | `contact-29` | STRAIGHT-IN (FLAPS LDG, FLAPS UP, FLAPS Τ/Ο). | divergent |
| `contact` | 30 | ELP | `contact-30` | EMERGENCY LANDING PATTERN (ELP) | divergent |
| `contact` | 32 | AOA Overhead Pattern | `contact-23` | LANDING PATTERN (NORMAL, NO FLAP, FLAP T/O - AΟA) | GROUPED |
| `contact` | 33 | AOA Landing | `contact-24` | LANDING (FLAPS LDG - FLAPS UP - FLAPS Τ/Ο - ELP - AΟA) | GROUPED |
| `contact` | 37 | Radio Comm. | `contact-37` | RADIO COMMUNICATION | divergent |
| `instrument` | 2 | T/O | `instrument-02` | TAKE OFF | divergent |
| `instrument` | 3 | Standard Instrument Departure | `instrument-03` | STANDARD INSTRUMENT DEPARTURE (SID) | divergent |
| `instrument` | 7 | Constant Speed Climb and Descent | `instrument-07` | CONSTANT AIRSPEED - CONSTANT RATE CLIMBS / DESCENTS AND VERTICAL “S” | GROUPED |
| `instrument` | 8 | Constant Rate Climb and Descent | `instrument-07` | CONSTANT AIRSPEED - CONSTANT RATE CLIMBS / DESCENTS AND VERTICAL “S” | GROUPED |
| `instrument` | 9 | Vertical “S” | `instrument-07` | CONSTANT AIRSPEED - CONSTANT RATE CLIMBS / DESCENTS AND VERTICAL “S” | GROUPED |
| `instrument` | 30 | Radio Comm. | `instrument-30` | RADIO COMMUNICATION, AIRMANSHIP, EMERGENCY PROCEDURES, GENERAL KNOWLEDGE. | GROUPED |
| `instrument` | 31 | Airmanship | `instrument-30` | RADIO COMMUNICATION, AIRMANSHIP, EMERGENCY PROCEDURES, GENERAL KNOWLEDGE. | GROUPED |
| `instrument` | 32 | Emergency Procedures | `instrument-30` | RADIO COMMUNICATION, AIRMANSHIP, EMERGENCY PROCEDURES, GENERAL KNOWLEDGE. | GROUPED |
| `instrument` | 33 | General Knowledge | `instrument-30` | RADIO COMMUNICATION, AIRMANSHIP, EMERGENCY PROCEDURES, GENERAL KNOWLEDGE. | GROUPED |
| `formation` | 1 | Formation T/O | `formation-01` | TAKE OFF (FORMATION - INTERVAL) | GROUPED |
| `formation` | 2 | Interval T/O | `formation-01` | TAKE OFF (FORMATION - INTERVAL) | GROUPED |
| `formation` | 5 | Descent – Traffic Pattern Entry | `formation-05` | RETURN / DESCENT / TRAFFIC PATTERN ENTRY | divergent |
| `formation` | 7 | Formation T/O | `formation-07` | FORMATION TAKE OFF | divergent |
| `formation` | 8 | Interval T/O | `formation-08` | INTERVAL TAKE OFF | divergent |
| `formation` | 12 | Breakout | `formation-12` | BREAK OUT | divergent |
| `formation` | 18 | Route / Fighting Wing | `formation-18` | ROUTE / FIGHTING WING FORMATION | divergent |
| `formation` | 19 | Echelon Turn | `formation-19` | ECHELON TURN (AS WINGMAN) | divergent |
| `formation` | 20 | Position Change (Cross Under) | `formation-20` | CROSS UNDER | divergent |
| `formation` | 23 | Extended Trail (Leader/ Wingman) | `formation-23` | EXTENDED TRAIL | divergent |
| `formation` | 24 | Tactical Formation | `formation-24b` | TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS | GROUPED |
| `formation` | 25 | Delay 90° | `formation-24b` | TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS | GROUPED |
| `formation` | 26 | Delay 45° | `formation-24b` | TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS | GROUPED |
| `formation` | 27 | In Place | `formation-24b` | TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS | GROUPED |
| `formation` | 28 | Cross/ Hook/ Shackle/ Check turns | `formation-24b` | TACTICAL TURNS DELAY 90°, DELAY 45°, IN PLACE, CROSS / HOOK / SHACKLE/ CHECK TURNS | GROUPED |
| `formation` | 34 | Radio Comm. | `formation-34` | RADIO COMMUNICATION | divergent |
| `vfr_navigation` | 3 | T/O | `vfr_navigation-03` | TAKEOFF | divergent |
| `vfr_navigation` | 4 | VFR / SID Departure | `vfr_navigation-04` | VFR DEPARTURE / SID | divergent |
| `vfr_navigation` | 5 | Basic A/C control | `vfr_navigation-05` | BASIC A/C CONTROL / WINGMAN CONSIDERATION | divergent |
| `vfr_navigation` | 6 | In flight Planning/ Formation Consistency | `vfr_navigation-06` | IN-FLIGHT PLANNING / FORMATION INTERGRITY | divergent |
| `vfr_navigation` | 10 | Maintaining Course | `vfr_navigation-10` | MAINTAIN TRACK | divergent |
| `vfr_navigation` | 12 | Turning Points Recognition | `vfr_navigation-12` | PILOTAGE | divergent |
| `vfr_navigation` | 13 | GPS Use | `vfr_navigation-13` | NAVIGATION WITH GPS | divergent |
| `vfr_navigation` | 15 | Instrument Procedures | `vfr_navigation-15` | INSTRUMET PROCEDURES | divergent |
| `vfr_navigation` | 17 | Airport Traffic Pattern | `vfr_navigation-17` | TRAFFIC PATTERN PROCEDURES | divergent |
| `vfr_navigation` | 18 | Landing Pattern | `vfr_navigation-18` | OVERHEAD PATTERN | divergent |
| `vfr_navigation` | 22 | Radio Comm. | `vfr_navigation-22` | COMMUNICATION | divergent |

> Also noted, without being counted as a mismatch: MIF `formation` `sn 24`
> (`Tactical Formation`) matches `formation-24` exactly, **but `formation-24b` also
> claims number 24** because of the source's duplicated `(24)` heading (§7.2). Any
> lookup by number alone will return two Formation items for `sn 24`.


---

## 8. Rules for consumers

1. **Normalise Greek/Latin lookalikes before any string matching** (§7.1). Join on
   `id` and on `numbers` ↔ `sn`, never on `name`.
2. **Never infer a table column from reading order** — use `code_1` / `code_3`.
3. **`null` in `plus`/`minus` is not zero.** It means the source sets no limit in that
   direction (`conventions.deviation_null`). An explicit `0` is only ever a printed 0.
4. **Interpolate per leg**, and only when `interpolation == "standard"`.
5. **Filter `key == "preamble"`** and group-title keys (`"a"`, `"b"` with a bare
   role name) when enumerating criteria.
6. **Filter `is_note_row: true`** parameter rows.
7. **`kind: "reference"` is not always about specific criteria only** — on items with
   no `(a)/(b)/(c)` sub-sections it governs the whole item.
8. **Apply the `instrument-28` numeric override manually** (§7.3).
9. **Do not interpret `E`** in MIF cells, and do not treat a `null` cell as “0”.
10. Treat every item carrying a §7.3 flag as **provisional** until confirmed against
    the printed syllabus.
11. **Read numeric standards from `expected_performance.resolved.parameters`, not from
    `specific_criteria.parameters`**, on every item whose `kind` is `none` or
    `reference` — the latter is empty there by design (§9).
12. **Never apply two `provenance` sets at once** on an item whose `resolved` block
    carries **`mutually_exclusive_provenance`** — today exactly one item does:
    `vfr_navigation-16` (`contact-05` vs `formation-17`). Pick one reading before
    grading (§9.6). `status: "resolved"` does **not** waive this: the *question* is
    settled, the two alternative readings are still mutually exclusive.
13. **`rule` is not derivable from `kind`.** 11 items with `kind: "none"` carry
    `rule: "explicit_reference"` (§9.3).

---

## 9. Reference resolution

A resolution pass ran after digitisation. Every item that does **not** print its own
numeric table now carries a derived block, `expected_performance.resolved`, holding the
numeric standards that actually apply to it — the values that the printed
“As described in …” sentences point at, pulled in and made explicit.

`raw/` was **not** touched: the block lives only in `criteria/*.json`, and
`manifest.json` carries the one-word summary `items[].resolved_status`.

**Nothing was invented.** Every row of `resolved.parameters` is a faithful copy of a
donor item's printed row — `code_1_raw` / `code_3_raw`, broken glyphs, source typos and
all — tagged with a `provenance` field naming the donor id. The single authorised
numeric modification in the entire dataset is the `instrument-28` override (§9.5), and
even there the pre-override values are preserved verbatim inside `override_note`.

### 9.1 Coverage and status

| `specific_criteria.kind` | items | `resolved` block | `manifest.items[].resolved_status` |
|---|---|---|---|
| `table` | 38 | **absent** — the item prints its own numbers | `n/a` |
| `none` | 43 | present | `resolved` ×43 |
| `reference` | 37 | present | `resolved` ×37 |

80 blocks in total — **80 `resolved`**, **0 `needs_user_decision`** (§9.6). **195** parameter
rows were copied in (against 111 printed rows in the 38 native tables).

30 of the 80 blocks resolve to **no** numeric rows at all (`parameters: []`). That is not
a failure: they are the purely qualitative items — the four `CRM` blocks, Mission Planning
/ Briefing, Ground Procedures, Clearing, Visual Signals, Radio Communication, Airmanship,
Emergency Procedures, General Knowledge, Special Requirements, and the
`contact-00-general` rule block itself. Their `sources[]` still records *why* no number
applies.

### 9.2 Schema of the `resolved` block

```jsonc
"expected_performance": {
  "general_criteria":  [ ... ],       // unchanged, printed layer
  "specific_criteria": { ... },       // unchanged, printed layer (parameters: [] here)
  "resolved": {
    "status": "resolved" | "needs_user_decision",
    "rule":   "explicit_reference" | "rule_7a5_default",
    "rule_note": "...",               // optional; only where rule ≠ the mechanical kind→rule mapping
    "sources": [ {
        "item":  "<criteria item id>" | null,
        "scope": "which part of the donor applies, and to which part of this item",
        "basis": "the verbatim printed sentence (or rule) that authorises it"
    } ],
    "parameters": [ {
        ... every field of a normal §2.4 parameter row, copied unchanged ...,
        "provenance":    "<donor item id>",   // REQUIRED on every resolved row
        "override_note": "...",               // optional; this row's numbers were modified
        "scope_note":    "..."                // optional; this row applies only to part of the item
    } ],
    "note": "...",                     // optional; records a user ruling applied to this block
    "mutually_exclusive_provenance": [ "<donor id>", "<donor id>" ],
                                       // optional; SAFETY. The listed provenance sets are
                                       // ALTERNATIVE readings — apply exactly one of them
    "mutually_exclusive_note": "...",  // optional; accompanies the field above
    "open_questions": [ "..." ]        // present ONLY when status = "needs_user_decision"
  }
}
```

| field | notes |
|---|---|
| `status` | `resolved` = usable as-is. `needs_user_decision` = the block deliberately holds **mutually exclusive** parameter sets, separated by `provenance`; a consumer must choose one before grading |
| `rule` | closed two-value enum — §9.3 |
| `sources[].item` | the donor item id, or `null` when the pointer is not a syllabus item (4 cases — §9.4) |
| `sources[].scope` | *how much* of the donor applies and to *which* part of this item (e.g. “only the SID leg”, “Contact leg — visual part of the approach”). Several sources per item are normal: 28 of the 80 blocks carry 2 or more |
| `sources[].basis` | the authority, quoted verbatim from the PDF — either the item's own printed cross-reference sentence, or rule 7.a(5) |
| `parameters[].provenance` | mandatory. It is the **only** way to tell which donor a row came from, and the discriminator a consumer uses on `vfr_navigation-16`, the one item that still carries two alternative sets (see `mutually_exclusive_provenance`) |
| `mutually_exclusive_provenance` | **safety gate.** Lists the `provenance` values that are *alternative readings* of the same item. A consumer must apply **exactly one** of them. Present on `vfr_navigation-16` only (`contact-05` = LEADER reading, `formation-17` = WINGMAN reading) — see §9.6 decision 4 |
| `open_questions` | Greek, one bullet per branch of the decision, each stating the numeric consequence of choosing it. **No item carries this key any more** — all were cleared by the 2026-07-31 ruling |

`sources` is *not* parallel to `parameters` — one source can back several rows, and a
source may back none at all (rule sources, external pointers). Join the two through
`sources[].item` ↔ `parameters[].provenance`.

Donor totals (195 rows): `contact-05` ×69, `contact-24` ×24, `instrument-04` ×21,
`formation-24b` ×18, `contact-23` ×16, `vfr_navigation-05` ×12, `formation-17` ×8,
`instrument-23` ×8, `instrument-24` ×8, `contact-02` ×8, `formation-18` ×2,
`formation-13` ×1.

`instrument-18` and `instrument-03` are **no longer donors** — the user ruling of
2026-07-31 (decisions 1α and 6β, §9.6) removed their rows. They survive only as
non-applied historical entries in the respective `sources[]`. `formation-13` is a donor
**to itself**: decision 2α made its own printed `+ 10' / − 5'` the VERTICAL SEPARATION row.

### 9.3 `rule` — a closed enum, and *not* a function of `kind`

* **`explicit_reference`** (48 items) — the source prints an explicit pointer *anywhere
  inside the item*: in `2/ SPECIFIC CRITERIA`, but equally in `(a) EXECUTION`,
  `(b) CONDITIONS` or `1/ GENERAL CRITERIA`. The sentence is quoted verbatim in
  `sources[].basis`.
* **`rule_7a5_default`** (32 items) — no explicit pointer anywhere in the item; the
  default rule 7.a(5) applies (§9.4).

The trap: **`rule` cannot be derived from `specific_criteria.kind`.** All 37
`kind: "reference"` items are `explicit_reference` as expected, but so are **11** items
whose `kind` is `none`, because their pointer is printed outside the specific-criteria
sub-section:

`formation-01`, `formation-05`, `formation-13`, `formation-15`, `formation-33`,
`formation-34`, `formation-36`, `vfr_navigation-14`, `vfr_navigation-22`,
`vfr_navigation-23`, `vfr_navigation-24`.

The four `vfr_navigation` ones carry an explicit `rule_note` saying so, precisely so that
a `kind ↔ rule` validator does not report them as false positives.

> `criteria/formation.json` → `source.conventions.resolved_rule` declares this convention
> — but it counts **seven** such items, because it speaks only for its own file. Corpus-wide
> the number is **eleven**. Do not use the convention's list as a global filter.

Consequently: filter on `rule == "rule_7a5_default"` to get *only* the items resolved by
the default rule; filter on `specific_criteria.kind == "none"` to get all items that print
no table. The two sets are **not** the same (32 vs 43).

### 9.4 Rule 7.a(5) — the default

Printed at `7. PERFORMANCE CRITERIA` → `a. GENERAL`, rule **(5)**, PDF p. 24; stored
verbatim at `contact-00-general` → `general_criteria` → `key: "5"`:

> “When specific criteria are not mentioned for certain maneuvers, general criteria will
> be applied, along with criteria described in the Basic A/C Control standards.”

“The Basic A/C Control standards” resolve per category to:

| category | Basic A/C Control item | rows |
|---|---|---|
| contact | `contact-05` (5) BASIC A/C CONTROL, PDF 29–30 | ALTITUDE (feet), AIRSPEED (knots), EXIT HEADING (degrees) |
| instrument | `instrument-04` (4) BASIC A/C CONTROL, PDF 49–50 | ALTITUDE (feet), AIRSPEED (KIAS), HEADING (degrees) |
| vfr_navigation | `vfr_navigation-05` (5) BASIC A/C CONTROL / WINGMAN CONSIDERATION | ALTITUDE\* (feet), AIRSPEED (knots), HEADING (degrees) |
| formation | **none of its own** — `formation-29` (29) BASIC A/C - FORMATION CONTROL prints no table, so the category borrows `contact-05`, on the authority of its own `formation-03` (“The A/C Basic Control of Contact category specific criteria apply.”) | as `contact-05` |

**The three printed tables (`contact-05`, `instrument-04`, `vfr_navigation-05`) carry
numerically identical limits** — `± 300′ / ± 150′` altitude, `± 20 / ± 10` speed,
`± 10° / ± 5°` heading — differing only in parameter labels and in which broken glyph the
PDF used for `±`. That is why several ambiguities about *which* Basic A/C Control table to
load turn out to be numerically indifferent, and it is stated as such in the relevant
`basis` fields. `contact-05`'s table is additionally scoped by its printed lead-in,
“For Straight and Level Flight and turns up to 60° of bank:”.

`sources[].item` is `null` in exactly four blocks, all of them deliberate:

* `contact-00-general` — it *is* the text that defines rule 7.a(5); `null` avoids a
  self-referential edge in graph traversal.
* `instrument-34` (SPECIAL REQUIREMENTS) — points at the MIF tables and the Training
  Exercises analysis, i.e. outside the criteria corpus.
* `vfr_navigation-15` and `vfr_navigation-20` (the genuine source duplication of §7.2) —
  a *conditional set* pointer: if a named instrument procedure is actually flown on the
  navigation sortie, that procedure's own table (`instrument-03`, `-12`, `-13`, `-14`,
  `-15`, `-16`, `-17`, `-18`, `-20`, `-21`, `-22`, `-23`, `-24`, `-29`) applies **in
  addition**. Those tables were **not** copied in, because the source names no specific
  one; only `instrument-04` is loaded unconditionally.

### 9.5 The `instrument-28` override — the only modified numbers

`instrument-28` (LANDING, after a precision approach) prints, as its entire specific
criteria (`kind: "reference"`, no table):

> “Specific criteria of the corresponding section of the Contact category apply, except
> for the parameters regarding the touch down from the beginning of RWY (for landing
> after Precision Approach). Specifically, for standard “1” the effective distance limits
> are modified to ± 1.000 feet and for standard “3” to ± 500 feet, from the projected
> Touch Down Point.”

Resolution: all six rows of the `contact-24` LANDING table (sub-tables
`a/ FLAPS LDG - FLAPS T/O – AΟA.` and `b/ FLAPS UP`) were copied with
`provenance: "contact-24"`; the **two `TOUCH DOWN POINT` rows were then modified**, and
only those. The other four (`DEVIATION FROM CENTER LINE` ×2, `TOUCH DOWN SPEED` ×2) are
byte-faithful copies.

| | `contact-24` as printed | `instrument-28` after override |
|---|---|---|
| sub-table `a/` code 1 / code 3 | `1500΄` / `1000΄` | `± 1.000 feet` / `± 500 feet` |
| sub-table `b/` code 1 / code 3 | `2000΄` / `1500΄` | `± 1.000 feet` / `± 500 feet` |
| `code_*.kind` | `nominal_change` (`value`) | `deviation` (`plus` = `minus`) |
| reference point | **the beginning of the runway** (an absolute maximum distance) | **the projected touch-down point** (a symmetric deviation) |
| `interpolation` | `undefined` | `standard` — code “2” = 500–1 000 ft |

Three things a consumer must not get wrong:

1. **`± 1.000 feet` is 1 000 ft**, not 1.0 ft — European thousands separator.
2. **The reference point changes**, not just the numbers. A pipeline that keeps measuring
   from the runway threshold will grade the wrong quantity.
3. **The `notes` field of those two rows still describes the original `contact-24`
   semantics**, because it was copied faithfully. It is prefixed with
   `[ΥΠΕΡΒΑΣΗ instrument-28 …]` so that the contradiction is visible to a consumer that
   renders `notes` without reading `override_note`. `override_note` is authoritative.

**Scope caveat, unresolved:** the printed parenthesis “(for landing after Precision
Approach)” limits the override to ILS / GCA PAR landings. Taken literally, landings after
a **non-precision** approach (VOR / TACAN / LOCALIZER / ASR) keep the original
`contact-24` limits. The dataset applies the override to the whole item and records the
caveat in `override_note`; see decision **5** in `USER_DECISIONS.md`.

### 9.6 `needs_user_decision` — ALL ANSWERED (user ruling of 2026-07-31)

The three items that could not be resolved without a human ruling were answered by the
user on **2026-07-31**: **1α, 2α, 3α, 4 = general, 5α, 6β, 7α**. All three are now
`resolved`; nothing in `criteria/` or `manifest.json` carries `needs_user_decision` any
more and the manifest counts read **80 `resolved` / 0 `needs_user_decision` / 38 `n/a`**.
`USER_DECISIONS.md` holds the questions as they were posed plus the per-decision record of
what was applied.

| # | item | answer (2026-07-31) | effect on the data |
|---|---|---|---|
| **1** | `instrument-19` | **1α** — Reading A, Basic A/C Control only | the 2 rows with `provenance: "instrument-18"` **deleted**; only the 3 `instrument-04` rows survive |
| **2** | `formation-13` | **2α** — the item's own `+ 10' / − 5'` **replaces** | VERTICAL SEPARATION rewritten to `plus: 10 / minus: 5` for **both** codes |
| **3** | `formation-13` | **3α** — OBSERVANCE ANGLE **is** the longitudinal criterion | row kept unchanged; ruling recorded in its `note` |
| **4** | `vfr_navigation-16` | **general** — *not* specialized by role | **both** sets kept (`contact-05` + `formation-17`), each with its own scope |
| **5** | `instrument-28` | **5α** — current default confirmed | **no data change** |
| **6** | `vfr_navigation-04` | **6β** — strict reading of rule 7.a(5) | the `COURSE DEVIATION (radials)` row **deleted** |
| **7** | `vfr_navigation-15` / `-20` | **7α** — current default confirmed | **no data change** |

Where a ruling changed or removed data, the item's `resolved` block records it in a `note`
field, the affected row carries an `override_note`, and the donor that stopped supplying
values is kept in `sources` **as a historical note only** — flagged `ΔΕΝ ΕΦΑΡΜΟΖΕΤΑΙ` so
the rejected reading stays visible without being consumable.

---

**Item 1 of 3 · `instrument-19` — EN-ROUTE DESCENT** (PDF p. 56, `kind: "none"`,
`rule: "rule_7a5_default"`) — `USER_DECISIONS.md` → **decision 1** ·
**ANSWERED 2026-07-31 → 1α**

Printed authority, in full: *“Instrument Descent and A/C Basic Control Training Exercises
General Criteria apply.”* — it names the **General** criteria of two exercises, and the
item prints no `2/ SPECIFIC CRITERIA` at all.

*The question, and how it was settled:*

* **Scope ambiguity.** The sentence names general criteria only; the item has no printed
  specific criteria.
* ✅ **Reading A — Basic A/C Control only** (strictly literal, rule 7.a(5)) — **CHOSEN**:
  only the `instrument-04` table applies — ALTITUDE `± 300΄ / ± 150΄`, AIRSPEED (KIAS)
  `± 20 / ± 10`, HEADING `± 10° / ± 5°` (the 3 rows with `provenance: "instrument-04"`).
  `instrument-18`'s general criteria a/b/c are purely qualitative and add no numbers.
  *Applied: the 2 rows with `provenance: "instrument-18"` were deleted.*
* ❌ **Reading B — plus the specific criteria of Instrument Descent** (extensive) —
  **REJECTED**: it would have added AIRSPEED (knots) `+15 / −10` · `+10 / −5` and
  MAINTAINING COURSE (radials) `± 8 / ± 5`.
* **Explicit numeric conflict — airspeed: RESOLVED.** The block used to hold two mutually
  exclusive airspeed rows. Only `AIRSPEED (KIAS) ± 20 / ± 10` (`instrument-04`) remains;
  the tighter, asymmetric `instrument-18` row is gone, and so is the `± 8 / ± 5` radial
  course limit that the syllabus never printed against item (19).
* `resolved.note`: `"User decision 2026-07-31: 1α"`. `sources` still lists `instrument-18`,
  marked as a non-applied historical note.

---

**Item 2 of 3 · `formation-13` — FORMATION APPROACH.** (PDF pp. 68–69, `kind: "none"`,
`rule: "explicit_reference"`, role WINGMAN) — `USER_DECISIONS.md` → **decisions 2 and 3** ·
**ANSWERED 2026-07-31 → 2α and 3α**

Printed authority, in full: *“The fingertip criteria, concerning longitudinal and lateral
separation, are applied. Moreover, SP can fly up to + 10' / - 5' altitude difference from
Leader's wing level.”* → the target (`formation-17` FINGERTIP, sub-section
`2/ SPECIFIC CRITERIA (AS WINGMAN)`) was never in doubt; its **extent** was.

*The questions, and how they were settled:*

* ✅ **Vertical dimension → 2α, REPLACEMENT.** The item's own `+ 10' / − 5'` **overrides**
  the copied `formation-17` row for **both** codes. Applied: `code_1` = `code_3` =
  `{kind: "deviation", plus: 10, minus: 5}`, `code_1_raw` = `code_3_raw` = `+ 10' / - 5'`,
  `interpolation: "undefined"` (there is no code-to-code difference left to interpolate),
  `provenance` moved from `formation-17` to **`formation-13`** (the item itself), and the
  row's `override_note` now reads: *“Per user decision 2α (2026-07-31): the printed
  '+ 10' / - 5' altitude difference from Leader's wing level' replaces the Fingertip
  VERTICAL SEPARATION line for both codes.”* The superseded values were `+ 6’, − 10’`
  (code 1) and `± 4’` (code 3).
* ❌ Reading (B) — *additional* absolute safety limit on top of the fingertip criteria —
  **REJECTED**.
* ✅ **Longitudinal dimension → 3α.** OBSERVANCE ANGLE (`50° ± 5°` code 1 / `30° ± 5°`
  code 3) **is** the longitudinal criterion. The row is kept exactly as it was and now
  carries `note`: *“Per user decision 3α (2026-07-31): the Observance Angle renders the
  longitudinal position — no separate longitudinal criterion.”* The FINGERTIP table still
  has no row literally labelled *longitudinal*; none is needed.
* `resolved.note`: `"User decision 2026-07-31: 2α, 3α"`.

---

**Item 3 of 3 · `vfr_navigation-16` — FORMATION APPROACH** (PDF p. 88,
`kind: "reference"`, `rule: "explicit_reference"`) — `USER_DECISIONS.md` → **decision 4** ·
**ANSWERED 2026-07-31 → general, not specialized by role**

Printed authority, in full: *“As described in Formation Category.”*

*The question, and how it was settled:*

* **Target ambiguity (unchanged as a fact).** The Formation category contains **two** items
  with this name — `formation-06` “(6) FORMATION APPROACH” (role **LEADER**, PDF 64) and
  `formation-13` “(13) FORMATION APPROACH.” (role **WINGMAN**, PDF 68–69). The source does
  not say which.
* ✅ **Ruling: keep it general — do not specialize by role at this level.** **Both** sets
  stay, told apart by `provenance` exactly as before, each with its own scope:
  * **`contact-05` set** (the LEADER reading via `formation-06`) — ALTITUDE
    `± 300΄ / ± 150΄`, AIRSPEED `± 20 / ± 10` kt, EXIT HEADING `± 10° / ± 5°`.
  * **`formation-17` set** (the WINGMAN reading via `formation-13`) — LATERAL SEPARATION
    `−0΄/+20΄` (code 1) and `−0΄/+10΄` (code 3), VERTICAL SEPARATION **`+ 10' / − 5'` for
    both codes** (see the inherited ruling below), OBSERVANCE ANGLE `50° ± 5°` / `30° ± 5°`.
* `resolved.note`: `"User decision (2026-07-31): keep general — not specialized by role at
  this level."` Neither set was deleted, so a consumer must still not apply the two
  simultaneously — pick the one that matches the sortie. Because `status` is now
  `resolved` and can no longer carry that warning, the block declares it explicitly and
  machine-readably: `resolved.mutually_exclusive_provenance: ["contact-05",
  "formation-17"]` (§9.2, §8 rule 12). This is the **only** item in the corpus with it.

> **Inherited ruling (decision 2 → decision 4):** the `formation-13` vertical-separation
> ruling propagated here. The VERTICAL SEPARATION row of the **`formation-17` set** in
> `vfr_navigation-16` received the *same* replacement — `plus: 10 / minus: 5` for both
> codes, `interpolation: "undefined"`, and the identical `override_note`. Its `provenance`
> deliberately stays `"formation-17"`, because decision 4 keeps the two sets keyed by that
> field. `vfr_navigation-07` (FINGERTIP) is **not** affected: it references `formation-17`
> as a pure fingertip exercise, not through `formation-13`, so it keeps `+ 6’, − 10’` /
> `± 4’`.

### 9.7 Consuming the `resolved` block

1. On `kind: "none"` / `"reference"` items, read numbers from `resolved.parameters`.
   `specific_criteria.parameters` is empty there and always will be.
2. On `kind: "table"` items there is **no** `resolved` block — read
   `specific_criteria.parameters` as before. `resolved_status: "n/a"` in the manifest marks
   exactly these 38.
3. Everything in §2.4 / §2.5 still holds for a resolved row: `null` ≠ 0, interpolate per
   leg and only when `interpolation == "standard"`, never infer a column from order.
4. Honour `override_note` and `scope_note` **on the row**. They exist because a row can
   travel away from its item's prose — e.g. `instrument-28`'s two touch-down rows (values
   modified, §9.5), and the VERTICAL SEPARATION rows of `formation-13` /
   `vfr_navigation-16` (replaced by decision 2α). *(The former `scope_note` example,
   `vfr_navigation-04`'s `COURSE DEVIATION (radials)` row, no longer exists — deleted by
   user decision 6β, 2026-07-31.)*
5. Gate on `mutually_exclusive_provenance` before grading. Where it is present the
   parameter list is deliberately over-complete: pick the one `provenance` set that
   matches the sortie. Today only `vfr_navigation-16` carries it. (`status` is
   `resolved` on all 80 blocks; `needs_user_decision` no longer occurs.)
6. `resolved` is a **derived** layer. If `raw/` is corrected and the merge re-run, the
   resolution must be re-run too — it is not reconstructible from `raw/` alone.
