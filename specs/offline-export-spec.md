# Offline Export Spec — Το πακέτο για το κλειστό δίκτυο της Μονάδας

> Ισχύει ΜΟΝΟ για ό,τι παράγει το tools/build_offline.py και στέλνεται στη δουλειά.
> Η web εφαρμογή (GitHub Pages) παραμένει ΣΥΓΧΡΟΝΗ — εκεί δουλεύουμε με τρέχοντα
> εργαλεία για τα οφέλη λειτουργικότητας.
> Σύνταξη: 2026-08-12 · **Αναθεώρηση: 2026-08-28 (Γύρος 23 — ΤΟ ΠΡΑΓΜΑΤΙΚΟ
> ΠΑΤΩΜΑ: Firefox 32, καθαρή ES5)**

## 1. Target περιβάλλον — Η ΑΠΟΦΑΝΣΗ ΤΟΥ ΧΡΗΣΤΗ

**Τεκμήριο (12/08/2026, 3 φωτογραφίες χρήστη, ακόμη στο `D:\FDMS-export`
ως `viber_image_2026-08-12_*.jpg`):**

- **Firefox 72.0.2 (64-bit)** σε Windows 10 — ο browser του κλειστού δικτύου.
  Το About box της μιας φωτογραφίας γράφει «72.0.2 (64-bit)» και από κάτω
  φαίνεται το footer αυτής της ίδιας εφαρμογής, άρα η φωτογραφία είναι από το
  μηχάνημα της μονάδας.
- Οι άλλες δύο δείχνουν `SyntaxError: expected expression, got '.'` ×3
  (Phase2-FDMS.html:1492, 2092, 2404) → **optional chaining `?.` δεν κάνει καν parse**
  → όλο το script απορρίπτεται → κενή σελίδα (μόνο το static footer φαίνεται).

**Απόφανση χρήστη (28/08/2026),** αφού είδε ο ίδιος τον φάκελο:
«**Λογικά με το 32 θα είμαστε μια χαρά**».

**ΑΠΟΦΑΣΗ:** το πάτωμα είναι **Firefox 32** — απόφανση, όχι υπόθεση. Ο Γύρος 22
είχε μαντέψει «52 ESR» από τη λέξη «παλαιολιθικό»· ο 23 το αντικαθιστά με τον
αριθμό που έδωσε ο χρήστης.

**Δεν είναι «άλλες είκοσι εκδόσεις του ίδιου πράγματος».** Ο 52 έχει ακόμη
arrow functions, classes, template literals, `let`/`const` — η ES2017 ήταν μια
**διάλεκτος** στην οποία μπορούσε να γραφτεί το αρχείο. Ο 32 δεν έχει σχεδόν
τίποτα από αυτά (`let`/`const` 51, classes 45, template literals 34,
destructuring 53) και **καθόλου `Symbol`** (36). Κάτω από αυτή τη γραμμή δεν
μένει διάλεκτος-στόχος πέρα από εκείνη που κάθε μηχανή από το 2011 παρσάρει:
το export μεταγλωττίζεται πλέον σε **καθαρή ES5**.

- Παλιό Edge/IE ενδέχεται επίσης να υπάρχει· ο σκληρός στόχος είναι ο Firefox.
  Η καθαρή ES5 τους καλύπτει συντακτικά ούτως ή άλλως.

### 1β. Τι ΔΕΝ καλύπτει το 32 — ειλικρινά

**Το WebCrypto είναι Firefox 34.** Σε γνήσιο 32 ή 33 ο κωδικός επεξεργασίας
ΔΕΝ μπορεί να οριστεί, άρα ο Scheduler μένει view-only και το Import είναι
απρόσιτο. Τίποτε άλλο στη σελίδα δεν επηρεάζεται. Ο capability guard το λέει
πλέον **στην οθόνη**, σε κλειστή-με-× λωρίδα, αντί να αφήνει κάποιον να ψάχνει
κουμπί που δεν πρόκειται να δουλέψει. Στον φωτογραφημένο 72 το θέμα δεν τίθεται.

