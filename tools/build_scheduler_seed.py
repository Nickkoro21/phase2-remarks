# -*- coding: utf-8 -*-
"""Rebuilds data/scheduler/seed.json with students placed at DIFFERENT points of
Phase II so the scheduler can be tested realistically.

Deterministic (no randomness): progression follows the flowchart2 per-track
order (ground -> exams -> F/S & flights in printed order), tracks in the rough
real-life sequence contact -> instrument -> formation -> vfr_navigation.
Class-scope ground events carry a few absentees (makeup testing); two gates
are opened (progress-test pending, KEPE) for blocking tests.

Run: python tools/build_scheduler_seed.py
"""
import json, io
from pathlib import Path
from datetime import date, timedelta

ROOT = Path(__file__).resolve().parent.parent
fc = json.loads((ROOT / "data" / "flowchart2.json").read_text(encoding="utf-8"))

TRACK_SEQ = ["contact", "instrument", "formation", "vfr_navigation"]
groups = {g["id"]: g for g in fc["groups"]}

# ── per-track ordered node lists ─────────────────────────────────────────────
def track_nodes(track):
    """[('g', group), ...ground+exams...] + [('s', sortie), ...fs+flights in file order...]"""
    out = []
    for g in fc["groups"]:
        if g.get("band") == "ground" and g.get("track") in (track, "shared"):
            out.append(("g", g))
    for g in fc["groups"]:
        if g.get("band") == "exams" and g.get("track") in (track, "shared"):
            out.append(("g", g))
    for s in fc["sorties"]:
        if s.get("track") == track:
            out.append(("s", s))
    return out

SEQ = []  # global progression: contact fully, then instrument, ...
for t in TRACK_SEQ:
    SEQ.extend([(t, kind, obj) for kind, obj in track_nodes(t)])

# shared-ground appears once only (attached to contact pass)
seen = set()
GLOBAL = []
for t, kind, obj in SEQ:
    key = ("g:" if kind == "g" else "s:") + obj["id"]
    if key in seen:
        continue
    seen.add(key)
    GLOBAL.append((t, kind, obj, key))

# ── students & instructors — ROUND 4: OIDs are the primary keys ─────────────
# primary_ip / reserve_ips STORE INSTRUCTOR OIDS ("oid-ip-XX"); training-log
# events keep referencing people by CODE (historical facts). Placeholder
# names/MN/rank/callsign are deterministic.
ip_oid = lambda n: f"oid-ip-{n:02d}"          # noqa: E731
IP_RANKS = ["1Lt", "Capt", "Maj", "Lt Col"]  # cycled — English ranks (board is English)
# ROUND 9 — the PUBLIC seed keeps its IP-x / SP-x fakes FOREVER (privacy gate:
# no real name, call sign or roster-derived string may ever reach this repo).
# The two NEW roster fields are seeded with FAKE values only, so that the UI
# that renders them (country badge, TP badge, Balance tooltip) has something to
# render out of the box. "Other" is seeded on purpose: it is the free-text
# escape of the country dropdown and must be seen to work.
IP_COUNTRIES = ["HAF", "HAF", "ITAF", "Other"]   # cycled
IP_TEST_PILOTS = {1, 3, 4, 10}                   # one TP per seeded country
# ROUND 11 — `experienced` (ΕΜΠ, Annex B §17) decides which validity column the
# Currency tab reads, so the seed carries BOTH levels: without a mix, half the
# 3-01's printed table would never be seen working. Fake, like everything here.
# (It had been hand-written into seed.json in Round 10b and the builder did not
# know about it — a regen used to drop it silently.)
IP_EXPERIENCED = {1, 3, 4, 7, 10, 13}

