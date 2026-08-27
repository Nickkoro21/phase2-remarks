# Offline Export Spec — Το πακέτο για το κλειστό δίκτυο της Μονάδας

> Ισχύει ΜΟΝΟ για ό,τι παράγει το tools/build_offline.py και στέλνεται στη δουλειά.
> Η web εφαρμογή (GitHub Pages) παραμένει ΣΥΓΧΡΟΝΗ — εκεί δουλεύουμε με τρέχοντα
> εργαλεία για τα οφέλη λειτουργικότητας.
> Σύνταξη: 2026-08-12 · **Αναθεώρηση: 2026-08-28 (Γύρος 22 — ΟΛΗ η εφαρμογή, ΕΝΑ αρχείο)**

## 1. Target περιβάλλον — ΔΥΟ ΑΡΙΘΜΟΙ, ΚΑΙ ΠΟΙΟΝ ΠΙΣΤΕΥΟΥΜΕ

**Τεκμήριο (12/08/2026, 3 φωτογραφίες χρήστη, ακόμη στο `D:\FDMS-export`
ως `viber_image_2026-08-12_*.jpg`):**

- **Firefox 72.0.2 (64-bit)** σε Windows 10 — ο browser του κλειστού δικτύου.
  Το About box της μιας φωτογραφίας γράφει «72.0.2 (64-bit)» και από κάτω
  φαίνεται το footer αυτής της ίδιας εφαρμογής, άρα η φωτογραφία είναι από το
  μηχάνημα της μονάδας.
- Οι άλλες δύο δείχνουν `SyntaxError: expected expression, got '.'` ×3
  (Phase2-FDMS.html:1492, 2092, 2404) → **optional chaining `?.` δεν κάνει καν parse**
  → όλο το script απορρίπτεται → κενή σελίδα (μόνο το static footer φαίνεται).

**Εντολή χρήστη (28/08/2026):** «…να τρέχει στο **παλαιολιθικό** Firefox του
κλειστού δικτύου της μονάδας» — χωρίς αριθμό έκδοσης.

**ΑΠΟΦΑΣΗ:** ο builder κατεβαίνει στο **Firefox 52 ESR** — είκοσι εκδόσεις ΚΑΤΩ
από τον φωτογραφημένο browser. Είναι υπόθεση εργασίας, όχι τεκμήριο, και
κρατιέται επειδή είναι **η ασφαλέστερη από τις δύο**: ό,τι κοστίζει το πάτωμα
του 52 (τα `grid-gap` longhands, το fallback ημερομηνίας, το fallback
clipboard, μερικά ακόμη shims) είναι **αδρανές** στον 72, οπότε το αρχείο
τρέχει στον 72 ακριβώς όπως πριν. Αν ο χρήστης επιβεβαιώσει ότι στα μηχανήματα
είναι όντως 72.0.2, ΔΕΝ χρειάζεται rebuild· απλώς το `FLOOR`/`ES_TARGET` του
builder μπορούν να ανέβουν σε firefox72/es2019 για λίγο μικρότερο output.

- Παλιό Edge/IE ενδέχεται επίσης να υπάρχει· ο σκληρός στόχος είναι ο Firefox.

## 2. Γλωσσικό συμβόλαιο των export

- **JavaScript: ES2017 maximum** — αυτή ΕΙΝΑΙ η οροφή σύνταξης του Firefox 52
  (ο 52 είναι η έκδοση που έφερε το `async`/`await`, το τελευταίο συντακτικό
  του ES2017, και δεν έχει τίποτα από ES2018).
  Απαγορεύονται ΣΤΗ ΣΥΝΤΑΞΗ: object rest/spread `{...x}` (Fx55), async
  generators / `for await` (Fx57), optional catch binding `catch {}` (Fx58),
  `?.` (Fx74), `??`/`??=` (Fx72), `||=`/`&&=` (Fx79), class fields, static
  blocks, top-level await, `#private`, numeric separators, BigInt,
  named capture groups / lookbehind / `s` flag στα regex (Fx78), `d`/`v` flags.
  · Το array/call spread (`[...a]`, `f(...a)`) και τα rest params **επιτρέπονται**:
    είναι ES2015 και ο 52 τα έχει. Η πύλη τα ξεχωρίζει με έλεγχο παρενθέσεων.
