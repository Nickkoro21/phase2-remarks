# Offline Export Spec — Πακέτα για το κλειστό δίκτυο της Μονάδας

> Ισχύει ΜΟΝΟ για ό,τι παράγει το tools/build_offline.py και στέλνεται στη δουλειά.
> Η web εφαρμογή (GitHub Pages) παραμένει ΣΥΓΧΡΟΝΗ — εκεί δουλεύουμε με τρέχοντα
> εργαλεία για τα οφέλη λειτουργικότητας. Σύνταξη: 2026-08-12.

## 1. Target περιβάλλον (τεκμήριο: 3 φωτογραφίες χρήστη, D:\FDMS-export, 12/08)

- **Firefox 72.0.2 (64-bit)** σε Windows 10 — ο browser του κλειστού δικτύου.
  Οι φωτογραφίες δείχνουν `SyntaxError: expected expression, got '.'` ×3
  (Phase2-FDMS.html:1492, 2092, 2404) → **optional chaining `?.` δεν κάνει καν parse**
  → όλο το script απορρίπτεται → κενή σελίδα (μόνο το static footer φαίνεται).
- Παλιό Edge/IE ενδέχεται επίσης να υπάρχει· ο σκληρός στόχος είναι το Fx72.

## 2. Γλωσσικό συμβόλαιο των export

- **JavaScript: ES2019 maximum.** Απαγορεύονται ΣΤΗ ΣΥΝΤΑΞΗ: `?.`, `??`, `??=`,
  `||=`, `&&=`, class fields, static blocks, top-level await, `#private`,
  numeric separators, `d`/`v` regex flags.
- **Runtime APIs που ΔΕΝ υπάρχουν στον Fx72 — απαγορεύονται ή θέλουν shim:**
  `structuredClone` (Fx94) → JSON deep-clone shim· `crypto.randomUUID` (Fx95) →
  fallback generator· `String.replaceAll` (Fx77) → split/join· `at()` (Fx90)·
  `Intl.RelativeTimeFormat` κ.ά. νεότερα. Το File System Access API δεν υπάρχει
  στον Firefox — το feedback πέφτει ΠΑΝΤΑ στο τοπικό tier + Export κουμπί (ήδη
  σχεδιασμένο έτσι· απλώς πλέον είναι ο κανόνας, όχι η εξαίρεση).
- **CSS: ό,τι υποστηρίζει ο Fx72.** ΟΚ: custom properties, grid, flex (+gap),
  position sticky. ΑΠΑΓΟΡΕΥΟΝΤΑΙ: `:is()/:where()` (Fx78+), `inset` shorthand
  ασφαλές μεν (Fx66) αλλά ελέγχεται, aspect-ratio (Fx81), `gap` σε multi-col.

## 3. Μηχανισμός: transpile ΣΤΟ BUILD, όχι διπλός κώδικας

- Ο πηγαίος κώδικας της εφαρμογής ΔΕΝ αλλάζει (μένει σύγχρονος).
- Το tools/build_offline.py περνά ΚΑΘΕ script που πρόκειται να γίνει inline μέσα
  από **esbuild `--target=es2019`** (διαθέσιμο μέσω npx στο dev μηχάνημα) και
  προσθέτει τα shims (structuredClone, randomUUID) ΠΡΙΝ από κάθε άλλο script.
- **Πύλη ποιότητας**: μετά το transpile ο builder ΑΠΟΤΥΓΧΑΝΕΙ αν στο τελικό HTML
  επιβιώνει `?.` ή `??` ως σύνταξη ή κλήση απαγορευμένου API χωρίς guard/shim
  (grep-based λίστα + esbuild ως αληθής parser).

## 4. Παραδοτέα του builder

| Αρχείο | Περιεχόμενο |
|---|---|
| `Phase2-FDMS.html` | Remarks + search + Info + MIF chart + τοπικό feedback + παλέτες |
| `Phase2-Validate.html` | **ΜΟΝΟ το Schedule Validation** (schedval + flowchart2 inline + συνώνυμα μονάδας + παλέτες)· ελαφρύ, ~1-2MB |
| `README-IT.txt` | ελληνικό σημείωμα, ενημερωμένο: Firefox 72 συμβατό, feedback = τοπικό export |

## 4β. Τι ΔΕΝ ταξιδεύει — και τι σημαίνει για το edit lock (Γύρος 12b)

Ο Scheduler, το Currency και το `app/schedstore.js` **δεν μπαίνουν** στα πακέτα:
τα δύο `<main>` γίνονται κενά stubs και η αλυσίδα scripts του offline build δεν
τα περιλαμβάνει. Άρα στο κλειστό δίκτυο **δεν υπάρχει store για να κλειδωθεί**
ούτε κουμπί «Editor» — αυστηρά ισχυρότερο από «ξεκινά κλειδωμένο». Το κουμπί
δεν προστίθεται στο `app/index.html` (θα χαλούσε τα counts της πύλης: 5 tab
stubs / 3 main stubs / 8 εξωτερικά `<script src>`) — το **γράφει το
`schedstore.js`** στην μπάρα, οπότε εκεί που δεν φορτώνεται, δεν υπάρχει.

## 5. Επαλήθευση κάθε build

1. esbuild parse με target es2019 = πράσινο για κάθε inline script.
2. Grep τελικού HTML: κανένα `?.`/`??`/απαγορευμένο API εκτός guard.
3. Λειτουργικό πέρασμα στον σύγχρονο browser (το ES2019 τρέχει παντού).
4. Όποτε υπάρχει πρόσβαση: πραγματικό τεστ σε Fx72 στη δουλειά (χειροκίνητο).