Επίσης: `document.execCommand("copy")` είναι Fx41 — κάτω από αυτόν το «Copy»
του flowchart απλώς δεν κάνει τίποτα (είναι μέσα σε try/catch)· και το
`position: sticky` είναι ακριβώς Fx32, δηλαδή πάνω στο πάτωμα.

## 2. Γλωσσικό συμβόλαιο των export

- **JavaScript: ΚΑΘΑΡΗ ES5 στην ΕΞΟΔΟ.** Όχι «ES5-ish»: κάθε inline script του
  τελικού αρχείου περνά από **acorn με `ecmaVersion: 5`** και το build ΔΕΝ
  γράφει αρχείο αν έστω ένα δεν παρσάρει. Δεν επιβιώνει: `let`/`const`,
  arrow functions, template literals, classes, destructuring, default/rest
  params, spread, `for-of`, generators, `async`/`await`, `?.`, `??`, `#private`,
  numeric separators, BigInt, optional catch binding — τίποτα πάνω από ES5.
  · **Γιατί ES5 και όχι πίνακας χαρακτηριστικών του Fx32:** σε αυτό το βάθος ο
    πίνακας δεν αγοράζει σχεδόν τίποτα (ο 32 έχει arrow functions και ελάχιστα
    άλλα), ενώ η ES5 αγοράζει **μηχανική απόδειξη**. Το «θα παρσάρει στον
    browser της μονάδας» παύει να είναι ελπίδα.
- **Runtime APIs που ΔΕΝ υπάρχουν στον Fx32 — θέλουν shim (τα δίνει ο builder).**
  Πάνω από τη λίστα του Γύρου 22 (`globalThis` 65 · `Object.fromEntries` 63 ·
  `Array.flat/flatMap` 62 · `String.trimStart/trimEnd` 61 · `String.matchAll` 67 ·
  `Promise.finally` 58 · `Promise.allSettled` 71 · `queueMicrotask` 69 ·
  `Element.replaceChildren` 86 · `Element.toggleAttribute` 63 ·
  `navigator.clipboard.writeText` 63 · `String.replaceAll` 77 · `.at()` 90 ·
  `Object.hasOwn` 92 · `Array.findLast` 104 · `structuredClone` 94 ·
  `crypto.randomUUID` 95) προστίθεται **η παρτίδα του 32**:
  `Object.assign` (34) · `Object.entries`/`values` (47) ·
  `Object.getOwnPropertyDescriptors` (50) · `Array.prototype.includes` (43) ·
  `String.prototype.includes` (40) · `String.padStart/padEnd` (48) ·
  `Element.matches` (34) · `Element.closest` (35) · `NodeList.forEach` (50) ·
  `Array.prototype.values` (48) · `<details>` toggle (49) — και, το κρίσιμο,
  **το iterator protocol**.
  · **ΤΟ ΦΕΡΟΝ SHIM — `"@@iterator"`.** Ο Babel μεταγλωττίζει το `for-of` και το
    spread σε helpers που ψάχνουν με τη σειρά: `Symbol.iterator` → το **string
    key `"@@iterator"`** → Array/String/Map/Set κατά brand → array-like με
    `.length`. Ο Firefox 32 **δεν έχει καθόλου `Symbol`** (36), άρα το σκαλί που
    σηκώνει την εφαρμογή είναι το string key: το `[...map.values()]` φτάνει στον
    helper ως *Map Iterator*, που ο έλεγχος brand ΔΕΝ αναγνωρίζει, και θα
    πετούσε «Invalid attempt to iterate non-iterable instance». Το shim ορίζει
    `"@@iterator"` (non-enumerable, μόνο όταν λείπει το `Symbol`) στα
    `Map.prototype`, `Set.prototype` και στα prototypes των Map/Set/Array
    iterators — ~250 σημεία της εφαρμογής εξαρτώνται από αυτό. Και το
    `Array.from` (που είναι ακριβώς Fx32) δοκιμάζεται ζωντανά πάνω σε Map
    iterator και αντικαθίσταται μόνο αν αποτύχει.
  · **`fetch` (39)** επιτρέπεται μόνο επειδή το offline fetch shim αντικαθιστά
    ΑΝΕΞΑΙΡΕΤΩΣ το `window.fetch` με αναγνώστη του ενσωματωμένου bundle: ο
    browser δεν φτάνει ποτέ στη δική του υλοποίηση.
  **ΑΠΑΓΟΡΕΥΟΝΤΑΙ (χωρίς λογικό shim):** IntersectionObserver (55),
  ResizeObserver (69), AbortController (57), `Promise.any` (79),
  `URLSearchParams` (44), νεότερα `Intl`, **και το `Symbol.toPrimitive`** — βλ. §3ε.
  Το File System Access API δεν υπάρχει στον Firefox — το feedback πέφτει ΠΑΝΤΑ
  στο τοπικό tier + κουμπί Export.
