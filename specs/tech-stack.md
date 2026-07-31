# Tech Stack — Phase 2 Remarks

## Αρχές

- **Zero-build, zero-dependency**: στατικό HTML/CSS/JS (vanilla). Τρέχει offline σε υπηρεσιακό PC
  χωρίς εγκαταστάσεις — μόνο ένας static file server (python -m http.server).
- **Δεδομένα = JSON στο δίσκο** (`data/`), ποτέ hardcoded στην εφαρμογή. Η εφαρμογή είναι viewer.
- **Ελληνικό UI, αγγλικό περιεχόμενο παρατηρήσεων** (όπως τα ΦΒ).

## Δομή

```
D:\FDMS
├── app\                  # index.html, styles.css, app.js (SPA, no framework)
├── data\
│   ├── criteria\         # 4 κατηγορίες, 118 items (verbatim + resolved τιμές)
│   ├── mif\              # fs.json, t6a.json (9 πίνακες MIF)
│   ├── observations\     # <category>\<item>.json + master_index.json
│   ├── requirements\     # 379 απαιτήσεις + board_tolerance_matrix
│   └── human_factors.json
├── specs\                # SDD constitution (mission, tech-stack, roadmap)
├── tools\build_index.py  # ξαναχτίζει το master_index.json
├── examples\             # εγκεκριμένο πρότυπο ύφους
└── start_app.bat         # εκκίνηση server + browser
```

## Indexing

`tools/build_index.py` σαρώνει τα observations και παράγει `data/observations/master_index.json`:
items ανά κατηγορία με MIF rows, διαθέσιμους συνδυασμούς (desired→achieved→count) και στατιστικά.
Η εφαρμογή φορτώνει ΜΟΝΟ το master index στην εκκίνηση και lazy-load το item file στην επιλογή.
Τρέχει ξανά μετά από κάθε νέα γενιά παρατηρήσεων.

## Συμβάσεις

- Python 3.x διαθέσιμη στο σύστημα (ΟΧΙ το venv aisuite).
- Git για κάθε αλλαγή· commits στα ελληνικά με σύντομο πρόθεμα (app:, data:, specs:, tools:).
- Footer credit σε κάθε σελίδα (βλ. mission).