students, cut, prim_code = [], {}, {}
N = len(GLOBAL)
for i in range(1, 31):
    cls = "99HAF-A" if i <= 22 else ("18ITAF" if i <= 26 else "3GAF")
    p, r0, r1 = ((i - 1) % 15) + 1, (i % 15) + 1, ((i + 1) % 15) + 1
    prim_code[f"SP-{i}"] = (f"IP-{p}", f"IP-{r0}", f"IP-{r1}")   # codes for the log
    students.append({
        "oid": f"oid-sp-{i:02d}", "code": f"SP-{i}",
        "first_name": "Test", "last_name": f"Student{i:02d}",
        "mn": f"MN-{1000 + i}", "rank": "S.Ten" if cls == "18ITAF" else "2Lt",
        "class": cls, "status": "active",
        "primary_ip": ip_oid(p), "reserve_ips": [ip_oid(r0), ip_oid(r1)],
        "avoid_ips": [], "notes": ""})
    # spread: SP-1 ~15% ... SP-22 ~85% of the stage; foreigners mid-range
    if cls == "99HAF-A":
        frac = 0.15 + 0.70 * (i - 1) / 21
    elif cls == "18ITAF":
        frac = 0.35 + 0.12 * (i - 23)
    else:
        frac = 0.50 + 0.10 * (i - 27)
    cut[f"SP-{i}"] = int(N * frac)

instructors = [{
    "oid": ip_oid(i), "code": f"IP-{i}",
    "first_name": "Test", "last_name": f"Instructor{i:02d}",
    "mn": f"MN-{2000 + i}", "rank": IP_RANKS[(i - 1) % len(IP_RANKS)],
    "callsign": f"VIPER{i:02d}",
    "country": IP_COUNTRIES[(i - 1) % len(IP_COUNTRIES)],
    "test_pilot": i in IP_TEST_PILOTS,
    "experienced": i in IP_EXPERIENCED,
    "quals": {"night": True, "evaluator": i <= 4, "ground": i in (3, 7, 11),
              "rsu_solo": i in (2, 5, 9, 13)},
    "duty_eligible": {"SOF": True, "RSU": True},
    "status": "active", "notes": ""} for i in range(1, 16)]

# ── build training log ───────────────────────────────────────────────────────
TODAY = date(2026, 8, 9)
def workday_back(n):
    d, left = TODAY, n
    while left > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d.isoformat()

log, eid = [], 0
def add(ev):
    global eid
    eid += 1
    log.append({"id": f"EV-{eid:04d}", **ev})

ABSENTS = {  # node_id -> [(student, reason)]
    "GT-INSTR": [("SP-9", "AMC")],
    "NA190": [("SP-6", "LV")],
    "GT-AERO-CRM": [("SP-17", "TO")],
}

# class-scope ground/exam events: fire when ANY member's cutoff passes the node
done_class_nodes = set()
for idx, (t, kind, obj, key) in enumerate(GLOBAL):
    if kind != "g" or obj.get("band") not in ("ground", "exams"):
        continue
    members_past = [s["code"] for s in students if cut[s["code"]] > idx]
    if not members_past or key in done_class_nodes:
        continue
    done_class_nodes.add(key)
    days_ago = max(3, int(55 * (1 - idx / N)))
    ev = {"date": workday_back(days_ago), "node": key, "scope": "class", "class": "99HAF-A",
          "instructor": "IP-3" if obj["band"] == "ground" else "IP-7",
          "result": "completed", "absent": [{"student": a, "reason": r} for a, r in ABSENTS.get(obj["id"], [])],
          "note": ""}
    if obj["band"] == "ground":
        ev["start_date"] = workday_back(days_ago + 4)
        ev["end_date"] = ev["date"]
    add(ev)

# individual sortie events up to each cutoff
for s in students:
    sc, c = s["code"], cut[s["code"]]
    my = [(idx, obj) for idx, (t, kind, obj, key) in enumerate(GLOBAL) if kind == "s" and idx < c]
    for j, (idx, srt) in enumerate(my):
        days_ago = max(1, int(50 * (1 - idx / N)) + (0 if j % 3 else 1))
        pc, rc0, rc1 = prim_code[sc]                 # events reference CODES
        ip = pc if j % 4 else (rc0, rc1)[j % 2]
        add({"date": workday_back(days_ago), "node": "s:" + srt["id"], "scope": "student", "student": sc,
             "instructor": ip, "device": ("OFT" if j % 2 else "FTD") if srt.get("band") == "fs" else "T-6A",
             "result": "completed", "note": ""})