- **CSS: ό,τι υποστηρίζει ο Fx32.** ΟΚ: custom properties (31), flexbox (28),
  `position: sticky` (32, πάνω στο πάτωμα), `calc` (16), `@supports` (22),
  `mix-blend-mode` (32). ΑΠΑΓΟΡΕΥΟΝΤΑΙ: `:is()/:where()` (78/82), `:has()` (121),
  `:focus-visible` (85), **`:focus-within` (52)**, `min()/max()/clamp()` (75),
  `inset` shorthand (66), aspect-ratio (89), `contain` (69), `env()` (65),
  `::marker` (68), scrollbar-* (64), overscroll-behavior (59), subgrid (71).
  **ΤΟ ΜΕΓΑΛΟ: CSS GRID = Fx52.** Δεν αφαιρείται — βλ. § 3στ.
  **ΠΡΟΣΟΧΗ ΣΤΟ `gap`:** unprefixed σε grid = Fx61, σε **flex = Fx63**, και το
  `grid-gap` καλύπτει GRID μόνο ως τον 52. Βλ. § 3γ.
  **`overflow-wrap` = Fx49** → παίρνει το legacy `word-wrap` ΠΡΙΝ από αυτό.
  Αδρανή/καλλωπιστικά και καταγεγραμμένα: `font-variant-numeric` (34),
  `filter:` (35), `accent-color` (92), `-webkit-line-clamp` (68),
  `prefers-reduced-motion` (63).
- **HTML:** ΟΧΙ native `<dialog>` (98) — όλοι οι διάλογοι της εφαρμογής είναι
  ήδη custom div (`.modal`, `.ed-pop`, `.sch-wordpop`, `.sv-modal`) και έτσι
  πρέπει να μείνουν (επαληθεύτηκε στον Γύρο 23). `<input type="date">` δεν έχει
  picker πριν τον 57 — βλ. §3δ. **`<details>/<summary>` = 49** — βλ. §3ζ.

## 3. Μηχανισμός: transpile ΣΤΟ BUILD, όχι διπλός κώδικας

- Ο πηγαίος κώδικας της εφαρμογής **ΔΕΝ αλλάζει** (μένει σύγχρονος). Ο Γύρος 23
  άλλαξε **μηδέν** γραμμές στο `app/` — όλη η απόκλιση ζει στον builder, και
  γι' αυτό το hosted app και το export ζωγραφίζουν ΤΟ ΙΔΙΟ σε κάθε σύγχρονο
  browser.
- **Ο transpiler είναι ο Babel, και ζει ΕΞΩ από το repo.** Το esbuild βγήκε από
  το build: σταματά στην ES2015 και στο `--target=es5` απαντά «Transforming
  const to the configured target environment ("es5") is not supported yet».
  Το `tools/es5_transpile.js` (λεπτός node driver) κάνει και τα δύο σκέλη:
  **TRANSPILE** με `@babel/preset-env` + `forceAllTransforms`, και **PARSE5**
  με **acorn `ecmaVersion: 5`** πάνω στο ΤΕΛΙΚΟ κείμενο.
  · **Πού ζουν τα deps:** `$FDMS_BUILD_DEPS` → `D:\FDMS-build-deps` →
    `tools/node_modules` (και τα τρία gitignored ή εκτός repo). Είναι ~30 MB
    node_modules και **το δημόσιο repo δεν πρέπει να τα αποκτήσει ποτέ**· ο
    builder τα ΑΠΑΙΤΕΙ και, αν λείπουν, **σπάει θορυβωδώς** τυπώνοντας την
    ακριβή εντολή `npm install` με τα καρφωμένα versions.
    Καρφωμένα: `@babel/core 7.28.4`, `@babel/preset-env 7.28.3`, `acorn 8.14.0`
    — version drift = hard fail (χωρίς αυτό το build δεν είναι αναπαραγώγιμο).
  · **ΜΙΑ ΠΑΓΙΔΑ, ΚΑΤΑΓΕΓΡΑΜΜΕΝΗ:** με `loose: true` ο Babel υπονοεί
    `iterableIsArray` στο spread και το `[...bag.values()]` βγήκε
    `[].concat(bag.values())` — που **δεν** ξεδιπλώνει iterator, το προσθέτει ως
    ΕΝΑ στοιχείο. Λίστα τάξεων γινόταν σιωπηλά λίστα ενός iterator: κανένα
    σφάλμα, καμία προειδοποίηση, άδεια οθόνη στη μονάδα. Το `loose` αφαιρέθηκε,
    τα assumptions γράφονται ένα-ένα, και το `--gate-selftest` το ξανα-αποδεικνύει
    σε κάθε τρέξιμο.
