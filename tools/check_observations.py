# -*- coding: utf-8 -*-
"""Round-26 gate for the observation bank — REPORT ONLY, never edits a data file.

    python tools/check_observations.py [--base <git-rev>] [--only <substring>]
                                       [--fail-on error|warn|none] [--quiet]

Checks, in the order the rulings of 2026-08-29 put them:

  1. SHAPE      every file parses; formatting invariants (UTF-8, no BOM, LF,
                trailing newline); `texts` keeps EXACTLY its six keys; the new
                families only carry legal keys; every text is a non-empty ASCII
                string of 2-5 sentences (2-4 for texts_above, because the
                composer appends one more).
  2. IDS        every error_mode id, and every composed observation id
                (<mode>-d<D>a<A>), is byte-identical to the base revision.
                Nothing renamed, nothing dropped, nothing invented.  The
                Feedback links and the app reference these ids.
  3. LADDER     ruling 2.  The ladder words (good / very good / excellent and
                their palettes) are legal ONLY in texts_above.  At-level and
                below-level texts that use them are errors; an at-level text
                that never states the standard was met is an error too.
                texts_above that opens with the deficiency formula
                ("SP, due to ...") is an error - ruling 1, achievement first.
  4. NUMBERS    ruling 3, best effort.  Every dimensioned number quoted in a
                text is pulled out and compared with the item's own criteria
                table for the ACHIEVED code's band.  Bound CITATIONS ("inside
                the 300 ft limit") are recognized and skipped.  Everything the
                parser cannot settle is reported as a FLAG, never as a failure.
  5. PALETTE    ruling 2's "synonyms, not one phrase parroted": per file, per
                rung, how many distinct adjectives and what share the most-used
                one takes.
  6. COVERAGE   how much of the round is actually written, per file.
  7. HYGIENE    non-ASCII, Greek glyphs, long digit runs, hand-typed closing
                sentence, real-name smell (capitalised words outside the
                aviation allow-list are LISTED for the human's eye - the
                authoritative privacy check is the roster grep, run separately).

Exit code: 0 unless --fail-on says otherwise (default: errors fail).
"""
import argparse
import io
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OBS = ROOT / "data" / "observations2"
CRIT = ROOT / "data" / "criteria"
CATS = ["contact", "instrument", "formation", "vfr_navigation"]

BASE_DEFAULT = "0e5f7ae"          # origin/main at the start of the round

TEXTS_KEYS = ["0", "1", "2", "3", "4", "marginal"]
AT_KEYS = ["0", "1", "2", "3"]            # "0" optional / deferred, see spec §12
AT_REQUIRED = ["1", "2", "3"]
ABOVE_KEYS = ["1", "2", "3", "4"]         # "1" optional (only reachable from desired 0)
ABOVE_REQUIRED = ["2", "3", "4"]

ABOVE_TAIL = "Above end of block MIF achieved."

# ── the ladder palettes (specs/observations-style.md §4) ──────────────────
LADDER = {
    "2": ["good", "sound", "solid", "steady", "dependable", "assured", "competent"],
    "3": ["very good", "sure-handed", "well-developed", "consistently accurate",
          "notably good", "precise", "disciplined"],
    "4": ["excellent", "exceptional", "outstanding", "exemplary", "superior",
          "first-rate", "faultless"],
}
ALL_LADDER = sorted({w for v in LADDER.values() for w in v}, key=len, reverse=True)
# Praise words that can NEVER describe a below-MIF or an at-level performance,
# wherever they sit in the sentence.
# ("outstanding" is NOT here: in a checklist item it means "not yet done" -
#  "declared the outstanding training handicaps" is correct English in a
#  below-MIF text.  It is caught in the attribution slot like the rest.)
HARD_PRAISE = ["excellent", "exceptional", "exemplary", "superior",
               "first-rate", "faultless", "very good", "notably good",
               "consistently accurate", "well-developed", "sure-handed"]
# The rest of the palette are ordinary English adjectives ("a steady descent
# rate", "solid contact with the runway") - they are forbidden only in the
# ATTRIBUTION slot, which is what ruling 2 actually legislates: "due to good ...".
ATTRIB_LEAD = (r"(?:due to|thanks to|owing to|reflecting|on the strength of|"
               r"the result of|attributable to|born of|the product of)\s+"
               r"(?:a |an |the |its |his )?(?:consistently |notably |genuinely |"
               r"particularly |especially )?")


def attribution_hits(lo, words):
    out = []
    for w in words:
        if re.search(ATTRIB_LEAD + r"%s\b" % re.escape(w), lo):
            out.append(w)
    return out


# The APPROVED above-MIF closings (spec §4.3).  Deliberately narrow: a below-MIF
# text legitimately says "exceeded the code 3 tolerance" or "beyond the standards",
# so only phrasings that speak of the code the TRAINING SECTION requires count.
ABOVE_ONLY_PHRASES = [
    "above the code required", "above the level required",
    "above the code the training section", "above the standard the training section",
    "beyond what the training section", "above what the training section",
    "above the level the training section", "above the level required at this point",
    "exceeded the code required", "above the code for this training section",
    "above end of block",
]
# at-level must SAY the standard was met (one of these stems)
AT_MET_STEMS = [
    "met the desired standard", "meets the desired standard",
    "the desired standard for this stage", "expected proficiency",
    "the standard for the training section was met",
    "standard required for this stage", "standard the training section requires",
    "in line with the proficiency expected", "within the desired standards",
    "inside the desired standards", "consistent with the expected",
]
AT_TREND_STEMS = ["sp is expected to", "is expected to"]

DEFICIENCY_OPENERS = [
    "sp, due to", "sp , due to", "sp, owing to", "sp failed", "sp did not",
    "sp could not", "sp was unable",
]

