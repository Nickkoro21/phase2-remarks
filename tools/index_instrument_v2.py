# -*- coding: utf-8 -*-
"""Validate + index data/observations2/instrument (schema v2-trunk).

Checks (report only -- NEVER edits the data files):
  * JSON parses, required top-level fields present
  * every error_mode carries all six texts keys: 0,1,2,3,4,marginal
  * every text is 2-5 sentences (abbreviation-aware counting)
  * every text is ASCII-only
  * mode ids unique inside a file (and reported if duplicated across files)
  * mif_row is null OR matches an entry of the file's mif_rows
  * technique modes (id *-tmNN) carry a source "technique:<section> <title>"
    that resolves to a real section of data/technique/technique.json
    (section number must exist; title must match that section's title)
  * mif_row references the row by its 'sn' (row_name strings are accepted but
    reported as a style deviation)
  * hf_concept, when present, resolves to an id of data/human_factors.json

Writes: data/observations2/instrument/index.json
"""
import io
import json
import re
import sys
import unicodedata
from pathlib import Path

CATEGORY = "instrument"
SCHEMA = "v2-trunk"

# The two families this round added, as SIBLINGS of `texts` (never keys inside
# it - the `extra` check below is exactly what would reject them there).
AT_KEYS = ["0", "1", "2", "3"]
ABOVE_KEYS = ["1", "2", "3", "4"]
FAMILIES = [("texts_at", AT_KEYS), ("texts_above", ABOVE_KEYS)]

ROOT = Path(r"D:\FDMS")
FOLDER = ROOT / "data" / "observations2" / CATEGORY
OUT = FOLDER / "index.json"
TECHNIQUE = ROOT / "data" / "technique" / "technique.json"
HUMAN_FACTORS = ROOT / "data" / "human_factors.json"

LEVELS = ["0", "1", "2", "3", "4", "marginal"]
REQUIRED_TOP = ["item_id", "item_name", "category", "schema", "mif_numbers",
                "mif_rows", "error_modes"]
MIN_SENT, MAX_SENT = 2, 5

TM_ID = re.compile(r"-tm\d+$")
TM_SRC = re.compile(r"^technique:\s*([0-9]+(?:\.[0-9]+)*)\s+(.*)$")

# Never sentence-final: skipped even when followed by a capital letter.
HARD_ABBREV = {
    "mr", "mrs", "ms", "dr", "prof", "capt", "lt", "col", "gen", "sgt", "maj",
    "jr", "sr", "st", "no", "nr", "fig", "vol", "ed", "para", "pt", "dept",
    "univ", "inc", "ltd", "co",
}
# May end a sentence: skipped only when followed by a digit / lowercase word.
SOFT_ABBREV = {
    "e.g", "i.e", "etc", "vs", "cf", "approx", "est", "incl", "excl", "al",
    "sec", "min", "max", "avg", "ref",
    "ft", "kt", "kts", "nm", "sm", "km", "kg", "lb", "lbs", "hr", "hrs",
    "gal", "hg", "mb", "rpm", "deg", "alt", "hdg", "crs", "wpt", "nav",
    "rwy", "twy", "elev", "freq",
}
DOTTED = re.compile(r"^(?:[A-Za-z]\.){2,}$")
SENT_END = re.compile(r"([.!?]+)(\s+|$)")


def count_sentences(text):
    """Abbreviation-aware sentence count (same rules as the other v2 indexers)."""
    n = 0
    for m in SENT_END.finditer(text):
        punct = m.group(1)
        before = text[:m.start()]
        tail = text[m.end():]
        nxt = tail[:1]
        soft_ctx = nxt.isdigit() or (nxt.isalpha() and nxt.islower())
        word = re.split(r"[\s(\[\"']", before)[-1] if before else ""
        probe = word.lower().rstrip(".")
        if punct == ".":
            if probe in HARD_ABBREV:
                continue
            if probe in SOFT_ABBREV and soft_ctx:
                continue
            if DOTTED.match(word + ".") and soft_ctx:
                continue
            if len(word) == 1 and word.isalpha() and word.isupper():
                continue
        if nxt and nxt.isalpha() and nxt.islower():
            continue
        n += 1
    stripped = text.rstrip()
    if stripped and not re.search(r"[.!?]$", stripped):
        n += 1
    return n


def non_ascii_report(text):
    bad = {}
    for ch in text:
        if ord(ch) > 127:
            key = "U+%04X %s" % (ord(ch), unicodedata.name(ch, "?"))
            bad[key] = bad.get(key, 0) + 1
    return bad


def row_keys(mif_rows):
    """(all accepted identifiers, canonical 'sn' identifiers)."""
    keys = set()
    sns = set()
    for r in mif_rows or []:
        if isinstance(r, dict):
            for k in ("sn", "row_name", "id", "name"):
                if r.get(k) is not None:
                    keys.add(str(r[k]).strip())
            if r.get("sn") is not None:
                sns.add(str(r["sn"]).strip())
        else:
            keys.add(str(r).strip())
    return keys, sns