- **Πέντε μπλοκ του builder μπαίνουν ΠΡΙΝ από κάθε script της εφαρμογής:**
  1. **CAPABILITY GUARD** — πρώτο script στο `<head>`, γραμμένο στο χέρι σε ES5.
     **Η δουλειά του άλλαξε:** τώρα που ΟΛΟ το αρχείο είναι ES5 δεν υπάρχει
     σύνταξη να ελεγχθεί — ό,τι παρσάρει τον guard παρσάρει και τα υπόλοιπα —
     οπότε ελέγχει το **runtime πάτωμα** (JSON, querySelector, classList,
     addEventListener, Promise, Map/Set, `Array.from`, localStorage, Blob +
     `URL.createObjectURL`, FileReader, CSS custom properties μέσω
     `CSS.supports` με fallback σε ζωντανό write/read-back) και, αν λείπει κάτι,
     ζωγραφίζει αγγλικό banner που **ονομάζει ακριβώς τι λείπει** αντί για
     λευκή σελίδα. Τρέχει επίσης τα **τρία ζωντανά layout tests** που ανάβουν τα
     `html.no-grid` (52) / `html.no-flexgap` (63) / `html.no-details` (49), και
     δείχνει **λωρίδα προειδοποίησης** όταν λείπει το WebCrypto (§ 1β).
  2. **RUNTIME SHIMS** — η λίστα του § 2, καθένα μόνο αν λείπει.
  3. **OFFLINE FETCH SHIM** — σερβίρει κάθε `../data/...` από το ενσωματωμένο
     bundle· τίποτα δεν αγγίζει δίκτυο.
  4. **TYPED-DATE FALLBACK** — § 3δ.
  5. **OFFLINE FEEDBACK** — υποκλέπτει στη φάση capture κάθε link `/issues/new`
     και ανοίγει τοπικό διάλογο· καμία πλοήγηση, κανένα request.
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
- **3ε. Ο ΕΝΑΣ computed key.** Ο Babel μεταγλωττίζει κάθε `{ [k]: v }` σε
  `_defineProperty` → `_toPropertyKey` → `_toPrimitive`, και το σώμα του
  τελευταίου διαβάζει `t[Symbol.toPrimitive]` **αφύλακτα**. Στον Fx32 αυτή η
  γραμμή είναι ReferenceError τη μέρα που το κλειδί θα είναι object. Σήμερα
  σώζεται από τύχη (το `CFG_KEY` είναι το string `"editor_lock"` και ο
  `_toPrimitive` επιστρέφει τα μη-objects πριν αγγίξει το `Symbol`) — και η τύχη
  δεν είναι πάτωμα. Ο builder (`prepare_schedstore`) ξαναγράφει τη μοναδική
  αυτή γραμμή του `app/schedstore.js` με τον μακρύ τρόπο (`var o={}; o[k]=v;`)
  ώστε ο helper **να μην παράγεται καθόλου**, και η πύλη απαγορεύει πλέον το
  `Symbol.toPrimitive` οπουδήποτε στο τελικό αρχείο: κάθε εναπομείνασα αναφορά
  στο `Symbol` κάθεται πίσω από ζωντανό `typeof Symbol`.