- **Runtime APIs που ΔΕΝ υπάρχουν στον Fx52 — θέλουν shim (τα δίνει ο builder):**
  `globalThis` (65) · `Object.fromEntries` (63) · `Array.flat/flatMap` (62) ·
  `String.trimStart/trimEnd` (61) · `String.matchAll` (67) · `Promise.finally`
  (58) · `Promise.allSettled` (71) · `queueMicrotask` (69) ·
  `Element.replaceChildren` (86) · `Element.toggleAttribute` (63) ·
  `navigator.clipboard.writeText` (63 → `document.execCommand("copy")`) ·
  `String.replaceAll` (77) · `.at()` (90) · `Object.hasOwn` (92) ·
  `Array.findLast` (104) · `structuredClone` (94) · `crypto.randomUUID` (95).
  **ΑΠΑΓΟΡΕΥΟΝΤΑΙ (χωρίς λογικό shim):** IntersectionObserver (55),
  ResizeObserver (69), AbortController (57), `Promise.any` (79), νεότερα `Intl`.
  Το File System Access API δεν υπάρχει στον Firefox — το feedback πέφτει ΠΑΝΤΑ
  στο τοπικό tier + κουμπί Export.
- **CSS: ό,τι υποστηρίζει ο Fx52.** ΟΚ: custom properties, **grid** (ο 52 είναι
  η έκδοση που το έφερε — με `grid-gap`), flex, position sticky, `@supports`,
  `:focus-within`. ΑΠΑΓΟΡΕΥΟΝΤΑΙ: `:is()/:where()` (78/82), `:has()` (121),
  `:focus-visible` (85), `min()/max()/clamp()` (75), `inset` shorthand (66),
  aspect-ratio (89), `contain` (69), `env()` (65), `::marker` (68),
  scrollbar-* (64), overscroll-behavior (59), subgrid (71).
  **ΠΡΟΣΟΧΗ ΣΤΟ `gap`:** unprefixed σε grid = Fx61, σε **flex = Fx63**. Ο 52
  έχει ΜΟΝΟ `grid-gap`. Βλ. § 3γ.
- **HTML:** ΟΧΙ native `<dialog>` (98) — όλοι οι διάλογοι της εφαρμογής είναι
  ήδη custom div (`.modal`, `.ed-pop`, `.sch-wordpop`, `.sv-modal`) και έτσι
  πρέπει να μείνουν. `<input type="date">` δεν έχει picker πριν τον 57 — βλ. §3δ.

## 3. Μηχανισμός: transpile ΣΤΟ BUILD, όχι διπλός κώδικας

- Ο πηγαίος κώδικας της εφαρμογής **ΔΕΝ αλλάζει** (μένει σύγχρονος). Ο Γύρος 22
  δεν άγγιξε ούτε μία γραμμή του `app/` — όλη η απόκλιση ζει στον builder.
- Το tools/build_offline.py περνά ΚΑΘΕ inline script από **esbuild
  `--target=es2017`** (pinned 0.28.2 στο tools/package.json· version drift =
  hard fail). Ο στόχος `firefox52` του esbuild **δεν χρησιμοποιείται**: ο
  πίνακας συμβατότητάς του θεωρεί for-of / destructuring / generators
  ανυποστήρικτα στον 52 και μετά αρνείται να τα μεταγλωττίσει — λάθος για τον
  Firefox (for-of 13, destructuring 2, generators 26) και θα έσπαγε το build.
- **Τέσσερα μπλοκ του builder μπαίνουν ΠΡΙΝ από κάθε script της εφαρμογής:**
  1. **CAPABILITY GUARD** — πρώτο script στο `<head>`, **γραμμένο σε ES5** ώστε
     να κάνει parse σε μηχανή που δεν καταλαβαίνει τα υπόλοιπα. Κάνει
     feature-detect το πάτωμα και, αν λείπει κάτι, ζωγραφίζει αγγλικό banner
     που **ονομάζει ακριβώς τι λείπει** αντί για λευκή σελίδα.
  2. **RUNTIME SHIMS** — η λίστα του § 2, καθένα μόνο αν λείπει.
  3. **OFFLINE FETCH SHIM** — σερβίρει κάθε `../data/...` από το ενσωματωμένο
     bundle· τίποτα δεν αγγίζει δίκτυο.
  4. **TYPED-DATE FALLBACK** — § 3δ.