# ── ROUND 2 consequence-engine fixtures (spec §3α) ──────────────────────────
# LAG fixture (fail-10 general rule): SP-11's existing repeat becomes a "lag"
# on the LAST workday — no flight the same day, eligible the NEXT working day.
def next_pending_sortie(sc):
    c = cut[sc]
    for idx, (t, kind, obj, key) in enumerate(GLOBAL):
        if kind == "s" and idx >= c:
            return obj
    return None

sp11_srt = next_pending_sortie("SP-11")
if sp11_srt is not None:
    add({"date": workday_back(1), "node": "s:" + sp11_srt["id"], "scope": "student", "student": "SP-11",
         "instructor": "IP-11", "device": "OFT" if sp11_srt.get("band") == "fs" else "T-6A",
         "result": "lag", "maneuvers": "unusual attitude recoveries, VOR tracking",
         "note": "LAG (YSTERISI) — consequence-engine fixture (fail-10 day math)"})

# APT-EXAM fixture (fail-12): SP-19 FAILS the last sortie of a section already
# completed up to there (latest non-checkride section-final A/C sortie flown).
sortie_by_id = {s["id"]: s for s in fc["sorties"]}
group_last = {}
for s in fc["sorties"]:
    group_last[s["group"]] = s["id"]          # file order — last one wins

def last_completed_section_final(sc):
    best = None
    for ev in log:
        if ev.get("student") != sc or ev.get("scope") != "student":
            continue
        sid = (ev.get("node") or "")[2:]
        srt = sortie_by_id.get(sid)
        if not srt or srt.get("band") == "fs" or srt.get("checkride"):
            continue
        if group_last.get(srt["group"]) != sid:
            continue
        if best is None or ev["date"] > best[0]:
            best = (ev["date"], srt)
    return best[1] if best else None

sp19_final = last_completed_section_final("SP-19")
if sp19_final is not None:
    add({"date": workday_back(2), "node": "s:" + sp19_final["id"], "scope": "student", "student": "SP-19",
         "instructor": "IP-5", "device": "T-6A",
         "result": "fail", "maneuvers": "rejoin, echelon turns",
         "note": "FAIL (APOTYXIA) on the section-final sortie — APT EXAM pending (fail-12 fixture)"})

# PD 29/2020 fixture (fail-16): SP-22 fails their upcoming checkride 3 workdays
# ago — full block of every activity until the dp_ae -> dp_cdr -> board path.
def checkride_for(sc):
    c = cut[sc]
    for idx, (t, kind, obj, key) in enumerate(GLOBAL):
        if kind == "s" and obj.get("checkride") and idx >= c:
            return obj                        # the next one they would reach
    last = None
    for idx, (t, kind, obj, key) in enumerate(GLOBAL):
        if kind == "s" and obj.get("checkride") and idx < c:
            last = obj                        # else the last one they flew
    return last

sp22_ck = checkride_for("SP-22")
if sp22_ck is not None:
    add({"date": workday_back(3), "node": "s:" + sp22_ck["id"], "scope": "student", "student": "SP-22",
         "instructor": "IP-2", "device": "T-6A",
         "result": "fail", "maneuvers": "",
         "note": "checkride FAIL — PD 29/2020 in force (fail-16 fixture)"})

gates = [
    {"student": "SP-14", "type": "progress_test_AE", "date": workday_back(2), "outcome": "pending",
     "note": "Progress test with AE pending — flights blocked until flown"},
    # category makes the fail-45 SMS counter bite: 1 entry / air category = cap
    {"student": "SP-23", "type": "kepe_entry", "category": "instrument", "date": workday_back(5), "outcome": "open",
     "note": "SMS (Special Monitoring Status) — max 1 dual sortie or 1 F/S per day; a 2nd item only as SOLO"},
]

