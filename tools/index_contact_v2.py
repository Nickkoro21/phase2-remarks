# -*- coding: utf-8 -*-
"""Validate + index data/observations2/contact (schema v2-trunk).

Checks only; never edits the source JSON. Writes index.json.
"""
import json, io, re, sys
from pathlib import Path

FOLDER = Path(r"D:\FDMS\data\observations2\contact")
CATEGORY = "contact"
SCHEMA = "v2-trunk"

# The two families this round added, as SIBLINGS of `texts` (never keys inside
# it - the `extra` check below is exactly what would reject them there).
AT_KEYS = ["0", "1", "2", "3"]
ABOVE_KEYS = ["1", "2", "3", "4"]
FAMILIES = [("texts_at", AT_KEYS), ("texts_above", ABOVE_KEYS)]

LEVELS = ["0", "1", "2", "3", "4", "marginal"]
TOP_REQUIRED = ["item_id", "item_name", "category", "schema", "mif_numbers", "mif_rows", "error_modes"]
MODE_REQUIRED = ["id", "label", "mif_row", "source", "hf_concept", "texts"]

# Abbreviations whose trailing period must NOT count as a sentence end.
ABBREV = {
    "no", "nos", "no1", "no2", "no3", "no4", "vs", "eg", "ie", "etc", "approx",
    "alt", "hdg", "ft", "kt", "kts", "nm", "sec", "min", "hr", "hrs",
    "mr", "mrs", "ms", "dr", "st", "jr", "sr", "fig", "ref", "para", "sect",
    "capt", "lt", "col", "sgt", "maj", "gen", "cpt", "u.s", "a.m", "p.m",
    "i.e", "e.g", "vol", "ch", "pp", "cf", "dep", "arr", "max", "min",
}

def count_sentences(text):
    """Abbreviation-aware sentence count.

    A terminator counts only when followed by whitespace or end-of-string, so
    intra-token periods ("1.5 G", "B.O 3-1") never split a sentence. A known
    abbreviation is discounted only when the next word starts lowercase --
    "... within 15 ft. The excess ..." is a real boundary, "e.g. the wing" is not.
    """
    n = 0
    for m in re.finditer(r"[.!?]+(?=\s|$)", text):
        prefix = text[:m.start()]
        tok = re.search(r"([A-Za-z0-9.]+)$", prefix)
        word = tok.group(1).lower().strip(".") if tok else ""
        nxt = re.match(r"\s+(\S)", text[m.end():])
        follows_lower = bool(nxt) and nxt.group(1).islower()
        if word in ABBREV and follows_lower:
            continue
        n += 1
    if n == 0 and text.strip():
        n = 1
    return n