- **3γ. `gap`:** κάθε `gap`/`row-gap`/`column-gap` παίρνει το legacy
  `grid-gap`/`grid-row-gap`/`grid-column-gap` ΠΡΙΝ από αυτό (καλύπτει το GRID
  μέχρι τον 52· ο σύγχρονος browser διαβάζει το επόμενο `gap`). Για τα FLEX
  containers ο builder **παράγει φύλλο fallback με margins** πίσω από
  `html.no-flexgap`, κλάση που ανάβει ΜΟΝΟ ο capability guard μετά από ζωντανό
  τεστ — άρα στον Fx63+ (και στον φωτογραφημένο 72) καμία τους δεν ταιριάζει.
- **3δ. Ημερομηνίες:** ο Firefox απέκτησε picker στον 57· κάτω από αυτόν το
  `<input type="date">` γίνεται απλό κουτί κειμένου. Το module του builder,
  ΜΟΝΟ όταν λείπει ο picker: βάζει `html.no-datepicker`, δίνει placeholder
  `YYYY-MM-DD` + pattern + title, και **κανονικοποιεί ό,τι πληκτρολογήθηκε στη
  φάση capture** (πριν το δει ο handler της εφαρμογής) δεχόμενο DD/MM/YYYY,
  DD-MM-YYYY, DD.MM.YYYY, D/M/YY, YYYYMMDD και σκέτο ISO. Ό,τι δεν παρσάρεται
  μένει **ανέπαφο** και σημαδεύεται `aria-invalid` — σιωπηλή λάθος μαντεψιά σε
  ημερομηνία είναι χειρότερη από πεδίο που φαίνεται λάθος.
- **Πύλη ποιότητας** (hard fail, δεν γράφεται τίποτα): κάθε emitted script
  ξανα-παρσάρεται από esbuild, μετά ένας scanner που αφαιρεί strings/templates/
  comments/regex αποδεικνύει ότι δεν επέζησε σύνταξη ES2018+ (με **έλεγχο
  παρενθέσεων** για να ξεχωρίσει το object spread από array/call spread), και
  τέλος checklist scan για APIs που λείπουν στον 52 και για CSS πάνω από τον 52.

## 4. Παραδοτέο του builder — ΕΝΑ ΑΡΧΕΙΟ

Εντολή χρήστη 28/08/2026: «πρέπει να είναι **όλα ΕΝΑ λειτουργικό HTML**».