- **3στ. CSS GRID (52) — ΤΟ ΦΥΛΛΟ `html.no-grid`.** Έντεκα containers του
  `app/styles.css` είναι grids. Στον Fx32 το `display: grid` είναι άγνωστη τιμή,
  πέφτει, και ο container γίνεται `block`: τέσσερα panel δίπλα-δίπλα γίνονται
  μία πολύ ψηλή στήλη και το flowchart χάνει το πλαϊνό του φύλλο. **Τίποτα δεν
  πετάει σφάλμα — απλώς φαίνεται λάθος**, που είναι το χειρότερο είδος λάθους
  για κλειστό δίκτυο.
  · **Η ΚΡΙΣΗ:** οι δηλώσεις grid **ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ΩΣ ΕΧΟΥΝ** — ο Γύρος 23 δεν
    αλλάζει ούτε ένα pixel σε ό,τι βλέπει σύγχρονος browser, και το
    `app/styles.css` είναι κοινό με το hosted app. Ο builder προσθέτει
    **γραμμένο στο χέρι** flexbox φύλλο πίσω από `html.no-grid`, κλάση που ανάβει
    ΜΟΝΟ ο guard όταν το `CSS.supports("display","grid")` απαντήσει όχι. Στον
    Fx52+ (και στον φωτογραφημένο 72) **καμία** από αυτές τις γραμμές δεν
    ταιριάζει. Flexbox = Fx28, τέσσερις εκδόσεις κάτω από το πάτωμα.
  · **Δύο μαθήματα, πληρωμένα στην οθόνη:** (α) τα panels διευθύνονται με **id**,
    όχι με `:nth-child` — το `remarksearch.js` εισάγει το `.rs-panel` ως πρώτο
    παιδί στο runtime και μετακινούσε όλη την αρίθμηση· (β) οι στήλες γράφονται
    ως `flex: 0 1 <track>` + `flex: 1 1 <min>` με `flex-wrap: wrap`, ώστε τα
    ίδια τρία σχήματα (4 στήλες → 2 → 1) να βγαίνουν από το πλάτος, με τα δύο
    breakpoints της εφαρμογής (1100/640) καθρεφτισμένα.
  · **ΔΥΟ TRIPWIRES στην πύλη:** κάθε selector που δηλώνει `display:grid` **ή**
    τοποθετείται σε grid track (`grid-column/row/area` — π.χ. το
    `.rs-panel { grid-column: 1 / -1 }`) πρέπει να εμφανίζεται στο φύλλο, και ο
    έλεγχος γίνεται και στο `<style>` **και στα CSS-in-JS** των modules. Νέο grid
    layout = το build σταματά μέχρι να το κοιτάξει κάποιος.
  · Ένα και μόνο layout υποβαθμίζεται σκόπιμα: το `.fc-l1` (πραγματικά
    δισδιάστατο) παίρνει τη **στενή μορφή που ήδη έχει η εφαρμογή κάτω από
    1040px** — μία στήλη με το detail sheet κολλημένο κάτω. Δηλωμένη υποβάθμιση,
    όχι προσέγγιση που «σχεδόν» πετυχαίνει.
- **3ζ. `<details>/<summary>` (49).** Κάτω από τον 49 το στοιχείο είναι άγνωστο
  inline box: **και** το summary **και** το σώμα φαίνονται πάντα, οπότε τα
  τέσσερα κλειστά «Source & verbatim» panels θα άνοιγαν μόνα τους. Ο guard βάζει
  `html.no-details`, το παραγόμενο φύλλο κρύβει το σώμα χωρίς `[open]`, και ένας
  delegated click handler στα shims γυρίζει το attribute.
- **Πύλη ποιότητας** (hard fail, δεν γράφεται τίποτα):
  · **ΣΤΡΩΜΑ 1 — Η ΑΠΟΔΕΙΞΗ:** acorn, `ecmaVersion: 5`, σε **κάθε** emitted
    script. Διαφορετική βιβλιοθήκη από αυτήν που παρήγαγε το κείμενο· ο
    transpiler δεν μπορεί ποτέ να είναι η απόδειξη του εαυτού του.
  · **ΣΤΡΩΜΑ 2 — δεύτερη γνώμη με αριθμούς γραμμής:** scanner που αφαιρεί
    strings/templates/comments/regex και μετά ψάχνει ονομαστικά `?.` και `??`
    (τα δύο tokens στα οποία όντως πέθανε ο browser της μονάδας) και την
    υπόλοιπη μη-ES5 σύνταξη· checklist για APIs που λείπουν στον 32· σάρωση CSS
    πάνω από τον 32· και τα δύο grid tripwires του § 3στ.

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