def load_hf_ids():
    if not HUMAN_FACTORS.exists():
        return None
    data = json.loads(HUMAN_FACTORS.read_text(encoding="utf-8"))
    acc = set()

    def walk(o):
        if isinstance(o, dict):
            if isinstance(o.get("id"), str):
                acc.add(o["id"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(data)
    return acc


def load_technique_sections():
    data = json.loads(TECHNIQUE.read_text(encoding="utf-8"))
    by_num = {}
    for s in data.get("sections", []):
        num = str(s.get("section") or "").strip()
        if num:
            by_num[num] = s
    return by_num


def norm_title(t):
    t = (t or "").lower()
    t = t.replace("\u2019", "'").replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def main():
    issues = []
    items = []
    modes_total = 0
    tm_modes_total = 0
    texts_total = 0
    fam_totals = {"texts_at": 0, "texts_above": 0}
    seen_ids_global = {}
    sections = load_technique_sections()
    hf_ids = load_hf_ids()

    files = sorted(p for p in FOLDER.glob("*.json") if p.name != "index.json")
    if not files:
        print("no data files found in %s" % FOLDER)
        return 1

    for f in files:
        raw = f.read_bytes()
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception as e:
            issues.append("%s: JSON parse error: %s" % (f.name, e))
            continue

        for key in REQUIRED_TOP:
            if key not in data:
                issues.append("%s: missing top-level field '%s'" % (f.name, key))

        if data.get("category") != CATEGORY:
            issues.append("%s: category=%r (expected %r)"
                          % (f.name, data.get("category"), CATEGORY))
        if data.get("schema") != SCHEMA:
            issues.append("%s: schema=%r (expected %r)"
                          % (f.name, data.get("schema"), SCHEMA))

        item_id = data.get("item_id") or f.stem
        item_name = data.get("item_name") or ""
        if not item_name:
            issues.append("%s: empty item_name" % f.name)
        if item_id != f.stem:
            issues.append("%s: item_id=%r does not match filename stem %r"
                          % (f.name, item_id, f.stem))

        valid_rows, sn_rows = row_keys(data.get("mif_rows"))
        modes = data.get("error_modes") or []
        if not isinstance(modes, list) or not modes:
            issues.append("%s: error_modes missing or empty" % f.name)
            modes = []

        seen_local = set()
        n_tm = 0
        for i, m in enumerate(modes, 1):
            tag = "%s[%s]" % (f.name, m.get("id") if isinstance(m, dict) else i)
            if not isinstance(m, dict):
                issues.append("%s: mode #%d is not an object" % (f.name, i))
                continue

            mid = m.get("id") or ""
            if not mid:
                issues.append("%s: mode #%d has no id" % (f.name, i))
            else:
                if mid in seen_local:
                    issues.append("%s: duplicate mode id '%s'" % (f.name, mid))
                seen_local.add(mid)
                if mid in seen_ids_global:
                    issues.append("%s: mode id '%s' also used in %s"
                                  % (f.name, mid, seen_ids_global[mid]))
                else:
                    seen_ids_global[mid] = f.name
                if not mid.startswith(item_id + "-"):
                    issues.append("%s: mode id '%s' does not use the item prefix"
                                  % (f.name, mid))

            if not m.get("label"):
                issues.append("%s: missing label" % tag)

            mr = m.get("mif_row", None)
            if mr is not None:
                if str(mr).strip() not in valid_rows:
                    issues.append("%s: mif_row %r not present in mif_rows %s"
                                  % (tag, mr, sorted(valid_rows)))
                elif sn_rows and str(mr).strip() not in sn_rows:
                    issues.append("%s: mif_row %r references the row by name; "
                                  "the category convention is the numeric 'sn'"
                                  % (tag, mr))

            hfc = m.get("hf_concept")
            if hfc and hf_ids is not None and hfc not in hf_ids:
                issues.append("%s: hf_concept %r is free text, not an id of "
                              "human_factors.json" % (tag, hfc))

            # ---- technique-mode source resolution -------------------------
            if TM_ID.search(mid):
                n_tm += 1
                src = m.get("source") or ""
                mo = TM_SRC.match(src)
                if not mo:
                    issues.append("%s: tm-mode source %r is not "
                                  "'technique:<section> <title>'" % (tag, src))
                else:
                    num, title = mo.group(1), mo.group(2).strip()
                    sec = sections.get(num)
                    if sec is None:
                        issues.append("%s: tm-mode source section %r not found "
                                      "in technique.json" % (tag, num))
                    elif norm_title(title) != norm_title(sec.get("title")):
                        issues.append("%s: tm-mode source title %r != "
                                      "technique.json title %r for section %s"
                                      % (tag, title, sec.get("title"), num))

            texts = m.get("texts")
            if not isinstance(texts, dict):
                issues.append("%s: texts missing or not an object" % tag)
                continue

            missing = [k for k in LEVELS if k not in texts]
            if missing:
                issues.append("%s: texts missing keys %s" % (tag, missing))
            extra = [k for k in texts if k not in LEVELS]
            if extra:
                issues.append("%s: texts has unexpected keys %s" % (tag, extra))

            for lvl in LEVELS:
                t = texts.get(lvl)
                if t is None:
                    continue
                if not isinstance(t, str):
                    issues.append("%s.%s: text is not a string" % (tag, lvl))
                    continue
                texts_total += 1
                if not t.strip():
                    issues.append("%s.%s: empty text" % (tag, lvl))
                    continue
                bad = non_ascii_report(t)
                if bad:
                    issues.append("%s.%s: non-ASCII %s"
                                  % (tag, lvl, ", ".join(sorted(bad))))
                n = count_sentences(t)
                if n < MIN_SENT or n > MAX_SENT:
                    issues.append("%s.%s: %d sentences (expected %d-%d) :: %s"
                                  % (tag, lvl, n, MIN_SENT, MAX_SENT,
                                     t[:110].replace("\n", " ")))
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
        tm_modes_total += n_tm
        items.append({
            "item_id": item_id,
            "item_name": item_name,
            "file": f.name,
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
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(index, ensure_ascii=False, indent=2) + "\n")

    print("index.json -> %s" % OUT)
    print("items=%d modes=%d tm_modes=%d texts=%d"
          % (len(items), modes_total, tm_modes_total, texts_total))
    print("format_issues=%d" % len(issues))
    for s in issues:
        print("  ! %s" % s)
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace")
    sys.exit(main())