| Αρχείο | Περιεχόμενο |
|---|---|
| `Phase2-FDMS-YYYYMMDD.html` | **ΟΛΗ η εφαρμογή**: Remarks · Description · Requirements · Phase II Flowchart · Scheduler (Board/Roster/Training Log/Balance/**Bridge**) · Currency · Validate · MIF chart · καθολική αναζήτηση · τοπικό feedback · οι 8 παλέτες |
| `README-IT-YYYYMMDD.txt` | ελληνικό σημείωμα για το Τμήμα Πληροφορικής (συνοδευτικό, όχι μέρος της εφαρμογής) |

Το ημερομηνιακό stamp είναι μέρος του ονόματος (`--stamp=YYYYMMDD`, default
σήμερα), ώστε δύο αποστολές να μην πατάνε η μία την άλλη στο `D:\FDMS-export`.

Το παλιό `Phase2-Validate.html` **καταργείται**: το Schedule Validation ταξιδεύει
πλέον μέσα στο ένα αρχείο, ως δική του καρτέλα.

## 4β. Τι ταξιδεύει τώρα — και γιατί άλλαξε (Γύρος 22, ανατρέπει το § 4β του 12b)

Μέχρι τις 28/08 ο Scheduler, το Currency και το `schedstore.js` **δεν έμπαιναν**
στο πακέτο, γιατί μαζί τους θα ταξίδευε το roster. **Το roster δεν ταξιδεύει
πια — και ούτε ο λόγος να τα κόβουμε.**

- Το export φεύγει με **ΑΔΕΙΟ STORE**: ο builder αντικαθιστά το
  `data/scheduler/seed.json` με `{}`. Κάθε collection ανοίγει άδεια και
  γράφεται άδεια, οπότε το store είναι κανονικά «σπαρμένο» (κανένα seedError,
  και το `↺ Reset` επιστρέφει στο άδειο) χωρίς ούτε ένα ονοματεπώνυμο,
  call sign ή ΑΜ μέσα στο αρχείο.
- Τα δεδομένα μπαίνουν **επιτόπου** από τη μονάδα, από τον ίδιο τον δρόμο
  κινδύνου του Γύρου 20: `✎ Editor` (πρώτη φορά ΟΡΙΖΕΙ κωδικό — trust on first
  use) → `«⋯»` → `⭱ Import` → αρχείο → πληκτρολόγηση της λέξης **REPLACE**.
- Άρα στο κλειστό δίκτυο **υπάρχει** store και **υπάρχει** edit lock, και ξεκινά
  ΚΛΕΙΔΩΜΕΝΟ (view-only, χωρίς κωδικό ορισμένο).
- **Ένα και μόνο module δεν ταξιδεύει: το `app/schedsync.js`.** Μιλάει στο
  GitHub· σε κλειστό δίκτυο μπορεί μόνο να αποτύχει και θα έβαζε ζωντανό https
  endpoint μέσα στο αρχείο. Φορτώνεται δυναμικά από το `app.js`, και ο builder
  εξουδετερώνει εκείνο ακριβώς το μπλοκ. Χωρίς αυτό δεν εμφανίζεται το `☁ Sync`
  στην μπάρα — ό,τι δεν φορτώνεται, δεν υπάρχει.
- **Tripwire της πύλης:** 10 εξωτερικά `<script src>` στο `app/index.html`,
  0 stubs, και κάθε `view-*` id παρόν. Νέο module = ο αριθμός κουνιέται μόνο
  αφού κοιταχτεί μία φορά για το πάτωμα και μπει στο `SCRIPT_CHAIN`.

## 5. Επαλήθευση κάθε build

1. `python tools/build_offline.py --gate-selftest` = PASS (regression της πύλης).
2. esbuild parse με target es2017 = πράσινο για κάθε inline script.
3. **Ανεξάρτητο static floor audit** του τελικού HTML (χωριστό script, δικοί του
   κανόνες — όχι η πύλη του builder): μηδέν σύνταξη/API πάνω από το πάτωμα,
   μηδέν εξωτερική αναφορά, κάθε `gap` με το `grid-gap` του.
4. **Privacy grep** του τελικού HTML με ΟΛΗ την ιδιωτική λίστα (`D:\FDMS-roster\
   roster.json` + τα `*.sql`): μηδέν επώνυμο / call sign / ΑΜ. Μαζί, σάρωση για
   κλειδιά και διαπιστευτήρια (ονόματα παρόχων cloud, tokens, κλειδιά API) και
   για http(s) — τα μόνα αποδεκτά https είναι **αδρανές κείμενο** (το
   `href` του feedback που το ίδιο το module υποκλέπτει στη φάση capture, και
   το SVG namespace). Τίποτα που να **φορτώνει** η σελίδα.
   > Η ίδια η λίστα ελέγχου γράφεται ΠΕΡΙΓΡΑΦΙΚΑ εδώ, όχι με τα literal tokens:
   > αλλιώς αυτό το ίδιο αρχείο χτυπάει στο grep κάθε φορά.
5. Λειτουργικό πέρασμα σε σύγχρονο browser: landing → gradesheet με
   παρατηρήσεις → training log → Bridge χωρίς αρχείο WA → Export → Import
   round-trip → «⋯» με τη λέξη → διάλογοι → edit lock. ΜΗΔΕΝ console errors,
   ΜΗΔΕΝ εξωτερικά network requests.
6. Όποτε υπάρχει πρόσβαση: πραγματικό τεστ στον browser της μονάδας (χειροκίνητο).