# ── INSTRUCTOR CURRENCY — FAKE demo data (Round 10b, semesters in Round 11) ──
# THE PUBLIC SEED STAYS FAKE. These are the three placeholder instructors
# IP-1/IP-2/IP-3 (oid-ip-01..03) and nothing here comes from a real logbook:
# the point is only that the Currency tab has something to draw out of the box.
#
#   items      one DATE per catalog item of data/requirements/instructor_currency.json,
#              written here as DAYS BEFORE CUR_ANCHOR so the file regenerates
#              identically and the spread of green / amber / red stays readable.
#   semesters  Round 11 — the ΑΝΑ ΕΞΑΜΗΝΟ counters, keyed BY SEMESTER
#              ("2026-H2") so 01/01 rolls over instead of overwriting.
#
# WHY NO RED SEMESTER ROW IS SEEDED: a quota row only turns red when 30 days or
# less of the semester remain. H2 2026 ends 31/12, so on 18/08/2026 there are
# 135 days left and red is simply not reachable — it becomes reachable on
# 01/12/2026 with the very same data. The seed does NOT fake the clock to force
# the colour; it seeds one complete (green), one behind (amber) and one with no
# counters recorded at all.
CUR_ANCHOR = date(2026, 8, 14)
CUR_SEM = "2026-H2"          # H2 = 01/07 – 31/12, the project's calendar half


def cur_day(n):
    return (CUR_ANCHOR - timedelta(days=n)).isoformat()


# days before CUR_ANCHOR, per instructor OID
CUR_ITEMS = {
    "oid-ip-01": {
        "day-landing": 31, "night-landing": 21, "e-1b-spin": 62,
        "e-1c-aircraft-test-fcf": 31, "e-1d-demo": 0, "e-3-in-cloud-flight": 21,
        "e-21-flight-300ft": 42, "e-31a-low-altitude-intercept-day": 42, "e-32-bfm": 52,
        "e-40-training-munitions-release": 125, "e-45-visual-delivery-med-hi-apex-day": 52,
        "e-46-visual-delivery-low-apex-day": 42, "e-49c-las-day": 52,
        "sim-refresh-after-abstention": 15, "night-flight-day-recency": 0,
        "in-cloud-recency-60d": 21, "type-availability-loss": 62,
        "demo-500ft-currency": 0, "demo-reavailability-15-to-30-days": 10,
        "demo-above-1000ft-availability": 31, "demo-pilot-tenure": 255,
        "pr-sortie-interval": 0, "pr-programme-completion": 74,
        "seminar-pdo": 127, "seminar-tactics": 127, "seminar-sea-survival": 127,
        "training-egress-survival": 32, "training-aircraft-re-servicing": 127,
        "seminar-flight-physiology": 383, "seminar-hpma-crm-orm": 127,
        "monthly-knowledge-exams": 10, "cross-staff-visits-ata-day": 127,
        "squadron-commanders-conference": 127, "trainee-20day-unscored-flight": 5,
        "trainee-30day-type-availability-loss": 10, "body-weight-check": 42,
    },
    "oid-ip-02": {
        "day-landing": 86, "night-landing": 15, "e-1b-spin": 62,
        "e-3-in-cloud-flight": 21, "e-21-flight-300ft": 31,
        "e-31a-low-altitude-intercept-day": 31, "e-32-bfm": 116,
        "e-40-training-munitions-release": 125, "e-45-visual-delivery-med-hi-apex-day": 42,
        "e-46-visual-delivery-low-apex-day": 31, "e-49c-las-day": 42,
        "sim-refresh-after-abstention": 10, "night-flight-day-recency": 0,
        "in-cloud-recency-60d": 21, "type-availability-loss": 62,
        "demo-500ft-currency": 0, "demo-reavailability-15-to-30-days": 10,
        "demo-above-1000ft-availability": 31, "demo-pilot-tenure": 255,
        "pr-sortie-interval": 0, "pr-programme-completion": 74,
        "seminar-pdo": 361, "seminar-tactics": 127, "seminar-sea-survival": 127,
        "training-egress-survival": 32, "training-aircraft-re-servicing": 127,
        "seminar-flight-physiology": 383, "seminar-hpma-crm-orm": 127,
        "monthly-knowledge-exams": 10, "cross-staff-visits-ata-day": 127,
        "squadron-commanders-conference": 127, "trainee-20day-unscored-flight": 5,
        "trainee-30day-type-availability-loss": 10, "body-weight-check": 42,
    },
    "oid-ip-03": {
        "day-landing": 31, "night-landing": 54, "e-3-in-cloud-flight": 21,
        "e-21-flight-300ft": 99, "e-31a-low-altitude-intercept-day": 31, "e-32-bfm": 42,
        "e-40-training-munitions-release": 125, "e-45-visual-delivery-med-hi-apex-day": 42,
        "e-46-visual-delivery-low-apex-day": 31, "e-49c-las-day": 42,
        "sim-refresh-after-abstention": 10, "night-flight-day-recency": 0,
        "in-cloud-recency-60d": 21, "type-availability-loss": 62,
        "demo-reavailability-15-to-30-days": 10, "demo-above-1000ft-availability": 31,
        "demo-pilot-tenure": 255, "pr-sortie-interval": 0, "pr-programme-completion": 74,
        "seminar-pdo": 127, "seminar-tactics": 127, "training-egress-survival": 32,
        "training-aircraft-re-servicing": 127, "seminar-flight-physiology": 383,
        "seminar-hpma-crm-orm": 127, "monthly-knowledge-exams": 10,
        "cross-staff-visits-ata-day": 127, "squadron-commanders-conference": 127,
        "trainee-20day-unscored-flight": 5, "trainee-30day-type-availability-loss": 10,
        "body-weight-check": 42,
    },
}