# ── sentence counting: same rules as tools/index_*_v2.py ──────────────────
HARD_ABBREV = {
    "mr", "mrs", "ms", "dr", "prof", "capt", "lt", "col", "gen", "sgt", "maj",
    "jr", "sr", "st", "no", "nr", "fig", "vol", "ed", "para", "pt", "dept",
    "univ", "inc", "ltd", "co",
}
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


# ── numbers ───────────────────────────────────────────────────────────────
UNIT_ALIASES = {
    "ft": "feet", "feet": "feet", "foot": "feet",
    "kt": "knots", "kts": "knots", "knot": "knots", "knots": "knots",
    "kias": "knots",
    "degree": "degrees", "degrees": "degrees", "deg": "degrees",
    "nm": "NM", "dme": "DME",
    "dot": "dots", "dots": "dots",
    "aoa units": "AOA units", "aoa unit": "AOA units", "units of aoa": "AOA units",
    "g": "G", "second": "seconds", "seconds": "seconds",
    "minute": "minutes", "minutes": "minutes",
    "fpm": "feet_per_min", "feet per minute": "feet_per_min",
    "ship length": "ship lengths", "ship lengths": "ship lengths",
}
UNIT_RE = "|".join(sorted((re.escape(u) for u in UNIT_ALIASES), key=len, reverse=True))
NUM_RE = re.compile(
    r"(?P<lead>(?:more than|less than|no more than|not more than|up to|within|inside|"
    r"about|roughly|around|approximately|nearly|almost|over|under|beyond|outside|"
    r"at most|past|out to|back inside|short of|close to)\s+)?"
    r"(?P<num>\d+(?:\.\d+)?)\s*(?P<unit>" + UNIT_RE + r")\b",
    re.IGNORECASE)
# a number that names the printed tolerance rather than a flown deviation
CITATION_NEAR = re.compile(
    r"\b(limit|limits|tolerance|tolerances|standard|standards|maximum|band|bands|"
    r"criteria|criterion|allowed|permitted|required|minimum|reference|"
    r"floor|inner|outer)\b", re.IGNORECASE)
# A deviation-kind parameter is a DIFFERENCE from a target.  Only read a number as
# one when the sentence actually talks about a difference - otherwise "rotated at
# 140 knots" and "levelled at 700 feet" (absolute settings) get judged against a
# +/- 20 kt band and every one of them is a false alarm.
DEVIATION_CUE = re.compile(
    r"\b(deviation|deviations|deviated|excursion|excursions|diverged|divergence|"
    r"off|from the target|from the desired|from the assigned|from the briefed|"
    r"from the reference|above the target|below the target|high|low|fast|slow|"
    r"wide|short|long|error|displaced|displacement|drift|drifted|excess|"
    r"overshoot|overshot|undershoot|undershot|within|inside|outside|beyond|"
    r"tolerance|limit|band|plus|minus|either side|by up to|as much as|"
    r"loss|gain|spread|scatter|"
    # A POSITION held against a named reference is a deviation reading too:
    # "150 ft in front of the line abreast position", "50 ft below the leader",
    # "1.4 ship lengths of nose-tail separation".  Without these the formation
    # rows - whose whole subject is position - were never even consulted.
    r"in front of|ahead of|forward of|behind|aft of|abreast|"
    r"separation|spacing|clearance|gap|nose-tail|closure|"
    r"above the leader|below the leader|opened|opening|reduce|reduced)\b",
    re.IGNORECASE)
# Leads that QUOTE a printed bound rather than report a flown value:
# "regain the position inside 1000 ft", "opened out past the 500 ft limit".
CITE_LEADS = {"inside", "within", "no more than", "not more than", "up to",
              "at most", "beyond", "outside", "over", "past", "out to",
              "close to", "back inside", "short of"}
IP_TOOK_OVER = re.compile(
    r"\b(ip (took|intervened|assumed|recovered|retarded|directed|had to)|"
    r"intervention|took the controls|took over the controls)\b", re.IGNORECASE)
# "45 degrees of bank in the break" is a SETTING, not a deviation from one.
# So is every number that NAMES THE POSITION the manoeuvre is defined by: the
# perch sits "45 degrees off the shoulder", the observance angle reference IS
# 30 degrees, a Cuban-8 rolls "at 45 degrees nose-low", route sweep is held
# "50 degrees aft".  Judging those against a tolerance band flags the syllabus
# itself rather than the student, so they are read as settings and skipped.
ABS_BEFORE = re.compile(r"(?:bank(?:\s+angle)?\s+of|angle\s+of|attitude\s+of|"
                        r"pitch\s+of|nose\s+(?:up|down)\s+|"
                        r"(?:bank|pitch|attitude)\s+(?:was\s+|is\s+)?"
                        r"(?:held|rolled|set|flown|maintained|kept|established|"
                        r"selected|carried)\s+(?:in\s+|at\s+|to\s+|within\s+|"
                        r"near\s+|around\s+)?|"
                        r"(?:held|rolled|set|flew|flown|maintained|kept|"
                        r"established|selected)\s+(?:the\s+)?"
                        r"(?:bank|pitch|attitude)\s+(?:within|at|to|near|around)?\s*|"
                        r"(?:pitch|bank|attitude)(?:\s+\w+)?\s+of\s+|"
                        r"(?:the\s+)?(?:briefed|planned|nominal|assigned|target)\s+|"
                        r"plane\s+of\s+motion\s+(?:close\s+to|at|of)?\s*|"
                        # a STATED SPAN - "the planned 20 to 30 KIAS of closure",
                        # "between 30 and 45 degrees": the second number closes a
                        # span the sentence names, it is not a second deviation.
                        r"\d+(?:\.\d+)?\s*(?:and|to)\s+)\s*$",
                        re.IGNORECASE)
