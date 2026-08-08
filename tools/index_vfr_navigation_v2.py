# -*- coding: utf-8 -*-
"""Validate + index data/observations2/vfr_navigation (schema v2-trunk).

Checks (report only -- NEVER edits the data files):
  * JSON parses, required top-level fields present
  * every error_mode carries all six texts keys: 0,1,2,3,4,marginal
  * every text is 2-5 sentences (abbreviation-aware counting)
  * every text is ASCII-only
  * mode ids unique inside a file (and reported if duplicated across files)
  * mif_row is null OR matches an entry of the file's mif_rows

Writes: data/observations2/vfr_navigation/index.json
"""
import io
import json
import re
import sys
import unicodedata
from pathlib import Path

CATEGORY = "vfr_navigation"
SCHEMA = "v2-trunk"
FOLDER = Path(r"D:\FDMS\data\observations2") / CATEGORY
OUT = FOLDER / "index.json"

LEVELS = ["0", "1", "2", "3", "4", "marginal"]
REQUIRED_TOP = ["item_id", "item_name", "category", "schema", "mif_numbers",
                "mif_rows", "error_modes"]
MIN_SENT, MAX_SENT = 2, 5

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
    # aviation / units -- in this corpus normally written WITHOUT a period,
    # so a period after them is a real full stop unless a lowercase/digit
    # continuation follows.
    "ft", "kt", "kts", "nm", "sm", "km", "kg", "lb", "lbs", "hr", "hrs",
    "gal", "hg", "mb", "rpm", "deg", "alt", "hdg", "crs", "wpt", "nav",
    "rwy", "twy", "elev", "freq",
}
# multi-dot acronyms: U.S., a.m., p.m.
DOTTED = re.compile(r"^(?:[A-Za-z]\.){2,}$")

SENT_END = re.compile(r"([.!?]+)(\s+|$)")


def count_sentences(text):
    """Abbreviation-aware sentence count.

    A '.'/'!'/'?' run followed by whitespace (or end of string) closes a
    sentence, unless:
      * the preceding word is a hard abbreviation (Mr., Fig., No.),
      * it is a soft abbreviation / dotted acronym and a lowercase word or a
        digit follows ("approx. 500 ft"),
      * the preceding word is a single capital letter (initials), or
      * the next character is lowercase (mid-sentence continuation).
    """
    n = 0
    for m in SENT_END.finditer(text):
        punct = m.group(1)
        before = text[:m.start()]
        tail = text[m.end():]
        nxt = tail[:1]
        soft_ctx = nxt.isdigit() or (nxt.isalpha() and nxt.islower())
        # word immediately preceding the punctuation
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
        # a following lowercase letter means the period did not really close it
        if nxt and nxt.isalpha() and nxt.islower():
            continue
        n += 1
    # trailing fragment without terminal punctuation still counts as a sentence
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
    """Accepted identifiers for a mif_row reference."""
    keys = set()
    for r in mif_rows or []:
        if isinstance(r, dict):
            for k in ("sn", "row_name", "id", "name"):
                if r.get(k) is not None:
                    keys.add(str(r[k]).strip())
        else:
            keys.add(str(r).strip())
    return keys


def main():
    issues = []
    items = []
    modes_total = 0
    texts_total = 0
    seen_ids_global = {}

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

        valid_rows = row_keys(data.get("mif_rows"))
        modes = data.get("error_modes") or []
        if not isinstance(modes, list) or not modes:
            issues.append("%s: error_modes missing or empty" % f.name)
            modes = []

        seen_local = set()
        for i, m in enumerate(modes, 1):
            tag = "%s[%s]" % (f.name, m.get("id") if isinstance(m, dict) else i)
            if not isinstance(m, dict):
                issues.append("%s: mode #%d is not an object" % (f.name, i))
                continue

            mid = m.get("id")
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

            if not m.get("label"):
                issues.append("%s: missing label" % tag)

            mr = m.get("mif_row", None)
            if mr is not None:
                if str(mr).strip() not in valid_rows:
                    issues.append("%s: mif_row %r not present in mif_rows %s"
                                  % (tag, mr, sorted(valid_rows)))

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

        modes_total += len(modes)
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
        "items": items,
    }
    OUT.write_text(json.dumps(index, ensure_ascii=False, indent=1),
                   encoding="utf-8")

    print("index.json -> %s" % OUT)
    print("items=%d modes=%d texts=%d" % (len(items), modes_total, texts_total))
    print("format_issues=%d" % len(issues))
    for s in issues:
        print("  ! %s" % s)
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace")
    sys.exit(main())
