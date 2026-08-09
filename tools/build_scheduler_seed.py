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

# ── students: cutoffs spread across the stage ────────────────────────────────
students, cut = [], {}
N = len(GLOBAL)
for i in range(1, 31):
    cls = "99HAF-A" if i <= 22 else ("18ITAF" if i <= 26 else "3GAF")
    students.append({"code": f"SP-{i}", "class": cls, "status": "active",
                     "primary_ip": f"IP-{((i - 1) % 15) + 1}",
                     "reserve_ips": [f"IP-{(i % 15) + 1}", f"IP-{((i + 1) % 15) + 1}"],
                     "notes": ""})
    # spread: SP-1 ~15% ... SP-22 ~85% of the stage; foreigners mid-range
    if cls == "99HAF-A":
        frac = 0.15 + 0.70 * (i - 1) / 21
    elif cls == "18ITAF":
        frac = 0.35 + 0.12 * (i - 23)
    else:
        frac = 0.50 + 0.10 * (i - 27)
    cut[f"SP-{i}"] = int(N * frac)

instructors = [{"code": f"IP-{i}", "quals": {"night": True, "evaluator": i <= 4, "ground": i in (3, 7, 11)},
                "duty_eligible": {"SOF": True, "RSU": True}, "notes": ""} for i in range(1, 16)]

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
        ip = s["primary_ip"] if j % 4 else s["reserve_ips"][j % 2]
        add({"date": workday_back(days_ago), "node": "s:" + srt["id"], "scope": "student", "student": sc,
             "instructor": ip, "device": ("OFT" if j % 2 else "FTD") if srt.get("band") == "fs" else "T-6A",
             "result": "completed", "note": ""})

# YSTERISI test fixture (rule 9c): SP-11 flew a repeat the PREVIOUS workday, so
# no flight is legal for SP-11 on the same day or the next working day.
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
         "result": "repeat", "note": "YSTERISI — repeat, no flight same/next working day (test fixture)"})

gates = [
    {"student": "SP-14", "type": "progress_test_AE", "date": workday_back(2), "outcome": "pending",
     "note": "Progress test with AE pending — flights blocked until flown"},
    {"student": "SP-23", "type": "kepe_entry", "date": workday_back(5), "outcome": "open",
     "note": "SMS (Special Monitoring Status) — max 1 dual sortie or 1 F/S per day; a 2nd item only as SOLO"},
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
    "absence_codes": ["LV", "AMC", "TO", "SLV"],
}
seed = {"schema": "scheduler-seed-v2", "generated_for_testing": True,
        "students": students, "instructors": instructors,
        "classes": [{"id": c, "members": [s["code"] for s in students if s["class"] == c]}
                    for c in ("99HAF-A", "18ITAF", "3GAF")],
        "config": config, "training_log": log, "availability": [], "duty_roster": [],
        "gates": gates, "day_plans": {}}
out = ROOT / "data" / "scheduler" / "seed.json"
out.write_text(json.dumps(seed, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"seed v2: {len(log)} log events, cutoffs {min(cut.values())}–{max(cut.values())} of {N} nodes")

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
