<div align="center">

# ✈️ Phase 2 Remarks — T-6A Gradesheet Observations

**A regulation-faithful remark generator for Hellenic Air Force Phase II (T-6A) flight training,**
**built with Spec-Driven Development and an LLM-as-judge data pipeline**

[![Live App](https://img.shields.io/badge/▶%20Live-App-5A4FE0)](https://nickkoro21.github.io/phase2-remarks/)
[![Remarks](https://img.shields.io/badge/Remarks-2%2C809%20across%20117%20items-E4405F)](https://nickkoro21.github.io/phase2-remarks/)
[![Categories](https://img.shields.io/badge/Categories-Contact%20·%20Instrument%20·%20Formation%20·%20VFR%20Nav-1FA971)](https://nickkoro21.github.io/phase2-remarks/)
[![Build](https://img.shields.io/badge/Build-No%20build%20step-blue)](https://github.com/Nickkoro21/phase2-remarks)
[![Offline](https://img.shields.io/badge/Runs-Fully%20offline-lightgrey)](https://github.com/Nickkoro21/phase2-remarks)
[![Standard](https://img.shields.io/badge/Format-BD%203--1%20§41-orange)](https://github.com/Nickkoro21/phase2-remarks)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Nick%20Koroniadis-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/nick-koroniadis-328962226/)
[![Hugging Face](https://img.shields.io/badge/🤗%20Hugging%20Face-NickKoro21-FFD21E)](https://huggingface.co/NickKoro21)
[![GitHub](https://img.shields.io/badge/GitHub-Nickkoro21-181717?logo=github&logoColor=white)](https://github.com/Nickkoro21)

### 🛫 [**Open the live app →**](https://nickkoro21.github.io/phase2-remarks/)

[📋 **What it does**](#-what-it-does) · [🗂️ **The data behind it**](#%EF%B8%8F-the-data-behind-it) · [💬 **Feedback loop**](#-feedback-loop) · [💻 **Run it locally**](#-run-it-locally) · [🏗️ **Structure**](#%EF%B8%8F-structure) · [👤 **Author**](#-author)

</div>

---

## Overview

Writing gradesheet remarks for student pilots is slow, repetitive and easy to get wrong: the
regulation demands a **standardized format** (`#item. (desired) → (achieved): text`), a **precise
deviation and its cause** — never vague wording — and a mandatory comment whenever performance sits
**above or below** the desired MIF code.

**Phase 2 Remarks** turns that into three clicks. Pick a category, an item and the two codes, and get
ready-to-copy remarks whose quantified deviations always match the achieved code band, written in the
subject–reason–cause–result structure the regulation prescribes, enriched with aviation human-factors
vocabulary where it genuinely fits.

## 📋 What it does

1. **Category** — Contact · Instrument · Formation · VFR Navigation
2. **Item** — live search across all graded items, with their MIF numbers
3. **Codes** — desired (MIF) and achieved (0–4); only combinations with data light up
4. **Remarks** — 2–5 sentence observations, colour-coded by variant
   (technique · human factor · marginal · above-MIF), each with **Copy** and **Feedback** buttons

Every item also has an **ℹ Info** panel showing its Execution, Conditions and Expected Performance
criteria **with the actual numeric standards inline** — cross-references pre-resolved, so nobody is
sent hunting through the source documents.

## 🗂️ The data behind it

Everything the app serves was digitized from the governing documents and **adversarially verified**
(every extraction chunk passed an independent LLM-as-judge review before merging):

| Dataset | Size |
|---|---|
| Performance criteria (verbatim + resolved numeric standards) | 118 items |
| MIF tables (desired code per Training Section) | 9 tables · 1,916 cells |
| Generated remarks (all desired × achieved combinations) | **2,809** across 117 items |
| Phase II requirements + failure/board-referral procedures | 379 requirements |
| Aviation human-factors phrase bank (cause-slot tagged) | 91 concepts |

Generation rules baked into every remark: deviations quantified **inside the achieved code's band**
(code 1 ↔ code 3 interpolation), IP intervention ⇒ code 0, above-MIF remarks close with
*“Above end of block MIF achieved.”*

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
double-click `start_app.bat`.

## 🏗️ Structure

```
├── app/                  # the SPA (index.html, styles.css, app.js)
├── data/
│   ├── criteria/         # 4 categories, verbatim + resolved standards
│   ├── mif/              # MIF tables (F/S + T-6A)
│   ├── observations/     # generated remarks + master_index.json
│   ├── requirements/     # Phase II requirements & board tolerance matrix
│   └── human_factors.json
├── specs/                # SDD constitution: mission, tech-stack, roadmap
├── tools/build_index.py  # rebuilds the master index after data changes
└── examples/             # the approved remark style template
```

## 👤 Author

Developed by **Koro** — with **Claude** riding the right seat, fueled by Kalamata coffee ☕ — July 2026.

*Sources (BD 3-1/2025, Phase 2 Syllabus 2025, PD 29/2020) are maintained privately; this repository
contains only the derived, structured datasets and the viewer application.*