def main():
    files = sorted(p for p in FOLDER.glob("*.json") if p.name != "index.json")
    issues = []
    items = []
    modes_total = 0
    texts_total = 0
    fam_totals = {"texts_at": 0, "texts_above": 0}
    seen_item_ids = {}
    global_mode_ids = {}

    for p in files:
        rel = p.name
        try:
            raw = p.read_bytes()
            data = json.loads(raw.decode("utf-8"))
        except Exception as e:
            issues.append(f"{rel}: PARSE FAILED: {e}")
            continue

        for k in TOP_REQUIRED:
            if k not in data:
                issues.append(f"{rel}: missing top-level field '{k}'")
        if data.get("category") != CATEGORY:
            issues.append(f"{rel}: category is {data.get('category')!r}, expected {CATEGORY!r}")
        if data.get("schema") != SCHEMA:
            issues.append(f"{rel}: schema is {data.get('schema')!r}, expected {SCHEMA!r}")

        item_id = data.get("item_id") or p.stem
        if item_id in seen_item_ids:
            issues.append(f"{rel}: duplicate item_id {item_id!r} (also in {seen_item_ids[item_id]})")
        seen_item_ids[item_id] = rel
        if item_id != p.stem:
            issues.append(f"{rel}: item_id {item_id!r} does not match filename stem {p.stem!r}")

        mif_rows = data.get("mif_rows") or []
        row_names = set()
        row_sns = set()
        for r in mif_rows:
            if not isinstance(r, dict) or "sn" not in r or "row_name" not in r:
                issues.append(f"{rel}: malformed mif_rows entry {r!r}")
                continue
            row_names.add(r["row_name"])
            row_sns.add(r["sn"])

        modes = data.get("error_modes") or []
        if not modes:
            issues.append(f"{rel}: no error_modes")
        local_ids = {}
        for i, m in enumerate(modes):
            tag = f"{rel}[{i}]"
            if not isinstance(m, dict):
                issues.append(f"{tag}: mode is not an object")
                continue
            mid = m.get("id")
            tag = f"{rel}:{mid or '?'}"
            for k in MODE_REQUIRED:
                if k not in m:
                    issues.append(f"{tag}: missing mode field '{k}'")
            if not mid:
                issues.append(f"{rel}[{i}]: mode has no id")
            else:
                if mid in local_ids:
                    issues.append(f"{rel}: duplicate mode id {mid!r}")
                local_ids[mid] = True
                if mid in global_mode_ids:
                    issues.append(f"{rel}: mode id {mid!r} also used in {global_mode_ids[mid]}")
                global_mode_ids[mid] = rel
                if not mid.startswith(item_id + "-"):
                    issues.append(f"{tag}: mode id does not start with '{item_id}-'")
            if not m.get("label"):
                issues.append(f"{tag}: empty label")

            # mif_row: null, a row_name string, or an int matching a mif_rows sn
            # (app.js expandV2() resolves ints through mif_rows[].sn).
            mr = m.get("mif_row", "__MISSING__")
            if mr != "__MISSING__" and mr is not None:
                if isinstance(mr, bool) or not isinstance(mr, (str, int)):
                    issues.append(f"{tag}: mif_row has unsupported type {type(mr).__name__}")
                elif isinstance(mr, int):
                    if mr not in row_sns:
                        issues.append(f"{tag}: mif_row sn {mr} not present in mif_rows sns {sorted(row_sns)}")
                elif mr not in row_names:
                    issues.append(f"{tag}: mif_row {mr!r} not present in mif_rows {sorted(row_names)}")

            texts = m.get("texts")
            if not isinstance(texts, dict):
                issues.append(f"{tag}: texts is not an object")
                continue
            missing = [lv for lv in LEVELS if lv not in texts]
            if missing:
                issues.append(f"{tag}: missing texts keys {missing}")
            extra = [k for k in texts if k not in LEVELS]
            if extra:
                issues.append(f"{tag}: unexpected texts keys {extra}")
            for lv in LEVELS:
                t = texts.get(lv)
                if t is None:
                    continue
                if not isinstance(t, str):
                    issues.append(f"{tag}[{lv}]: text is not a string")
                    continue
                texts_total += 1
                if not t.strip():
                    issues.append(f"{tag}[{lv}]: empty text")
                    continue
                # ASCII-only
                bad = sorted({ch for ch in t if ord(ch) > 126 or (ord(ch) < 32 and ch != "\n")})
                if bad:
                    issues.append(
                        f"{tag}[{lv}]: non-ASCII chars {[hex(ord(c)) + ' ' + repr(c) for c in bad]}")
                ns = count_sentences(t)
                if ns < 2 or ns > 5:
                    issues.append(f"{tag}[{lv}]: {ns} sentences (expected 2-5)")
                if not t.strip()[-1] in ".!?":
                    issues.append(f"{tag}[{lv}]: does not end with sentence terminator")
                if "  " in t:
                    issues.append(f"{tag}[{lv}]: contains double space")
                if t != t.strip():
                    issues.append(f"{tag}[{lv}]: leading/trailing whitespace")
            # --- the relation families (spec 2.2) -------------------------
            for fam, legal in FAMILIES:
                block = m.get(fam)
                if block is None:
                    continue
                if not isinstance(block, dict):
                    issues.append(f"{tag}: {fam} is not an object")
                    continue
                bad_keys = [k for k in block if k not in legal]
                if bad_keys:
                    issues.append(f"{tag}: unexpected {fam} keys {bad_keys}")
                for lv, t in block.items():
                    if lv not in legal or t is None:
                        continue
                    if not isinstance(t, str):
                        issues.append(f"{tag}.{fam}[{lv}]: text is not a string")
                        continue
                    fam_totals[fam] += 1
                    if not t.strip():
                        issues.append(f"{tag}.{fam}[{lv}]: empty text")
                        continue
                    bad = sorted({ch for ch in t
                                  if ord(ch) > 126 or (ord(ch) < 32 and ch != "\n")})
                    if bad:
                        issues.append(f"{tag}.{fam}[{lv}]: non-ASCII chars "
                                      f"{[hex(ord(c)) + ' ' + repr(c) for c in bad]}")
                    # texts_above is 2-4: the composer appends one sentence more.
                    hi = 4 if fam == "texts_above" else 5
                    ns = count_sentences(t)
                    if ns < 2 or ns > hi:
                        issues.append(f"{tag}.{fam}[{lv}]: {ns} sentences (expected 2-{hi})")
                    if t.strip()[-1] not in ".!?":
                        issues.append(f"{tag}.{fam}[{lv}]: does not end with sentence terminator")
                    if "  " in t:
                        issues.append(f"{tag}.{fam}[{lv}]: contains double space")
                    if t != t.strip():
                        issues.append(f"{tag}.{fam}[{lv}]: leading/trailing whitespace")


        modes_total += len(modes)
        items.append({
            "item_id": item_id,
            "item_name": data.get("item_name", ""),
            "file": rel,
            "modes": len(modes),
        })

    index = {
        "category": CATEGORY,
        "schema": SCHEMA,
        "generated_items": len(items),
        "modes_total": modes_total,
        "texts_total": texts_total,
        "texts_at_total": fam_totals["texts_at"],
        "texts_above_total": fam_totals["texts_above"],
        "items": items,
    }
    # indent=2 + LF, matching contact/index.json and instrument/index.json.
    out = FOLDER / "index.json"
    body = json.dumps(index, ensure_ascii=False, indent=2) + "\n"
    with io.open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(body)

    print(f"items={len(items)} modes={modes_total} texts={texts_total}")
    print(f"issues={len(issues)}")
    for s in issues:
        print("  ! " + s)

main()