ABS_AFTER = re.compile(r"^\s*(?:of\s+(?:bank|pitch|aspect|sweep|turn|arc)|"
                       r"nose[-\s](?:up|low|down|high)|angle\s+of\s+bank|"
                       r"off\s+the\s+(?:shoulder|wing|nose)|aft\b|"
                       r"(?:degree\s+)?(?:reference|references|point|position|line|"
                       r"mark|glide\s*path|glidepath|cone|sweep|bank)|"
                       r"short\s+of\s+the\s+(?:aim\s+point|threshold|numbers)|"
                       r"of\s+(?:altitude|height)[\w\s]{0,24}?"
                       r"(?:in\s+hand|remaining|to\s+spare|in\s+reserve))\b",
                       re.IGNORECASE)

DATUM_RE = re.compile(r"reference point for deviations is set at\s*(\d+(?:\.\d+)?)",
                      re.IGNORECASE)
# An ABSOLUTE safety limit declared in the item's own reference_text.  For
# formation-23 the criteria file spells out what it is: "το σκέλος b/ (500'
# safety bubble) ειναι ΠΡΟΣΘΕΤΟ απολυτο οριο ασφαλειας που ΔΕΝ προκυπτει απο
# τον πινακα Fighting Wing και ΔΕΝ διαφοροποιειται ανα κωδικο 1/3".  It does
# not move with the code, so a separation is measured against IT, not against
# the inherited Fighting Wing range.
FLOOR_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[’'΄]?\s*safety distance",
                      re.IGNORECASE)

# What PHYSICAL QUANTITY a criteria row - and a sentence - is talking about.
# formation-20 inherits contact-05's Basic A/C Control rows (ALTITUDE +/-150',
# AIRSPEED, EXIT HEADING) and its own General Criteria set a 10 ft minimum
# separation from No1.  "held nose-tail separation to about 15 feet" is not an
# altitude excursion, and the altitude row must not be allowed to judge it.
SUBJECT_WORDS = {
    "altitude": ("altitude", "height", "level off", "decision height"),
    "airspeed": ("airspeed", "speed", "kias", "knots"),
    "heading": ("heading", "course", "track", "bearing", "radial", "centerline"),
    "bank": ("bank",),
    "vsi": ("rate of climb", "rate of descent", "vertical velocity",
            "feet per minute", "descent rate", "climb rate"),
    "separation": ("separation", "spacing", "clearance", "nose-tail", "nose tail",
                   "gap", "distance", "interval", "abreast", "wingtip", "bubble",
                   "slant range", "range", "route"),
    "aoa": ("aoa", "angle of attack"),
    "glidepath": ("glide path", "glidepath", "glide slope", "glideslope"),
    "touchdown": ("touch down", "touchdown", "aim point"),
    "geometry": ("observance angle", "sweep", "cone", "aspect angle",
                 "line of sight"),
    "path": ("intended line", "ground track"),
}


def subject_of(text):
    """The one quantity a string is about, or None when it is 0 or several."""
    lo = (text or "").lower()
    hit = {g for g, words in SUBJECT_WORDS.items() if any(w in lo for w in words)}
    return hit.pop() if len(hit) == 1 else None

GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]")
LONG_DIGITS = re.compile(r"\d{5,}")
CAP_WORD = re.compile(r"\b[A-Z][a-z]{2,}\b")
CAP_ALLOW = {
    "Above", "Airspeed", "Altitude", "Approach", "Aircraft", "Airmanship",
    "Bank", "Base", "Before", "Both", "Break", "Checklist", "Climb", "Closure",
    "Code", "Configuration", "Control", "Correction", "Course", "Crosscheck",
    "Cross", "Descent", "Deviation", "Downwind", "Drift", "Each", "Engine",
    "Energy", "Every", "Excess", "Final", "Fingertip", "Flaps", "Flight",
    "Formation", "Gear", "Glide", "Ground", "Heading", "Height", "Holding",
    "Landing", "Lateral", "Lead", "Level", "Localizer", "Minimum", "Missed",
    "Neither", "Nose", "Once", "Overhead", "Pattern", "Performance", "Pitch",
    "Position", "Power", "Precision", "Radio", "Rate", "Recovery", "Rejoin",
    "Return", "Roll", "Route", "Rudder", "Runway", "Scan", "Section", "Separation",
    "Speed", "Spacing", "Stall", "Standard", "Straight", "Taxi", "The", "There",
    "This", "Throttle", "Timing", "Track", "Traffic", "Training", "Trim", "Turn",
    "Vertical", "Visual", "Wind", "Wings", "Both", "After", "During", "When",
    "While", "With", "Without", "Airspace", "Attitude", "Angle", "Airfield",
    "Sortie", "Student", "Instructor", "Recoveries", "Recognition", "Approaches",
    "Procedures", "Procedure", "Checks", "Check", "Emergency", "Knowledge",
    "Signals", "Clearing", "Wingman", "Element", "Departure", "Arrival",
    "Navigation", "Instrument", "Contact", "Interval", "Takeoff", "Overshoot",
    "Pilotage", "Airspeeds", "Altitudes", "Headings", "Numbers", "Minor",
}