# The POSTED (ΤΟΠΟΘΕΤΗΜΕΝΟΣ) requirement of Πίνακας 6 / Πίνακας 9, for reference
# while reading the fake counters below — the app reads it from the catalog, not
# from here:  sim-1 1 · sim-2 1 · sim-3 1 · sim-4 — · sim-5 1 · sim-ΔΑ 1 (TP only)
#             ΣΥΝΟΛΑ 4 || Σ-1 1 · Σ-2 day 1 · Σ-2 night 1 · Σ-3 2 · Σ-4 1 · Σ-20 —
#             ΣΥΝΟΛΟ ΕΞΟΔΩΝ 6
CUR_SEMESTERS = {
    # IP-1 — every posted quota met, SIM-ΔΑ included (he carries the TP flag)
    "oid-ip-01": {
        CUR_SEM: {"sim-1": 1, "sim-2": 1, "sim-3": 1, "sim-5": 1, "sim-da": 1,
                  "semiannual-fs-total-t6": 4,
                  "s-1-general-adaptation": 1, "s-2-pdo-day": 1, "s-2-pdo-night": 1,
                  "s-3-air-to-ground": 2, "s-4-air-to-air": 1,
                  "semiannual-air-total-t6": 6},
        # last semester, kept on purpose: the key is per semester, so a rollover
        # never overwrites what was already flown
        "2026-H1": {"sim-1": 1, "sim-2": 1, "sim-5": 1, "semiannual-fs-total-t6": 3,
                    "s-1-general-adaptation": 1, "s-3-air-to-ground": 2,
                    "semiannual-air-total-t6": 5},
    },
    # IP-2 — behind: five of the eleven quotas that apply to him are met
    # (no TP flag, so SIM-ΔΑ prints no requirement for him at all)
    "oid-ip-02": {
        CUR_SEM: {"sim-1": 1, "sim-2": 1, "sim-5": 1, "semiannual-fs-total-t6": 2,
                  "s-1-general-adaptation": 1, "s-2-pdo-day": 1,
                  "s-3-air-to-ground": 1, "semiannual-air-total-t6": 3},
    },
    # IP-3 — nothing recorded this semester: the "missing key reads as 0" path
}

