<div align="center">

# ✈️ FDMS — Flight Data Management System for T-6A Phase II

**A regulation-faithful toolset for Hellenic Air Force Phase II (T-6A) flight training —**
**gradesheet remarks, daily scheduling, instructor currency and a two-way bridge to the students' own records,**
**built with Spec-Driven Development and an LLM-as-judge data pipeline**

[![Live App](https://img.shields.io/badge/▶%20Live-App-5A4FE0)](https://nickkoro21.github.io/phase2-remarks/)
[![Remarks](https://img.shields.io/badge/Remarks-2%2C809%20across%20117%20items-E4405F)](https://nickkoro21.github.io/phase2-remarks/)
[![Parts](https://img.shields.io/badge/Parts-Remarks%20·%20Description%20·%20Scheduler%20·%20Bridge-1FA971)](https://nickkoro21.github.io/phase2-remarks/)
[![Tests](https://img.shields.io/badge/Bridge%20fixtures-1%2C625%20passing-2e7d32)](https://github.com/Nickkoro21/phase2-remarks/tree/main/tools/fixtures/bridge)
[![Build](https://img.shields.io/badge/Build-No%20build%20step-blue)](https://github.com/Nickkoro21/phase2-remarks)
[![Offline](https://img.shields.io/badge/Runs-Fully%20offline-lightgrey)](https://github.com/Nickkoro21/phase2-remarks)
[![Standard](https://img.shields.io/badge/Format-BD%203--1%20§41-orange)](https://github.com/Nickkoro21/phase2-remarks)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Nick%20Koroniadis-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/nick-koroniadis-328962226/)
[![Hugging Face](https://img.shields.io/badge/🤗%20Hugging%20Face-NickKoro21-FFD21E)](https://huggingface.co/NickKoro21)
[![GitHub](https://img.shields.io/badge/GitHub-Nickkoro21-181717?logo=github&logoColor=white)](https://github.com/Nickkoro21)

### 🛫 [**Open the live app →**](https://nickkoro21.github.io/phase2-remarks/)

[📋 **The four parts**](#-the-four-parts) · [🗂️ **The data behind it**](#%EF%B8%8F-the-data-behind-it) · [🌉 **The bridge**](#-the-bridge) · [🔍 **How it stays honest**](#-how-it-stays-honest) · [💬 **Feedback loop**](#-feedback-loop) · [💻 **Run it locally**](#-run-it-locally) · [🏗️ **Structure**](#%EF%B8%8F-structure) · [👤 **Author**](#-author)

</div>

---

## Overview

Writing gradesheet remarks for student pilots is slow, repetitive and easy to get wrong: the
regulation demands a **standardized format** (`#item. (desired) → (achieved): text`), a **precise
deviation and its cause** — never vague wording — and a mandatory comment whenever performance sits
**above or below** the desired MIF code.

FDMS started as the answer to that one problem and grew into the squadron's working tool. It is still
a **single static page with no build step**: no framework, no bundler, no runtime dependency. It
reads JSON from disk, runs offline on a service PC, and ships to the unit as **one HTML file**.

## 📋 The four parts

**1 · Remarks** — pick a category, an item and the two codes, and get ready-to-copy observations
whose quantified deviations always match the achieved code band, written in the
subject–reason–cause–result structure the regulation prescribes, enriched with human-factors
vocabulary where it genuinely fits. Every item carries an **ℹ Info** panel with its Execution,
Conditions and Expected Performance criteria **and the actual numeric standards inline** —
cross-references pre-resolved, so nobody hunts through source documents.

**2 · Description** — the twin of Remarks: the whole gradesheet description block for one sortie,
assembled in one step instead of three.

**3 · Scheduler** — the squadron's day: a **training log** keyed to the 153-node syllabus graph, the
**daily board** (waves, simulator, lessons, alternates, print view) that actualizes into log events,
a **progress editor** per student, the **consequence engine** that applies the regulation's failure
rows and board-referral thresholds, **instructor currency** (the Ε/Σ semester quotas of the 3-01),
and duty roster, balance and availability gates.

**4 · Bridge** — the two-way lane to **Wings Ahead**, the students' own record application
([repo](https://github.com/Nickkoro21/wingsahead)). See below.

## 🗂️ The data behind it

Everything the app serves was digitized from the governing documents and **adversarially verified**
(every extraction chunk passed an independent LLM-as-judge review before merging):

| Dataset | Size |
|---|---|
| Performance criteria (verbatim + resolved numeric standards) | 118 items |
| MIF tables (desired code per Training Section) | 9 tables · 1,916 cells |
| Observation bank — error modes with per-relation texts | 117 files · **1,882 modes** |
| Generated remarks (all desired × achieved combinations) | **2,809** across 117 items |
| Phase II requirements + failure & board-referral procedures | 482 requirements |
| Instructor currency catalogue (3-01 Ch. 4) | 91 items |
| Aviation human-factors phrase bank (cause-slot tagged) | 94 concepts |

Generation rules baked into every remark: deviations quantified **inside the achieved code's band**;
at the **same** code the number is the band's own limit (3→3 = desired tolerance, 1→1 = maximum);
IP intervention ⇒ code 0; above-MIF remarks close with *“Above end of block MIF achieved.”*; and no
number is ever invented where the regulation prints no tolerance.

## 🌉 The bridge

The students keep their own training records in **Wings Ahead** (a separate app, Supabase-backed).
The squadron keeps the scheduler. Two systems describing the same flights will drift — so the bridge
reads both and reports, in **nine deviation classes**, exactly where they disagree.

- **Read-only first.** Every line says which side knows what, and why.
- **Nothing is written without a numbered dialog** that states, before the click, what each line
  writes and what it does to the syllabus node — including when it costs a student an unlocked node
  or makes an evaluator "avoided" for a failed checkride.
- **Every write is reversible.** A change log with ↺ Undo, per act.
- **Identity is never guessed from a name.** Match by immutable object id, else by military number —
  never by surname.
- Checkrides, solo flights, flight time and the instructor's own currency all cross; FAIL / NFS / SMS
  / airsickness stay **report-only** by ruling, because the training log has no honest shape for them.

## 🔍 How it stays honest

Two gates close every round, and both are commands anyone can run:

```bash
python tools/check_observations.py --quiet     # the observation bank: 0 errors, 0 fallbacks
node tools/fixtures/bridge/run.js              # the bridge: 1,625 headless assertions, 0 failed
```

The bank's checker reads the criteria tables and judges **every number in every text** against the
band of the code that text belongs to, on the side the sentence names. The bridge fixtures drive the
real planner — identity, idempotency, undo, refusals — against fabricated records, never live data.
Numbers in this README and in the specs are written **after** the command runs, never from memory.

## 💬 Feedback loop

Spotted a wrong remark? The **Feedback** button on every card opens a pre-filled GitHub Issue carrying
the remark's unique id, item, codes and full text — you only type what's wrong. Issues are the
persistent correction queue: nothing gets lost, and fixes flow back into the dataset by id.

## 💻 Run it locally

```bash
git clone https://github.com/Nickkoro21/phase2-remarks.git
cd phase2-remarks
python -m http.server 8123
# open http://localhost:8123/app/
```

No build step, no dependencies — plain HTML/CSS/JS reading static JSON. Windows users can just
double-click `start_app.bat`. The unit build is a **single self-contained HTML file** produced by
`tools/build_offline.py`, compiled down to ES5 so it opens on a browser as old as Firefox 32.

## 🏗️ Structure

```
├── app/                      # the SPA — 13 modules, no framework
│   ├── app.js                #   Remarks
│   ├── description.js        #   the gradesheet description block
│   ├── scheduler.js          #   syllabus graph + training log
│   ├── schedboard.js         #   daily board, actualize, progress editor
│   ├── schedconsq.js         #   failure rows, thresholds, referrals
│   ├── currency.js           #   instructor currency (Ε / Σ, semesters)
│   ├── schedbridge.js        #   the two-way bridge to Wings Ahead
│   └── …store, sync, search, charts
├── data/
│   ├── criteria/             # 4 categories, verbatim + resolved standards
│   ├── mif/                  # MIF tables (F/S + T-6A)
│   ├── observations2/        # the live observation bank (117 files)
│   ├── observations/         # master_index.json — what the app loads first
│   ├── requirements/         # Phase II requirements, board matrix, currency catalogue
│   ├── technique/            # T-6A Techniques & Procedures, by section
│   └── human_factors.json
├── specs/                    # SDD constitution (mission · tech-stack · roadmap)
│                             # + the four long specs: observations-style, scheduler,
│                             #   description, bridge
└── tools/
    ├── check_observations.py # the bank's gate
    ├── build_offline.py      # the one-file unit build (ES5)
    └── fixtures/bridge/      # 1,625 headless assertions
```

## 👤 Author

Developed by **Koro** — with **Claude** riding the right seat, fueled by Kalamata coffee ☕ — since July 2026.

*Sources (BD 3-1/2025, Phase 2 Syllabus 2025, PD 29/2020, T-6A Techniques & Procedures Manual) are
maintained privately; this repository contains only the derived, structured datasets and the
applications. No real name, call sign or student record appears anywhere in it.*