def band_bounds(param):
    """{unit: [(kind, code1, code3), ...]} for ONE criteria row.

    A row can print more than one unit.  `formation-18 · a/ ROUTE POSITION -
    DISTANCE` is "+200' , -1/2 span": the plus leg is FEET, the minus leg is
    WING SPANS, and the row's own `unit` field just says "mixed".  Indexing the
    whole row under "mixed" hid the 200/100 ft band from every number in the
    file, so each leg is now filed under the unit it is actually printed in.
    """
    c1, c3 = param.get("code_1"), param.get("code_3")
    if not isinstance(c1, dict):
        return {}
    base = param.get("unit")
    out = defaultdict(list)
    k1 = c1.get("kind")
    # A few rows measure from a DATUM rather than from zero, and say so in
    # their own footnote: "The reference point for deviations is set at 10' of
    # minimum lateral separation" (formation-17).
    mdat = DATUM_RE.search(param.get("notes") or "")
    datum = float(mdat.group(1)) if mdat else None
    subject = subject_of("%s %s" % (param.get("maneuver") or "",
                                    param.get("parameter") or ""))
    if k1 == "range":
        r3 = c3 if isinstance(c3, dict) and c3.get("kind") == "range" else None
        out[base].append(((("range", (c1.get("min"), c1.get("max")),
                            (r3.get("min"), r3.get("max")) if r3 else None)), subject))
    elif k1 == "deviation":
        # SIDE-AWARE, cheaply: many rows are asymmetric ("+200', -100'" on final,
        # "+20, -0" on downwind airspeed - slow is never tolerated). Collapsing
        # them to max() made every legitimate low-side number look out of band, so
        # each side becomes its OWN candidate band and a number that fits either
        # one passes. Which side a sentence means is the human's call.
        d3 = c3 if isinstance(c3, dict) and c3.get("kind") == "deviation" else {}
        for side in ("plus", "minus"):
            b1 = abs(c1.get(side) or 0)
            if not b1:
                continue
            b3 = abs(d3.get(side) or 0) or None
            unit = (c1.get(side + "_unit") or param.get(side + "_unit") or base)
            out[unit].append((("deviation", b1, b3, datum), subject))
    elif k1 == "nominal_change":
        v1 = c1.get("value")
        v3 = c3.get("value") if isinstance(c3, dict) else None
        if c1.get("plus") is not None:      # nominal with a tolerance window
            out[base].append((("nominal_window", (v1, c1.get("plus"), c1.get("minus")),
                               (v3, c3.get("plus"), c3.get("minus"))
                               if isinstance(c3, dict) else None), subject))
        else:                               # a single ceiling, e.g. touch-down point
            out[base].append((("deviation", v1, v3, datum), subject))
    return dict(out)


def param_key(s):
    """Normalise a criteria row label so a mode's `source` can name it.

    The bank writes `specific:BREAK / ALTITUDE (feet)` where the table reads
    `BREAK - ALTITUDE (feet)`, and sometimes appends `|general:c`.  Separator
    and case are noise; the words are the identity.
    """
    s = (s or "").split("|")[0]
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def load_criteria():
    """item_id -> {"units": {unit: [band, ...]}, "rows": {key: {unit: [band, ...]}}}

    `units` is the whole item pooled by unit - the fallback for a mode whose
    source names no row.  `rows` is each criteria row on its own, so a mode that
    DOES name its row is judged against that row alone.  Pooling was the bug:
    every number in feet anywhere in formation-18 was being measured against
    FIGHTING WING DISTANCE (500-1500 ft), which is not what ROUTE HEIGHT
    (+/-50 ft) or ROUTE DISTANCE (+200 ft) mean at all.
    """
    out = {}
    for cat in CATS:
        f = CRIT / ("%s.json" % cat)
        if not f.is_file():
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        for it in data.get("items", []):
            ep = it.get("expected_performance") or {}
            sc = ep.get("specific_criteria") or {}
            res = ep.get("resolved") or sc.get("resolved") or {}
            params = sc.get("parameters") or res.get("parameters") or []
            by_unit = defaultdict(list)
            rows = {}
            for p in params:
                per = band_bounds(p)
                for unit, bands in per.items():
                    by_unit[unit].extend(bands)
                key = param_key("%s %s" % (p.get("maneuver") or "",
                                           p.get("parameter") or ""))
                if key:
                    tgt = rows.setdefault(key, defaultdict(list))
                    for unit, bands in per.items():
                        tgt[unit].extend(bands)
            mfl = FLOOR_RE.search(sc.get("reference_text") or "")
            out[it["id"]] = {"units": dict(by_unit),
                             "rows": {k: dict(v) for k, v in rows.items()},
                             "floor": float(mfl.group(1)) if mfl else None}
    return out


def resolve_row(item, source):
    """The criteria row a mode's `source` names, or None when it names none."""
    if not item or not source or not source.startswith("specific:"):
        return None
    key = param_key(source[len("specific:"):])
    rows = item.get("rows") or {}
    if not key or not rows:
        return None
    if key in rows:
        return rows[key]
    # `specific:reference_text b/ 500 ft safety distance (bubble)` and friends -
    # the source quotes the row loosely.  Accept only an unambiguous prefix.
    cands = [v for k, v in rows.items() if k.startswith(key) or key.startswith(k)]
    return cands[0] if len(cands) == 1 else None