instructor_currency = [
    {"oid": oid,
     "items": {k: {"last_date": cur_day(n), "src": "manual"} for k, n in items.items()},
     **({"semesters": CUR_SEMESTERS[oid]} if oid in CUR_SEMESTERS else {}),
     "updated_at": f"2026-08-14T07:{10 + i:02d}:00.000Z"}
    for i, (oid, items) in enumerate(CUR_ITEMS.items())
]

config = {
    "mass_briefing_default": "06:00",
    "wave_template": {"brief_min": 30, "ground_ops_min": 45, "debrief_min_min": 15, "total_min": 195, "round_min": 5},
    "slots": {"to_window_from_min": 5, "to_window_to_min": 35, "stagger_min": 5},
    "turnaround_ip_min": 120, "waves_per_day": 2,
    "iff_pool": ["2443", "2444", "2445"],
    "ip_fs_pref": 2, "ip_fs_max": 3, "sof_rsu_max_sorties": 1,
    "lookahead_depth": 3, "idle_threshold_workdays": 3,
    "day_mix_default": {"99HAF-A": 10, "18ITAF": 4, "3GAF": 4},
    "absence_codes": ["LV", "SLV", "HLV", "SCL", "OFF", "TO", "AMC"],
}
seed = {"schema": "scheduler-seed-v3", "generated_for_testing": True,
        "students": students, "instructors": instructors,
        "classes": [{"id": c, "members": [s["code"] for s in students if s["class"] == c]}
                    for c in ("99HAF-A", "18ITAF", "3GAF")],
        "config": config, "training_log": log, "availability": [], "duty_roster": [],
        "gates": gates, "instructor_currency": instructor_currency, "day_plans": {}}
out = ROOT / "data" / "scheduler" / "seed.json"
out.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"seed v3: {len(students)} students, {len(instructors)} instructors (oid PKs, "
      f"rsu_solo: IP-2/5/9/13, TP: "
      f"{'/'.join('IP-%d' % n for n in sorted(IP_TEST_PILOTS))}, "
      f"countries: {'/'.join(sorted(set(IP_COUNTRIES)))}), {len(log)} log events, "
      f"cutoffs {min(cut.values())}–{max(cut.values())} of {N} nodes")
print("round-2 fixtures:",
      f"SP-11 lag on {sp11_srt['id'] if sp11_srt else '—'} ({workday_back(1)})",
      f"| SP-19 fail on section-final {sp19_final['id'] if sp19_final else '—'} ({workday_back(2)})",
      f"| SP-22 checkride fail on {sp22_ck['id'] if sp22_ck else '—'} ({workday_back(3)})",
      "| SP-23 SMS category=instrument")

# report: which SPs' NEXT flight sortie falls inside a solo-allowed section
def solo_candidate(srt):
    if srt.get("first_solo") or srt.get("solo_candidate"):
        return True
    g = groups.get(srt.get("group", ""))
    if not g:
        return False
    cand = g.get("solo_candidate_sorties")
    if isinstance(cand, list):
        return srt["id"] in cand
    return bool(g.get("solo_allowed"))

def next_flight(sc):
    for idx, (t, kind, obj, key) in enumerate(GLOBAL):
        if kind == "s" and obj.get("band") != "fs" and idx >= cut[sc]:
            return obj
    return None

solo_next = []
for s in students:
    nf = next_flight(s["code"])
    if nf is not None and solo_candidate(nf):
        solo_next.append(f"{s['code']}→{nf['id']}")
print("next flight is a solo-candidate sortie for:", ", ".join(solo_next) if solo_next else "NOBODY")