1. `python tools/build_offline.py --gate-selftest` = PASS (regression της πύλης,
   **μαζί με το spread-over-a-Map του § 3**).
2. **acorn `ecmaVersion: 5` = μηδέν σφάλματα** για κάθε inline script — αυτή
   είναι η απόδειξη ότι ο Firefox 32 (και ο φωτογραφημένος 72, και ό,τι είναι
   ανάμεσα) μπορεί τουλάχιστον να **παρσάρει** τα πάντα.
3. **Ανεξάρτητο static floor audit** του τελικού HTML (χωριστό script, δικοί του
   κανόνες, δικός του stripper — όχι η πύλη του builder): δεύτερο ES5 parse,
   μηδέν `?.`/`??` στο ΩΜΟ κείμενο, μηδέν API/CSS πάνω από το πάτωμα, κάθε shim
   παρών, μηδέν αφύλακτο `Symbol`, μηδέν εξωτερική αναφορά, κάθε `gap` με το
   `grid-gap` του και κάθε `overflow-wrap` με το `word-wrap` του.
4. **Privacy grep** του τελικού HTML με ΟΛΗ την ιδιωτική λίστα (`D:\FDMS-roster\
   roster.json` + τα `*.sql`): μηδέν επώνυμο / call sign / ΑΜ. Μαζί, σάρωση για
   κλειδιά και διαπιστευτήρια (ονόματα παρόχων cloud, tokens, κλειδιά API) και
   για http(s) — τα μόνα αποδεκτά https είναι **αδρανές κείμενο** (το
   `href` του feedback που το ίδιο το module υποκλέπτει στη φάση capture, και
   το SVG namespace). Τίποτα που να **φορτώνει** η σελίδα.
   > Η ίδια η λίστα ελέγχου γράφεται ΠΕΡΙΓΡΑΦΙΚΑ εδώ, όχι με τα literal tokens:
   > αλλιώς αυτό το ίδιο αρχείο χτυπάει στο grep κάθε φορά.
5. Λειτουργικό πέρασμα σε σύγχρονο browser: landing → κάθε καρτέλα → gradesheet
   με παρατηρήσεις → Scheduler (Board/Roster/Training Log/Balance/Bridge χωρίς
   αρχείο WA) → Currency → Validate → Export → Import round-trip → «⋯» με τη
   λέξη → διάλογοι → edit lock. ΜΗΔΕΝ console errors, ΜΗΔΕΝ εξωτερικά network
   requests (`performance.getEntriesByType("resource").length === 0`).
   · **Και τα τρία fallback φύλλα δοκιμάζονται ανάβοντας τις κλάσεις με το χέρι**
     (`no-grid`, `no-flexgap`, `no-details`) και μετρώντας το layout σε δύο-τρία
     πλάτη: είναι ο μόνος τρόπος να δει κανείς αυτόν τον κώδικα να τρέχει χωρίς
     Firefox 32 στο τραπέζι. Έτσι βρέθηκαν και τα δύο λάθη του § 3στ.
6. **ΤΙ ΔΕΝ ΑΠΟΔΕΙΚΝΥΕΙ ΤΙΠΟΤΑ ΑΠΟ ΤΑ ΠΑΡΑΠΑΝΩ:** ότι ο Firefox 32 τρέχει την
   εφαρμογή. Το ES5 parse αποδεικνύει ότι **παρσάρει**· τα shims και ο guard
   καλύπτουν το γνωστό API πάτωμα· το λειτουργικό πέρασμα έγινε σε **σύγχρονη**
   μηχανή. Όποτε υπάρχει πρόσβαση: πραγματικό τεστ στον browser της μονάδας
   (χειροκίνητο) — αυτό παραμένει το μόνο τεκμήριο.