def numeric_verdicts(text, code, item, row=None, defines=()):
    """[(number, unit, verdict, detail)] — verdict in ok / flag / cite / skip.

    `row` is the ONE criteria row the mode's source names, when it names one.
    A number whose unit that row prints is judged against that row alone; any
    other unit falls back to the item's pooled bands.
    
    `defines` are the numbers the mode's OWN label and source quote - the mode
    "Pitch corrections larger than 2 degrees on the glide path" is DEFINED by
    that 2, and a text naming it is naming the technique limit the mode is
    about, not reporting a deviation from the item's criteria table.
    """
    res = []
    units_map = (item or {}).get("units") or {}
    for m in NUM_RE.finditer(text):
        val = float(m.group("num"))
        unit = UNIT_ALIASES[m.group("unit").lower()]
        lead = (m.group("lead") or "").strip().lower()
        ctx = text[max(0, m.start() - 60):min(len(text), m.end() + 60)]
        if row and row.get(unit):
            bands, scope = row[unit], "row"
        else:
            bands, scope = (units_map.get(unit) or []), "item"
        if not bands:
            res.append((val, unit, "skip", "no criteria parameter in %s" % unit))
            continue
        # A row can only judge a number that is about the SAME QUANTITY it
        # measures.  When the sentence names one quantity and the row names a
        # different one, the row is simply not the standard for this number.
        ctx_subj = subject_of(ctx)
        if ctx_subj:
            named = [s for _b, s in bands if s]
            if named and ctx_subj not in named:
                # The item prints standards, but none of them for THIS quantity
                # - formation-20 inherits altitude/airspeed/heading and says
                # nothing about nose-tail separation.  Spec 5.7: the measurable
                # fact stands on the General Criteria, not on a table row.
                res.append((val, unit, "skip",
                            "no %s row in this item's table" % ctx_subj))
                continue
            bands = [(b, s) for b, s in bands if s is None or s == ctx_subj]
        # bound citation? ("inside the 300 ft limit", "the 20 kt tolerance")
        printed = set()
        for b, _subj in bands:
            if b[0] == "deviation":
                printed.update(x for x in (b[1], b[2]) if x is not None)
                if len(b) > 3 and b[3] is not None:
                    printed.add(b[3])          # the datum is printed too
            elif b[0] == "range":
                for r in (b[1], b[2]):
                    if r:
                        printed.update(x for x in r if x is not None)
            elif b[0] == "nominal_window":
                for r in (b[1], b[2]):
                    if r and r[0] is not None:
                        printed.add(r[0])
        # Naming a printed bound is quoting the standard, whether the sentence
        # says "limit" out loud ("inside the 300 ft limit") or leans on the
        # preposition to say it ("regain the position inside 1000 ft").
        if val in printed and (CITATION_NEAR.search(ctx) or lead in CITE_LEADS):
            res.append((val, unit, "cite", "quotes the printed tolerance"))
            continue
        if val in defines:
            res.append((val, unit, "skip",
                        "the mode's own label is defined by this number"))
            continue
        if (ABS_BEFORE.search(text[max(0, m.start() - 30):m.start()])
                or ABS_AFTER.search(text[m.end():m.end() + 60])):
            res.append((val, unit, "skip", "reads as a setting, not a deviation"))
            continue
        # An absolute safety floor outranks the code bands: it does not move
        # with the code, so any separation clear of it is compliant, and one
        # inside it is a violation whatever the rest of the text claims.
        floor = (item or {}).get("floor")
        if floor and unit == "feet" and ctx_subj == "separation":
            if val >= floor:
                res.append((val, unit, "ok",
                            "clear of the %g ft absolute safety distance" % floor))
            else:
                res.append((val, unit, "ok" if code == "0" else "flag",
                            "INSIDE the %g ft safety distance, which does not "
                            "vary by code" % floor))
            continue
        ok, soft, why = False, False, []
        cue = bool(DEVIATION_CUE.search(ctx))
        took = bool(IP_TOOK_OVER.search(text))
        for b, _subj in bands:
            kind = b[0]
            if kind == "deviation":
                b1, b3 = b[1], b[2]
                datum = b[3] if len(b) > 3 else None
                if b1 is None:
                    continue
                if b3 is None:
                    b3 = b1 / 2.0

                def judge(v):
                    """(good, soft) for one candidate reading of the number."""
                    if v is None or v < 0 or v > 3 * b1:
                        return None
                    near = lambda x: abs(v - x) <= max(0.02 * x, 1e-9)
                    if code == "0":
                        return (v > b1 or lead in ("more than", "over", "beyond",
                                                   "outside") or took), False
                    if code == "1":
                        # sitting ON the code-1 bound is the HOUSE PHRASING for a
                        # code 1 ("about 300 ft, at the tolerance limit") - only
                        # the code-3 end is suspicious here.
                        return b3 < v <= b1 * 1.001, near(b3)
                    if code == "2":
                        if b3 < v < b1:
                            return True, False
                        if near(b3) or near(b1):
                            return True, True
                        return False, False
                    if code == "3":
                        return v <= b3 * 1.001, False
                    if code == "4":
                        if v <= b3 * 0.5 + 1e-9:
                            return True, False
                        return (v <= b3 * 1.001), (v <= b3 * 1.001)
                    return True, False

                # not a deviation reading at all -> this parameter cannot judge it
                if not cue or (val > 3 * b1 and not datum):
                    continue
                # Some rows measure from a DATUM, not from zero: fingertip
                # lateral separation is "+20 ft" from the 10 ft minimum spacing
                # (table footnote), so a text that says "30 ft of spacing" is
                # reporting the code-1 deviation, not breaking it.  Both readings
                # are offered and the kinder one wins - which side a sentence
                # means is the human's call, exactly as with the plus/minus legs.
                verdict = judge(val)
                if (not verdict or not verdict[0]) and datum:
                    alt = judge(val - datum)
                    if alt and alt[0]:
                        verdict = alt
                if verdict is None:
                    continue
                good, s = verdict
                soft = soft or s
                why.append("%s band %s/%s%s"
                           % (kind, b3, b1, " from %g" % datum if datum else ""))
            elif kind == "range":
                r1, r3 = b[1], b[2]
                if not r1:
                    continue
                in1 = r1[0] <= val <= r1[1]
                in3 = bool(r3) and r3[0] <= val <= r3[1]
                if code == "0":
                    good = not in1
                elif code in ("1", "2"):
                    good = in1 and not in3
                else:
                    good = in3
                why.append("range %s / %s" % (r1, r3))
            elif kind == "nominal_window":
                # The nominal itself MOVES with the code - the observance angle
                # is 30 degrees when desired and 50 degrees at maximum tolerance
                # - so the number is a POSITION, not a deviation (spec 5.5):
                # code 3 sits in the desired window, code 1 in the outer one,
                # and code 2 in the GAP BETWEEN THEM.  Reading code 2 against
                # the outer window called every correct 40-degree text wrong.
                w1, w3 = b[1], b[2]
                if not w1 or w1[0] is None:
                    continue
                lo1, hi1 = w1[0] - (w1[2] or 0), w1[0] + (w1[1] or 0)
                lo3 = hi3 = None
                if w3 and w3[0] is not None:
                    lo3, hi3 = w3[0] - (w3[2] or 0), w3[0] + (w3[1] or 0)
                if code == "0":
                    lo = lo1 if lo3 is None else min(lo1, lo3)
                    hi = hi1 if hi3 is None else max(hi1, hi3)
                    good = not (lo <= val <= hi)
                elif code == "1":
                    good = lo1 <= val <= hi1
                elif code == "2":
                    if lo3 is None:
                        good = lo1 <= val <= hi1
                    elif lo1 > hi3:                 # outer window sits above
                        good = hi3 <= val <= lo1
                    elif hi1 < lo3:                 # outer window sits below
                        good = hi1 <= val <= lo3
                    else:
                        good = lo1 <= val <= hi1
                elif code == "3":
                    good = lo3 is not None and lo3 <= val <= hi3
                else:                               # code 4 - on the nominal
                    good = (lo3 is not None
                            and abs(val - w3[0]) <= max(0.5 * (hi3 - lo3), 1e-9))
                why.append("window %s / %s" % (w1, w3))
            else:
                good = True
            if good:
                ok = True
                break
        if not why:
            res.append((val, unit, "skip", "not read as a deviation in %s" % unit))
        else:
            res.append((val, unit, "ok" if (ok and not soft) else ("soft" if ok else "flag"),
                        "%s: %s" % (scope, "; ".join(why[:2]))))
    return res


def git_mode_ids(base):
    """base rev -> {relpath: [mode ids]} ; None when the rev is unreachable."""
    try:
        subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--verify", base + "^{commit}"],
                       check=True, capture_output=True)
    except Exception:
        return None
    out = {}
    for cat in CATS:
        listing = subprocess.run(
            ["git", "-C", str(ROOT), "ls-tree", "--name-only", base,
             "data/observations2/%s/" % cat],
            capture_output=True, text=True, encoding="utf-8")
        for rel in listing.stdout.splitlines():
            rel = rel.strip()
            if not rel.endswith(".json") or rel.endswith("index.json"):
                continue
            blob = subprocess.run(["git", "-C", str(ROOT), "show", "%s:%s" % (base, rel)],
                                  capture_output=True, text=True, encoding="utf-8")
            try:
                d = json.loads(blob.stdout)
            except Exception:
                continue
            out[rel] = [m.get("id") for m in d.get("error_modes", [])]
    return out


def composed_ids(mode_ids):
    return {"%s-d%da%d" % (mid, d, a) for mid in mode_ids
            for d in range(4) for a in range(5)}


def main():
    ap = argparse.ArgumentParser(description="Round-26 observation-bank gate (report only).")
    ap.add_argument("--base", default=BASE_DEFAULT,
                    help="git rev the ids are compared against (default %s)" % BASE_DEFAULT)
    ap.add_argument("--only", default=None, help="only files whose path contains this")
    ap.add_argument("--fail-on", choices=["error", "warn", "none"], default="error")
    ap.add_argument("--quiet", action="store_true", help="totals and problems only")
    args = ap.parse_args()

    crit = load_criteria()
    base_ids = git_mode_ids(args.base)
    errors, warns, flags, softs = [], [], [], []
    per_file = []
    caps_seen = Counter()

    files = []
    for cat in CATS:
        folder = OBS / cat
        if not folder.is_dir():
            errors.append("MISSING FOLDER %s" % folder)
            continue
        files += [p for p in sorted(folder.glob("*.json")) if p.name != "index.json"]
    if args.only:
        files = [p for p in files if args.only in p.as_posix()]

    tot_modes = tot_at = tot_above = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        raw = path.read_bytes()
        if raw[:3] == b"\xef\xbb\xbf":
            errors.append("%s: UTF-8 BOM" % rel)
        if b"\r\n" in raw:
            # 5 files already carried CRLF before the round (contact-29/34,
            # formation-09/10, instrument-11) - a warning, not a gate.
            warns.append("%s: CRLF line endings (pre-existing in 5 files; keep as found, "
                         "do not reflow the whole file)" % rel)
        if not raw.endswith(b"\n"):
            errors.append("%s: no trailing newline" % rel)
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception as e:
            errors.append("%s: JSON parse error: %s" % (rel, e))
            continue

        item_id = data.get("item_id") or path.stem
        item_bands = crit.get(item_id, {})
        modes = data.get("error_modes") or []
        tot_modes += len(modes)
        rung_use = defaultdict(Counter)
        n_at = n_above = 0

        for m in modes:
            mid = m.get("id") or "?"
            tag = "%s[%s]" % (path.name, mid)
            texts = m.get("texts")
            if not isinstance(texts, dict):
                errors.append("%s: texts missing" % tag)
                continue
            missing = [k for k in TEXTS_KEYS if k not in texts]
            extra = [k for k in texts if k not in TEXTS_KEYS]
            if missing:
                errors.append("%s: texts missing keys %s" % (tag, missing))
            if extra:
                errors.append("%s: texts has unexpected keys %s "
                              "(the families are SIBLINGS of texts, never inside it)"
                              % (tag, extra))
            fam_at = m.get("texts_at") or {}
            fam_ab = m.get("texts_above") or {}
            if fam_at and not isinstance(fam_at, dict):
                errors.append("%s: texts_at is not an object" % tag)
                fam_at = {}
            if fam_ab and not isinstance(fam_ab, dict):
                errors.append("%s: texts_above is not an object" % tag)
                fam_ab = {}
            bad = [k for k in fam_at if k not in AT_KEYS]
            if bad:
                errors.append("%s: texts_at has illegal keys %s (legal: %s)" % (tag, bad, AT_KEYS))
            bad = [k for k in fam_ab if k not in ABOVE_KEYS]
            if bad:
                errors.append("%s: texts_above has illegal keys %s (legal: %s)" % (tag, bad, ABOVE_KEYS))
            if fam_at:
                miss = [k for k in AT_REQUIRED if not fam_at.get(k)]
                if miss:
                    errors.append("%s: texts_at started but %s missing" % (tag, miss))
                else:
                    n_at += 1
            if fam_ab:
                miss = [k for k in ABOVE_REQUIRED if not fam_ab.get(k)]
                if miss:
                    errors.append("%s: texts_above started but %s missing" % (tag, miss))
                else:
                    n_above += 1

            # The row this mode is scored on, when its source names one, so its
            # numbers are measured against THAT row and not against every row
            # of the item that happens to print the same unit.
            mode_row = resolve_row(item_bands, m.get("source"))
            # Numbers the mode is NAMED after: "Delay 45 turn", "Minimum
            # separation of 10 feet from No1", "Pitch corrections larger than
            # 2 degrees".  A text quoting one is quoting the mode's subject.
            mode_defines = {float(x) for x in
                            re.findall(r"\d+(?:\.\d+)?",
                                       "%s %s" % (m.get("label") or "",
                                                  m.get("source") or ""))}

            def scan(txt, key, code, relation):
                if not isinstance(txt, str):
                    errors.append("%s.%s: not a string" % (tag, key))
                    return
                if not txt.strip():
                    errors.append("%s.%s: empty" % (tag, key))
                    return
                bad = {"U+%04X %s" % (ord(c), unicodedata.name(c, "?"))
                       for c in txt if ord(c) > 127}
                if bad:
                    errors.append("%s.%s: non-ASCII %s" % (tag, key, sorted(bad)))
                if GREEK.search(txt):
                    errors.append("%s.%s: Greek glyphs in an English observation" % (tag, key))
                if LONG_DIGITS.search(txt):
                    warns.append("%s.%s: 5+ digit run - service number?" % (tag, key))
                for w in CAP_WORD.findall(txt):
                    if w not in CAP_ALLOW:
                        caps_seen[w] += 1
                lo = txt.lower()
                if " he " in lo or " she " in lo or " his " in lo or " her " in lo:
                    warns.append("%s.%s: personal pronoun - the subject is SP" % (tag, key))
                n = count_sentences(txt)
                hi = 4 if relation == "above" else 5
                if n < 2 or n > hi:
                    # strict on what THIS round writes, informative on inherited prose
                    (warns if relation == "below" else errors).append(
                        "%s.%s: %d sentences (expected 2-%d)" % (tag, key, n, hi))
                if ABOVE_TAIL.lower() in lo:
                    if relation == "above":
                        warns.append("%s.%s: closing sentence typed by hand - the composer "
                                     "appends it (harmless, it is de-duplicated)" % (tag, key))
                    else:
                        errors.append("%s.%s: carries the above-MIF closing sentence" % (tag, key))
                # --- ruling 2: the ladder ---------------------------------
                praise = [w for w in HARD_PRAISE if re.search(r"\b%s\b" % re.escape(w), lo)]
                attrib = attribution_hits(lo, ALL_LADDER)
                phr = [p for p in ABOVE_ONLY_PHRASES if p in lo]
                if relation == "above":
                    rung = LADDER.get(code)
                    if rung is None:
                        # achieved (1) above MIF - reachable only from a desired 0.
                        # The ruling named rungs 2/3/4 only, so this one carries NO
                        # praise word: it states the fact (spec §12, question 2).
                        if attrib:
                            errors.append("%s.%s: rung-1 above-MIF must carry no praise "
                                          "word (unruled rung): %s" % (tag, key, attrib))
                        if not phr:
                            errors.append("%s.%s: must state plainly that the result is above "
                                          "the level the Training Section requires" % (tag, key))
                    else:
                        want = [w for w in rung if w in attrib]
                        if not want:
                            errors.append("%s.%s: the closing attribution carries no rung-%s word "
                                          "(due to <%s> ...)"
                                          % (tag, key, code, " | ".join(rung)))
                        else:
                            rung_use[code][want[0]] += 1
                        wrong = [w for w in attrib if w not in rung
                                 and not any(w in ww for ww in want)]
                        if wrong:
                            warns.append("%s.%s: attribution uses a word from another rung: %s"
                                         % (tag, key, wrong))
                        if not phr:
                            warns.append("%s.%s: never states the result is above the required code"
                                         % (tag, key))
                    if any(lo.startswith(o) for o in DEFICIENCY_OPENERS):
                        errors.append("%s.%s: opens with the deficiency formula - "
                                      "ruling 1 says achievement FIRST" % (tag, key))
                elif relation == "at":
                    if praise:
                        errors.append("%s.%s: praise word(s) %s at at-level - ruling 2: "
                                      "'from 3 to 3 we cannot say very good'" % (tag, key, praise))
                    if attrib:
                        errors.append("%s.%s: ladder attribution 'due to %s' at at-level - "
                                      "the at-level text states the CAUSE of the minor error, "
                                      "not a merit" % (tag, key, attrib[0]))
                    if phr:
                        errors.append("%s.%s: above-MIF phrasing %s at at-level" % (tag, key, phr))
                    if not any(s in lo for s in AT_MET_STEMS):
                        errors.append("%s.%s: at-level text never states the desired standard "
                                      "was met" % (tag, key))
                    if not any(s in lo for s in AT_TREND_STEMS):
                        warns.append("%s.%s: no forward expectation sentence (BaD 3-1 §41.d "
                                     "wants the trend named)" % (tag, key))
                else:  # below
                    if praise:
                        errors.append("%s.%s: praise word(s) %s below MIF" % (tag, key, praise))
                    if attrib:
                        errors.append("%s.%s: ladder attribution 'due to %s' below MIF"
                                      % (tag, key, attrib[0]))
                    if phr:
                        errors.append("%s.%s: above-MIF phrasing %s below MIF" % (tag, key, phr))
                # --- ruling 3: the numbers --------------------------------
                for val, unit, verdict, why in numeric_verdicts(txt, code, item_bands,
                                                                mode_row, mode_defines):
                    if verdict == "flag":
                        flags.append("%s.%s: %g %s outside the code-%s band (%s)"
                                     % (tag, key, val, unit, code, why))
                    elif verdict == "soft":
                        softs.append("%s.%s: %g %s sits ON the code-%s boundary (%s)"
                                     % (tag, key, val, unit, code, why))

            for k in ("0", "1", "2"):
                if isinstance(texts.get(k), str):
                    scan(texts[k], "texts.%s" % k, k, "below")
            for k in AT_KEYS:
                if fam_at.get(k) is not None:
                    scan(fam_at[k], "texts_at.%s" % k, k, "at")
            for k in ABOVE_KEYS:
                if fam_ab.get(k) is not None:
                    scan(fam_ab[k], "texts_above.%s" % k, k, "above")

        tot_at += n_at
        tot_above += n_above
        # --- ruling 2: distribution ----------------------------------------
        for code, c in sorted(rung_use.items()):
            n = sum(c.values())
            if n >= 4:
                top, k = c.most_common(1)[0]
                share = k / float(n)
                # ceil(n/4) distinct adjectives, but never more than the rung's
                # palette actually offers: spec 4.1 lists SEVEN words per rung,
                # so a file with 37 texts in a rung can never reach 10 however
                # well it is written.  contact-12 uses all seven.
                need = min(len(LADDER.get(code, [])) or 3, max(3, (n + 3) // 4))
                if len(c) < need:
                    warns.append("%s rung %s: only %d distinct adjective(s) over %d texts "
                                 "(want >= %d) - the house asked for synonyms"
                                 % (path.name, code, len(c), n, need))
                if share > 0.40:
                    warns.append("%s rung %s: '%s' used in %d of %d texts (%.0f%%, cap 40%%)"
                                 % (path.name, code, top, k, n, share * 100))
        # --- ids -----------------------------------------------------------
        if base_ids is not None:
            was = base_ids.get(rel)
            now = [m.get("id") for m in modes]
            if was is None:
                warns.append("%s: not present at %s (new file?)" % (rel, args.base))
            else:
                if was != now:
                    lost = [i for i in was if i not in now]
                    new = [i for i in now if i not in was]
                    if lost:
                        errors.append("%s: mode id(s) LOST since %s: %s" % (rel, args.base, lost))
                    if new:
                        errors.append("%s: mode id(s) INVENTED since %s: %s" % (rel, args.base, new))
                    if not lost and not new:
                        warns.append("%s: mode ids reordered" % rel)
                if composed_ids(was) - composed_ids(now):
                    errors.append("%s: composed observation ids would disappear" % rel)
        per_file.append((rel, len(modes), n_at, n_above))

    if base_ids is not None:
        for rel in base_ids:
            if not (ROOT / rel).is_file():
                errors.append("%s: file present at %s but GONE now" % (rel, args.base))

    # ── report ────────────────────────────────────────────────────────────
    if not args.quiet:
        print("=" * 78)
        print("COVERAGE  (modes with the family complete / total modes)")
        print("=" * 78)
        for rel, n, a, b in per_file:
            mark = "OK " if (a == n and b == n) else "   "
            print("  %s %-46s modes %3d   at %3d   above %3d" % (mark, rel.split("/")[-1], n, a, b))
    print("-" * 78)
    print("files=%d  modes=%d  texts_at complete=%d (%.1f%%)  texts_above complete=%d (%.1f%%)"
          % (len(per_file), tot_modes, tot_at, 100.0 * tot_at / max(1, tot_modes),
             tot_above, 100.0 * tot_above / max(1, tot_modes)))
    print("id baseline: %s%s" % (args.base, "" if base_ids is not None else "  (UNREACHABLE - ids NOT verified)"))
    print("-" * 78)
    for name, bag in (("ERROR", errors), ("WARN", warns), ("NUMBER FLAG", flags),
                      ("NUMBER ON-BOUNDARY", softs)):
        print("%s: %d" % (name, len(bag)))
        for s in bag[:400 if name == "ERROR" else 200]:
            print("  ! %s" % s)
        if len(bag) > (400 if name == "ERROR" else 200):
            print("  ... %d more" % (len(bag) - (400 if name == "ERROR" else 200)))
    if caps_seen:
        print("-" * 78)
        print("CAPITALISED WORDS OUTSIDE THE ALLOW-LIST (eyeball these; the authoritative")
        print("privacy check is the roster grep, run separately at the end of the round):")
        print("  " + ", ".join("%s x%d" % (w, n) for w, n in caps_seen.most_common(60)))

    if args.fail_on == "none":
        return 0
    if errors:
        return 1
    if args.fail_on == "warn" and warns:
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.exit(main())
