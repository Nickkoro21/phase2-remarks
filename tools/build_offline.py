# -*- coding: utf-8 -*-
r"""
build_offline.py — deterministic single-file export of Phase 2 FDMS for the
unit's CLOSED network.

ΤΙ ΑΛΛΑΞΕ ΣΤΙΣ 18/10/2026 (Γύρος Η — ΟΤΙ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΔΟΥΛΕΨΕΙ ΕΚΕΙ, ΔΕΝ ΦΕΥΓΕΙ)
  Η απόφανση του ιδιοκτήτη, μία γραμμή: «Ό,τι δημιουργεί πρόβλημα για το export
  απλά δεν το συμπεριλαμβάνουμε.»  Τρεις δουλειές βγαίνουν από αυτή.

  1. ΤΟ BRIDGE ΒΓΑΙΝΕΙ — ΚΑΙ ΤΟ ΕΠΙΚΙΝΔΥΝΟ ΔΕΝ ΗΤΑΝ ΤΟ ΜΟΔΟΥΛΟ, ΗΤΑΝ Η ΛΙΣΤΑ.
     Το `schedbridge.js` (526.526 bytes) συγχρονίζεται με Supabase — cloud.  Στο
     κλειστό δίκτυο το `W.fetch` του πέφτει πάνω στο offline shim, άρα η καρτέλα
     δεν υπολειτουργεί: ΑΠΟΤΥΓΧΑΝΕΙ ΠΑΝΤΑ, μπροστά σε εκπαιδευτή που δεν έχει
     κανέναν να ρωτήσει.  Βγαίνει από το SCRIPT_CHAIN όπως το advisor.js, και το
     κουμπί + το <section> του από δύο σημασμένα μπλοκ `bridge:start/end`.
     ΑΛΛΑ ΤΟ ΒΓΑΛΣΙΜΟ ΤΗΣ ΚΑΡΤΕΛΑΣ ΗΤΑΝ ΑΥΤΟ ΠΟΥ ΘΑ ΕΣΠΑΖΕ ΤΟΝ SCHEDULER.  Η
     `scheduler.js` κρατά τη λίστα `PANES` με πέντε ονόματα και περνά ΟΛΗ τη
     λίστα σε δύο βρόχους που καλούν μέθοδο πάνω στο στοιχείο κάθε pane ΧΩΡΙΣ
     έλεγχο για null:
         for (const p of PANES) $id("sch-" + p).innerHTML = msg;        // boot error
         for (const p of PANES) $id("sch-" + p).classList.toggle(…);    // ΚΑΘΕ ΚΛΙΚ
     Ο δεύτερος τρέχει σε κάθε κλικ σε υποκαρτέλα.  Χωρίς το
     `<section id="sch-bridge">` το `$id` γυρίζει null, ο handler πετά TypeError
     ΠΡΙΝ φτάσει στο render(), και ο χρήστης βλέπει υποκαρτέλες που δεν αλλάζουν
     ΠΟΤΕ: Board, Roster, Training Log, Balance — όλα νεκρά, χωρίς μήνυμα.
     Η θεραπεία είναι στη ΡΙΖΑ: φεύγει το "bridge" από τη λίστα (prepare_scheduler),
     κι έτσι και οι δύο βρόχοι γίνονται σωστοί χωρίς να τους αγγίξει κανείς.
     Μαζί κόβονται τα τρία καλώδια που δεν οδηγούν πουθενά (η custody κλήση, η
     γραμμή dispatch, η renderBridge() — που ΜΟΝΗ ΤΗΣ θα έσκαγε σε null) και το
     τέταρτο μέσα στην app.js: το ίδιο σχήμα με το `advInit`, μία μέρα μετά.
     Νέο tripwire `gate_scan_unit`, πάνω σε ΟΛΟ το αρχείο — markup, scripts και
     data μαζί, γιατί το μάθημα του advInit ήταν ότι ο έλεγχος στο κέλυφος είναι
     μισός έλεγχος.  Τα needle είναι ΑΝΑΓΝΩΡΙΣΤΙΚΑ, όχι λέξεις: «bridge» σημαίνει
     γεφύρι στα δεδομένα της πλοήγησης, έξι φορές, και ένας έλεγχος που έσκαγε
     σε αυτά θα ήταν λογοκρισία της Πελοποννήσου.

  2. ΤΑ ΚΕΙΜΕΝΑ ΠΟΥ ΜΙΛΟΥΣΑΝ ΓΙΑ ΚΟΥΜΠΙΑ ΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ.  Το `schedsync.js`
     δεν ταξιδεύει ποτέ — άρα δεν υπάρχει ☁ Sync, δεν υπάρχει ⭱ Push, δεν
     υπάρχει αντίγραφο στο GitHub — και όμως οι διάλογοι ↺ Reset / ⭱ Import /
     ⭳ Export καθησύχαζαν τον εκπαιδευτή ότι «το αντίγραφο στο GitHub ΔΕΝ
     πειράζεται».  Αυτό δεν είναι ανακρίβεια, είναι ΠΑΓΙΔΑ: κάποιος θα πατήσει
     ↺ Reset πιστεύοντας ότι υπάρχει αντίγραφο.  Και ο ίδιος διάλογος έλεγε ότι
     «ξαναχτίζει από το seed file» — ενώ στο export το seed είναι ΑΔΕΙΟ, δηλαδή
     το ↺ Reset ΑΔΕΙΑΖΕΙ.  Δεκαπέντε κείμενα ξαναγράφηκαν στο ΠΑΡΑΓΟΜΕΝΟ
     (`retell_closed_network`), ΠΟΤΕ στο app/: στη φιλοξενούμενη εφαρμογή το
     GitHub, ο συγχρονισμός και οι άλλες συσκευές ΥΠΑΡΧΟΥΝ και τα κείμενα είναι
     αληθινά εκεί.  Κάθε αντικατάσταση είναι sub1 με μέτρηση.

  3. Η ΠΥΛΗ ΤΩΝ ΕΞΩΤΕΡΙΚΩΝ ΕΙΧΕ ΔΕΚΑ ΤΡΥΠΕΣ, ΜΕΤΡΗΜΕΝΕΣ.  Ένας αναιρέτης πέρασε
     δείγματα ΜΕΣΑ ΑΠΟ ΤΗΝ ΙΔΙΑ ΤΗΝ ΠΥΛΗ.  Δεν πιάστηκαν: `<IFRAME>`, `<LINK
     rel=stylesheet>`, `<SCRIPT SRC>` (ΚΕΦΑΛΑΙΑ — η πύλη έψαχνε πεζά, και η HTML
     δεν έχει πεζά), `https:\/\/` (escaped slashes), `https&#58;//` (HTML
     entity), `<meta http-equiv="refresh">`, `setAttribute("src","//cdn/a.js")`,
     `new Worker`, `navigator.serviceWorker.register`, `window.open`.  Το
     `importScripts` ΗΤΑΝ ήδη στη λίστα και πιάστηκε.  Όλες έκλεισαν, καθεμία
     έχει δείγμα στο `--gate-selftest`, και ο κανόνας γράφτηκε: ό,τι διαβάζει η
     HTML ανεξαρτήτως πεζών-κεφαλαίων ελέγχεται ανεξαρτήτως πεζών-κεφαλαίων· ό,τι
     είναι ταυτότητα JavaScript ελέγχεται ΩΣ ΤΑΥΤΟΤΗΤΑ (το γυμνό «SharedWorker»
     έσκαγε στο «SharedWorkerLike»).  ΚΑΙ Η ΣΗΜΕΙΩΣΗ ΣΤΑΜΑΤΗΣΕ ΝΑ
     ΥΠΕΡΑΠΑΓΓΕΛΛΕΙ: έλεγε «0 network API … no external reference survived» χωρίς
     να έχει κοιτάξει ποτέ Worker/serviceWorker/window.open.  Τώρα απαριθμεί τα
     μοτίβα ΚΑΙ ομολογεί το όριό της — ένα URL που συναρμολογείται σε runtime
     («htt» + «ps://…») δεν ανιχνεύεται στατικά από κανέναν.  Μια πύλη που
     υπόσχεται περισσότερα απ' όσα ελέγχει κάνει τον επόμενο να μην ξανακοιτάξει.

ΤΙ ΑΛΛΑΞΕ ΣΤΙΣ 18/10/2026 (Γύρος Ζ — ΤΟ ΠΑΡΑΔΟΤΕΟ ΤΗΣ ΜΟΝΑΔΑΣ ΔΕΝ ΔΕΙΧΝΕΙ ΠΟΥΘΕΝΑ)
  Τρεις αποφάνσεις του ιδιοκτήτη, μία μέρα, και οι τρεις ζουν ΕΔΩ και μόνο εδώ.

  1. ΤΟ CREDIT ΤΗΣ AI ΦΕΥΓΕΙ — ΜΟΝΟ ΑΠΟ ΤΟ ΠΑΡΑΓΟΜΕΝΟ.  Το `app/index.html`
     κουβαλά «Developed by Koro · with Claude riding the right seat».  Στο
     δημόσιο repo και στη ζωντανή εφαρμογή ΜΕΝΕΙ — ρητή απόφανση.  Στο
     unit-facing αρχείο δεν έχει θέση, γιατί εκεί το παραδοτέο δεν είναι
     προσωπικό έργο αλλά υπηρεσιακό εργαλείο.  Άρα η αφαίρεση γίνεται ΕΔΩ, με
     `sub1` πάνω στο αντίγραφο της συναρμολόγησης, και ΠΟΤΕ με edit του
     `app/index.html`.  Φεύγει μόνο η `<span class="credit-line">`, ΟΧΙ ο
     `<footer class="credit">`: ο footer είναι το σημείο ανάρτησης της μπάρας
     feedback (`document.querySelector("footer.credit")` στο FEEDBACK_JS) —
     κόβοντάς τον ολόκληρο, η μπάρα θα έπεφτε στο `<body>` και θα έχανε το
     πλαίσιό της.  Tripwire: `strip_attribution`.

  2. ΚΑΘΕ ΕΞΩΤΕΡΙΚΟΣ ΣΥΝΔΕΣΜΟΣ ΑΔΡΑΝΟΠΟΙΕΙΤΑΙ — ΟΧΙ ΜΟΝΟ ΟΙ ΤΡΕΙΣ ΓΝΩΣΤΟΙ.
     Μέχρι σήμερα τα τρία κουμπιά Feedback (app.js · description.js ·
     remarksearch.js) έγραφαν `https://github.com/<repo>/issues/new?…` στο
     `href` και το FEEDBACK_JS τα έπιανε στο click.  Αυτό έπιανε ΤΟ ΚΛΙΚ, όχι
     ΤΟΝ ΣΥΝΔΕΣΜΟ: μεσαίο κλικ (σε νεότερο Firefox είναι `auxclick`, δεν
     περνά καθόλου από τον handler), «Άνοιγμα σε νέα καρτέλα» από το
     context menu, ή `target="_blank"` με το κλικ να χάνεται — και ο browser
     ξεκινά αίτημα προς github.com που στο κλειστό δίκτυο δεν αποτυγχάνει
     αμέσως, ΠΕΡΙΜΕΝΕΙ μέχρι το timeout.  Τώρα ο σύνδεσμος ΔΕΝ είναι καν
     σύνδεσμος: γίνεται fragment (`#fdms-feedback/issues/new?…`), που δεν
     φεύγει ποτέ από το έγγραφο ό,τι κι αν κάνει ο χρήστης, και το
     `target="_blank"` φεύγει μαζί (ένα νέο tab θα ξαναφόρτωνε 13 MB για να
     δείξει το ίδιο αρχείο).  Το query μένει ΑΚΡΙΒΩΣ όπως ήταν, γιατί το
     FEEDBACK_JS διαβάζει από εκεί title/body — βλ. `neutralise_externals`.

  3. Ο ΚΑΝΟΝΑΣ ΕΙΝΑΙ «ΚΑΝΕΝΑ ΕΞΩΤΕΡΙΚΟ, ΕΚΤΟΣ ΑΠΟ ΑΥΤΑ» — όχι «όχι αυτά τα
     τρία».  Νέο tripwire `gate_scan_external`, μέσα στο run_gate: σαρώνει
     ΟΛΟΚΛΗΡΟ το συναρμολογημένο HTML για κάθε απόλυτο URL με σχήμα δικτύου,
     για protocol-relative `//host`, για `@import`, για `url(` με σχήμα, και
     για τα API που δεν μπορούν να σημαίνουν τίποτε άλλο παρά δίκτυο
     (XMLHttpRequest, WebSocket, EventSource, sendBeacon, importScripts,
     `<iframe>`, `<form action>`, `<link href>`).  Λευκή λίστα: ΜΟΝΟ το
     `http://www.w3.org/2000/svg` — είναι XML namespace, ένα αναγνωριστικό
     που ο browser δεν ζητά ποτέ από το δίκτυο.  Ό,τι άλλο εμφανιστεί
     αύριο σκάει το build· αυτό είναι η δουλειά του.
     Επιβεβαιώθηκε στο ίδιο πέρασμα ότι το `api.github.com` (schedsync.js)
     και το `http://127.0.0.1:8771` (advisor.js) ΔΕΝ επιβιώνουν — και τα δύο
     αρχεία είναι εκτός SCRIPT_CHAIN — και ότι ο `schedbridge.js` δεν έχει
     καρφωμένο endpoint: διαβάζει το `W.fetch` την ώρα της κλήσης, οπότε
     πέφτει πάνω στο offline shim όπως κάθε άλλο fetch της εφαρμογής.
     Ο tripwire απαιτεί τώρα ΡΗΤΑ να υπάρχει αυτό το shim: ένα export που
     θα το έχανε θα άφηνε 25 `fetch("../data/…")` να χτυπήσουν τον δίσκο.

  Και ένα εργαλείο: `--inspect-to`.  Το `--dry-run` τύπωνε μόνο sha256, οπότε
  ΚΑΝΕΝΑΣ δεν μπορούσε να αποδείξει ισχυρισμό πάνω στο παραγόμενο HTML χωρίς
  να γράψει στον φάκελο του ιδιοκτήτη (D:\FDMS-export, ΑΝΕΓΓΙΧΤΟΣ).  Το
  `--inspect-to` γράφει το HTML οπουδήποτε ΑΛΛΟΥ και αρνείται κατηγορηματικά
  κάθε διαδρομή μέσα στον EXPORT — βλ. THE COMMAND LINE.

WHAT CHANGED ON 28/08/2026 (Round 24b — THE COMPENSATION TRAVELS WITH THE SHAPE)
  The verify of Round 24 left exactly one thing measurably wrong, and it was an
  INSTANCE-level miss of a model that was otherwise right.

  Round 24 taught the flex-gap fallback's CHILD rules to follow a shape flip
  into its @media; the CONTAINER rules stayed where they were written.  So
  `.fc-bar` — wrapping, painting nothing — got `margin-bottom:-14px` at the top
  level to give back the height its children's margins added, and when the
  stylesheet flips it to a column at 740px the children's `margin-bottom` was
  duly zeroed while the container's -14px went on applying, compensating
  nothing.  Measured at 560px with the fallback forced: the 12px `.fc-view`'s
  own gap puts between `.fc-bar` and `.fc-l0` came out as a 2px OVERLAP.

  Fixed AS THE MODEL, not as a special case.  The compensation is now asked of
  every shape, read off the child rule rather than off the flags (only the
  wrapping tail `> *` puts a margin on the LAST child, so only it can grow the
  box), and every at-context in which a container rule is emitted restates the
  FULL set of properties this generator has ever set on that container — with
  what the new shape needs, or with the box's own uncompensated value where the
  new shape needs nothing.  One rule was added to the whole export
  (`@media (max-width: 740px){html.no-flexgap .fc-bar{margin-bottom:0}}`), the
  spacing is 12px again, and a sweep of all 62 container compensations against
  every shape-flip rule now finds nothing left to find.  See flexgap_sheet.

  Also: the `inset` collapse is no longer written up as a fixed measurement.
  The old note quoted "120×20" in the spec and "63×20" here for the same
  defect, because the collapsed box is content-sized — the collapse is the
  fact, its dimensions are not.

WHAT CHANGED ON 28/08/2026 (Round 24 — THE VERIFY: WHAT THE PATCH NEVER SWEPT)
  Round 23 shipped, and the verify found two things wrong with it plus one
  footgun in the command line.  All three have the same shape: a rule that was
  enforced in ONE place and not in the other.

  1. `inset: 0` SURVIVED IN CSS-IN-JS.  mifchart.js's `.mc-modal` and
     schedval.js's `.sv-modal` declare `position:fixed;inset:0` inside a
     template literal.  patch_css only ever reads the <style> block, and the
     CSS-in-JS tripwire was watching for `grid`, not for the forbidden list.
     Measured on the shipped file: the overlay covers the whole viewport
     (1440×900) where `inset` is understood; where it is not, it collapses to a
     content-sized box in the top-left corner — the size is whatever the modal
     happens to hold, not a fixed one (the verify measured 760×305 and
     1240×115 for the two).  So on Fx32-65 the Schedule-Validation and
     minimums backdrops stopped being backdrops at all.  Fixed at the source of
     truth and generalised:
       · the per-declaration floor patch is now the FUNCTION `patch_decls`,
         called by patch_css for the stylesheet AND by prepare_cssjs for every
         rule a module writes from a string.  app/ is untouched — the hosted
         app keeps the shorthand and renders identically;
       · the CSS-in-JS sweep (`gate_scan_cssjs`) runs THE SAME `gate_scan_css`
         the stylesheet gets — `_CSS_FORBIDDEN` entire, plus the min/max/clamp
         fallback rule — over every rule block inside a string literal, and
         adds the grid and flex-gap COVERAGE checks a generated fallback needs.
         The class of hole dies, not the instance.

  2. THE FLEX-GAP SHEET SAID TOO MUCH AND GREW THE BOX.  Three selectors were
     emitted twice; the longer copy zeroed all four margins, including two the
     gap had never touched; and a wrapping container took its row gap from a
     margin on EVERY child, last line included, so the box came out `gap` px
     tall (.topbar: 106px by the real geometry, 114px by the fallback).  The
     generator now emits one rule per selector per context, cancels only what
     it set itself, and gives a wrapping container the difference back — out of
     its own padding where there is padding (exact, and what .topbar gets), out
     of a negative margin where the box paints nothing on that edge.  Measured
     with the fallback forced: 1440px is exact, 560px is +6px, all of it the
     one nested case written up in flexgap_sheet.
     While proving it, a THIRD bug fell out: `.viewtabs` declares its gap in
     one rule and `flex-wrap: wrap` in a @media 1900 lines away, and the
     generator only ever read the first — so below 900px the tab bar's second
     line sat flush against its first.  See collect_flex_rules.

  3. argparse.  `--help` was not a flag, so typing it printed nothing and
     REBUILT the deliverable.  See THE COMMAND LINE.

WHAT CHANGED ON 28/08/2026 (Round 23 — THE REAL FLOOR: FIREFOX 32, PURE ES5)
  User ruling, after being told to look in D:\FDMS-export at what the unit
  actually sent back: «Λογικά με το 32 θα είμαστε μια χαρά».  Round 22's
  Firefox 52 was a guess; 32 is the number the user gave.

  It is not twenty more releases of the same work.  Firefox 52 still has
  arrow functions, classes, template literals, let/const — es2017 was a
  DIALECT the file could be written in.  Firefox 32 has almost none of that
  (let/const 51, classes 45, template literals 34, destructuring 53), and no
  Symbol at all (36).  Below that line there is no dialect left to aim at
  except the one every engine since 2011 parses, so the export is now compiled
  to **pure ES5**, and the claim is MECHANICAL: every inline script in the
  output is parsed by acorn at `ecmaVersion: 5` and the build refuses to write
  a file if one of them is not.  That is what makes "it will at least parse on
  the unit's browser" a proof rather than a hope — for 32, for the
  photographed 72, and for everything in between.

  THREE CONSEQUENCES, each with its own section below:
    1. esbuild is OUT of the build.  It bottoms out at ES2015 and answers
       --target=es5 with "Transforming const to the configured target
       environment is not supported yet".  @babel/preset-env replaces it, and
       acorn — a different library — supplies the proof.  Both live OUTSIDE
       this repository; see § 0.
    2. The API floor drops with the syntax floor: Object.assign (34),
       .includes (43/40), Object.entries/values (47), padStart/End (48),
       Element.closest (35) and matches (34), NodeList.forEach (50) and
       <details> (49) all need shims, and the ITERATOR PROTOCOL needs one too,
       because Babel's helpers reach for Symbol.iterator and Firefox 32 has no
       Symbol — see THE FIREFOX 32 BATCH in RUNTIME_SHIMS_JS.
    3. CSS GRID IS GONE (52).  Eleven containers in app/styles.css are grids.
       They stay exactly as they are — nothing a modern browser sees changed —
       and a hand-written flexbox sheet behind `html.no-grid` restores them,
       switched on only by the capability guard's live test.  See NO_GRID_CSS.

  The capability guard's job changed with all this: with the whole file in
  ES5 there is no syntax left for it to probe, so it guards the RUNTIME floor
  instead.  Its comment says so.

WHAT CHANGED ON 28/08/2026 (Round 22 — THE WHOLE APP, ONE FILE)
  User order: «Ετοίμασε το export του Phase II FDMS όπως είναι τώρα. Προσοχή:
  πρέπει να είναι όλα ΕΝΑ λειτουργικό HTML και να τρέχει στο παλαιολιθικό
  Firefox του κλειστού δικτύου της μονάδας.»

  Two things follow from that sentence and both break the old builder:

  1. ΟΛΑ — ONE file, THE WHOLE APP.  Until today the export was a syllabus
     tool: Scheduler, Currency, Flowchart and Bridge were cut out because the
     roster travelled with them.  It does not travel any more — the export
     ships an EMPTY STORE (data/scheduler/seed.json is replaced by `{}` at
     build time) and the unit loads its own data on site through the app's own
     ⭱ Import, behind «⋯» + the edit lock + the typed word.  So every module
     ships, every tab is live, and nothing roster-derived is inside the file.
     The one module that still does NOT travel is app/schedsync.js: it talks to
     GitHub over the network, which on a closed network can only fail and would
     put a live https endpoint in the file.

  2. ΠΑΛΑΙΟΛΙΘΙΚΟ — the floor dropped from Firefox 72 to Firefox 52 ESR as a
     working assumption.  Round 23 (above) replaced that guess with the user's
     own ruling of 32; § FLOOR below carries both numbers and the evidence.

FLOOR — READ THIS BEFORE MOVING IT
  specs/offline-export-spec.md § 1 records the unit's browser as **Firefox
  72.0.2 (64-bit) on Windows 10**, on the evidence of three photographs the
  user took at the unit on 12/08/2026 (they are still in D:\FDMS-export as
  viber_image_2026-08-12_*.jpg; the middle one shows the About box reading
  "72.0.2 (64-bit)" with this app's own footer below it).  That is a hard,
  first-hand fact and it has not been retracted.  The two OTHER photographs
  show what that browser did with AN EXPORT: three SyntaxErrors at
  Phase2-FDMS.html:1492, 2092 and 2404 — optional chaining `?.`, which Firefox
  did not parse until 74 — so every script died before running and the unit
  got a blank page with only the static footer on it.

  WHICH export, corrected on 28/08 by the Round 24 verify: NOT the 26/08 file
  that is still in D:\FDMS-export, which this docstring used to name.  The
  taskbar clock inside the photograph reads 9:36, 10/8/2026; the app footer in
  the About-box photograph reads "July 2026"; and the 26/08 file contains zero
  `?.` and zero `??`, parses clean under acorn at ecmaVersion 2019, and its
  lines 1492 / 2092 / 2404 are CSS, not code.  The crash therefore belongs to
  an earlier build (~10/08) carrying the same stable filename, and that build
  no longer exists to be examined.  Nothing else moves: the browser is still
  Firefox 72.0.2 on first-hand evidence, `?.` is still Fx74, and the floor of
  32 is still the user's own ruling.  Only the attribution was overstated.

  Round 22 guessed **52 ESR** from the word "παλαιολιθικό".  On 28/08 the user
  looked in the folder and ruled: «Λογικά με το 32 θα είμαστε μια χαρά».
  **32 is a ruling, not a guess, and it is what this builder targets.**  It is
  forty releases below the photographed browser, and the cost is real (no CSS
  Grid, no Symbol, no Object.assign, no `.includes`) — but every one of those
  costs is paid by a shim or a fallback sheet that a newer browser never
  activates, so the file still runs on 72 exactly as it does on 132.

  WHAT 32 DOES NOT COVER, honestly: WebCrypto is Firefox **34**.  On a true 32
  or 33 the editor code cannot be set, so the Scheduler stays view-only and
  Import is out of reach.  Nothing else on the page is affected, and the
  capability guard now says so ON SCREEN in a dismissible strip rather than
  leaving someone hunting for a button that will not work.  On the browser in
  the photograph this is moot.

LANGUAGE CONTRACT (spec § 2, floor-adjusted) — the app source stays modern;
the divergence lives only here:
  * every inline script is compiled to **pure ES5** by @babel/preset-env with
    `forceAllTransforms` (tools/es5_transpile.js holds the full contract and
    the reasoning for every option, including the `loose: true` trap that
    turned `[...map.values()]` into `[].concat(iterator)`).
    ES5, rather than a Firefox-32 feature table, because at this depth the
    table buys almost nothing — 32 has arrow functions and nothing else — and
    ES5 buys a MECHANICAL PROOF: acorn at `ecmaVersion: 5` either parses the
    emitted script or it does not.
  * FIVE builder-owned blocks are prepended before any app script —
      ① the CAPABILITY GUARD (hand-written ES5, first script in <head>).  With
        the whole file in ES5 it no longer probes SYNTAX — anything that can
        parse the guard can parse all of it — so it probes the RUNTIME floor
        and paints a plain-English banner naming what is missing.  It also runs
        the three live layout tests that set html.no-grid / html.no-flexgap /
        html.no-details;
      ② the RUNTIME SHIMS (everything Fx32 lacks that the app or the export's
        own code touches — each installed only if missing).  The load-bearing
        one is the ITERATOR BRIDGE: Babel's helpers look for Symbol.iterator,
        then for the STRING key "@@iterator"; Firefox 32 has no Symbol, so the
        shim installs that string key on Map, Set and the Map/Set/Array
        iterator prototypes, and the app's ~250 for-of/spread sites work;
      ③ the OFFLINE FETCH SHIM (serves ../data/... from the embedded bundle);
      ④ the DATE-INPUT FALLBACK (no date picker before Fx57 — <input type=date>
        degrades to a text box, so the export teaches it to accept a typed
        DD/MM/YYYY or YYYY-MM-DD and hands the app ISO either way);
      ⑤ the offline FEEDBACK module.
  * CSS is patched for Fx32: :focus-visible→:focus, :has() rules dropped,
    min()/max()/clamp() and inset: and break-inside: and overflow-wrap: get a
    same-property or legacy-property fallback emitted BEFORE the modern value,
    every gap: gets its grid-gap longhand, and TWO generated stylesheets —
    `html.no-flexgap` (flex gap, Fx63) and `html.no-grid` (CSS Grid, Fx52) —
    restore the layouts, each behind a class the capability guard sets only
    after a live test.  app/styles.css itself is NOT touched: the hosted app
    and this export render identically on any browser that has the features.
  * QUALITY GATE (hard fail, nothing is written):
      LAYER 1 — acorn, ecmaVersion 5, over every emitted script.  The proof.
      LAYER 2 — a string/comment/regex-stripping scanner for line numbers and
        for the API floor, plus the CSS floor scan and the two GRID TRIPWIRES
        (stylesheet and CSS-in-JS) that refuse to ship a grid container or a
        grid-placed child with no rule in the html.no-grid sheet.

GATE HONESTY NOTE: Babel *lowers* modern syntax rather than rejecting it, so
the transpiler can never be its own proof.  acorn is a different library
reading the finished text, and it is the layer that establishes "this parses on
an engine from 2011".  The regex scanner underneath it is a second opinion with
line numbers, and it is the layer that greps for `?.` and `??` by name, because
those two tokens are what the unit's browser was photographed dying on.  It strips
string literals, template literals, comments and regex literals before matching
(pragmatic first-token heuristic for / vs division), so "?." inside remark text
never false-positives.

Flags: run `python tools/build_offline.py --help`.  They are declared with
argparse (Round 24), which is why --help now PRINTS AND EXITS instead of
printing and then building, and why a mistyped flag is an error instead of a
silent full build over the deliverable.  --dry-run runs the whole build,
transpiler and gates included, and writes nothing.

Deterministic: same inputs + pinned toolchain + same stamp -> byte-identical
output.  Re-run any time:  python tools/build_offline.py
"""

import argparse
import base64
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # D:\FDMS
APP = ROOT / "app"
DATA = ROOT / "data"
TOOLS = ROOT / "tools"
EXPORT = ROOT.parent / "FDMS-export"                # D:\FDMS-export (OUTSIDE the repo)

FLOOR = "Firefox 32"
ES_TARGET = "es5"                                   # the OUTPUT dialect — see § 0
BABEL_VERSION = "7.28.4"                            # must match FDMS-build-deps/package.json
PRESET_ENV_VERSION = "7.28.3"
ACORN_VERSION = "8.14.0"
MAX_BYTES = 20 * 1024 * 1024                        # hard size guard

# WHERE THE TRANSPILER LIVES — deliberately NOT in this repository.
#   1. $FDMS_BUILD_DEPS            (override; point it at a node_modules parent)
#   2. D:\FDMS-build-deps          (the recorded default, OUTSIDE the repo tree)
#   3. tools/                      (gitignored fallback, for a checkout that
#                                   would rather keep everything in one place)
# @babel/core + @babel/preset-env + acorn is ~30 MB of node_modules. The public
# repo (Nickkoro21/phase2-remarks) must never gain a vendored blob that size, so
# the builder REQUIRES the path and fails loudly with the exact npm command when
# it is absent, instead of quietly shipping un-transpiled ES2020 to the unit.
BUILD_DEPS_ENV = "FDMS_BUILD_DEPS"
BUILD_DEPS_DEFAULT = ROOT.parent / "FDMS-build-deps"

# The gate finds the shim block by this string. It lives in the <script> LABEL
# (comments do not survive the transpiler), so it must not carry a version
# number that would rot the next time the floor moves.
SHIM_MARK = "FDMS runtime shims"

# ────────────────────────────────────────────────────────────────────
# THE COMMAND LINE (Round 24)
#
# Until now the flags were `"--x" in sys.argv` tests, and that had one real
# footgun: `--help` was not a flag at all, so typing it printed nothing, fell
# through to main() and REBUILT the deliverable.  A verifier did exactly that.
# Harmless here (the build is deterministic, so the file came back identical),
# but a builder whose only mode is "write the artefact" has no business being
# the default answer to a question.
#
# argparse fixes all three at once: --help prints and exits, an unknown flag is
# an error with a usage line, and --dry-run runs the entire build — Babel, acorn
# and every gate — and then writes nothing.
#
# Parsed AT IMPORT so that STAMP/OUT_HTML stay module-level constants, and so
# that --help exits before a single source file has been read.  When the module
# is IMPORTED (the probes, floor_audit) it is parsed with an empty argv instead,
# or every importer would inherit this parser.
# ────────────────────────────────────────────────────────────────────

def _stamp_arg(v: str) -> str:
    if not re.fullmatch(r"\d{8}", v):
        raise argparse.ArgumentTypeError("must be YYYYMMDD, e.g. 20260828")
    return v


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="build_offline.py",
        description="Deterministic single-file export of Phase 2 FDMS for the "
                    f"unit's CLOSED network ({FLOOR} floor, every inline script "
                    f"emitted as {ES_TARGET}).",
        epilog="With no flags at all it builds:  "
               f"{EXPORT}\\Phase2-FDMS-<today>.html + README-IT-<today>.txt\n"
               "The toolchain lives OUTSIDE the repo; the build fails loudly "
               "with the npm command when it is absent.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--stamp", metavar="YYYYMMDD", type=_stamp_arg,
                   help="override the date stamp in the output filenames "
                        "(default: today)")
    p.add_argument("--no-transpile", action="store_true",
                   help="skip Babel AND the ES5 proof (DEMO ONLY: shows the "
                        "regex layer tripping on un-transpiled input; the build "
                        "then fails by design)")
    p.add_argument("--gate-selftest", action="store_true",
                   help="run the scanner against known-good/known-bad snippets, "
                        "re-prove the Map-spread regression, then exit")
    p.add_argument("--dry-run", action="store_true",
                   help="run the whole build and every gate, then report what "
                        "WOULD be written (path, size, SHA-256) and write nothing")
    # 18/10/2026 — ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΑΥΤΗ Η ΣΗΜΑΙΑ.  Το --dry-run τύπωνε μέγεθος
    # και sha256 και τίποτε άλλο: κάθε ισχυρισμός για το ΠΕΡΙΕΧΟΜΕΝΟ του
    # παραδοτέου («δεν έχει github», «δεν έχει attribution») ήταν ανεπαλήθευτος
    # αν δεν έγραφε κανείς πραγματικό αρχείο — δηλαδή μέσα στον φάκελο του
    # ιδιοκτήτη, που είναι ΑΝΕΓΓΙΧΤΟΣ.  Η σημαία δίνει τον τρίτο δρόμο: το ίδιο
    # HTML, οπουδήποτε ΑΛΛΟΥ, για να σαρωθεί.  Ο έλεγχος διαδρομής στη main()
    # αρνείται κατηγορηματικά οτιδήποτε μέσα στον EXPORT, ώστε η σημαία να μην
    # μπορεί να γίνει πλάγιος δρόμος για το πραγματικό build.
    p.add_argument("--inspect-to", metavar="FILE",
                   help="ONLY with --dry-run: also write the generated HTML to "
                        "FILE for verification. Any path inside the owner's "
                        f"{EXPORT} is refused.")
    return p.parse_args(argv)


ARGS = parse_args() if __name__ == "__main__" else parse_args([])

NO_TRANSPILE = ARGS.no_transpile                    # gate-demo mode only
DRY_RUN = ARGS.dry_run
STAMP = ARGS.stamp or datetime.date.today().strftime("%Y%m%d")
OUT_HTML = EXPORT / f"Phase2-FDMS-{STAMP}.html"
OUT_README = EXPORT / f"README-IT-{STAMP}.txt"


def fail(msg: str) -> None:
    sys.exit(f"BUILD FAILED: {msg}")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def sub1(pattern: str, repl, s: str, what: str, count: int = 1, flags=0) -> str:
    """re.subn that hard-fails unless exactly `count` replacements happened."""
    out, n = re.subn(pattern, repl, s, flags=flags)
    if n != count:
        fail(f"expected {count} match(es) for {what}, got {n} — app/ layout changed?")
    return out


# ────────────────────────────────────────────────────────────────────
# 0. THE ES5 TOOLCHAIN — Babel to compile, acorn to prove it (pinned)
#
#    Round 22 used esbuild --target=es2017. Round 23 cannot: esbuild bottoms
#    out at ES2015 and answers --target=es5 with "Transforming const to the
#    configured target environment (\"es5\") is not supported yet". Babel is
#    the only real route to ES5, so esbuild is out of the build entirely and
#    tools/es5_transpile.js (a thin node driver) owns both halves:
#      · TRANSPILE — @babel/preset-env, forceAllTransforms, ES5 out;
#      · PARSE5    — acorn with ecmaVersion:5 over every EMITTED script.
#    The second half is the proof. It is not "the transpiler says so": it is a
#    different library, reading the finished text, refusing anything an engine
#    from 2011 could not parse.
# ────────────────────────────────────────────────────────────────────

DRIVER = TOOLS / "es5_transpile.js"


def build_deps_dir() -> Path:
    """Locate node_modules holding @babel/core, @babel/preset-env and acorn."""
    cands = []
    env = os.environ.get(BUILD_DEPS_ENV)
    if env:
        cands.append(Path(env))
    cands += [BUILD_DEPS_DEFAULT, TOOLS]
    for c in cands:
        nm = c if c.name == "node_modules" else c / "node_modules"
        if (nm / "@babel" / "core" / "package.json").is_file() and \
           (nm / "acorn" / "package.json").is_file():
            return nm
    fail(
        "the ES5 build toolchain was not found. It lives OUTSIDE this repository\n"
        "  on purpose (the public repo must not carry ~30 MB of node_modules).\n"
        "  Looked in: " + " · ".join(str(c) for c in cands) + "\n\n"
        "  To create it:\n"
        f"     mkdir {BUILD_DEPS_DEFAULT}\n"
        f"     cd {BUILD_DEPS_DEFAULT}\n"
        f"     npm install --save-dev @babel/core@{BABEL_VERSION} "
        f"@babel/preset-env@{PRESET_ENV_VERSION} acorn@{ACORN_VERSION}\n\n"
        f"  or set {BUILD_DEPS_ENV} to a directory that already has them.")


_DEPS = None


def deps() -> Path:
    """Resolve once, then version-check: a build that is not reproducible is
    not a build we can hand to a closed network and defend."""
    global _DEPS
    if _DEPS is None:
        if not DRIVER.is_file():
            fail(f"missing the node driver: {DRIVER}")
        _DEPS = build_deps_dir()
        got = _node(_DEPS, "versions", None)
        want = {"babel": BABEL_VERSION, "presetEnv": PRESET_ENV_VERSION,
                "acorn": ACORN_VERSION}
        drift = {k: (want[k], got.get(k)) for k in want if got.get(k) != want[k]}
        if drift:
            fail("build toolchain version drift — builds would not be "
                 "reproducible:\n  " + "\n  ".join(
                     f"{k}: expected {w}, found {g}" for k, (w, g) in drift.items()) +
                 f"\n  (in {_DEPS}; pin them or update the constants at the top "
                 f"of {Path(__file__).name})")
    return _DEPS


def _node(deps_dir: Path, mode: str, payload):
    """Run tools/es5_transpile.js once, over a whole batch. One node start-up
    for the entire build instead of one per script."""
    tmp = Path(tempfile.mkdtemp(prefix="fdms-es5-"))
    fin, fout = tmp / "in.json", tmp / "out.json"
    try:
        fin.write_text(json.dumps(payload if payload is not None else []),
                       encoding="utf-8")
        p = subprocess.run(["node", str(DRIVER), str(deps_dir), mode,
                            str(fin), str(fout)], capture_output=True)
        if p.returncode != 0:
            err = p.stderr.decode("utf-8", "replace").strip()
            fail(f"es5_transpile.js ({mode}) failed:\n{err}")
        return json.loads(fout.read_text(encoding="utf-8"))
    finally:
        for f in (fin, fout):
            try:
                f.unlink()
            except OSError:
                pass
        try:
            tmp.rmdir()
        except OSError:
            pass


def transpile_all(items: list) -> dict:
    """[(name, source)] → {name: ES5 source}."""
    if NO_TRANSPILE:
        return {n: s for n, s in items}
    out = _node(deps(), "transpile", [{"name": n, "code": s} for n, s in items])
    if isinstance(out, dict) and out.get("fatal"):
        fail(out["fatal"])
    return {r["name"]: r["code"] for r in out}


def parse_es5(items: list) -> list:
    """THE MECHANICAL PROOF. [(name, emitted source)] → list of violations,
    one per script acorn could not parse at ecmaVersion 5."""
    if NO_TRANSPILE:
        return []
    out = _node(deps(), "parse5", [{"name": n, "code": s} for n, s in items])
    if isinstance(out, dict) and out.get("fatal"):
        fail(out["fatal"])
    return [f"{r['name']}: NOT ES5 — {r['error']}"
            + (f"\n      → {r['context']}" if r.get("context") else "")
            for r in out if not r.get("ok")]


# ────────────────────────────────────────────────────────────────────
# 1. QUALITY GATE — JS scanner (strings/comments/regex stripped first)
# ────────────────────────────────────────────────────────────────────

_RE_KEYWORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete",
                "void", "case", "do", "else", "yield", "await", "throw"}


def strip_js(code: str) -> str:
    """Replace string/template/regex literals and comments with placeholders,
    preserving newlines (for line numbers).  Pragmatic regex-vs-division
    heuristic: a '/' starts a regex when the previous significant token cannot
    end an expression.  Good enough for this codebase; documented in spec §3."""
    out = []
    n = len(code)
    i = 0
    # context stack: ("code", from_template) | ("tpl",)
    stack = [["code", False, 0]]  # [type, spawned_by_template, brace_depth]
    mode = "code"
    sub = ""          # sub-mode inside code: "", line, block, sq, dq, re, recls
    last_sig = ""     # last significant char emitted in code mode
    last_word = ""    # last identifier/keyword emitted
    word = ""

    def emit(ch):
        out.append(ch)

    while i < n:
        c = code[i]
        nc = code[i + 1] if i + 1 < n else ""
        top = stack[-1]
        if mode == "code":
            if sub == "line":
                if c == "\n":
                    sub = ""
                    emit("\n")
                else:
                    emit(" ")
                i += 1
                continue
            if sub == "block":
                if c == "*" and nc == "/":
                    sub = ""
                    emit("  ")
                    i += 2
                else:
                    emit("\n" if c == "\n" else " ")
                    i += 1
                continue
            if sub in ("sq", "dq"):
                q = "'" if sub == "sq" else '"'
                if c == "\\":
                    emit("  ")
                    i += 2
                elif c == q:
                    sub = ""
                    emit("0")           # placeholder value → '/' after = division
                    last_sig = "0"
                    last_word = ""
                    i += 1
                else:
                    emit("\n" if c == "\n" else " ")
                    i += 1
                continue
            if sub in ("re", "recls"):
                if c == "\\":
                    emit("  ")
                    i += 2
                elif sub == "re" and c == "[":
                    sub = "recls"
                    emit(" ")
                    i += 1
                elif sub == "recls" and c == "]":
                    sub = "re"
                    emit(" ")
                    i += 1
                elif sub == "re" and c == "/":
                    sub = ""
                    emit("0")
                    last_sig = "0"
                    last_word = ""
                    i += 1
                    while i < n and code[i].isalpha():   # regex flags
                        emit(" ")
                        i += 1
                else:
                    emit("\n" if c == "\n" else " ")
                    i += 1
                continue
            # plain code
            if c == "/" and nc == "/":
                sub = "line"
                emit("  ")
                i += 2
                continue
            if c == "/" and nc == "*":
                sub = "block"
                emit("  ")
                i += 2
                continue
            if c == "'":
                sub = "sq"
                emit(" ")
                i += 1
                continue
            if c == '"':
                sub = "dq"
                emit(" ")
                i += 1
                continue
            if c == "`":
                stack.append(["tpl", False, 0])
                mode = "tpl"
                emit(" ")
                i += 1
                continue
            if c == "/":
                if (last_sig == "" or last_sig in "([{,;=:!&|?+-*%^~<>"
                        or last_word in _RE_KEYWORDS):
                    sub = "re"
                    emit(" ")
                    i += 1
                    continue
                emit(c)
                last_sig = c
                word = ""
                i += 1
                continue
            if c == "{":
                top[2] += 1
                emit(c)
                last_sig = c
                word = ""
                i += 1
                continue
            if c == "}":
                if top[2] > 0:
                    top[2] -= 1
                    emit(c)
                    last_sig = c
                elif top[1]:            # closes a ${ } template expression
                    stack.pop()
                    mode = "tpl"
                    emit(" ")
                else:
                    emit(c)
                    last_sig = c
                word = ""
                i += 1
                continue
            if c.isalnum() or c in "_$":
                word += c
                emit(c)
                last_sig = c
                i += 1
                continue
            if word:
                last_word = word
                word = ""
            if not c.isspace():
                last_sig = c
                last_word = ""
            emit(c)
            i += 1
            continue
        # template literal
        if mode == "tpl":
            if c == "\\":
                emit("  ")
                i += 2
                continue
            if c == "`":
                stack.pop()
                mode = "code" if stack[-1][0] == "code" else "tpl"
                emit("0")
                last_sig = "0"
                last_word = ""
                i += 1
                continue
            if c == "$" and nc == "{":
                stack.append(["code", True, 0])
                mode = "code"
                sub = ""
                emit("  ")
                last_sig = "("          # expression context
                last_word = ""
                i += 2
                continue
            emit("\n" if c == "\n" else " ")
            i += 1
            continue
    return "".join(out)


# Syntax above the ES5 output contract.
#
# ROUND 23: the AUTHORITY on syntax is now acorn at ecmaVersion 5 (parse_es5),
# which reads the finished script and refuses every one of these and more. The
# regex rules below are kept as a CHEAP SECOND OPINION that also produces a
# line number and the offending text, and because two of them — `?.` and `??` —
# are the exact tokens the unit's Firefox choked on in the photographed
# export (§ FLOOR: the ~10/08 build, not the 26/08 one still in the folder),
# and this project greps for them by name.
#
# They run over strip_js output (strings, template literals, comments and regex
# literals blanked), so a `?.` inside remark prose never false-positives.
_SYNTAX_RULES = [
    (r"\?\.(?![0-9])", "optional chaining `?.` (ES2020 / Fx74)"),
    (r"\?\?", "nullish coalescing `??`/`??=` (ES2020 / Fx72)"),
    (r"\|\|=(?!=)", "logical assignment `||=` (ES2021 / Fx79)"),
    (r"&&=(?!=)", "logical assignment `&&=` (ES2021 / Fx79)"),
    (r"#[A-Za-z_$]", "private class field `#x` (ES2022 / Fx90)"),
    (r"(?<![\w$])\d[\d_]*_\d", "numeric separator (ES2021 / Fx70)"),
    (r"(?<![\w$])\d+n\b", "BigInt literal (ES2020 / Fx68)"),
    (r"\bcatch\s*\{", "optional catch binding `catch {}` (ES2019 / Fx58)"),
    (r"\basync\s+function\s*\*", "async generator (ES2018 / Fx57)"),
    (r"\bfor\s+await\b", "for-await-of (ES2018 / Fx57)"),
    (r"\bnew\s+RegExp\s*\(\s*0\s*,\s*0*[a-z]*s", "RegExp `s` (dotAll) flag (ES2018 / Fx78)"),
    # ── new at the ES5 floor (Firefox 32) ──
    #    Each names the release that FIRST ran it, so the cost of the floor is
    #    legible from the failure message alone.
    (r"=>", "arrow function (ES2015 / Fx22 — but not ES5, so it must not survive)"),
    (r"(?<![\w$.])(?:let|const)\s+[A-Za-z_$]", "let/const (ES2015 / Fx51)"),
    (r"(?<![\w$.])class\s+[A-Za-z_$]", "class declaration (ES2015 / Fx45)"),
    (r"(?<![\w$.])class\s*(?:extends[\s(]|\{)", "class expression (ES2015 / Fx45)"),
    (r"(?<![\w$.])function\s*\*", "generator function (ES2015 / Fx26)"),
    (r"(?<![\w$.])async(?:\s+function|\s*\(|\s+[A-Za-z_$])", "async function (ES2017 / Fx52)"),
    (r"(?<![\w$.])for\s*\(\s*(?:var\s+|let\s+|const\s+)?[\w$.\[\]]+\s+of(?![\w$])",
     "for-of (ES2015 / Fx53 per Babel's table)"),
    (r"(?<![\w$.])yield(?![\w$])", "yield (ES2015 / Fx26)"),
    # NOTE: template literals leave no trace in strip_js output (every one is
    # blanked to `0`), so a backtick cannot be scanned for here — that is
    # exactly the kind of hole acorn closes, and why acorn is the authority.
]

# Object rest/spread `{...x}` is ES2018.  Array spread `[...a]` and call spread
# `f(...a)` are ES2015 — none of the three is ES5, so all of them are now
# violations; the bracket-aware scanner survives because it names WHICH one,
# which is the difference between "Babel missed a case" and "the source grew a
# construct nobody looked at".
def scan_object_spread(name: str, stripped: str) -> list:
    bad, brackets = [], []
    i, n = 0, len(stripped)
    while i < n:
        c = stripped[i]
        if c in "([{":
            brackets.append(c)
        elif c in ")]}":
            if brackets:
                brackets.pop()
        elif c == "." and stripped[i:i + 3] == "...":
            kind = {"{": "object rest/spread `{...}` (ES2018 / Fx55)",
                    "[": "array spread `[...a]` (ES2015 / Fx16)",
                    "(": "call spread / rest params `f(...a)` (ES2015 / Fx27)"}.get(
                        brackets[-1] if brackets else "", "spread/rest `...` (ES2015)")
            ln = stripped.count("\n", 0, i) + 1
            ctx = stripped.splitlines()[ln - 1].strip()[:90]
            bad.append(f"{name}:{ln}: {kind} — not ES5  →  {ctx}")
            i += 3
            continue
        i += 1
    return bad


# APIs missing in Fx32.  kind:
#   shimmed     — allowed, the prepended shim block provides it
#   guarded     — allowed only when the same script also contains the guard text
#   forbidden   — hard fail
_API_RULES = [
    # ── the Firefox 32 batch (Round 23) ──────────────────────────────────
    (r"Object\.assign\b", "Object.assign (Fx34)", "shimmed", None),
    (r"Object\.entries\b", "Object.entries (Fx47)", "shimmed", None),
    (r"Object\.values\b", "Object.values (Fx47)", "shimmed", None),
    (r"Object\.getOwnPropertyDescriptors\b",
     "Object.getOwnPropertyDescriptors (Fx50)", "shimmed", None),
    (r"\.includes\s*\(", "Array/String .includes (Fx43 / Fx40)", "shimmed", None),
    (r"\.padStart\s*\(", "String.padStart (Fx48)", "shimmed", None),
    (r"\.padEnd\s*\(", "String.padEnd (Fx48)", "shimmed", None),
    (r"\.closest\s*\(", "Element.closest (Fx35)", "shimmed", None),
    (r"(?<!\w)\.matches\s*\(", "Element.matches (Fx34 unprefixed)", "shimmed", None),
    # fetch is Fx39 — but the export never makes a network request at all, and
    # the offline fetch shim REPLACES window.fetch unconditionally with a
    # bundle reader, so the browser's own fetch is never reached. That is the
    # only reason a Fx39 API is allowed at a Fx32 floor.
    (r"(?<![\w.$])fetch\s*\(", "fetch (Fx39) — served by the offline shim, never "
     "by the browser", "shimmed", None),
    # nothing in app/ uses URLSearchParams, and there is no reason for a
    # file:// page with no URLs to grow one — kept forbidden rather than shimmed
    (r"\bURLSearchParams\b", "URLSearchParams (Fx44)", "forbidden", None),
    # THE ITERATOR PROTOCOL. Firefox got Symbol in 36, so on the floor there is
    # no Symbol at all. Every mention of it in the emitted file comes from
    # Babel's own helpers and is written `"undefined" != typeof Symbol &&
    # r[Symbol.iterator] || r["@@iterator"]` — the STRING key is the rung that
    # carries the weight here, and the shim block installs it on Map, Set and
    # the Map/Set/Array iterator prototypes. So: allowed ONLY behind a live
    # `typeof Symbol` test. An unguarded Symbol from app source is a hard fail.
    (r"(?<![\w.$])Symbol\s*[.(\[]", "Symbol (Fx36)", "guarded", "typeof Symbol"),
    # …with ONE exception that no `typeof Symbol` in the same script can excuse.
    # Babel's _toPrimitive reads `t[Symbol.toPrimitive]` UNGUARDED, and it is
    # emitted for every computed object key `{[k]: v}`. On Fx32 that line is a
    # ReferenceError the moment the key is an object. prepare_schedstore()
    # rewrites the app's single computed key the long way so the helper is never
    # emitted; if another one appears, this stops the build and says what to do.
    (r"Symbol\.toPrimitive", "Symbol.toPrimitive inside Babel's _toPrimitive — "
     "something in the sources grew a computed object key `{[k]: v}`; write it "
     "the long way (see prepare_schedstore) or the floor has an unguarded Symbol",
     "forbidden", None),
    # WebCrypto is Fx34: below it the editor code cannot be set and the
    # scheduler stays view-only. Every call site already tests for it, and the
    # capability guard names it on screen (see the warning strip there).
    (r"crypto\.subtle\b", "crypto.subtle (Fx34)", "guarded", "crypto.subtle)"),
    # document.execCommand("copy") is Fx41 — ABOVE the floor and unshimmable
    # (there is no other way to reach the clipboard from a page that old). The
    # one call site is inside a try/catch, so on Fx32-40 "copy" simply does
    # nothing visible and the rest of the page is unaffected. Recorded, not
    # fatal: see kind "degrades".
    (r"execCommand\s*\(", "document.execCommand('copy') (Fx41) — copy silently "
     "does nothing below 41; every other control is unaffected", "degrades", None),
    # provided by the shim block
    (r"\bstructuredClone\s*\(", "structuredClone (Fx94)", "shimmed", None),
    (r"crypto\.randomUUID", "crypto.randomUUID (Fx95)", "shimmed", None),
    (r"\.replaceAll\s*\(", "String.replaceAll (Fx77)", "shimmed", None),
    (r"\.at\s*\(", ".at() (Fx90)", "shimmed", None),
    (r"Object\.hasOwn\b", "Object.hasOwn (Fx92)", "shimmed", None),
    (r"\bglobalThis\b", "globalThis (Fx65)", "shimmed", None),
    (r"Object\.fromEntries\b", "Object.fromEntries (Fx63)", "shimmed", None),
    (r"\.flatMap\s*\(", "Array.flatMap (Fx62)", "shimmed", None),
    (r"(?<!\.)\.flat\s*\(", "Array.flat (Fx62)", "shimmed", None),
    (r"\.trimStart\s*\(", "String.trimStart (Fx61)", "shimmed", None),
    (r"\.trimEnd\s*\(", "String.trimEnd (Fx61)", "shimmed", None),
    (r"\.matchAll\s*\(", "String.matchAll (Fx67)", "shimmed", None),
    (r"Promise\.allSettled\s*\(", "Promise.allSettled (Fx71)", "shimmed", None),
    (r"\.finally\s*\(", "Promise.finally (Fx58)", "shimmed", None),
    (r"\.replaceChildren\s*\(", "Element.replaceChildren (Fx86)", "shimmed", None),
    (r"\.toggleAttribute\s*\(", "Element.toggleAttribute (Fx63)", "shimmed", None),
    (r"\bqueueMicrotask\s*\(", "queueMicrotask (Fx69)", "shimmed", None),
    (r"\bfindLast(?:Index)?\s*\(", "findLast/findLastIndex (Fx104)", "shimmed", None),
    (r"navigator\.clipboard", "navigator.clipboard (Fx63)", "shimmed", None),
    # no shim is possible / sensible — these must not appear at all
    (r"\bIntersectionObserver\b", "IntersectionObserver (Fx55)", "forbidden", None),
    (r"\bResizeObserver\b", "ResizeObserver (Fx69)", "forbidden", None),
    (r"\bAbortController\b", "AbortController (Fx57)", "forbidden", None),
    (r"AbortSignal\s*\.", "AbortSignal statics (Fx88+)", "forbidden", None),
    (r"Intl\.(?:RelativeTimeFormat|ListFormat|Segmenter|DisplayNames)",
     "newer Intl API (Fx>52)", "forbidden", None),
    (r"Promise\.any\s*\(", "Promise.any (Fx79)", "forbidden", None),
    (r"showOpenFilePicker|showDirectoryPicker", "File System Access picker", "forbidden", None),
    (r"showSaveFilePicker", "showSaveFilePicker (no Firefox support)",
     "guarded", "typeof window.showSaveFilePicker"),
    # Blob/File .text() is Fx69. Two shapes are accepted:
    #   · `if (x.text) return x.text();` — the FileReader fallback the store,
    #     the scheduler and the Bridge all use;
    #   · code that can only run inside the File System Access tier, which
    #     Firefox does not have at all (the feedback module's shared-file path).
    (r"(?<![\w.$])\b(?:file|blob|f|b)\.text\s*\(\s*\)", "Blob/File.text() (Fx69)",
     "guarded", [".text)", "typeof window.showSaveFilePicker"]),
]

# Regex syntax that esbuild turns into a `new RegExp("…")` STRING — the source
# text survives, so this pair is matched on the raw (un-stripped) body.
_RAW_RULES = [
    (r"new RegExp\(\"[^\"]*\(\?<[=!]", "RegExp lookbehind (ES2018 / Fx78)"),
    (r"new RegExp\(\"[^\"]*\(\?<[A-Za-z_$]", "RegExp named capture group (ES2018 / Fx78)"),
]


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def gate_scan_script(name: str, body: str, shim_present: bool,
                     check_apis: bool = True) -> tuple:
    """Return (violations, notes) for one emitted script body."""
    stripped = strip_js(body)
    bad, notes = [], []
    for pat, label in _SYNTAX_RULES:
        for m in re.finditer(pat, stripped):
            ln = _line_of(stripped, m.start())
            ctx = stripped.splitlines()[ln - 1].strip()[:90]
            bad.append(f"{name}:{ln}: {label}  →  {ctx}")
    bad += scan_object_spread(name, stripped)
    for pat, label in _RAW_RULES:
        for m in re.finditer(pat, body):
            bad.append(f"{name}:{_line_of(body, m.start())}: {label}")
    if not check_apis:
        return bad, notes
    for pat, label, kind, guard in _API_RULES:
        hits = list(re.finditer(pat, stripped))
        if not hits:
            continue
        if kind == "shimmed":
            if not shim_present:
                bad.append(f"{name}: uses {label} but the shim block is absent from this page")
            continue
        if kind == "degrades":
            # above the floor, unshimmable, and harmless where it fails —
            # reported every build so the cost stays visible, never fatal
            notes.append(f"{name}: {len(hits)}× {label}")
            continue
        if kind == "guarded":
            guards = guard if isinstance(guard, (list, tuple)) else [guard]
            if any(g and g in body for g in guards):
                continue
            bad.append(f"{name}:{_line_of(stripped, hits[0].start())}: {label} without its guard")
            continue
        bad.append(f"{name}:{_line_of(stripped, hits[0].start())}: {label} — no shim, {FLOOR} breaks")
    # NOTE: everything CSS-shaped inside a JS string — min()/max()/clamp()
    # included — moved to gate_scan_cssjs in Round 24, so that the CSS-in-JS
    # sweep and the stylesheet sweep read ONE list instead of two.
    return bad, notes


_CSS_FORBIDDEN = [
    (r":is\(", ":is() (Fx78)"),
    (r":where\(", ":where() (Fx82)"),
    (r":has\(", ":has() (Fx121)"),
    (r":focus-within", ":focus-within (Fx52 — invalidates the whole rule)"),
    (r"aspect-ratio", "aspect-ratio (Fx81)"),
    (r":focus-visible", ":focus-visible (Fx85 — invalidates the whole rule)"),
    (r"content-visibility", "content-visibility"),
    (r"@layer", "@layer"),
    (r"@container", "@container"),
    (r"conic-gradient\(", "conic-gradient (Fx83)"),
    (r"backdrop-filter", "backdrop-filter (Fx103)"),
    (r"overflow:\s*clip", "overflow:clip (Fx81)"),
    (r"(?<![\w-])inset\s*:", "inset shorthand (Fx66)"),
    (r"(?<![\w-])subgrid", "subgrid (Fx71)"),
    (r"text-wrap\s*:", "text-wrap (Fx121)"),
    (r"scrollbar-(?:width|color)\s*:", "scrollbar-width/color (Fx64)"),
    (r"(?<![\w-])contain\s*:", "contain (Fx69)"),
    (r"overscroll-behavior", "overscroll-behavior (Fx59)"),
    (r"text-decoration-thickness", "text-decoration-thickness (Fx70)"),
    (r"::marker", "::marker (Fx68)"),
    (r"(?<![\w-])env\(", "env() (Fx65)"),
]
_CSS_INFO = [  # degrade silently on the floor — reported, not fatal
    (r"accent-color", "accent-color (Fx92) — checkboxes fall back to the native look"),
    (r"color-scheme", "color-scheme (Fx96) — print block only, harmless"),
    (r"prefers-reduced-motion", "prefers-reduced-motion (Fx63) — the @media block is "
                                "ignored, so animations simply keep running"),
    (r"-webkit-line-clamp", "-webkit-line-clamp (Fx68) — the text is not clamped, it wraps"),
    (r"(?<![\w-])gap\s*:", "gap: — every one carries its grid-gap longhand, and the "
                           "generated html.no-flexgap sheet restores the flex ones"),
    # ── the Firefox 32 batch (Round 23) ──
    (r"display\s*:\s*(?:inline-)?grid", "display:grid (Fx52) — every one of these "
                                        "containers has a flexbox rule in the generated "
                                        "html.no-grid sheet; the gate asserts it below"),
    (r"font-variant-numeric", "font-variant-numeric (Fx34) — the tabular figures fall "
                              "back to proportional; columns of numbers still align "
                              "because the font is Consolas"),
    (r"(?<![\w-])filter\s*:", "filter: (Fx35) — one decorative saturate() on the credit "
                              "line, ignored below 35"),
    (r"mix-blend-mode", "mix-blend-mode (Fx32) — lands exactly on the floor"),
    (r"(?<![\w-])position\s*:\s*sticky", "position:sticky (Fx32) — lands exactly on the "
                                         "floor; below it the element simply scrolls away"),
]


def gate_scan_css(name: str, css: str) -> tuple:
    """(violations, notes). min()/max()/clamp() values are allowed ONLY when an
    earlier declaration for the same property exists in the same rule block
    (the dual-emission fallback pattern patch_css produces)."""
    bad, notes = [], []
    for pat, label in _CSS_FORBIDDEN:
        for m in re.finditer(pat, css):
            bad.append(f"{name}:{_line_of(css, m.start())}: {label}")
    for pat, label in _CSS_INFO:
        c = len(re.findall(pat, css))
        if c:
            notes.append(f"{name}: {c}× {label}")
    for m in re.finditer(r"(?<![\w.$-])(?:min|max|clamp)\(", css):
        decl_start = max(css.rfind(";", 0, m.start()), css.rfind("{", 0, m.start())) + 1
        pm = re.match(r"\s*([a-zA-Z-]+)\s*:", css[decl_start:m.start()])
        prop = pm.group(1) if pm else "?"
        block_start = css.rfind("{", 0, decl_start)
        fallback = re.search(r"(?:[;{]|^)\s*" + re.escape(prop) + r"\s*:",
                             css[block_start:decl_start - 1])
        if not fallback:
            bad.append(f"{name}:{_line_of(css, m.start())}: `{prop}: …{css[m.start():m.start()+18]}…` "
                       f"has no same-property fallback before it (Fx75 drops it)")
    return bad, notes


def gate_scan_grid(name: str, css: str) -> list:
    """THE GRID TRIPWIRE.

    CSS Grid is Firefox 52 — twenty releases above this floor. On Fx32 an
    unknown `display: grid` is simply dropped and the container falls back to
    `display: block`, which for this app means four side-by-side panels
    stacking into one very tall column and the flowchart's rail losing its side
    sheet. Nothing errors; it just looks wrong.

    The answer is the same shape as the flex-gap answer: the grid declarations
    STAY (they are what a modern browser reads, and Round 23 changed nothing a
    modern browser sees), and the builder appends a hand-written flexbox sheet
    behind `html.no-grid`, a class the capability guard sets only after a live
    test. On Fx52+ — and on the photographed Fx72 — not one of those rules can
    match.

    Hand-written, so it needs a tripwire: every selector that declares
    `display: grid` must appear in that sheet. A new grid layout added to
    app/styles.css therefore stops the build until someone has looked at it
    once, instead of quietly shipping a broken column to the unit."""
    covered = re.search(r"/\* NO-GRID SHEET BEGIN \*/(.*?)/\* NO-GRID SHEET END \*/",
                        css, re.S)
    if not covered:
        return [f"{name}: the generated html.no-grid sheet is missing"]
    # comments BLANKED before the membership test: the sheet documents itself,
    # and a selector named in a comment above a rule made the check pass with
    # the rule deleted. Found by deleting one on purpose — a tripwire nobody
    # has tried to trip is not a tripwire.
    sheet = _blank_comments(covered.group(1))
    body_css = css[:covered.start()]
    bad = []
    # Two kinds of rule need a fallback, not one:
    #   · the CONTAINER (display:grid) — without it the box becomes a block;
    #   · the PLACEMENT (grid-column / grid-row / grid-area) — a child that
    #     spans every column, like `.rs-panel { grid-column: 1 / -1 }`, needs a
    #     100% basis or it lines up beside its siblings instead of above them.
    #     That one was found on screen, not by the gate, which is why it is here.
    probe = _blank_comments(body_css)
    for at, sel, b0, b1 in _leaf_blocks(body_css):
        seg = probe[b0:b1]
        why = None
        if re.search(r"display\s*:\s*(?:inline-)?grid", seg):
            why = "declares display:grid"
        elif re.search(r"(?<![\w-])grid-(?:column|row|area)\s*:", seg):
            why = "places itself on a grid track (grid-column/row/area)"
        if not why:
            continue
        for part in sel.split(","):
            s = part.strip()
            if not s or s.startswith("@"):
                continue
            if s not in sheet:
                bad.append(f"{name}: `{s}` {why} but has no rule in the html.no-grid "
                           f"fallback sheet (NO_GRID_CSS in the builder) — on {FLOOR} "
                           f"its layout would silently come out wrong")
    return bad


def gate_scan_cssjs(name: str, body: str, sheet: str) -> tuple:
    """THE CSS-IN-JS FLOOR SWEEP.

    Several modules write their own rules from a string — remarksearch.js owns
    `.rs-panel { grid-column: 1 / -1 }`, mifchart.js and schedval.js own their
    modal sheets — and none of that ever reaches the <style> block the CSS gate
    reads.  Until Round 24 this sweep watched exactly TWO things: an unpaired
    min()/max()/clamp(), and CSS Grid.  The FF32 verify then found `inset:0`
    alive inside `.mc-modal` and `.sv-modal`: forbidden CSS, shipped to the
    unit, with a tripwire in the building that was looking the other way.

    The hole was never `inset`.  It was that the CSS-in-JS sweep had its own
    short private list while the stylesheet had the real one.  So this now runs
    THE SAME gate_scan_css — _CSS_FORBIDDEN entire, plus the same-property
    fallback rule for min()/max()/clamp() — over every CSS rule block inside a
    string literal, and adds the two coverage checks that a GENERATED fallback
    needs and a static list cannot express:

      · GRID: a grid container, or a child placed on a grid track, must appear
        in the hand-written html.no-grid sheet;
      · FLEX GAP: a flex container leaning on `gap` must have its generated
        html.no-flexgap rule in the same script (prepare_cssjs appends it to the
        module's own CSS string, so it is there or the patch did not run).

    Returns (violations, notes)."""
    blocks = _cssjs_blocks(body)
    if not blocks:
        return [], []
    bad = []
    ng = _blank_comments(sheet)         # see the note in gate_scan_grid
    flat = _descape(body)
    known_flex = set()
    for _a, _b, _at, sel, _b0, _b1, block in blocks:
        if re.search(r"display\s*:\s*(inline-)?flex", block):
            for part in sel.split(","):
                known_flex.add(part.strip())
    for _a, _b, _at, sel, b0, _b1, block in blocks:
        where = f"{name}:{_line_of(body, b0)} `{sel[:40]}`"
        # THE SAME LIST THE STYLESHEET GETS. The braces are put back so the
        # min()/max()/clamp() fallback lookup can find the start of the block.
        b, _n = gate_scan_css(where, sel + "{" + block + "}")
        bad += [x.replace(f"{where}:1: ", f"{where}: ") for x in b]
        for part in sel.split(","):
            s = part.strip()
            if not s or s.startswith("@"):
                continue
            why = None
            if re.search(r"display\s*:\s*(?:inline-)?grid", block):
                why = "declares display:grid"
            elif re.search(r"(?<![\w-])grid-(?:column|row|area|template)\s*:", block):
                why = "places itself on a grid track"
            if why and s not in ng:
                bad.append(f"{where}: `{s}` {why} from JavaScript but has no rule in "
                           f"the html.no-grid fallback sheet (NO_GRID_CSS in the builder)")
            g = _gap_rule(s, block, known_flex)
            if g and g[4] and not (_zero_len(g[0]) and _zero_len(g[1])):
                want = _prefix_selector(s, "")
                if want not in flat:
                    bad.append(f"{where}: `{s}` is a flex container leaning on `gap` "
                               f"(Fx63) but this script carries no `{want}` rule — "
                               f"prepare_cssjs should have appended one")
    # a bare min()/max()/clamp() OUTSIDE any rule block (an el.style assignment,
    # say) — the block-scoped check above already allows the patched pairs.
    spans = [(b0, b1) for _a, _b, _at, _s, b0, b1, _t in blocks]
    for m in re.finditer(r"(?<![\w.$-])(?:min|max|clamp)\(\s*\d", flat):
        if any(b0 <= m.start() < b1 for b0, b1 in spans):
            continue
        bad.append(f"{name}:{_line_of(body, m.start())}: CSS min()/max()/clamp() "
                   f"inside JS (Fx75+) and outside any rule block — patch it in "
                   f"the builder")
    return bad, [f"{name}: {len(blocks)} CSS rule block(s) swept for the floor list"]


# ────────────────────────────────────────────────────────────────────
#  TRIPWIRE: ΚΑΝΕΝΑ ΕΞΩΤΕΡΙΚΟ ΑΙΤΗΜΑ — ΕΚΤΟΣ ΑΠΟ ΤΗ ΛΕΥΚΗ ΛΙΣΤΑ (18/10/2026)
#
#  Απόφανση ιδιοκτήτη: «να αδρανοποιήσουμε όποιον άλλο εξωτερικό σύνδεσμο
#  υπάρχει» — όχι μόνο τους τρεις γνωστούς.  Ένας έλεγχος που απαριθμεί τους
#  τρεις είναι άχρηστος την επόμενη φορά που κάποιος προσθέτει τον τέταρτο·
#  άρα ο κανόνας γράφεται ανάποδα: ΤΙΠΟΤΑ δεν επιτρέπεται, εκτός από ό,τι είναι
#  ρητά στη λευκή λίστα, και η λευκή λίστα έχει σήμερα ΕΝΑ στοιχείο.
#
#  Γιατί έχει σημασία στο κλειστό δίκτυο: ένα νεκρό https δεν αποτυγχάνει
#  γρήγορα.  Δεν υπάρχει DNS να πει «όχι» — η σύνδεση κρέμεται μέχρι το
#  timeout.  Ένα <link> ή ένα web font μπλοκάρει το πρώτο paint· ένα fetch
#  κρεμά το κουμπί που το κάλεσε.  Ο χρήστης βλέπει εφαρμογή που «κόλλησε».
_EXT_ALLOW = (
    # XML namespace. Ο browser ΔΕΝ το ζητά ποτέ: είναι αναγνωριστικό που
    # ταυτοποιεί τη γραμματική του SVG, όχι διεύθυνση περιεχομένου.
    "http://www.w3.org/2000/svg",
)

# Κάθε απόλυτο URL με σχήμα που σημαίνει «φέρε κάτι από αλλού».
_EXT_SCHEME_RE = re.compile(r"(?i)(?:https?|ftps?|wss?|file)://[^\s\"'`<>)\\]*")
# Protocol-relative: `src="//host/…"` κληρονομεί το σχήμα της σελίδας. Σε
# file:// δεν σημαίνει τίποτα, και αυτό είναι ακριβώς το είδος του σφάλματος
# που δεν φαίνεται στον developer και φαίνεται στη Μοίρα.
_EXT_PROTO_REL_RE = re.compile(
    r"""(?i)(?:href|src|srcset|action|formaction|poster|cite|data)\s*=\s*["']?//""")
# CSS: url(http…), url(//…), αλλά ΟΧΙ url(#fc-arr-out) — αυτό είναι SVG marker
# του ίδιου εγγράφου — και ΟΧΙ url(data:…)/url(blob:…) που δεν φεύγουν ποτέ.
_EXT_CSS_URL_RE = re.compile(
    r"""(?i)url\(\s*["']?\s*(?://|(?!data:|blob:|about:|#)[a-z][a-z0-9+.\-]*:)""")
# @import φέρνει ΑΛΛΟ stylesheet — και αν είναι απομακρυσμένο, το φέρνει
# μπλοκάροντας το paint. Στο export δεν έχει καμία νόμιμη χρήση.
_EXT_IMPORT_RE = re.compile(r"(?i)@import\b")
# Τα API που δεν μπορούν να σημαίνουν τίποτε άλλο παρά «δίκτυο». Μένουν
# ΑΚΡΙΒΩΣ όπως γράφονται, γιατί η JavaScript είναι case-sensitive: το
# `xmlhttprequest` δεν είναι API, είναι λέξη. Το `fetch` λείπει σκόπιμα: η
# εφαρμογή το καλεί 25 φορές για το ../data/…, και το offline shim το έχει
# αντικαταστήσει — γι' αυτό ο έλεγχος από κάτω απαιτεί ΡΗΤΑ αυτό το shim.
_EXT_NET_NEEDLES = ("XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon",
                    "importScripts")

# ── ΟΙ ΤΡΥΠΕΣ ΠΟΥ ΒΡΗΚΕ Ο ΑΝΑΙΡΕΤΗΣ (18/10/2026, ΓΥΡΟΣ Η) ─────────────────
#  Δείγματα πέρασαν ΜΕΣΑ ΑΠΟ ΑΥΤΗΝ ΤΗΝ ΠΥΛΗ και δεν πιάστηκαν. Μετρημένα, με
#  probe πάνω στην ίδια τη συνάρτηση, ΠΡΙΝ γραφτεί μία γραμμή διόρθωσης:
#    `<IFRAME src=…>` · `<LINK rel="stylesheet">` · `<SCRIPT SRC=…>`   → η πύλη
#       έψαχνε `html.find("<iframe")`, δηλαδή ΠΕΖΑ, και η HTML δεν έχει πεζά:
#       τα tags είναι case-insensitive από το 1995. Τρεις τρύπες, ένα αίτιο.
#    `var u="https:\/\/evil/x"`                                        → το
#       `\/` είναι ο κανονικός τρόπος να γραφτεί slash μέσα σε JSON-escaped
#       string, και το `_EXT_SCHEME_RE` ζητούσε δύο ΓΥΜΝΑ slash.
#    `https&#58;//…`                                                   → HTML
#       entity για την άνω-κάτω τελεία· ο browser τη διαβάζει κανονικά.
#    `<meta http-equiv="refresh" content="0;url=//evil">`              → ούτε
#       tag ούτε API: ΟΔΗΓΙΑ ΠΛΟΗΓΗΣΗΣ, και κανένα μοτίβο δεν την κοίταζε.
#    `s.setAttribute("src","//cdn/a.js")`                              → το ίδιο
#       πράγμα με `src="//…"`, γραμμένο από JavaScript· το μοτίβο των
#       attributes ζητούσε σύνταξη markup.
#    `new Worker(…)` · `navigator.serviceWorker.register(…)` ·
#    `window.open(…)`                                                  → τρία
#       API που ΦΕΡΝΟΥΝ ή ΑΝΟΙΓΟΥΝ άλλο έγγραφο, και η σημείωση της πύλης
#       διαφήμιζε «0 network API» χωρίς να τα έχει δει ποτέ.
#  Ο κανόνας που γεννήθηκε: ό,τι η HTML διαβάζει ανεξαρτήτως πεζών-κεφαλαίων,
#  το ελέγχουμε με regex ανεξαρτήτως πεζών-κεφαλαίων· ό,τι είναι ταυτότητα
#  JavaScript, το ελέγχουμε ΑΚΡΙΒΩΣ. Και κάθε μία από τις τρύπες έχει τώρα
#  δείγμα στο --gate-selftest: έλεγχος που δεν αποδείχθηκε ότι σκάει είναι ευχή.
_EXT_HTML_RES = (
    # Tags που φέρνουν δεύτερο έγγραφο ή υποπόρο. `<link`/`<script` ΜΟΝΟ όταν
    # κουβαλούν διεύθυνση: το `<script>` χωρίς src είναι όλο το export.
    (re.compile(r"(?i)<iframe\b"), "<iframe> (a second document)"),
    (re.compile(r"(?i)<frame\b|<frameset\b"), "<frame>/<frameset>"),
    (re.compile(r"(?i)<form\b"), "<form> (it has an action, default: this URL)"),
    (re.compile(r"(?i)<base\b"), "<base> (it rewrites every relative URL)"),
    (re.compile(r"(?i)<object\b|<embed\b|<applet\b"), "<object>/<embed>/<applet>"),
    (re.compile(r"(?i)<link\b[^>]*\b(?:href|rel)\s*=" ), "<link> (an external resource)"),
    (re.compile(r"(?i)<script\b[^>]*\bsrc\s*="), "<script src> (a second file)"),
    (re.compile(r"(?i)\bsrcset\s*="), "srcset"),
    # Η META REFRESH: ούτε tag δικτύου ούτε API — οδηγία πλοήγησης, που στο
    # κλειστό δίκτυο σημαίνει «φύγε από το μόνο αρχείο που υπάρχει».
    (re.compile(r"(?i)<meta[^>]*http-equiv\s*=\s*[\"']?\s*refresh"),
     '<meta http-equiv="refresh"> (it navigates away on its own)'),
    # ESCAPED SLASHES: `https:\/\/host` — ο JSON-escaped τρόπος. Και το
    # `%2f`/`/`/`\x2f`, για την ίδια σκέψη γραμμένη αλλιώς.
    (re.compile(r"(?i)(?:https?|ftps?|wss?|file):(?:\\/|%2[fF]|\\u002[fF]|\\x2[fF]){2}"),
     "absolute URL with escaped slashes (https:\\/\\/…)"),
    # HTML ENTITY ΓΙΑ ΤΗΝ ΑΝΩ-ΚΑΤΩ ΤΕΛΕΙΑ: ο browser το διαβάζει ως «:».
    (re.compile(r"(?i)(?:https?|ftps?|wss?|file)(?:&#0*58;|&#x0*3a;|&colon;)"),
     "absolute URL with an HTML-entity colon (https&#58;//…)"),
    # setAttribute("src"|"href"|…, "//host" ή "scheme:…") — η ίδια πράξη με το
    # markup attribute, από κώδικα. Μόνο με ΚΥΡΙΟΛΕΚΤΙΚΗ τιμή: ό,τι περνά από
    # μεταβλητή δεν φαίνεται στατικά, και η σημείωση το λέει.
    (re.compile(r"""(?i)setAttribute\s*\(\s*["'](?:src|srcset|href|xlink:href|action"""
                r"""|formaction|poster|cite|data)["']\s*,\s*["']\s*"""
                r"""(?://|(?!data:|blob:|about:|#)[a-z][a-z0-9+.\-]*:)"""),
     'setAttribute("src", "//host…") — markup written from code'),
    # WORKER / SERVICE WORKER / window.open: φέρνουν ή ανοίγουν άλλο έγγραφο.
    # `new Worker` με όρια λέξης, ώστε ένα `SchedWorkerThing` να μη σκάει· και
    # `window.open(` με παρένθεση, γιατί η εφαρμογή έχει `window.openMifChart`.
    (re.compile(r"\bnew\s+(?:Shared)?Worker\s*\("), "new Worker() (a second script file)"),
    # ΜΕ ΟΡΙΑ ΛΕΞΗΣ, και ο λόγος είναι μετρημένος: ως γυμνό substring το
    # «SharedWorker» έσκαγε πάνω στο «SharedWorkerLike» μέσα στο ίδιο το
    # selftest. Ταυτότητα JavaScript ελέγχεται ΩΣ ΤΑΥΤΟΤΗΤΑ, όχι ως κομμάτι λέξης.
    (re.compile(r"\bSharedWorker\b"), "SharedWorker"),
    (re.compile(r"\bserviceWorker\b"), "serviceWorker (it would outlive the page)"),
    (re.compile(r"\b(?:window|self|top|parent)\.open\s*\("),
     "window.open() (a second document, which on file:// is a dead tab)"),
)


# Ο ΣΥΜΒΟΥΛΟΣ: τι ΔΕΝ επιτρέπεται να υπάρχει πουθενά στο αρχείο.
# Προσοχή στο τι ΔΕΝ είναι στη λίστα: η γυμνή λέξη «advisor» εμφανίζεται 73
# φορές στις παρατηρήσεις — «traffic advisories», «a traffic advisory was
# missed» — και είναι ΑΓΓΛΙΚΑ της εκπαίδευσης, όχι υπόλειμμα κώδικα. Κάθε
# needle εδώ είναι αναγνωριστικό, όχι λέξη.
_ADVISOR_NEEDLES = ('id="view-advisor"', 'id="tab-advisor"', "tab-advisor",
                    "view-advisor", "advisor.js", "Σύμβουλος", "advInit",
                    "advisor:start", 'switchView("advisor")', "sym-main", "sym-view")


def gate_scan_advisor(page: str, html: str) -> list:
    """Ο ίδιος κανόνας, πάνω στο ΟΛΟΚΛΗΡΟ αρχείο — markup, scripts και data."""
    return [f"{page}:{_line_of(html, html.find(n))}: advisor residue {n!r} is in "
            f"the unit build (the shell check only ever saw the markup)"
            for n in _ADVISOR_NEEDLES if n in html]


# ΤΟ BRIDGE (απόφανση 18/10/2026): ΔΕΝ ΤΑΞΙΔΕΥΕΙ. Ο συγχρονισμός του είναι
# Supabase — cloud. Στο κλειστό δίκτυο το `W.fetch` που διαβάζει την ώρα της
# κλήσης πέφτει πάνω στο offline shim, άρα η καρτέλα δεν «υπολειτουργεί»:
# αποτυγχάνει ΠΑΝΤΑ, μπροστά σε χρήστη που δεν έχει κανέναν να ρωτήσει. Και
# είναι 526.526 bytes για να αποτύχει.
#
# Η ΙΔΙΑ ΠΡΟΣΟΧΗ ΜΕ ΤΟΝ ΣΥΜΒΟΥΛΟ: κάθε needle εδώ είναι ΑΝΑΓΝΩΡΙΣΤΙΚΟ, όχι
# λέξη. Η γυμνή λέξη «bridge» ΥΠΑΡΧΕΙ ΝΟΜΙΜΑ στα δεδομένα — έξι φορές στο
# vfr_navigation, όπου είναι γεφύρι πάνω από το οποίο περνά η πλοήγηση — και
# «Bridge» με κεφαλαίο είναι σημείο αναφοράς στο έδαφος, όχι κώδικας. Μια
# πύλη που έψαχνε τη λέξη θα έσκαγε στη γεωγραφία της Πελοποννήσου.
_BRIDGE_NEEDLES = ("schedbridge", "SchedBridge", "schBridgeInit", "schBridgeLeave",
                   "sch-bridge", 'data-sch="bridge"', "renderBridge",
                   "supabase", "Supabase", "bridge:start", "data-brgw")

# ΤΑ ΚΕΙΜΕΝΑ ΠΟΥ ΜΙΛΟΥΝ ΓΙΑ ΚΟΥΜΠΙ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ (ίδια μέρα, ίδια απόφανση).
# Το `schedsync.js` δεν ταξιδεύει ποτέ — άρα το ☁ Sync ΔΕΝ ΥΠΑΡΧΕΙ στο export —
# και όμως τρεις διάλογοι του schedstore.js προειδοποιούσαν τον εκπαιδευτή για
# «το αντίγραφο στο GitHub» και για «τον κωδικό του ☁ Sync». Μια προειδοποίηση
# για λειτουργία που λείπει δεν είναι ακριβής: είναι αίνιγμα, και το αίνιγμα
# το λύνει ο χρήστης ψάχνοντας κουμπί που δεν θα βρει ποτέ.
_CLOSEDNET_NEEDLES = ("github", "GitHub", "Github", "☁ Sync", "Sync access code",
                      "api.github.com")


def gate_scan_unit(page: str, html: str) -> list:
    """Bridge + κλειστό δίκτυο: ό,τι δεν επιτρέπεται να έχει επιβιώσει.

    Τρέχει στο ΙΔΙΟ επίπεδο με τον gate_scan_advisor και για τον ίδιο λόγο:
    ο έλεγχος που κοιτά μόνο το κέλυφος είναι μισός έλεγχος — αυτό ήταν το
    μάθημα του `advInit`, που έμενε καρφωμένο στην app.js επειδή ο έλεγχος
    έτρεχε πριν μπουν τα scripts."""
    bad = []
    for n in _BRIDGE_NEEDLES:
        if n in html:
            bad.append(f"{page}:{_line_of(html, html.find(n))}: Bridge residue "
                       f"{n!r} is in the unit build — the tab is gone, so this is "
                       f"a wire to a module that does not travel")
    for n in _CLOSEDNET_NEEDLES:
        if n in html:
            bad.append(f"{page}:{_line_of(html, html.find(n))}: {n!r} is in the "
                       f"unit build — it names a service or a button that does "
                       f"not exist on the closed network")
    return bad


def gate_scan_external(page: str, html: str) -> list:
    """Σαρώνει ΟΛΟΚΛΗΡΟ το συναρμολογημένο αρχείο για εξωτερικές εξαρτήσεις."""
    bad = []
    seen = {}
    for m in _EXT_SCHEME_RE.finditer(html):
        url = m.group(0)
        if any(url.startswith(a) for a in _EXT_ALLOW):
            continue
        key = url[:120]
        if key in seen:
            seen[key] += 1
            continue
        seen[key] = 1
        bad.append(f"{page}:{_line_of(html, m.start())}: external URL in a file "
                   f"that must ask the network for NOTHING: {key}")
    for rx, what in ((_EXT_PROTO_REL_RE, "protocol-relative URL (//host)"),
                     (_EXT_CSS_URL_RE, "CSS url() pointing outside the document"),
                     (_EXT_IMPORT_RE, "@import")) + _EXT_HTML_RES:
        for m in rx.finditer(html):
            bad.append(f"{page}:{_line_of(html, m.start())}: {what} — "
                       f"{html[m.start():m.start() + 60]!r}")
    for needle in _EXT_NET_NEEDLES:
        i = html.find(needle)
        if i >= 0:
            bad.append(f"{page}:{_line_of(html, i)}: {needle!r} — this can only "
                       f"mean a network request or a second document; neither "
                       f"exists on the unit's closed network")
    # Το shim ΔΕΝ είναι προαιρετικό: χωρίς αυτό, 25 fetch("../data/…") της
    # εφαρμογής γίνονται αιτήματα για αρχεία που δεν συνοδεύουν το export.
    if "window.fetch = function" not in html:
        bad.append(f"{page}: the offline fetch shim is missing or no longer "
                   f"overrides window.fetch — every ../data/… fetch would go out")
    return bad


def run_gate(html: str, page: str) -> list:
    """Full quality gate over one assembled HTML page. Returns notes; exits on
    violations."""
    # 18/10/2026 — ΚΑΙ ΑΥΤΟΙ ΟΙ ΔΥΟ ΗΤΑΝ CASE-SENSITIVE. Ένα `<SCRIPT SRC="x.js">`
    # ή ένα `<LINK REL=stylesheet HREF=s.css>` περνούσε και από τους δύο, γιατί
    # ζητούσαν πεζά και σταθερή σειρά attributes — και η HTML δεν υπόσχεται
    # ούτε το ένα ούτε το άλλο. Τώρα: ανεξαρτήτως πεζών-κεφαλαίων, και με το
    # attribute οπουδήποτε μέσα στο tag.
    if re.search(r"(?i)<script\b[^>]*\bsrc\s*=", html):
        fail(f"{page}: external <script src> survived assembly")
    if re.search(r"(?i)<link\b[^>]*\brel\s*=\s*[\"']?stylesheet", html):
        fail(f"{page}: external stylesheet link survived assembly")
    scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
    styles = re.findall(r"<style>(.*?)</style>", html, re.S)
    if not scripts or not styles:
        fail(f"{page}: could not extract inline scripts/styles for the gate")
    shim_present = any(SHIM_MARK in s for s in scripts)
    if not shim_present:
        fail(f"{page}: the runtime shim block is missing")
    bad, notes = [], []
    named = []
    for idx, body in enumerate(scripts):
        mlab = re.search(r"/\* ═+ (.+?) ═+ \*/", body)
        named.append((f"{page}[script#{idx} {(mlab.group(1) if mlab else 'head')}]", body))

    # ── LAYER 1: acorn, ecmaVersion 5, over EVERY emitted script. This is the
    #    proof the whole round exists for: a different library from the one that
    #    produced the text, reading the finished file, refusing every construct
    #    an engine from 2011 could not parse. Nothing below is a substitute.
    es5 = parse_es5(named)
    if es5:
        print(f"\nES5 PARSE — {len(es5)} script(s) in {page} are NOT ES5:", file=sys.stderr)
        for x in es5:
            print("  ✗ " + x, file=sys.stderr)
        fail(f"{page} would not PARSE on {FLOOR} — nothing was written")
    notes.append(f"acorn ecmaVersion:5 — {len(named)} inline scripts, 0 parse errors")

    # ── LAYER 2: the regex scanners (line numbers, API floor, CSS-in-JS)
    for name, body in named:
        if SHIM_MARK in body or "FDMS capability guard" in body:
            # the shim block IS the API provider, and the capability guard runs
            # BEFORE it — both are syntax-scanned only.
            b, nn = gate_scan_script(name, body, shim_present, check_apis=False)
        else:
            b, nn = gate_scan_script(name, body, shim_present)
        bad += b
        notes += nn
    for idx, body in enumerate(styles):
        b, nn = gate_scan_css(f"{page}[style#{idx}]", body)
        bad += b
        notes += nn
        bad += gate_scan_grid(f"{page}[style#{idx}]", body)
    # THE SAME FLOOR LIST over the modules that write CSS from JavaScript.
    # Skipped for the data bundle alone: it is free text, and a Greek remark
    # that happens to contain a brace is not a stylesheet.
    for name, body in named:
        if "Embedded data bundle" in name:
            continue
        b, nn = gate_scan_cssjs(name, body, NO_GRID_CSS)
        bad += b
        notes += nn
    # ── LAYER 3: ΚΑΜΙΑ ΕΞΩΤΕΡΙΚΗ ΕΞΑΡΤΗΣΗ. Πάνω σε ΟΛΟ το αρχείο, markup και
    #    scripts και data μαζί — ένας σύνδεσμος δεν ξεχωρίζει τι είδους είναι
    #    το μπλοκ που τον κουβαλά.
    ext = (gate_scan_external(page, html) + gate_scan_advisor(page, html)
           + gate_scan_unit(page, html))
    bad += ext
    if not ext:
        # Η ΣΗΜΕΙΩΣΗ ΛΕΕΙ ΤΙ ΕΛΕΓΧΘΗΚΕ, ΟΥΤΕ ΜΙΑ ΛΕΞΗ ΠΑΡΑΠΑΝΩ (18/10/2026).
        # Η παλιά έλεγε «0 network API … no external reference survived» ενώ
        # δεν είχε κοιτάξει ΠΟΤΕ Worker, serviceWorker ή window.open — και μια
        # πύλη που υπόσχεται περισσότερα απ' όσα ελέγχει είναι χειρότερη από
        # καμία πύλη: κάνει τον επόμενο να μην ξανακοιτάξει. Τώρα απαριθμεί τα
        # μοτίβα και ΟΜΟΛΟΓΕΙ το όριό της.
        notes.append(
            f"external-reference scan (static, over the WHOLE file — markup, "
            f"scripts, data): 0 absolute URLs outside the whitelist "
            f"({len(_EXT_ALLOW)} entry), 0 with escaped slashes or an "
            f"entity colon, 0 protocol-relative, 0 @import, 0 CSS url() off the "
            f"document, 0 of {len(_EXT_NET_NEEDLES)} network APIs by exact name "
            f"(XHR/WebSocket/EventSource/sendBeacon/importScripts), "
            f"0 of {len(_EXT_HTML_RES)} markup-and-navigation patterns "
            f"(iframe/frame/form/base/object/embed/link/script-src/srcset/"
            f"meta-refresh/setAttribute-with-a-literal-URL/new Worker/"
            f"SharedWorker/serviceWorker/window.open), tag matching "
            f"CASE-INSENSITIVE; offline fetch shim "
            f"present; 0 of {len(_ADVISOR_NEEDLES)} advisor identifiers, "
            f"0 of {len(_BRIDGE_NEEDLES)} Bridge identifiers, 0 of "
            f"{len(_CLOSEDNET_NEEDLES)} GitHub/sync words")
        notes.append(
            "what this scan CANNOT see, said plainly: a URL assembled at "
            "runtime (\"htt\" + \"ps://…\", String.fromCharCode, atob of a "
            "base64 host) and a URL that arrives in a variable "
            "(setAttribute(\"src\", u)) are invisible to any static scan. The "
            "guarantee is about the TEXT of the file, not about every possible "
            "execution of it; what makes runtime assembly harmless here is the "
            "offline fetch shim plus the fact that nothing in this app builds a "
            "URL at all")
    if bad:
        print(f"\nQUALITY GATE — {len(bad)} violation(s) in {page}:", file=sys.stderr)
        for x in bad[:60]:
            print("  ✗ " + x, file=sys.stderr)
        if len(bad) > 60:
            print(f"  … and {len(bad) - 60} more", file=sys.stderr)
        fail(f"{page} would not run on {FLOOR} — nothing was written")
    return notes


def gate_selftest() -> None:
    cases_bad = [
        ("var x = a?.b;", "optional chaining"),
        ("var y = a ?? b;", "nullish"),
        ("v ||= 3;", "logical assign"),
        ("class A { #x = 1; }", "private field"),
        ("var n = 1_000_000;", "numeric separator"),
        ("var b = 10n;", "bigint"),
        ("s.replaceAll('a','b')", "replaceAll without shim"),
        ("try { x(); } catch { y(); }", "optional catch binding"),
        ("var o = {...a, b: 1};", "object spread"),
        ("var q = new IntersectionObserver(f);", "IntersectionObserver"),
        # ── the ES5 floor (Round 23) ──
        ("var f = (x) => x + 1;", "arrow function"),
        ("let a = 1;", "let"),
        ("const a = 1;", "const"),
        ("class K { m() {} }", "class"),
        ("function* g() { yield 1; }", "generator"),
        ("async function f() {}", "async function"),
        ("for (var x of xs) { f(x); }", "for-of"),
        ("var arr = [...a, ...b];", "array spread"),
        ("f(...arr);", "call spread"),
        ("function g(...args) {}", "rest params"),
        ("var el = document.querySelector('x'); el.closest('.y');", "Element.closest, no shim"),
        ("Object.assign({}, a);", "Object.assign, no shim"),
        ("var t = xs.includes(3);", "Array.includes, no shim"),
        ("String(n).padStart(2, '0');", "padStart, no shim"),
        ("var k = Symbol.iterator;", "unguarded Symbol"),
    ]
    cases_good = [
        'var s = "no ?. here ?? really";',
        "var r = /ab?./g; var t = 'x ?.';",
        "var u = 'tpl ${a?.b} not code'; // a?.b in comment",
        "var q = x ? .5 : y;",
        'el.innerHTML = "<a href=\\"?x=1&y=2\\">" + esc(v) + "</a>";',
        "try { x(); } catch (e) { y(); }",
        "var i = 0; for (i = 0; i < n; i++) { f(i); }",
        # the exact shape Babel's helper emits — guarded Symbol is fine
        'var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];',
        # ES5 property access on reserved-ish names must not trip the class rule
        "var c = node.className; var d = o['class'];",
    ]
    ok = True
    for src, why in cases_bad:
        hits, _ = gate_scan_script("selftest", src, shim_present=False)
        if not hits:
            ok = False
            print(f"SELFTEST FAIL: missed {why}: {src}")
    for src in cases_good:
        hits, _ = gate_scan_script("selftest", src, shim_present=True)
        if hits:
            ok = False
            print(f"SELFTEST FAIL: false positive on: {src}\n  {hits}")

    # ── Ο TRIPWIRE ΤΩΝ ΕΞΩΤΕΡΙΚΩΝ ΣΥΝΔΕΣΜΩΝ (18/10/2026) ─────────────────
    # Ένας έλεγχος που δεν έχει αποδειχθεί ότι σκάει είναι ευχή, όχι έλεγχος.
    # Τα κακά δείγματα είναι ακριβώς τα είδη που βρέθηκαν ή θα μπορούσαν να
    # βρεθούν στο app/: απόλυτο https, loopback του συμβούλου, api.github.com,
    # protocol-relative, web font μέσω @import, url() σε CDN. Τα καλά είναι τα
    # δύο που ΔΕΝ πρέπει να σκάνε ποτέ: το XML namespace του SVG και η
    # αναφορά marker στο ίδιο έγγραφο.
    ext_bad = [
        ('<a href="https://github.com/x/y/issues/new?title=a">f</a>', "https link"),
        ('var P = "http://127.0.0.1:8771";', "advisor loopback"),
        ('var A = "https://api.github.com";', "api.github.com"),
        ('<img src="//cdn.example.com/a.png">', "protocol-relative src"),
        ("@import url(https://fonts.googleapis.com/css?family=X);", "@import web font"),
        ("a{background:url(https://cdn.example.com/b.png)}", "url() to a CDN"),
        ('var x = new XMLHttpRequest();', "XMLHttpRequest"),
        ('<iframe src="x"></iframe>', "iframe"),
        # ── ΟΙ ΕΝΤΕΚΑ ΤΡΥΠΕΣ ΤΟΥ ΑΝΑΙΡΕΤΗ (18/10/2026) ───────────────────
        # Κάθε μία πέρασε ΜΕΣΑ ΑΠΟ ΤΗΝ ΠΥΛΗ και δεν πιάστηκε. Μένουν εδώ ως
        # δείγματα για πάντα: η απόδειξη ότι ο έλεγχος σκάει είναι ο έλεγχος.
        ('<IFRAME src="x.html"></IFRAME>', "<IFRAME> in capitals"),
        ('<LINK rel="stylesheet" href="s.css">', "<LINK rel=stylesheet> in capitals"),
        ('<SCRIPT SRC="x.js"></SCRIPT>', "<SCRIPT SRC> in capitals"),
        ('<Form action="/x">', "<Form> in mixed case"),
        ('var u = "https:\\/\\/evil/x";', "escaped slashes (JSON-escaped string)"),
        ('el.innerHTML = "<a href=\\"https&#58;//evil/x\\">go</a>";',
         "HTML-entity colon (https&#58;//…)"),
        ('<meta http-equiv="refresh" content="0;url=//evil">', "meta refresh"),
        ('s.setAttribute("src", "//cdn/a.js");', 'setAttribute("src", "//host")'),
        ('var w = new Worker("w.js");', "new Worker()"),
        ('navigator.serviceWorker.register("sw.js");', "serviceWorker.register()"),
        ('window.open("x.html", "_blank");', "window.open()"),
    ]
    ext_good = [
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        'o["marker-end"] = "url(#fc-arr-out)";',
        'el.innerHTML = "<a href=\\"#fdms-feedback/issues/new?title=a\\">Feedback</a>";',
        'el.href = URL.createObjectURL(blob);',
        'd.setAttribute("src", "data:image/png;base64,AAA");',
        # ΤΑ ΨΕΥΔΩΣ-ΘΕΤΙΚΑ ΠΟΥ ΘΑ ΕΣΠΑΓΑΝ ΤΟ BUILD (18/10/2026): η εφαρμογή έχει
        # `window.openMifChart` σε τέσσερα σημεία — ένα needle «window.open»
        # χωρίς παρένθεση θα είχε σκάσει στο πρώτο build. Και το `<script>`
        # χωρίς src είναι ΟΛΟ το export: 17 μπλοκ.
        'if (window.openMifChart) window.openMifChart(cat, sn);',
        'window.openSchedVal(uid); window.openRequirements(id);',
        "<script>\n/* a block with no src — this is what the export is made of */\n</script>",
        'd.setAttribute("aria-expanded", "true"); d.setAttribute("src", v);',
        'var worker = { SharedWorkerLike: 1 }; var k = o.workerish;',
    ]
    # το shim είναι υποχρεωτικό, άρα κάθε δείγμα εδώ το κουβαλά μαζί του
    SHIM = "\nwindow.fetch = function (u) { return null; };\n"
    for src, why in ext_bad:
        if not gate_scan_external("selftest", src + SHIM):
            ok = False
            print(f"SELFTEST FAIL: the external-link tripwire missed {why}: {src}")
    for src in ext_good:
        hits = gate_scan_external("selftest", src + SHIM)
        if hits:
            ok = False
            print(f"SELFTEST FAIL: external-link false positive on: {src}\n  {hits}")
    if not gate_scan_external("selftest", "var a = 1;"):
        ok = False
        print("SELFTEST FAIL: a file without the offline fetch shim passed the "
              "external-link tripwire")

    # ── ΤΟ BRIDGE ΚΑΙ ΤΟ ΚΛΕΙΣΤΟ ΔΙΚΤΥΟ (18/10/2026) ─────────────────────
    # Τα κακά είναι ακριβώς ό,τι βρισκόταν στο app/ πριν τον γύρο. Τα καλά
    # είναι η γεωγραφία: «bridge» στα αγγλικά της πλοήγησης υπάρχει στα
    # δεδομένα και ΔΕΝ είναι κώδικας — αν σκάσει σε αυτά, η πύλη έγινε λογοκρισία.
    unit_bad = [
        ('<button class="sch-subtab" data-sch="bridge">Bridge</button>', "the Bridge subtab"),
        ('<section id="sch-bridge" class="sch-pane hidden"></section>', "the Bridge pane shell"),
        ('if (window.schBridgeInit) { window.schBridgeInit(el); return; }', "schBridgeInit"),
        ('if (from === "x" && window.schBridgeLeave) window.schBridgeLeave();', "schBridgeLeave"),
        ('<p>Expected <code>app/schedbridge.js</code> next to the others.</p>', "app/schedbridge.js"),
        ('SchedBridge.looksLikeWaExport(data)', "SchedBridge.*"),
        ('placeholder="&lt;project&gt;.supabase.co"', "a supabase host"),
        ('"…and the copy on GitHub are NOT touched."', "the GitHub copy warning"),
        ('"It does NOT touch the ☁ Sync access code."', "the ☁ Sync access code warning"),
        ('var A = "api.github.com";', "api.github.com"),
    ]
    unit_good = [
        # ΤΟ ΓΕΦΥΡΙ ΤΟΥ VFR NAVIGATION — έξι φορές στα δεδομένα, μηδέν φορές κώδικας
        '{"text": "the turning point is the bridge south of the town"}',
        '{"text": "Bridge and dam are the two visual references for leg 3"}',
        # το ΟΝΟΜΑ της συλλογής μένει στο store: δεν είναι σύρμα προς το module
        'bridgeLog: { type: "list", key: "id", seed: "bridge_log" },',
    ]
    for src, why in unit_bad:
        if not gate_scan_unit("selftest", src):
            ok = False
            print(f"SELFTEST FAIL: the Bridge/closed-network tripwire missed {why}: {src}")
    for src in unit_good:
        hits = gate_scan_unit("selftest", src)
        if hits:
            ok = False
            print(f"SELFTEST FAIL: Bridge/closed-network false positive on: {src}\n  {hits}")

    # ── THE SPREAD REGRESSION ────────────────────────────────────────────
    # Round 23 first ran Babel with `loose: true`, which implies iterableIsArray
    # for the spread transform. `[...bag.values()]` came out as
    # `[].concat(bag.values())` — and Array.prototype.concat does not expand an
    # iterator, it appends it as ONE element. Every list built that way from a
    # Map silently became a list of one iterator object: no error, no console
    # warning, just an empty screen at the unit. The build now proves the
    # opposite on every run.
    if not NO_TRANSPILE:
        probe = "var out = [...m.values()]; for (const k of s) { f(k); }"
        got = transpile_all([("spread-probe.js", probe)])["spread-probe.js"]
        if "[].concat(m.values())" in got or "_toConsumableArray" not in got:
            ok = False
            print("SELFTEST FAIL: spread over a Map iterator did not go through "
                  "Babel's iterator helper — check the assumptions in "
                  "tools/es5_transpile.js (loose: true is the known trap)\n  " + got)
        if '"@@iterator"' not in got:
            ok = False
            print("SELFTEST FAIL: the emitted iterator helper has no \"@@iterator\" "
                  "fallback rung — without Symbol (Fx36) nothing would iterate")
        if parse_es5([("spread-probe.js", got)]):
            ok = False
            print("SELFTEST FAIL: the transpiler's own output is not ES5")

    print("gate selftest:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


# ────────────────────────────────────────────────────────────────────
# 2. CSS patch for Fx52 (source stays modern — export-only rewrites)
# ────────────────────────────────────────────────────────────────────

def _blank_comments(css: str) -> str:
    """A same-length copy of the stylesheet with every /* … */ interior turned
    into spaces (newlines kept). Structure scanning and selector extraction run
    on THIS copy, so a `{` inside a Greek comment cannot desynchronise the brace
    walk and a comment sitting above a rule cannot end up glued into the
    selector the flex-gap fallback is generated from. Offsets are identical, so
    the bodies are still sliced out of the real stylesheet."""
    def blank(m):
        return "".join("\n" if ch == "\n" else " " for ch in m.group(0))
    return re.sub(r"/\*.*?\*/", blank, css, flags=re.S)


def _leaf_blocks(real_css: str):
    """Yield (at_rule_stack, selector, body_start, body_end) for every INNERMOST
    rule block (a block whose body holds declarations, not other blocks).
    The stack is the list of enclosing at-rule preludes, outermost first, so a
    generated fallback can be re-emitted inside the same @media."""
    css = _blank_comments(real_css)
    stack, out = [], []
    i, n, seg_start = 0, len(css), 0
    while i < n:
        c = css[i]
        if c == "{":
            prelude = css[seg_start:i].strip()
            # find the matching close and see whether it contains another block
            depth, j = 1, i + 1
            inner = False
            while j < n and depth:
                if css[j] == "{":
                    depth += 1
                    inner = True
                elif css[j] == "}":
                    depth -= 1
                j += 1
            if inner or prelude.startswith("@"):
                stack.append(prelude)
                i += 1
                seg_start = i
                continue
            close = css.find("}", i)
            if close < 0:                # unbalanced: not a stylesheet after all
                break                    # (a JS string with a stray `{` — see
            out.append((list(stack), prelude, i + 1, close))   # _cssjs_blocks)
            i = close + 1
            seg_start = i
            continue
        if c == "}":
            if stack:
                stack.pop()
            i += 1
            seg_start = i
            continue
        i += 1
    return out


_LEN = r"[-\w.%()+ /*]+"


def sub_decls(pattern: str, repl, body: str) -> tuple:
    """re.subn over a rule body, SKIPPING anything inside a /* … */ comment.

    _leaf_blocks hands back the real text between `{` and `}`, and in this
    stylesheet a rule body can contain a long Greek comment that DISCUSSES the
    property being rewritten — `overflow-wrap: normal` is spelled out in prose
    in the currency table's note. A plain re.subn rewrote the sentence and
    swallowed everything up to the next semicolon into the value. Inert inside
    a comment, but it corrupted the note, and one stray `*/` would have made it
    not inert at all. Every per-declaration rewrite goes through here."""
    spans = [m.span() for m in re.finditer(r"/\*.*?\*/", body, re.S)]

    def inside(pos):
        for a, b in spans:
            if a <= pos < b:
                return True
        return False

    out, last, n = [], 0, 0
    for m in re.finditer(pattern, body):
        if inside(m.start()):
            continue
        out.append(body[last:m.start()])
        out.append(repl(m))
        last = m.end()
        n += 1
    out.append(body[last:])
    return "".join(out), n


def _split_gap(v: str):
    """`gap: 4px 10px` → (row, col); `gap: 6px` → (6px, 6px)."""
    parts = v.strip().split()
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], parts[1]


def _prefix_selector(sel: str, tail: str) -> str:
    """`.a, .b:hover` → `html.no-flexgap .a TAIL, html.no-flexgap .b:hover TAIL`.
    A selector that already starts at the root gets the class welded on instead
    of prefixed, or `html.no-flexgap html.light .x` would never match.
    An empty tail addresses the CONTAINER itself (the wrap compensation)."""
    outs = []
    for one in sel.split(","):
        one = one.strip()
        if not one:
            continue
        if one.startswith("html"):
            one = "html.no-flexgap" + one[len("html"):]
        elif one.startswith(":root"):
            one = ":root.no-flexgap" + one[len(":root"):]
        else:
            one = "html.no-flexgap " + one
        outs.append(one + " " + tail if tail else one)
    return ", ".join(outs)


# ── FINDING THE CSS A MODULE WRITES FROM A STRING (Round 24) ────────────────

def _js_literal_spans(js: str) -> list:
    """[(start, end)] for the INTERIOR of every string, template literal, regex
    literal and comment in `js` — i.e. every region strip_js blanked.

    strip_js emits exactly one character for every character it consumes, so the
    blanked copy is an offset-for-offset mask of the original; the assertion
    below is what keeps that a fact rather than a belief.  CSS-in-JS lives in a
    string literal BY DEFINITION, so this is where the floor patch and the floor
    sweep look for it — and only there, which is what stops a JavaScript object
    key spelled `gap:` or `contain:` from being read as CSS."""
    stripped = strip_js(js)
    if len(stripped) != len(js):
        fail("strip_js lost the 1:1 offset mapping the CSS-in-JS pass depends on")
    spans, i, n = [], 0, len(js)
    while i < n:
        if js[i].strip() and not stripped[i].strip():
            j = i
            while j < n and (not js[j].strip() or not stripped[j].strip()):
                j += 1
            a = i + 1 if js[i] in "'\"`" else i     # skip the opening delimiter
            if j > a:
                spans.append((a, j))
            i = j
        else:
            i += 1
    return spans


def _descape(s: str) -> str:
    """A same-LENGTH copy of a string literal with every `\\x` escape blanked to
    two spaces.  Babel compiles the modules' CSS template literals down to
    ordinary double-quoted strings, so by the time the GATE reads the emitted
    file every newline inside that CSS is the two characters `\\n`.  Blanking
    the pairs leaves every brace and declaration exactly where it was — offsets
    are what the line numbers are made of — while stopping `\\n` from gluing
    itself to the front of a selector."""
    return re.sub(r"\\.", "  ", s, flags=re.S)


def _looks_css(sel: str, body: str) -> bool:
    s = sel.strip()
    return bool(s) and bool(re.match(r"[@.#*:\[a-zA-Z]", s)) \
        and bool(re.search(r"[-a-zA-Z]+\s*:\s*[^;}\s]", body))


def _stylesheet_shaped(text: str) -> bool:
    """Cheap gate before the brace walk. A module is full of strings that are
    NOT stylesheets — HTML fragments, messages, an SVG path — and some of them
    carry a lone `{`. Only text with at least one brace PAIR and a declaration
    in it is worth parsing, and the counts must balance or the walk is reading
    something that was never CSS."""
    return ("{" in text and ":" in text
            and text.count("{") == text.count("}")
            and bool(re.search(r"\{[^{}]*[-a-zA-Z]+\s*:\s*[^;}\s][^{}]*\}", text)))


def _cssjs_blocks(js: str) -> list:
    """[(lit_a, lit_b, at_stack, selector, b0, b1, scan_body)] for every CSS rule
    block inside a string literal.  b0/b1 index into `js`; scan_body is the
    de-escaped copy (same length), which is what the gate reads."""
    out = []
    for a, b in _js_literal_spans(js):
        text = _descape(js[a:b])
        if not _stylesheet_shaped(text):
            continue
        for at_stack, sel, i0, i1 in _leaf_blocks(text):
            if _looks_css(sel, text[i0:i1]):
                out.append((a, b, at_stack, sel.strip(),
                            a + i0, a + i1, text[i0:i1]))
    return out


# ── THE ONE FLOOR PATCH FOR A BLOCK OF DECLARATIONS (Round 24) ──────────────
# Every rewrite below used to live INSIDE patch_css, and patch_css only ever
# sees the <style> block.  Two modules write their own rules from a JavaScript
# string — mifchart.js's `.mc-modal` and schedval.js's `.sv-modal` both declare
# `position:fixed;inset:0` — so the inset patch swept straight past them.  On
# Fx32-65 those two backdrops came out as a content-sized box in the top-left
# corner instead of a full-viewport veil (measured on the shipped file:
# 1440×900 with inset support; without it the box is only as big as what the
# modal holds — 760×305 and 1240×115 for the two).  The two numbers this
# comment and the header used to quote were each a single reading of a
# content-dependent box, and they did not even agree with each other; the
# COLLAPSE is the fact, its size is not.
# The patch is a FUNCTION now and BOTH paths call it:
# patch_css for the stylesheet, prepare_cssjs for the rules a module writes
# from a string.  app/ is not touched — the hosted app keeps the shorthand.
_GAP_LEGACY = {"gap": "grid-gap", "row-gap": "grid-row-gap",
               "column-gap": "grid-column-gap"}


def _inset_longhands(v: str) -> str:
    """`inset: T R B L` → the four longhands.  A total replacement, not a
    fallback pair: the shorthand has no legacy VALUE to degrade to, it simply
    must not be used below Fx66.  Every browser since forever computes the same
    box from the longhands, so nothing a modern engine draws changes."""
    parts = v.strip().split()
    if len(parts) == 1:
        t = r = b = l = parts[0]
    elif len(parts) == 2:
        t = b = parts[0]
        r = l = parts[1]
    elif len(parts) == 3:
        t, r, b = parts
        l = r
    else:
        t, r, b, l = parts[:4]
    return f"top:{t};right:{r};bottom:{b};left:{l}"


def _mm_repl(m):
    """min()/max()/clamp() (Fx75) → a same-property fallback BEFORE the modern
    declaration.  Fx32 drops the declaration it cannot parse and keeps the
    fallback; a modern browser applies the later one.  The fallback value is the
    FIRST argument, plus max-width/max-height for the classic
    `width: min(Npx, Nvw)` shape, which is what every current call site is."""
    prop, fn, args = m.group(1), m.group(2), m.group(3)
    first = args.split(",")[0].strip()
    rest = [a.strip() for a in args.split(",")[1:]]
    fb = f"{prop}:{first};"
    if fn == "min" and prop in ("width", "height") and len(rest) == 1:
        fb += f"max-{prop}:{rest[0]};"
    return fb + f"{prop}:{fn}({args})"


def patch_decls(body: str) -> tuple:
    """Apply every per-declaration floor fallback to ONE rule body.
    Returns (new_body, {what: count})."""
    n = {}

    def run(key, pattern, repl, text):
        text, k = sub_decls(pattern, repl, text)
        n[key] = n.get(key, 0) + k
        return text

    body = run("inset", r"(?<![\w-])inset\s*:\s*([^;}]+)",
               lambda m: _inset_longhands(m.group(1)), body)
    # break-inside (Fx65 unprefixed) → the legacy page-break-inside first
    body = run("break", r"(?<![\w-])break-inside\s*:\s*([^;}]+)",
               lambda m: f"page-break-inside:{m.group(1)};break-inside:{m.group(1)}",
               body)
    # overflow-wrap (Fx49 unprefixed) → the legacy word-wrap first.  Same values,
    # same effect; Fx32 reads word-wrap and ignores the one it does not know.
    # Done per-declaration rather than sheet-wide because one of this
    # stylesheet's Greek comments discusses `overflow-wrap: normal` in prose,
    # and a sheet-wide substitution rewrote the sentence.
    body = run("ow", r"(?<![\w-])overflow-wrap\s*:\s*([^;}]+)",
               lambda m: f"word-wrap:{m.group(1)};overflow-wrap:{m.group(1)}",
               body)
    # gap / row-gap / column-gap → the grid-* longhand first.  Fx52 shipped CSS
    # Grid with grid-gap; the unprefixed forms are Fx61 (grid) and Fx63 (flex).
    # On a FLEX container Fx52 ignores both — that is what the generated
    # html.no-flexgap sheet below is for.
    body = run("gap", r"(?<![\w-])(gap|row-gap|column-gap)\s*:\s*([^;}]+)",
               lambda m: (f"{_GAP_LEGACY[m.group(1)]}:{m.group(2).strip()};"
                          f"{m.group(1)}:{m.group(2).strip()}"), body)
    body = run("minmax", r"(?<![\w-])([a-z-]+)\s*:\s*(min|max|clamp)\(([^()]*)\)",
               _mm_repl, body)
    return body, n


# ── READING A GAP RULE, AND READING THE CONTAINER'S OWN BOX ─────────────────

def _gap_rule(sel: str, probe: str, known_flex: set):
    """(row, col, is_column, is_wrap, is_flex) for a rule body that declares a
    gap, or None when it declares none.  `probe` is the COMMENT-BLANKED body, so
    a rule commented out — or a comment that talks about gap — cannot be
    mistaken for a declaration."""
    gm = re.search(r"(?<![\w-])gap\s*:\s*([^;}]+)", probe)
    rgm = re.search(r"(?<![\w-])row-gap\s*:\s*([^;}]+)", probe)
    cgm = re.search(r"(?<![\w-])column-gap\s*:\s*([^;}]+)", probe)
    if not (gm or rgm or cgm):
        return None
    row, col = ("0", "0")
    if gm:
        row, col = _split_gap(gm.group(1))
    if rgm:
        row = rgm.group(1).strip()
    if cgm:
        col = cgm.group(1).strip()
    dm = re.search(r"display\s*:\s*(inline-)?(flex|grid)", probe)
    fd = re.search(r"flex-direction\s*:\s*([\w-]+)", probe)
    fw = re.search(r"flex-wrap\s*:\s*([\w-]+)", probe)
    # a rule is a flex container when it says so, when another rule says so for
    # the same selector (the media-query override case, which carries the gap
    # but not the display), or when it sets a flex-only property
    is_flex = bool(dm and dm.group(2) == "flex") or (
        not dm and (bool(fd) or bool(fw)
                    or any(p.strip() in known_flex for p in sel.split(","))))
    return (row, col,
            bool(fd and "column" in fd.group(1)),
            bool(fw and fw.group(1).strip() == "wrap"),
            is_flex, bool(dm))


def collect_flex_rules(blocks, blank, known_flex) -> tuple:
    """Walk the rule blocks IN SOURCE ORDER and return
    (flex_rules, orphan_gap, n_shape) for the generated html.no-flexgap sheet.

    THE SHAPE OVERRIDE, found by measuring rather than by reading.  With the
    fallback forced at 560px the topbar came out SIX PIXELS SHORT, and the six
    belonged to `.viewtabs`:

        .viewtabs { display: flex; gap: 6px }                      (line 368)
        @media (max-width: 900px) { .viewtabs { flex-wrap: wrap } } (line 2306)

    The gap and the wrap live in different rules, eighteen hundred lines apart.
    The generator read the first one, saw a non-wrapping row, and restored the
    HORIZONTAL gap only — so below 900px the tab bar's second line sat flush
    against its first.  The builder already knew to look across rules for
    `display: flex` (that is what `known_flex` is); it did not know to look
    across rules for the SHAPE.  It does now: a rule that declares flex-wrap or
    flex-direction and no gap of its own inherits the gap of the last rule that
    did, and is emitted in ITS OWN at-context, which is what makes the fallback
    change shape at the same breakpoint the real layout does."""
    flex_rules, orphan_gap = [], []
    last_gap, last_shape = {}, {}
    n_shape = 0
    for at_stack, sel, b0, b1 in blocks:
        key = sel.strip()
        probe = blank[b0:b1]
        g = _gap_rule(sel, probe, known_flex)
        if g:
            row, col, column, wrap, is_flex, has_display = g
            if is_flex:
                flex_rules.append((at_stack, sel, row, col, column, wrap))
                last_gap[key] = (row, col)
                last_shape[key] = (column, wrap)
            elif not has_display:
                orphan_gap.append(key[:60])
            continue
        fd = re.search(r"flex-direction\s*:\s*([\w-]+)", probe)
        fw = re.search(r"flex-wrap\s*:\s*([\w-]+)", probe)
        if not (fd or fw) or key not in last_gap or key not in known_flex:
            continue
        base_col, base_wrap = last_shape.get(key, (False, False))
        column = bool(fd and "column" in fd.group(1)) if fd else base_col
        wrap = (fw.group(1).strip() == "wrap") if fw else base_wrap
        if (column, wrap) == (base_col, base_wrap):
            continue                     # says nothing the base rule did not
        row, col = last_gap[key]
        flex_rules.append((at_stack, sel, row, col, column, wrap))
        last_shape[key] = (column, wrap)
        n_shape += 1
    return flex_rules, orphan_gap, n_shape


_PX = re.compile(r"-?[\d.]+px")
_SIDES = ("-top", "-right", "-bottom", "-left")


def _four(val: str) -> list:
    p = val.strip().split()
    if len(p) == 1:
        return [p[0]] * 4
    if len(p) == 2:
        return [p[0], p[1], p[0], p[1]]
    if len(p) == 3:
        return [p[0], p[1], p[2], p[1]]
    return p[:4]


def box_facts(blocks, blank) -> dict:
    """What the stylesheet says about each selector's OWN box.  The wrap
    compensation below has exactly two questions to ask of it: how much padding
    and margin the box already carries on the edge being compensated, and
    whether the box PAINTS that edge — because the negative-margin trick leaves
    the painted box `gap` px taller than the space it occupies, and on something
    like .topbar (background + border-bottom + sticky) that would drag the bar's
    bottom edge down over the first rows of the page."""
    f = {}
    for _at, sel, b0, b1 in blocks:
        seg = blank[b0:b1]
        paints = set()
        if re.search(r"(?<![\w-])background(?:-color|-image)?\s*:", seg):
            paints.add("background")
        # any border but border-top: the left/right ones run the full height of
        # the box, so they lengthen with it exactly as border-bottom moves
        if re.search(r"(?<![\w-])border(?:-(?:bottom|left|right|width|style|color))?\s*:", seg):
            paints.add("border")
        if re.search(r"(?<![\w-])box-shadow\s*:", seg):
            paints.add("box-shadow")
        if re.search(r"(?<![\w-])position\s*:\s*(?:sticky|fixed|absolute)", seg):
            paints.add("out-of-flow")
        got = {}
        for m in re.finditer(r"(?<![\w-])(padding|margin)(-top|-right|-bottom|-left)?\s*:"
                             r"\s*([^;}]+)", seg):
            prop, side, val = m.group(1), m.group(2), m.group(3).strip()
            if side:
                got[prop + side] = val
            else:
                for s, v in zip(_SIDES, _four(val)):
                    got[prop + s] = v
        for part in sel.split(","):
            s = part.strip()
            if not s:
                continue
            e = f.setdefault(s, {"paints": set(), "decl": {}})
            e["paints"] |= paints
            for k, v in got.items():
                e["decl"].setdefault(k, set()).add(v)
    return f


def _resolve_px(entry, prop):
    """(value_in_px, usable).  `usable` is False when the stylesheet says
    something the generator must not average over — several DIFFERENT values for
    the same property (a @media override it cannot see from here), or a value
    that is not a plain px length (var(), %, calc()).  Absent means the initial
    value, which for padding and margin is 0 and is perfectly usable."""
    vals = entry["decl"].get(prop) if entry else None
    if not vals:
        return 0.0, True
    if len(vals) != 1:
        return 0.0, False
    v = next(iter(vals)).strip()
    return (float(v[:-2]), True) if re.fullmatch(_PX, v) else (0.0, False)


def _len(x: float) -> str:
    return "0" if abs(x) < 1e-9 else f"{x:g}px"


def _wrap_compensation(entry, side: str, amount: float):
    """A WRAPPING flex container takes its gap from a margin on EVERY child —
    the last line included — so the box comes out `amount` px bigger than the
    gap geometry it is imitating.  Measured on the shipped file: .topbar is
    106px with row-gap:8px and 114px with the fallback.

    Two ways to give it back, and the first one is exact and free:

      · PADDING.  Take `amount` off the container's own padding on that edge.
        The visible distance from the last line to the padding edge is then
        (child margin) + (padding − amount) = the original padding, whether the
        container wrapped or not.  Nothing outside the box moves at all.
      · NEGATIVE MARGIN — the standard trick, and the one the vertical axis can
        fall back on.  A block's HEIGHT is content-driven, so the children's
        margin really did make the box taller and `margin-bottom: -amount` gives
        the space back to the flow.  Its cost is that the box still PAINTS
        `amount` px taller, so it is only offered to a container that paints
        nothing on that edge.

    The horizontal axis gets no negative-margin rung, and that is not an
    oversight: a block's WIDTH comes from its parent, not from its content, so
    the trailing margin never widened the box — it only ate `amount` px INTO the
    line.  `margin-right: -amount` would not give anything back; it would make
    the box genuinely wider and hang it over the parent's padding.

    Returns (container declarations, how, residual px)."""
    pad, pad_ok = _resolve_px(entry, "padding-" + side)
    take = min(pad, amount) if pad_ok else 0.0
    decl, how = {}, []
    if take > 0:
        decl["padding-" + side] = _len(pad - take)
        how.append("padding")
    left = amount - take
    if left <= 1e-9:
        return decl, "+".join(how), 0.0
    if side == "bottom" and not entry["paints"]:
        mar, mar_ok = _resolve_px(entry, "margin-bottom")
        if mar_ok:
            decl["margin-bottom"] = _len(mar - left)
            how.append("negative margin")
            return decl, "+".join(how), 0.0
    return decl, "+".join(how), left


def _uncompensated(entry, prop: str) -> str:
    """What a container property is worth when it is compensating NOTHING: the
    box's own declared value, which for an absent padding or margin is 0.

    This is the value a compensation has to be RESTATED as in an at-context
    whose shape no longer puts a margin on the last child — `padding-bottom`
    back to the padding the stylesheet wrote, `margin-bottom` back to 0.

    A property only ever reaches here because _wrap_compensation set it, and
    that function sets one only when _resolve_px called it usable, so the
    `not ok` branch is unreachable.  It is a tripwire, not a fallback: if some
    future stylesheet makes it reachable, the build must stop rather than
    invent a number for a box it cannot read."""
    v, ok = _resolve_px(entry, prop)
    if not ok:
        fail(f"flex-gap fallback: the compensation set {prop} on a box whose "
             f"own {prop} the generator cannot read, so it cannot be restated "
             f"where the shape flips")
    return _len(v)


def flexgap_sheet(flex_rules, boxes, where: str) -> tuple:
    """THE GENERATED FLEX-GAP SHEET.  Firefox grew `gap` on flex containers in
    63; below that the spacing collapses to nothing.  These rules restore it
    with margins, behind `html.no-flexgap` — a class the capability guard sets
    ONLY when its live feature test says flex gap is missing, so on Fx63+ (and
    on the photographed Fx72) not one of them can ever match.

    `flex_rules` arrives in SOURCE order: a @media override has to be emitted
    after the base rule it is meant to beat.

    THREE THINGS THE FF32 VERIFY FOUND HERE, all fixed (Round 24):
      · the sheet emitted three selectors TWICE.  All three were the same
        shape — a base rule plus a later rule for the same selector.  A repeat
        in the SAME at-context is now dropped outright, because the earlier
        rule is simply unreachable (.topbar said the identical thing twice;
        .sch-pnode would have said `margin-left:5px` and then `margin-left:0`).
        Where the repeat is REAL — a @media that flips .fc-vrow from row to
        column — CSS needs both rules, so both are still emitted: what changed
        is what the second one says.
      · it said too much.  The second rule used to zero ALL FOUR margins, so
        `.fc-vrow > * + *` and `.sch-avcls > * + *` came out carrying
        `margin-right:0;margin-bottom:0` — margins this generator had never set
        and the original gap had never touched, sitting there ready to flatten a
        legitimate margin on some future child.  It now cancels exactly the
        properties IT set for that selector and this rule does not, which for a
        row→column flip is the one `margin-left`.
      · it grew the box.  See _wrap_compensation.

    AND THE ONE THING THE FF32 VERIFY LEFT BEHIND (Round 24b).  Those three
    fixes taught the CHILD rules to follow a shape flip into its @media; the
    CONTAINER rules stayed where they were written.  `.fc-bar` wraps at the top
    level and paints nothing, so it got `margin-bottom:-14px`; at 740px the
    stylesheet flips it to a column, the pass above duly zeroes the children's
    `margin-bottom` — and the container's -14px went on applying, compensating
    nothing.  Measured at 560px with the fallback forced, the 12px `.fc-view`'s
    own gap puts between `.fc-bar` and `.fc-l0` came out as a 2px OVERLAP.
    The compensation now TRAVELS WITH THE SHAPE: see the container block."""
    # TWO GROUPS, and the order between them is a decision, not a formatting
    # choice.  A wrapping container can itself be a child of another wrapping
    # container — `.viewtabs` sits inside `.topbar`, and below 900px BOTH wrap —
    # and then two generated rules of EQUAL specificity want the same element's
    # `margin-bottom`: the parent's `> *` gap, and the child's own compensation.
    # CSS cannot add them, so one has to win, and measurement settles which:
    # with the compensation winning the topbar came out 8px SHORT at 560px (the
    # parent's row gap simply vanished, two rows touching); with the parent's
    # gap winning it comes out 6px TALL (every gap present, one of them
    # generous).  A gap that is there and slightly large beats a gap that is
    # gone, so every CONTAINER rule is emitted before every CHILD rule and the
    # parent wins on source order.  Compensation paid out of `padding` is not
    # in this fight at all — a different property — which is why .topbar, the
    # one that was actually measured wrong, stays exact.
    out, cont_out, notes = [], [], []
    how_n = {}          # how the compensation was paid → count
    resid = {"bottom": [], "right": []}
    carried = []        # compensations restated where the shape flipped
    emitted = {}        # selector → (ctx, tail, {prop: value}, index in `out`)
    comped = {}         # selector → (decls, index in `cont_out`, ctx)
    owned = {}          # selector → {prop: last value emitted for the container}
    for at_stack, sel, row, col, column, wrap in flex_rules:
        key = sel.strip()
        ctx = tuple(at_stack)

        def wrap_rule(text):
            for at in reversed(at_stack):
                text = at + "{" + text + "}"
            return text

        # ── the child rule: ONLY the axis this gap actually governs ──
        decl, cont = {}, {}
        if column:
            tail = "> * + *"
            if not _zero_len(row):
                decl["margin-top"] = row
        elif wrap:
            tail = "> *"
            if not _zero_len(col):
                decl["margin-right"] = col
            if not _zero_len(row):
                decl["margin-bottom"] = row
        else:
            tail = "> * + *"
            if not _zero_len(col):
                decl["margin-left"] = col
        # ── the container rule: give back what the last line/column took ──
        # The question is asked of EVERY shape, not just of `wrap`, and it is
        # asked of the child rule that was just built rather than of the flags:
        # only the wrapping tail `> *` puts a margin on the LAST child as well,
        # so only that tail leaves the container bigger than the gap geometry
        # it is imitating.  A column or a plain row answers "nothing" — and
        # that answer is not a no-op, it is exactly what a later at-context has
        # to HEAR when the base context said -14px.
        entry = boxes.get(key) or {"paints": set(), "decl": {}}
        for side, amount in (("bottom", row if tail == "> *"
                              and "margin-bottom" in decl else None),
                             ("right", col if tail == "> *"
                              and "margin-right" in decl else None)):
            if amount is None:
                continue
            px = float(amount[:-2]) if re.fullmatch(_PX, amount.strip()) else None
            if px is None:
                resid[side].append(f"{key} ({amount} is not a px length)")
                continue
            d, how, residual = _wrap_compensation(entry, side, px)
            cont.update(d)
            how_n[how or "nothing to take it from"] = \
                how_n.get(how or "nothing to take it from", 0) + 1
            if residual > 1e-9:
                resid[side].append(f"{key} +{_len(residual)}")
        # ── SUPERSEDE, or cancel, but never both ──────────────────────────
        # Two rules for one selector in the SAME at-context is not an override,
        # it is a replacement: whatever the earlier one said is unreachable, and
        # emitting `margin-left:5px` on one line and `margin-left:0` on the next
        # is exactly the noise this round exists to remove.  (`.sch-pnode`
        # declares `gap: 5px` at line 1167 and a bare `flex-wrap: wrap` at 1202,
        # both top-level.)  So the earlier rule is REMOVED from the sheet.
        # A DIFFERENT context is a genuine override — a @media that flips
        # `.fc-vrow` from row to column — and there CSS needs both rules, so the
        # old one is cancelled where it stands, in the properties this generator
        # set and this rule does not.
        prev_ctx, prev_tail, prev, prev_ix = emitted.get(key, (ctx, tail, {}, None))
        if prev and prev_ctx == ctx:
            if prev_ix is not None:
                out[prev_ix] = None                  # unreachable — drop it
            prev = {}
        elif prev_tail != tail:
            # the shape changed (row ⇄ wrap) in a NEW context: the old rule's
            # selector no longer matches the same children, so it is cancelled
            if prev:
                out.append(wrap_rule(_prefix_selector(sel, prev_tail) + "{"
                                     + ";".join(f"{k}:0" for k in prev) + "}"))
            prev = {}
        else:
            for k in prev:
                if k not in decl:
                    decl[k] = "0"
        if decl and decl != prev:
            out.append(wrap_rule(_prefix_selector(sel, tail) + "{"
                                 + ";".join(f"{k}:{v}" for k, v in decl.items()) + "}"))
            emitted[key] = (ctx, tail, {k: v for k, v in decl.items() if v != "0"},
                            len(out) - 1)
        # ── THE COMPENSATION TRAVELS WITH THE SHAPE ────────────────────────
        # A compensation is only ever correct for the shape that caused it, so
        # the container rules follow a shape flip into its @media exactly as
        # the child rules just did.  The rule is: EVERY at-context in which
        # this generator emits a container rule states the FULL set of
        # properties it has ever set on that container — with what the new
        # shape needs (`cont`, computed above by the same padding-first rung)
        # or, where the new shape needs nothing, with the box's own
        # uncompensated value.  Stating all of them is what makes it airtight
        # for contexts that are not nested: whichever @media happens to match,
        # the last matching rule settles every compensated property outright,
        # so nothing from an earlier context can survive into a shape it was
        # never computed for.  A property first compensated in a LATER context
        # is untouched in the earlier ones by construction, which is exactly
        # right, so it does not have to be back-stated.
        own = owned.setdefault(key, {})
        prev_cont, prev_cix, prev_cctx = comped.get(key, ({}, None, None))
        if prev_cont and prev_cctx == ctx:
            if prev_cix is not None:
                cont_out[prev_cix] = None            # same context: replaced
            prev_cont = {}
        for k in own:
            if k not in cont:
                cont[k] = _uncompensated(entry, k)
                if cont[k] != own[k]:
                    carried.append(f"{key} → {' '.join(at_stack) or 'top level'} "
                                   f"({k}:{own[k]} → {cont[k]})")
        if cont and cont != prev_cont:
            cont_out.append(wrap_rule(_prefix_selector(sel, "") + "{"
                                      + ";".join(f"{k}:{v}" for k, v in cont.items()) + "}"))
            comped[key] = (dict(cont), len(cont_out) - 1, ctx)
            own.update(cont)
    out = [r for r in cont_out if r] + [r for r in out if r]
    notes.append(f"{where}: flex-gap fallback — {len(flex_rules)} gap rules → "
                 f"{len(out)} generated rules ({len(cont_out)} of them the wrap "
                 f"compensation, emitted first) behind html.no-flexgap")
    if how_n:
        notes.append(f"{where}: wrap compensation — "
                     + ", ".join(f"{v}× {k}" for k, v in sorted(how_n.items())))
    if carried:
        notes.append(f"{where}: container compensation restated in "
                     f"{len(carried)} shape-flip context(s) — "
                     + ", ".join(carried))
    if resid["bottom"]:
        notes.append(f"{where}: still {len(resid['bottom'])} wrapping container(s) "
                     f"taller than the gap geometry — {', '.join(resid['bottom'])}")
    if resid["right"]:
        # NOT container growth: a block's width comes from its parent, so the
        # trailing margin only eats into the LINE. Reported because the last
        # item of each line sits that many px short of the padding edge.
        notes.append(f"{where}: {len(resid['right'])} wrapping container(s) keep a "
                     f"gap-sized margin after the last item of each line (the box "
                     f"itself does not grow)")
    return out, notes


def _zero_len(v: str) -> bool:
    return v.strip() in ("0", "0px", "0em", "0rem", "normal", "")


def patch_css(css: str) -> tuple:
    """Returns (patched_css, notes). Every rewrite is mechanical and reversible;
    nothing changes what a MODERN browser renders (each fallback is emitted
    BEFORE the modern declaration, or behind html.no-flexgap)."""
    notes = []

    # ── 0. ΤΟ ΟΝΟΜΑ ΑΡΧΕΙΟΥ ΠΟΥ ΔΕΝ ΤΑΞΙΔΕΥΕΙ (18/10/2026) ────────────────
    #    Τα σχόλια της CSS ΕΠΙΒΙΩΝΟΥΝ στο παραδοτέο — σχόλια πετά μόνο ο Babel,
    #    και μόνο της JavaScript. Δύο σχόλια του stylesheet ονομάτιζαν ρητά το
    #    `app/schedbridge.js`, δηλαδή το module που ο γύρος αυτός έκοψε: το
    #    αρχείο κουβαλούσε την ΑΠΟΔΕΙΞΗ ότι του λείπει κάτι, που είναι ακριβώς
    #    ο λόγος που έφυγε και το «advInit».
    #    ΤΙ ΔΕΝ ΓΙΝΕΤΑΙ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ: οι ~45 κανόνες `.brg-*` ΜΕΝΟΥΝ. Είναι
    #    στυλ για στοιχεία που δεν υπάρχουν — νεκρά bytes, μηδενική διαδρομή
    #    αποτυχίας — ενώ η αφαίρεσή τους θα κούναγε τους μετρητές του
    #    `gap:`/flex-gap και θα ξανάγραφε το παραγόμενο φύλλο no-flexgap για
    #    κανένα κέρδος. Το μικρότερο ρίσκο κερδίζει.
    css = sub1(r"app/schedbridge\.js", lambda m: "a Scheduler module that does not "
               "travel to the unit", css,
               "the Bridge module named in a stylesheet comment", count=2)

    # ── 1. :focus-visible (Fx85) → :focus. On the floor the unknown
    #       pseudo-class would invalidate the WHOLE rule; :focus is the
    #       graceful export behaviour. Count is reported, not asserted: the
    #       rewrite is total, so a new focus ring cannot slip past it.
    css, n_fv = re.subn(r":focus-visible", ":focus", css)
    notes.append(f":focus-visible → :focus ×{n_fv}")

    # ── 2. :has() rules (Fx121) — the rule would be dropped silently anyway;
    #       strip it explicitly so the gate stays clean.
    def drop_has(m):
        # the replacement text must not itself contain the forbidden token —
        # the CSS gate scans the FINAL stylesheet, comments included.
        return "/* [offline] has-selector rule dropped for the floor */\n"
    css, n_has = re.subn(r"[^{}\n]*:has\([^)]*\)[^{}]*\{[^}]*\}\n?", drop_has, css)
    notes.append(f":has() rules dropped ×{n_has}")

    # ── 3. per-declaration fallbacks inside every innermost rule block ──
    #       DETECTION reads a comment-blanked copy (same offsets) so that a rule
    #       commented out, or a comment that talks about gap, cannot be mistaken
    #       for a declaration; the SUBSTITUTIONS rewrite the real body.
    blocks = _leaf_blocks(css)
    blank = _blank_comments(css)
    # every selector any rule declares display:flex on — so that a MEDIA-QUERY
    # OVERRIDE (`@media … { .fc-vrow { flex-direction: column; gap: 4px } }`),
    # which carries the gap but not the display, is still recognised.
    known_flex = set()
    for _at, _sel, _b0, _b1 in blocks:
        if re.search(r"display\s*:\s*(inline-)?flex", blank[_b0:_b1]):
            for part in _sel.split(","):
                known_flex.add(part.strip())
    boxes = box_facts(blocks, blank)

    # 3a. COLLECT, forward, in source order: a @media override has to be emitted
    #     after the base rule it is meant to beat.
    flex_rules, orphan_gap, n_shape = collect_flex_rules(blocks, blank, known_flex)

    # 3b. PATCH, backwards, so the string offsets stay valid while css is
    #     rewritten under the loop.
    tot = {}
    for _at, _sel, b0, b1 in reversed(blocks):
        body = css[b0:b1]
        new, n = patch_decls(body)
        for k, v in n.items():
            tot[k] = tot.get(k, 0) + v
        if new != body:
            css = css[:b0] + new + css[b1:]

    notes.append(f"gap → grid-gap longhand ×{tot.get('gap', 0)}")
    notes.append(f"inset: → four longhands ×{tot.get('inset', 0)}")
    notes.append(f"break-inside → page-break-inside first ×{tot.get('break', 0)}")
    notes.append(f"min()/max()/clamp() same-property fallback ×{tot.get('minmax', 0)}")
    notes.append(f"overflow-wrap → word-wrap first ×{tot.get('ow', 0)}")

    # ── 4. THE GENERATED FLEX-GAP SHEET (see flexgap_sheet) ───────────────
    out = ["\n/* ══════════════════════════════════════════════════════════════",
           " * GENERATED BY tools/build_offline.py — flex-gap fallback",
           " * Firefox grew `gap` on FLEX containers in 63; `grid-gap` (emitted",
           " * above next to every gap) covers GRID as far back as 52. These",
           " * rules restore the flex spacing with margins and are switched on",
           " * only by the capability guard's live test (html.no-flexgap).",
           " * A WRAPPING container also gets a rule of its own: the margin has",
           " * to go on every child, last line included, so the box is handed",
           " * the difference back out of its own padding (exact) or, when it",
           " * paints nothing on that edge, out of a negative margin.",
           " * ══════════════════════════════════════════════════════════════ */"]
    rules, gen_notes = flexgap_sheet(flex_rules, boxes, "styles.css")
    out += rules
    notes += gen_notes
    if n_shape:
        notes.append(f"styles.css: {n_shape} rule(s) flip a container's shape "
                     f"(flex-wrap/flex-direction) without restating its gap — the "
                     f"fallback follows them into their own @media")
    if orphan_gap:
        notes.append("gap without display: in the same rule (grid-gap only, "
                     f"no flex fallback): {', '.join(orphan_gap)}")

    return css + "\n".join(out) + "\n" + NO_GRID_CSS, notes


# ── THE NO-GRID SHEET ────────────────────────────────────────────────────
# CSS Grid is Firefox 52 — twenty releases above the ruled floor. Eleven
# containers in app/styles.css are grids. On Fx32 `display: grid` is an unknown
# value, so it is dropped and the container becomes a plain block: four panels
# that should sit side by side stack into one tall column, and the flowchart
# loses its side sheet. Nothing throws; it just looks wrong, which is the worst
# kind of wrong to send to a closed network.
#
# THE JUDGEMENT (recorded here because it is the only hand-written CSS in the
# build): the grid declarations STAY EXACTLY AS THEY ARE. Round 23 must not
# change one pixel of what a modern browser draws, and app/styles.css is shared
# with the hosted app, so nothing was touched there either. The fallback below
# is generated into the export only, behind `html.no-grid` — a class the
# capability guard sets ONLY after CSS.supports("display","grid") answers no.
# On Fx52+, and on the photographed Fx72, not one of these rules can match.
#
# Flexbox is Firefox 28, four releases below the floor, so every rule here is
# safe. Percentage widths with margins reproduce the fractional columns; the
# ×2 wrapping grids become `flex-wrap: wrap` with a calc() basis (calc is Fx16).
# The tripwire in gate_scan_grid() asserts that every selector declaring
# display:grid appears somewhere in this text, so a new grid layout stops the
# build instead of quietly shipping a broken column.
NO_GRID_CSS = r"""
/* ══════════════════════════════════════════════════════════════
 * GENERATED BY tools/build_offline.py — CSS Grid fallback (Fx52)
 * and the <details> fallback (Fx49). Both are switched on only by
 * the capability guard's live tests, so a browser that has the
 * feature never matches a single rule below.
 * ══════════════════════════════════════════════════════════════ */
/* NO-GRID SHEET BEGIN */
/* EVERY multi-column rule below is `flex-wrap: wrap` with a flex-BASIS rather
   than a fixed width, and that is the whole trick: the original grids change
   their column count at 1100px and 640px through media queries, and a fallback
   built on fixed widths would have to restate all of them — get one wrong and
   the panels squeeze instead of wrapping. (They did: the first version of this
   sheet put four fixed columns in a 321px pane and every panel came out 30px
   wide.) A wrapping basis reproduces the same three shapes — four columns,
   then two, then one — from the container width alone, with no breakpoint to
   keep in step. `min-width:0` is what lets a long word wrap instead of
   forcing the row wider, which is the job `minmax(0, 1fr)` does in the grid. */
/* The three .layout grids are addressed BY PANEL ID, not by :nth-child.
   remarksearch.js injects .rs-panel as the FIRST child of #view-remarks at
   run time, so :nth-child(1..4) silently addressed the wrong four boxes — the
   230px column landed on the 300px panel and so on. Every panel in
   app/index.html carries a stable id; ids cannot be knocked out of step by a
   module that injects a sibling.
   `flex: 0 1 <track>` for the fixed columns and `flex: 1 1 <min>` for the
   `1fr` one reproduces the grid almost to the pixel: the fixed panels keep
   their basis and the last one absorbs the remainder, which is exactly what
   `230px 300px 250px 1fr` does. */
html.no-grid .layout,html.no-grid .req-layout,html.no-grid .desc-layout{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-align-items:flex-start;align-items:flex-start;margin-left:-7px;margin-right:-7px}
html.no-grid .layout > *{margin:0 7px 14px;min-width:0;max-width:100%}
/* `grid-column: 1 / -1` — a child that spans every column. In a wrapping flex
   row the equivalent is a 100% basis, which forces its own line. .rs-panel is
   the global search panel and its rule lives in remarksearch.js, not in
   styles.css, which is why the tripwire reads the emitted scripts too. */
html.no-grid .rs-panel{-webkit-flex:1 1 100%;flex:1 1 100%;width:auto}

/* Remarks — 230px 300px 250px 1fr */
html.no-grid #panel-category{-webkit-flex:0 1 230px;flex:0 1 230px}
html.no-grid #panel-item{-webkit-flex:0 1 300px;flex:0 1 300px}
html.no-grid #panel-codes{-webkit-flex:0 1 250px;flex:0 1 250px}
html.no-grid #panel-results{-webkit-flex:1 1 300px;flex:1 1 300px}

/* Requirements — 260px 1fr */
html.no-grid #panel-req-domains{-webkit-flex:0 1 260px;flex:0 1 260px}
html.no-grid #panel-req-list{-webkit-flex:1 1 320px;flex:1 1 320px}

/* Description — 215px 275px minmax(0,1fr), and the output panel spans the row
   at EVERY width (its grid-column: 1 / -1 sits outside any media query) */
html.no-grid #panel-desc-cat{-webkit-flex:0 1 215px;flex:0 1 215px}
html.no-grid #panel-desc-sortie{-webkit-flex:0 1 275px;flex:0 1 275px}
html.no-grid #panel-desc-build{-webkit-flex:1 1 300px;flex:1 1 300px}
html.no-grid #panel-desc-out{-webkit-flex:1 1 100%;flex:1 1 100%}

/* the app's own two breakpoints, mirrored: at 1100 the grids drop to two
   columns and .panel.wide starts spanning; at 640 they drop to one. */
@media (max-width:1100px){
  html.no-grid #panel-category,html.no-grid #panel-item,html.no-grid #panel-codes,
  html.no-grid #panel-desc-cat,html.no-grid #panel-desc-sortie{-webkit-flex:1 1 40%;flex:1 1 40%}
  html.no-grid #panel-results,html.no-grid #panel-desc-build,
  html.no-grid .layout > .panel.wide{-webkit-flex:1 1 100%;flex:1 1 100%}
}
@media (max-width:640px){
  /* the ids are repeated here on purpose: an id beats `.layout > .panel`
     whatever the source order, so a class-only rule never reached the two
     panels the 1100 block had already pinned to 40%. */
  html.no-grid .layout > .panel,
  html.no-grid #panel-category,html.no-grid #panel-item,html.no-grid #panel-codes,
  html.no-grid #panel-results,html.no-grid #panel-req-domains,html.no-grid #panel-req-list,
  html.no-grid #panel-desc-cat,html.no-grid #panel-desc-sortie,
  html.no-grid #panel-desc-build,html.no-grid #panel-desc-out{-webkit-flex:1 1 100%;flex:1 1 100%}
}

html.no-grid .cat-grid{display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column}
html.no-grid .cat-grid > * + *{margin-top:8px}

html.no-grid .fc-vitals{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin:0 -5px}
html.no-grid .fc-vitals > *{-webkit-flex:1 1 160px;flex:1 1 160px;margin:0 5px 10px;min-width:0}

html.no-grid .fc-tracks{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin:0 -6px}
html.no-grid .fc-tracks > *{-webkit-flex:1 1 238px;flex:1 1 238px;margin:0 6px 12px;min-width:0}

html.no-grid .fc-vitals-grid{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin-top:8px;margin-right:-10px}
html.no-grid .fc-vitals-grid > *{-webkit-flex:1 1 110px;flex:1 1 110px;min-width:0;margin:0 10px 4px 0}

html.no-grid .thm-grid{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin-right:-8px}
html.no-grid .thm-grid > *{-webkit-flex:1 1 130px;flex:1 1 130px;min-width:0;margin:0 8px 8px 0}

html.no-grid .sch-grid2{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;-webkit-align-items:flex-start;align-items:flex-start;margin-right:-12px}
html.no-grid .sch-grid2 > *{min-width:0;max-width:100%;margin:0 12px 12px 0}
html.no-grid .sch-grid2 > *:nth-child(1){-webkit-flex:115 1 340px;flex:115 1 340px}
html.no-grid .sch-grid2 > *:nth-child(2){-webkit-flex:100 1 300px;flex:100 1 300px}

/* the poster is a SCROLLING board, not a wrapping one — seven fixed-width
   columns and an overflow:auto container. nowrap is the faithful shape here. */
html.no-grid .fc-poster{display:-webkit-flex;display:flex;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;-webkit-align-items:flex-start;align-items:flex-start}
html.no-grid .fc-poster > *{-webkit-flex:1 0 190px;flex:1 0 190px;margin-right:12px}
html.no-grid .fc-poster > *:last-child{margin-right:0}

/* .fc-l1 is the one genuinely two-dimensional layout (a full-width track bar,
   a full-width filter row, then a rail with an optional side sheet). Rather
   than fake two dimensions with wrapping — where align-content would hand the
   two header rows the same share of the leftover height as the rail — it takes
   the app's OWN narrow-screen shape, which is already written, already tested
   and already the layout this app shows below 1040px: one column, and the
   detail sheet docked to the bottom of the window. A deliberate, named
   degradation rather than an approximation that would look almost right. */
html.no-grid .fc-l1{display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;min-height:0}
html.no-grid .fc-l1 > * + *{margin-top:10px}
html.no-grid .fc-trackbar,html.no-grid .fc-filters{-webkit-flex:0 0 auto;flex:0 0 auto}
html.no-grid .fc-rail-scroll{-webkit-flex:1 1 auto;flex:1 1 auto;min-height:0}
html.no-grid .fc-detail{position:fixed;left:0;right:0;bottom:0;max-height:58vh;border-radius:12px 12px 0 0;z-index:30;box-shadow:0 -14px 44px var(--shadow);margin-top:0}
/* ROUND E (2026-10-17) — the Board decision-trees counter strip. The original is
   `repeat(auto-fill, minmax(300px, 1fr))` with a 6px gap, so the fallback is the
   same wrapping-basis trick as .fc-tracks: basis 300px and the gap reproduced by
   negative margins on the container. The quality gate caught this one BEFORE the
   unit ever saw it — a grid with no fallback lays out as a single stacked column
   on Firefox 32 and the counters would have read as one long list. */
html.no-grid .bt-ctrs{display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;margin:0 -3px}
html.no-grid .bt-ctrs > *{-webkit-flex:1 1 300px;flex:1 1 300px;margin:0 3px 6px;min-width:0}
/* NO-GRID SHEET END */

/* <details> — Firefox 49. The guard sets html.no-details only when the element
   has no `open` property; the shim block's delegated click handler flips the
   attribute this rule reads. */
html.no-details details > *{display:none}
html.no-details details > summary{display:list-item;cursor:pointer;list-style:none}
html.no-details details[open] > *{display:block}
html.no-details details[open] > summary{display:list-item}
html.no-details details > summary:before{content:"\25B8\00a0"}
html.no-details details[open] > summary:before{content:"\25BE\00a0"}
"""


# ────────────────────────────────────────────────────────────────────
# 3. Data bundle
# ────────────────────────────────────────────────────────────────────

# THE EMPTY STORE (28/08/2026 order). The app seeds itself from
# ../data/scheduler/seed.json on the very first open. The repo's seed is the
# PUBLIC placeholder roster; even that does not travel. The export ships `{}`:
# every collection comes up empty and is persisted empty, so the store is
# genuinely seeded (no seedError banner, ↺ Reset returns to empty) and the unit
# loads its own data on site through Scheduler → «⋯» → ⭱ Import.
EMPTY_SEED = {}


def collect_data() -> dict:
    files = [
        DATA / "observations" / "master_index.json",   # app.js + remarksearch.js
        DATA / "minimums.json",                        # mifchart.js
        DATA / "manifest.json",                        # mifchart.js (source-jump)
        DATA / "descriptions.json",                    # description.js — the grammar
        DATA / "sections.json",                        # description.js — MISSION/OBJECTIVE
        DATA / "areas.json",                           # description.js — working areas
        DATA / "routes.json",                          # description.js — CPM routes
        DATA / "ep_list.json",                         # description.js — the 71 EPs
        DATA / "flowchart2.json",                      # description/flowchart/scheduler/schedval
    ]
    files += sorted((DATA / "observations2").rglob("*.json"))   # item remarks (v2)
    files += sorted((DATA / "criteria").glob("*.json"))         # Info modal
    files += sorted((DATA / "mif").glob("*.json"))              # MIF progression
    files += sorted((DATA / "requirements").glob("*.json"))     # req view + currency catalog
    bundle = {}
    for f in files:
        if not f.is_file():
            fail(f"missing data file: {f}")
        rel = f.relative_to(ROOT).as_posix()
        try:
            bundle[rel] = json.loads(read_text(f))
        except json.JSONDecodeError as e:
            fail(f"{rel}: invalid JSON ({e})")
    master = bundle["data/observations/master_index.json"]
    v1_only = [it["item_id"] for c in master["categories"].values()
               for it in c["items"] if not it.get("v2_file")]
    if v1_only:
        fail(f"master_index items without v2_file (v1 files are not bundled): {v1_only}")

    # the store's seed — bundled EMPTY on purpose (see EMPTY_SEED above)
    real_seed = DATA / "scheduler" / "seed.json"
    if not real_seed.is_file():
        fail(f"missing data file: {real_seed} (the repo seed must exist even though "
             f"the export ships an empty one — its absence means the layout changed)")
    bundle["data/scheduler/seed.json"] = EMPTY_SEED
    return bundle


# 18/10/2026 — ΑΠΟΦΑΝΣΗ: «το export να πάρει δικές του παρατηρήσεις και
# περιγραφές».  Ο builder ΠΑΝΤΑ διάβαζε τα σημερινά αρχεία από τον δίσκο (η
# collect_data από πάνω δεν έχει ούτε snapshot ούτε cache ούτε καρφωμένη τιμή),
# αλλά αυτό ήταν αόρατο: η μόνη αναφορά ήταν «N JSON files, X MB raw», που θα
# τύπωνε το ίδιο νούμερο και αν η τράπεζα είχε μισές παρατηρήσεις.  Από εδώ και
# πέρα η απογραφή τυπώνεται, για να φαίνεται σε κάθε build ΤΙ κουβαλά το αρχείο.
def data_census(bundle: dict) -> list:
    v2 = {k: v for k, v in bundle.items()
          if k.startswith("data/observations2/") and not k.endswith("/index.json")}
    modes = texts = 0
    for obj in v2.values():
        for m in obj.get("error_modes") or []:
            modes += 1
            for key in ("texts", "texts_at", "texts_above"):
                texts += len(m.get(key) or {})
    master = bundle["data/observations/master_index.json"]
    items = [it for c in master["categories"].values() for it in c["items"]]
    desc = bundle["data/descriptions.json"]
    # Σταυρωτός έλεγχος: κάθε item του master_index πρέπει να έχει το v2 αρχείο
    # του ΜΕΣΑ στο bundle. Ένα item που δείχνει σε αρχείο που δεν ταξίδεψε
    # εμφανίζεται στη Μοίρα ως καρτέλα που δεν ανοίγει ποτέ.
    missing = [it["item_id"] for it in items
               if f"data/observations2/{it['v2_file']}" not in bundle]
    if missing:
        fail(f"master_index points at v2 files that are not in the bundle: {missing}")
    return [
        f"observations : {len(v2)} item files, {modes} error modes, {texts} remark texts "
        f"(read from {DATA / 'observations2'} at build time)",
        f"index        : {len(master['categories'])} categories, {len(items)} items "
        f"— every one of them with its v2 file in the bundle",
        f"descriptions : {len(desc['templates'])} templates, {len(desc['sorties'])} sorties, "
        f"{len(desc['families'])} families, {len(desc['lists'])} pick-lists "
        f"(data/descriptions.json, round {desc.get('round', '?')}, "
        f"generated {desc.get('generated', '?')})",
    ]


def data_bundle_js(bundle: dict) -> str:
    parts = []
    for key, obj in bundle.items():
        blob = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        parts.append(f"{json.dumps(key)}:{blob}")
    js = "window.FDMS_DATA={\n" + ",\n".join(parts) + "\n};"
    # "</" only occurs inside JSON strings → "<\/" is identical JSON, HTML-safe.
    # "<!--" would open an HTML comment inside a classic script → "<\u0021--".
    return js.replace("</", "<\\/").replace("<!--", "<\\u0021--")


# ────────────────────────────────────────────────────────────────────
# 4. Builder-owned scripts
# ────────────────────────────────────────────────────────────────────

# ① THE CAPABILITY GUARD — the FIRST script in <head>.
#    Marker string for the gate: FDMS capability guard
#
#    WHAT CHANGED IN ROUND 23, AND IT CHANGED THE GUARD'S JOB.
#    Until now the guard was hand-written ES5 in a file that was otherwise
#    ES2017, and its first and most important probe was for SYNTAX: it asked,
#    via new Function(), whether the engine understood let/const/arrows/classes,
#    because if it did not, every other block in the file died at PARSE time and
#    the reader got a white page.
#
#    The whole file is now ES5. There is no syntax left to fail on: anything
#    that can parse this block can parse all of it. So the guard has stopped
#    guarding syntax and guards the RUNTIME FLOOR instead — the APIs Firefox 32
#    does have, which the rest of the file assumes and the shim block cannot
#    invent (you can polyfill Object.assign; you cannot polyfill localStorage).
#    It is still written in plain ES5 by hand, for the same reason as before:
#    it must be the one block that cannot possibly be the thing that broke.
CAPABILITY_GUARD_JS = r"""
/* FDMS capability guard — build_offline.py.
   The whole file is ES5 now, so this block no longer probes for SYNTAX: if it
   parses, everything parses. It probes the RUNTIME FLOOR — the handful of APIs
   that cannot be shimmed — and below it paints a plain-English banner naming
   exactly what is missing, instead of a white or half-drawn page.
   It also runs three live layout tests and sets the classes that switch on the
   generated fallback sheets: no-grid (Fx52), no-flexgap (Fx63), no-details
   (Fx49). On a browser that has those features, none of them is ever set. */
(function () {
  "use strict";
  var missing = [];
  function need(label, test) {
    var ok = false;
    try { ok = !!test(); } catch (e) { ok = false; }
    if (!ok) missing.push(label);
  }

  /* ── the floor: what no shim can provide ── */
  need("JSON", function () { return window.JSON && typeof JSON.parse === "function"; });
  need("querySelector / querySelectorAll",
    function () { return typeof document.querySelectorAll === "function"; });
  need("classList on elements",
    function () { return "classList" in document.createElement("div"); });
  need("addEventListener", function () { return typeof window.addEventListener === "function"; });
  need("Promise", function () { return typeof Promise === "function"; });
  need("Map and Set",
    function () { return typeof Map === "function" && typeof Set === "function" &&
                         typeof new Map().values === "function"; });
  need("Array.from (Firefox 32 or newer)",
    function () { return typeof Array.from === "function"; });
  need("localStorage (needed to keep the scheduler data on this computer)",
    function () { window.localStorage.setItem("p2r-probe", "1");
                  window.localStorage.removeItem("p2r-probe"); return true; });
  need("Blob and URL.createObjectURL (needed by Export)",
    function () { return typeof Blob === "function" && typeof URL !== "undefined" &&
                         typeof URL.createObjectURL === "function"; });
  need("FileReader (needed by Import)", function () { return typeof FileReader === "function"; });
  /* CSS custom properties (Firefox 31) — every colour in this page is one, so
     without them the screen is unreadable rather than merely plain. CSS.supports
     is itself Firefox 22; where it is missing, fall back to writing the property
     and reading it back, which is what the feature test would do anyway. */
  need("CSS custom properties (needed by every colour in this page)", function () {
    if (window.CSS && CSS.supports) {
      return CSS.supports("--a", "0") || CSS.supports("(--a: 0)");
    }
    var d = document.createElement("div");
    d.style.cssText = "--fdms-probe:1;color:var(--fdms-probe,#123456)";
    return d.style.color !== "";
  });

  /* ── warnings: real losses, but the page still works around them ── */
  var WARN = [];
  try {
    if (!(window.crypto && window.crypto.subtle)) {
      WARN.push("This browser has no Web Crypto (Firefox 34 and newer have it). " +
                "The editor code cannot be set, so the Scheduler stays view-only " +
                "and Import is unavailable — everything else on this page works.");
    }
  } catch (e) {}

  function shell(bg, fg, html, fixed) {
    var d = document.createElement("div");
    d.setAttribute("style",
      (fixed ? "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;padding:6vh 6vw;overflow:auto;"
             : "position:relative;padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.25);") +
      "background:" + bg + ";color:" + fg + ";" +
      "font:15px/1.6 Segoe UI,Tahoma,sans-serif");
    d.innerHTML = html;
    return d;
  }

  function banner() {
    var li = "", i;
    for (i = 0; i < missing.length; i++) {
      li += "<li style=\"margin:6px 0\">" + missing[i] + "</li>";
    }
    var d = shell("#0b1220", "#e6edf6",
      "<h1 style=\"font-size:22px;margin:0 0 10px\">Phase 2 FDMS cannot run in this browser</h1>" +
      "<p style=\"margin:0 0 14px;color:#9fb3c8\">This file was built for " +
      "<strong>Firefox 32 or newer</strong>. The browser that opened it is missing " +
      "the following, and the page would otherwise come up blank or half-drawn:</p>" +
      "<ul style=\"margin:0 0 18px 20px;padding:0\">" + li + "</ul>" +
      "<p style=\"margin:0;color:#9fb3c8\">Nothing is broken and no data was lost — " +
      "open the same file in a newer Firefox, or in Chrome or Edge, and it will work. " +
      "If none of those is available on this computer, hand this message to the IT " +
      "department: it names exactly what the browser lacks.</p>", true);
    if (document.body) {
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      document.body.appendChild(d);
    } else {
      document.addEventListener("DOMContentLoaded", banner);
    }
  }

  /* A warning is NOT a white page, so it must not take the screen. It is a
     strip above the app that says what is lost and can be closed. Losing the
     editor code silently would be worse: the unit would reach for Import and
     find no way in, with nothing on screen to explain why. */
  function strip() {
    var txt = "", i;
    for (i = 0; i < WARN.length; i++) txt += "<div>" + WARN[i] + "</div>";
    var d = shell("#3a2a12", "#f4e7d0",
      "<div style=\"font-size:13.5px;line-height:1.5\">" + txt + "</div>", false);
    var b = document.createElement("button");
    b.setAttribute("type", "button");
    b.setAttribute("style",
      "position:absolute;right:10px;top:8px;background:transparent;border:1px solid " +
      "currentColor;color:inherit;border-radius:999px;padding:1px 9px;cursor:pointer;font:inherit");
    b.appendChild(document.createTextNode("×"));
    b.onclick = function () { if (d.parentNode) d.parentNode.removeChild(d); };
    d.appendChild(b);
    if (document.body.firstChild) document.body.insertBefore(d, document.body.firstChild);
    else document.body.appendChild(d);
  }

  /* ── the three live layout probes ──────────────────────────────────────
     Each sets a class ONLY when the feature is genuinely absent, so on any
     browser that has it the generated fallback rules cannot match at all. */
  function mark(cls) { document.documentElement.className += " " + cls; }

  function gridTest() {
    /* CSS Grid — Firefox 52. CSS.supports answers this one honestly, and where
       CSS.supports itself is missing (below Fx22) the answer is no anyway. */
    try {
      var ok = !!(window.CSS && CSS.supports && CSS.supports("display", "grid"));
      if (!ok) mark("no-grid");
      return ok;
    } catch (e) { mark("no-grid"); return false; }
  }

  function flexGapTest() {
    /* flex `gap` — Firefox 63. A LIVE test, because no CSS.supports() query can
       tell flex gap from grid gap on the browsers in between. */
    try {
      var box = document.createElement("div");
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.rowGap = "1px";
      box.style.position = "absolute";
      box.style.visibility = "hidden";
      box.appendChild(document.createElement("div"));
      box.appendChild(document.createElement("div"));
      document.body.appendChild(box);
      var ok = box.scrollHeight === 1;
      box.parentNode.removeChild(box);
      if (!ok) mark("no-flexgap");
    } catch (e) { /* leave the modern path alone if the probe itself fails */ }
  }

  function detailsTest() {
    /* <details> — Firefox 49. Below it the element is an unknown inline box:
       the summary AND the body are both always visible, so the four collapsed
       source panels in this app open permanently and push everything down.
       The class turns on a CSS rule that hides the body, and the delegated
       click handler in the shim block does the toggling. */
    try {
      if (!("open" in document.createElement("details"))) mark("no-details");
    } catch (e) { mark("no-details"); }
  }

  function ready() {
    flexGapTest();
    if (WARN.length) { try { strip(); } catch (e) {} }
  }

  gridTest();
  detailsTest();

  if (missing.length) {
    banner();
    if (window.console && console.error) {
      console.error("[FDMS] below the browser floor — missing: " + missing.join(" · "));
    }
    return;
  }
  for (var w = 0; w < WARN.length; w++) {
    if (window.console && console.warn) console.warn("[FDMS] " + WARN[w]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
"""

# ② RUNTIME SHIMS — everything the floor lacks that this app (or the export's
#    own code) touches. Each installs ONLY when the API is missing, so a modern
#    browser keeps its native implementation.
#    Marker string for the gate: Fx52 runtime shims
RUNTIME_SHIMS_JS = r"""
"use strict";
/* FDMS runtime shims — prepended by tools/build_offline.py BEFORE every app
   script. Each installs ONLY when the API is missing, so a modern browser keeps
   every native implementation and this whole block is inert there. */
(function () {
  var def = function (obj, name, value) {
    try {
      Object.defineProperty(obj, name, { configurable: true, writable: true, value: value });
    } catch (e) { try { obj[name] = value; } catch (e2) {} }
  };

  /* ══════════════════════════════════════════════════════════════════════
     THE FIREFOX 32 BATCH (Round 23). Everything above is what Firefox 52
     lacked; this is the further twenty releases down to the ruled floor.
     ══════════════════════════════════════════════════════════════════════ */

  /* ── THE ITERATOR PROTOCOL, WITHOUT Symbol (Fx36) ──────────────────────
     This is the load-bearing shim of the whole round, and it is worth reading
     before touching.

     Babel compiles `for (var x of xs)` and `[...xs]` into helpers whose
     fallback chain is, in order:
         Symbol.iterator  →  the STRING key "@@iterator"  →  Array / String /
         Map / Set recognised by brand  →  array-like by .length
     Firefox 32 has no Symbol at all (it arrived in 36), so the "@@iterator"
     rung is the one this app stands on: it iterates and spreads Maps and Sets
     in roughly 250 places, and `[...map.values()]` reaches the helper as a
     Map Iterator, which the brand check does NOT recognise — it would throw
     "Invalid attempt to iterate non-iterable instance".

     So: install "@@iterator" on Map, on Set, and on the Map/Set/Array ITERATOR
     prototypes (the objects .keys()/.values()/.entries() actually return).
     NOT on Array.prototype or String.prototype — the helpers already handle
     those natively, by a faster path, and adding the key would divert every
     array loop through a closure for nothing.

     Installed non-enumerable, so it is invisible to Object.keys and for-in,
     and only when Symbol is genuinely absent. */
  var IT = "@@iterator";
  var selfIter = function () { return this; };
  if (typeof Symbol === "undefined" || !Symbol.iterator) {
    var put = function (proto) {
      try { if (proto && !proto[IT]) def(proto, IT, selfIter); } catch (e) {}
    };
    try { if (!Map.prototype[IT]) def(Map.prototype, IT, function () { return this.entries(); }); } catch (e) {}
    try { if (!Set.prototype[IT]) def(Set.prototype, IT, function () { return this.values(); }); } catch (e) {}
    try { put(Object.getPrototypeOf(new Map().keys())); } catch (e) {}
    try { put(Object.getPrototypeOf(new Set().values())); } catch (e) {}
    try { put(Object.getPrototypeOf([].keys())); } catch (e) {}
  }

  /* Array.from is Firefox 32 EXACTLY — the floor's own release, which is why
     the capability guard names it. It is also the function Babel's helpers call
     the moment they decide something is iterable, so it has to cope with a Map
     iterator on an engine with no Symbol. Probe the native one against that
     exact case; replace it only if the probe fails. */
  var fromOK = false;
  try {
    var probeMap = new Map();
    probeMap.set("a", 1);
    fromOK = typeof Array.from === "function" &&
             Array.from(probeMap.values()).length === 1 &&
             Array.from(new Set([1, 2])).length === 2 &&
             Array.from({ length: 2 }).length === 2 &&
             Array.from("ab").length === 2;
  } catch (e) { fromOK = false; }
  if (!fromOK) {
    def(Array, "from", function (src, mapFn, thisArg) {
      if (src === null || src === undefined) {
        throw new TypeError("Array.from requires an array-like or iterable");
      }
      var out = [], i = 0, it = null, step, fn = null;
      if (typeof src !== "string") {
        if (typeof Symbol !== "undefined" && Symbol.iterator && src[Symbol.iterator]) {
          fn = src[Symbol.iterator];
        } else if (src[IT]) {
          fn = src[IT];
        }
        if (typeof fn === "function") it = fn.call(src);
        else if (typeof src.next === "function") it = src;
      }
      if (it) {
        while (!(step = it.next()).done) {
          out.push(mapFn ? mapFn.call(thisArg, step.value, i) : step.value);
          i++;
        }
        return out;
      }
      var n = src.length >>> 0;
      for (i = 0; i < n; i++) {
        out.push(mapFn ? mapFn.call(thisArg, src[i], i) : src[i]);
      }
      return out;
    });
  }

  /* Array.prototype.values (Fx48). Not used by app/ today, but anything this
     shim hands back must itself carry "@@iterator", or spreading its result
     would land in the very hole the block above exists to fill. */
  if (!Array.prototype.values) {
    def(Array.prototype, "values", function () {
      var a = Object(this), i = 0;
      var it = { next: function () {
        return i < (a.length >>> 0)
          ? { value: a[i++], done: false }
          : { value: undefined, done: true };
      } };
      def(it, IT, selfIter);
      return it;
    });
  }

  /* Object.assign (Fx34) — 38 call sites in app/. */
  if (typeof Object.assign !== "function") {
    def(Object, "assign", function (target) {
      if (target === null || target === undefined) {
        throw new TypeError("Cannot convert undefined or null to object");
      }
      var to = Object(target), i, k, src;
      for (i = 1; i < arguments.length; i++) {
        src = arguments[i];
        if (src === null || src === undefined) continue;
        src = Object(src);
        for (k in src) {
          if (Object.prototype.hasOwnProperty.call(src, k)) to[k] = src[k];
        }
      }
      return to;
    });
  }

  /* Object.values / Object.entries (Fx47) */
  if (!Object.values) {
    def(Object, "values", function (o) {
      var r = [], k, s = Object(o);
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) r.push(s[k]);
      return r;
    });
  }
  if (!Object.entries) {
    def(Object, "entries", function (o) {
      var r = [], k, s = Object(o);
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) r.push([k, s[k]]);
      return r;
    });
  }

  /* Object.getOwnPropertyDescriptors (Fx50) */
  if (!Object.getOwnPropertyDescriptors) {
    def(Object, "getOwnPropertyDescriptors", function (o) {
      var s = Object(o), names = Object.getOwnPropertyNames(s), r = {}, i;
      for (i = 0; i < names.length; i++) {
        r[names[i]] = Object.getOwnPropertyDescriptor(s, names[i]);
      }
      return r;
    });
  }

  /* Array.prototype.includes (Fx43) — NaN-aware, like the real one. */
  if (!Array.prototype.includes) {
    def(Array.prototype, "includes", function (x, from) {
      var a = Object(this), n = a.length >>> 0, i = parseInt(from, 10) || 0, v;
      if (n === 0) return false;
      if (i < 0) i = Math.max(n + i, 0);
      for (; i < n; i++) {
        v = a[i];
        if (v === x || (x !== x && v !== v)) return true;
      }
      return false;
    });
  }

  /* String.prototype.includes (Fx40 — it was called `contains` before that) */
  if (!String.prototype.includes) {
    def(String.prototype, "includes", function (s, from) {
      return String(this).indexOf(String(s), from || 0) !== -1;
    });
  }

  /* String.prototype.padStart / padEnd (Fx48) */
  var padWith = function (self, len, fill, atEnd) {
    var s = String(self);
    var want = len >> 0;
    var f = fill === undefined ? " " : String(fill);
    if (s.length >= want || f === "") return s;
    var need = want - s.length, pad = "";
    while (pad.length < need) pad += f;
    pad = pad.slice(0, need);
    return atEnd ? s + pad : pad + s;
  };
  if (!String.prototype.padStart) {
    def(String.prototype, "padStart", function (len, fill) {
      return padWith(this, len, fill, false);
    });
  }
  if (!String.prototype.padEnd) {
    def(String.prototype, "padEnd", function (len, fill) {
      return padWith(this, len, fill, true);
    });
  }

  /* Element.matches (Fx34 unprefixed) and Element.closest (Fx35).
     closest has 90 call sites — nearly every delegated click handler in the
     app walks up from event.target with it, so without this shim the Scheduler
     board simply would not respond to clicks. */
  if (typeof Element !== "undefined" && Element.prototype) {
    var ep = Element.prototype;
    if (!ep.matches) {
      def(ep, "matches", ep.matchesSelector || ep.mozMatchesSelector ||
                         ep.webkitMatchesSelector || ep.msMatchesSelector ||
        function (sel) {
          var doc = this.document || this.ownerDocument;
          if (!doc) return false;
          var list = doc.querySelectorAll(sel), i = 0;
          while (list[i] && list[i] !== this) i++;
          return !!list[i];
        });
    }
    if (!ep.closest) {
      def(ep, "closest", function (sel) {
        var n = this;
        while (n && n.nodeType === 1) {
          if (n.matches(sel)) return n;
          n = n.parentElement || n.parentNode;
        }
        return null;
      });
    }
  }

  /* NodeList.forEach (Fx50) / HTMLCollection — querySelectorAll(...).forEach()
     is the shape the app writes in a few places. Array.prototype.forEach is
     ES5, so it can simply be borrowed. */
  var LISTS = [window.NodeList, window.HTMLCollection, window.DOMTokenList], li;
  for (li = 0; li < LISTS.length; li++) {
    if (LISTS[li] && LISTS[li].prototype && !LISTS[li].prototype.forEach) {
      def(LISTS[li].prototype, "forEach", Array.prototype.forEach);
    }
  }

  /* <details>/<summary> (Fx49). Below it the element is an unknown inline box:
     the summary AND the body are both permanently visible, so the four
     collapsed "Source & verbatim" panels in this app would open themselves and
     push the page down. The capability guard sets html.no-details, the
     generated stylesheet hides the body of a <details> without [open], and this
     delegated handler does the toggling — the same open/closed behaviour, from
     three small pieces instead of one native element. */
  try {
    if (!("open" in document.createElement("details"))) {
      document.addEventListener("click", function (ev) {
        var n = ev.target;
        while (n && n.nodeType === 1 && String(n.nodeName).toLowerCase() !== "summary") {
          n = n.parentNode;
        }
        if (!n || n.nodeType !== 1) return;
        var d = n.parentNode;
        if (!d || String(d.nodeName).toLowerCase() !== "details") return;
        if (d.getAttribute("open") === null) d.setAttribute("open", "");
        else d.removeAttribute("open");
        if (ev.preventDefault) ev.preventDefault();
      }, false);
    }
  } catch (e) { /* no <details> on the page is not a failure */ }

  /* globalThis (Fx65) — schedbridge.js reads it in the else branch of a
     typeof-window ternary; harmless there, but a defined value costs nothing. */
  if (typeof window.globalThis === "undefined") { window.globalThis = window; }

  /* structuredClone (Fx94) → JSON deep clone. Sufficient for this app: only
     plain JSON data is ever cloned (the fetch shim's bundle objects). */
  if (typeof window.structuredClone !== "function") {
    window.structuredClone = function (o) {
      return o === undefined ? o : JSON.parse(JSON.stringify(o));
    };
  }

  /* crypto.randomUUID (Fx95) → v4 from getRandomValues (Math.random fallback). */
  try {
    if (window.crypto && typeof window.crypto.randomUUID !== "function") {
      window.crypto.randomUUID = function () {
        var b = new Uint8Array(16), i;
        if (typeof window.crypto.getRandomValues === "function") {
          window.crypto.getRandomValues(b);
        } else {
          for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
        }
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        var h = [];
        for (i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
        return h[0] + h[1] + h[2] + h[3] + "-" + h[4] + h[5] + "-" + h[6] + h[7] +
          "-" + h[8] + h[9] + "-" + h[10] + h[11] + h[12] + h[13] + h[14] + h[15];
      };
    }
  } catch (e) { /* crypto locked down — rid() has its own fallback */ }

  /* String.replaceAll (Fx77) → split/join (string) or g-RegExp replace.
     Limitation (documented): "$&"-style patterns in a STRING replacement are
     not interpreted — no call site in this codebase uses them. */
  if (!String.prototype.replaceAll) {
    def(String.prototype, "replaceAll", function (search, repl) {
      if (search instanceof RegExp) {
        if (String(search.flags).indexOf("g") < 0) {
          throw new TypeError("replaceAll must be called with a global RegExp");
        }
        return String(this).replace(search, repl);
      }
      var s = String(this), find = String(search);
      if (typeof repl === "function") {
        if (find === "") return s.split("").join(String(repl("", 0, s)));
        var out = "", i = 0, j;
        while ((j = s.indexOf(find, i)) >= 0) {
          out += s.slice(i, j) + repl(find, j, s);
          i = j + find.length;
        }
        return out + s.slice(i);
      }
      return s.split(find).join(String(repl));
    });
  }

  /* .at() (Fx90) */
  function atImpl(k) {
    var n = Math.trunc(Number(k) || 0), len = this.length;
    if (n < 0) n += len;
    return (n < 0 || n >= len) ? undefined : this[n];
  }
  if (!Array.prototype.at) def(Array.prototype, "at", atImpl);
  if (!String.prototype.at) def(String.prototype, "at", atImpl);

  /* Object.hasOwn (Fx92) */
  if (!Object.hasOwn) {
    def(Object, "hasOwn", function (o, k) {
      return Object.prototype.hasOwnProperty.call(Object(o), k);
    });
  }

  /* Object.fromEntries (Fx63) */
  if (!Object.fromEntries) {
    def(Object, "fromEntries", function (list) {
      var out = {};
      Array.from(list).forEach(function (pair) { out[pair[0]] = pair[1]; });
      return out;
    });
  }

  /* Array.flat / flatMap (Fx62) */
  if (!Array.prototype.flat) {
    def(Array.prototype, "flat", function (depth) {
      var d = depth === undefined ? 1 : Math.floor(Number(depth) || 0);
      var out = [];
      (function walk(arr, lvl) {
        for (var i = 0; i < arr.length; i++) {
          if (Array.isArray(arr[i]) && lvl > 0) walk(arr[i], lvl - 1);
          else if (i in arr) out.push(arr[i]);
        }
      })(this, d);
      return out;
    });
  }
  if (!Array.prototype.flatMap) {
    def(Array.prototype, "flatMap", function (fn, thisArg) {
      return Array.prototype.map.call(this, fn, thisArg).flat(1);
    });
  }

  /* Array.findLast / findLastIndex (Fx104) */
  if (!Array.prototype.findLastIndex) {
    def(Array.prototype, "findLastIndex", function (fn, thisArg) {
      for (var i = this.length - 1; i >= 0; i--) {
        if (fn.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    });
  }
  if (!Array.prototype.findLast) {
    def(Array.prototype, "findLast", function (fn, thisArg) {
      var i = Array.prototype.findLastIndex.call(this, fn, thisArg);
      return i < 0 ? undefined : this[i];
    });
  }

  /* String.trimStart / trimEnd (Fx61) — trimLeft/trimRight exist since Fx3.5 */
  if (!String.prototype.trimStart) {
    def(String.prototype, "trimStart", function () { return String(this).replace(/^\s+/, ""); });
  }
  if (!String.prototype.trimEnd) {
    def(String.prototype, "trimEnd", function () { return String(this).replace(/\s+$/, ""); });
  }

  /* String.matchAll (Fx67) — returns an array (iterable, spreadable, for-of-able),
     which is every way this codebase could consume it. */
  if (!String.prototype.matchAll) {
    def(String.prototype, "matchAll", function (re) {
      var flags = String(re.flags === undefined ? "g" : re.flags);
      if (flags.indexOf("g") < 0) {
        throw new TypeError("matchAll must be called with a global RegExp");
      }
      var r = new RegExp(re.source, flags), s = String(this), out = [], m;
      while ((m = r.exec(s)) !== null) {
        out.push(m);
        if (m[0] === "") r.lastIndex += 1;
      }
      return out;
    });
  }

  /* Promise.prototype.finally (Fx58) */
  if (typeof Promise === "function" && !Promise.prototype["finally"]) {
    def(Promise.prototype, "finally", function (cb) {
      var P = this.constructor || Promise;
      return this.then(
        function (v) { return P.resolve(cb && cb()).then(function () { return v; }); },
        function (e) { return P.resolve(cb && cb()).then(function () { throw e; }); }
      );
    });
  }

  /* Promise.allSettled (Fx71) */
  if (typeof Promise === "function" && !Promise.allSettled) {
    def(Promise, "allSettled", function (list) {
      return Promise.all(Array.from(list).map(function (p) {
        return Promise.resolve(p).then(
          function (value) { return { status: "fulfilled", value: value }; },
          function (reason) { return { status: "rejected", reason: reason }; }
        );
      }));
    });
  }

  /* queueMicrotask (Fx69) */
  if (typeof window.queueMicrotask !== "function") {
    window.queueMicrotask = function (fn) {
      Promise.resolve().then(fn).catch(function (e) { setTimeout(function () { throw e; }); });
    };
  }

  /* Element.replaceChildren (Fx86) · Element.toggleAttribute (Fx63) */
  if (typeof Element !== "undefined") {
    if (!Element.prototype.replaceChildren) {
      def(Element.prototype, "replaceChildren", function () {
        while (this.firstChild) this.removeChild(this.firstChild);
        for (var i = 0; i < arguments.length; i++) {
          var n = arguments[i];
          this.appendChild(typeof n === "string" ? document.createTextNode(n) : n);
        }
      });
    }
    if (!Element.prototype.toggleAttribute) {
      def(Element.prototype, "toggleAttribute", function (name, force) {
        var has = this.hasAttribute(name);
        var want = force === undefined ? !has : !!force;
        if (want) { if (!has) this.setAttribute(name, ""); }
        else if (has) this.removeAttribute(name);
        return want;
      });
    }
  }

  /* navigator.clipboard.writeText (Fx63) → the execCommand("copy") route, which
     Fx52 does have. Same contract: returns a Promise that rejects on failure,
     so every `await navigator.clipboard.writeText(...)` call site and every
     .then/.catch keeps working unchanged. */
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      var api = {
        writeText: function (text) {
          return new Promise(function (resolve, reject) {
            var ta = document.createElement("textarea");
            ta.value = String(text === undefined || text === null ? "" : text);
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.top = "0";
            ta.style.left = "-9999px";
            (document.body || document.documentElement).appendChild(ta);
            var sel = document.getSelection();
            var prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            if (ta.parentNode) ta.parentNode.removeChild(ta);
            if (prev && sel) { sel.removeAllRanges(); sel.addRange(prev); }
            if (ok) resolve(); else reject(new Error("copy was refused by the browser"));
          });
        }
      };
      if (navigator.clipboard) {
        try { navigator.clipboard.writeText = api.writeText; }
        catch (e) { def(navigator, "clipboard", api); }
      } else {
        def(navigator, "clipboard", api);
      }
    }
  } catch (e) { /* a locked-down navigator: the app's own try/catch takes over */ }
})();
"""

# ③ OFFLINE FETCH SHIM
FETCH_SHIM_JS = r"""
"use strict";
/* Offline fetch shim — serves every ../data/... request from the embedded
   bundle. Nothing ever touches the network; misses return a 404-like
   response and log a console.warn. */
(() => {
  const D = window.FDMS_DATA || {};
  const clone = (o) => (typeof structuredClone === "function"
    ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  const norm = (u) => String(u).split("#")[0].split("?")[0]
    .replace(/^(?:\.\.\/|\.\/)+/, "").replace(/^\//, "");
  window.fetch = function (url) {
    const p = norm(url);
    if (Object.prototype.hasOwnProperty.call(D, p)) {
      return Promise.resolve({
        ok: true, status: 200, url: String(url),
        json: () => Promise.resolve(clone(D[p])),
        text: () => Promise.resolve(JSON.stringify(D[p])),
      });
    }
    console.warn("[FDMS offline] no bundled data for fetch:", String(url));
    return Promise.resolve({
      ok: false, status: 404, url: String(url),
      json: () => Promise.reject(new Error("offline bundle miss: " + p)),
      text: () => Promise.resolve(""),
    });
  };
})();
"""

# ④ DATE-INPUT FALLBACK
DATE_FALLBACK_JS = r"""
"use strict";
/* Typed-date fallback — build_offline.py (not part of app/).

   Firefox grew the date picker in 57. Below that, <input type="date"> is an
   unknown type and the browser renders a PLAIN TEXT BOX: no calendar, no
   format hint, no validation — and whatever is typed goes straight into the
   store, where every date in this app is ISO "YYYY-MM-DD".

   This module does three things, and only when the picker is genuinely absent:
     · marks <html class="no-datepicker"> (the stylesheet needs no change; the
       class is there so the screen can be read for what it is);
     · gives every date field a placeholder, a pattern and a title, so the
       expected format is on screen rather than in someone's memory;
     · NORMALISES what was typed, in the capture phase — before the app's own
       change handler sees it — accepting DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
       D/M/YY and YYYYMMDD as well as plain ISO, and rewriting the field to
       ISO. The app therefore keeps reading exactly what it always read.

   Anything it cannot parse is left ALONE and flagged with aria-invalid: a
   silent wrong guess about a date is worse than a field the reader can see is
   not right. */
(() => {
  const test = document.createElement("input");
  try { test.setAttribute("type", "date"); } catch (e) { /* older DOM */ }
  test.value = "not-a-date";
  const supported = test.type === "date" && test.value === "";
  if (supported) return;

  document.documentElement.className += " no-datepicker";
  const HINT = "YYYY-MM-DD";
  const TITLE = "Type the date as " + HINT + " (2026-08-28). "
    + "DD/MM/YYYY is accepted too and is converted for you.";

  const pad = (n) => (n < 10 ? "0" + n : String(n));
  const valid = (y, m, d) => {
    if (!(y >= 1900 && y <= 2199 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };
  const iso = (y, m, d) => y + "-" + pad(m) + "-" + pad(d);

  /* the parser. Order matters: ISO first, because it is what the store holds
     and what the app writes back into the field on every re-render. */
  function toIso(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
    m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(s);
    if (m) {
      let y = +m[3];
      if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
      const d = +m[1], mo = +m[2];               // DD/MM — the unit's own order
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
    return null;
  }

  function dress(el) {
    if (el.getAttribute("data-fdms-dated") === "1") return;
    el.setAttribute("data-fdms-dated", "1");
    if (!el.getAttribute("placeholder")) el.setAttribute("placeholder", HINT);
    if (!el.getAttribute("title")) el.setAttribute("title", TITLE);
    el.setAttribute("pattern", "\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}");
    el.setAttribute("autocomplete", "off");
    el.setAttribute("spellcheck", "false");
    el.setAttribute("inputmode", "numeric");
    el.setAttribute("maxlength", "10");
  }

  const dateFields = (root) => {
    const out = [];
    const scope = root && root.querySelectorAll ? root : document;
    const list = scope.querySelectorAll('input[type="date"]');
    for (let i = 0; i < list.length; i++) out.push(list[i]);
    if (root && root.matches && root.matches('input[type="date"]')) out.push(root);
    return out;
  };

  const dressAll = () => { dateFields(document).forEach(dress); };

  /* normalise in the CAPTURE phase — this listener is on `document`, so it runs
     before any handler the app bound on a pane or on the field itself. */
  function normalise(e) {
    const el = e.target;
    if (!el || el.tagName !== "INPUT" || el.getAttribute("type") !== "date") return;
    const out = toIso(el.value);
    if (out === null) { el.setAttribute("aria-invalid", "true"); return; }
    el.removeAttribute("aria-invalid");
    if (out !== el.value) el.value = out;
  }
  document.addEventListener("change", normalise, true);
  document.addEventListener("focusout", normalise, true);

  /* the app re-renders whole panes with innerHTML, so the dressing has to be
     re-applied; one debounced pass per batch of mutations is enough. */
  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; dressAll(); }, 40);
  };
  if (typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(document.documentElement,
      { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dressAll);
  } else {
    dressAll();
  }
  console.warn("[FDMS offline] this browser has no date picker — date fields accept "
    + HINT + " (DD/MM/YYYY is converted for you).");
})();
"""

FEEDBACK_JS = r"""
"use strict";
/* Offline feedback module — appended by tools/build_offline.py (not part of app/).
   Intercepts every "/issues/new" link (per-remark Feedback buttons and the
   global remark-search Feedback buttons) and opens a local dialog instead.
   Since 18/10/2026 those hrefs are no longer URLs at all but fragments of this
   same document (neutralise_externals), so even a click this handler never
   sees — middle click, "open in new tab" — cannot reach the network. The
   handler stays, because the dialog is the point; the fragment is the floor
   under it.
   Storage tiers:
     (a) SHARED FILE — File System Access API (Chrome/Edge ONLY; Firefox has no
         such API, so on the unit's Firefox this tier simply never appears):
         connect ONE common fdms-feedback.json on a network drive; every save =
         read + append + write. Handle persisted in IndexedDB.
     (b) FALLBACK — localStorage on this computer + "Export feedback (N)" button
         that downloads fdms-feedback-<name|device>-<date>.json. On Firefox this
         is ALWAYS the active tier (detected via typeof, no reference errors). */
(() => {
  const LS_NAME = "fdms-fb-name", LS_REC = "fdms-fb-records";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; };
  const FSA = typeof window.showSaveFilePicker === "function";
  let fileHandle = null;
  let cur = null;

  /* ── local tier ── */
  const localRecs = () => {
    try { const v = JSON.parse(localStorage.getItem(LS_REC) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  };
  const saveLocal = (rec) => {
    const a = localRecs(); a.push(rec);
    try { localStorage.setItem(LS_REC, JSON.stringify(a)); } catch (e) {}
    refreshBar();
  };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));

  /* ── IndexedDB persistence of the shared-file handle ── */
  const idb = () => new Promise((res, rej) => {
    const rq = indexedDB.open("fdms-feedback", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  const idbGet = async (k) => {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const t = db.transaction("kv").objectStore("kv").get(k);
        t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
      });
    } catch (e) { return null; }
  };
  const idbSet = async (k, v) => {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const t = db.transaction("kv", "readwrite");
        t.objectStore("kv").put(v, k);
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    } catch (e) {}
  };

  /* ── shared-file tier (Chrome/Edge only — FSA is false on Firefox) ── */
  async function ensurePerm(h) {
    if (typeof h.queryPermission !== "function") return true;
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  }
  async function readArray(h) {
    const f = await h.getFile();
    const t = await f.text();
    if (!t.trim()) return [];
    const v = JSON.parse(t);                    // throws on corrupt file
    if (!Array.isArray(v)) throw new Error("the file is not a JSON array");
    return v;                                    // never clobber unreadable data
  }
  async function writeArray(h, arr) {
    const w = await h.createWritable();
    await w.write(JSON.stringify(arr, null, 2));
    await w.close();
  }
  async function appendShared(rec) {
    if (!(await ensurePerm(fileHandle))) throw new Error("permission denied");
    const arr = await readArray(fileHandle);
    arr.push(rec);
    await writeArray(fileHandle, arr);
    return arr.length;
  }
  async function connectFile() {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: "fdms-feedback.json",
        types: [{ description: "FDMS feedback (JSON)", accept: { "application/json": [".json"] } }],
      });
      if (!(await ensurePerm(h))) { setStatus("Write permission was not granted."); return; }
      const arr = await readArray(h);           // existing records survive
      await writeArray(h, arr);                 // round-trip proves readwrite works
      fileHandle = h;
      await idbSet("handle", h);
      setStatus(`Shared file connected: ${h.name} (${arr.length} records) ✓`);
    } catch (e) {
      if (e && e.name === "AbortError") return; // user cancelled the picker
      setStatus("Could not connect the shared file: " + ((e && e.message) || e));
    }
  }

  /* ── styles ── */
  const CSS = `
  .fb-bar{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:9px;font-size:12px;color:var(--muted)}
  .fb-bar .fb-b{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:3px 10px;font-size:11.5px;cursor:pointer}
  .fb-bar .fb-b:hover{color:var(--text);border-color:var(--accent)}
  .fb-ctx{background:var(--panel-2);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 12px;margin-bottom:4px}
  .fb-ctx .q{font-style:italic;color:var(--text);margin-top:6px;line-height:1.5;font-size:13px}
  .fb-meta{font-family:Consolas,monospace;font-size:12px;color:var(--accent)}
  .fb-lbl{display:block;color:var(--muted);font-size:12px;margin:12px 0 4px}
  .fb-in,.fb-ta{width:100%;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
  .fb-ta{min-height:110px;resize:vertical}
  .fb-in:focus,.fb-ta:focus{outline:none;border-color:var(--accent)}
  .fb-note{font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.5}
  .fb-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
  .fb-primary{background:var(--accent);color:#06121f;border:1px solid var(--accent);border-radius:8px;padding:6px 16px;font-weight:700;cursor:pointer}
  .fb-primary:hover{filter:brightness(1.12)}
  .fb-flash{color:var(--warn);font-size:12px;margin-right:auto;align-self:center}
  /* The grid-gap longhand and the html.no-flexgap rules for .fb-bar and
     .fb-actions used to be written out by hand right here. They are GENERATED
     now, by the same prepare_cssjs pass that patches the app's own modules:
     one source for the whole export instead of a hand-written island beside a
     generated sheet, which is the exact split that let the modals ship a
     shorthand nobody below Fx66 can read. It also gets .fb-bar right, which
     the hand-written rule did not: the bar WRAPS, and only the horizontal gap
     was ever restored. */
  #fb-status{font-size:11.5px}
  `;

  /* ── DOM ── */
  function buildDom() {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    const w = document.createElement("div");
    w.id = "fb-modal";
    w.className = "modal hidden";
    w.innerHTML = `
      <div class="modal-box" style="width:660px;max-width:94vw">
        <div class="modal-head">
          <h3>Feedback — report an error / suggest a correction</h3>
          <button id="fb-close" class="info-btn">✕ Close</button>
        </div>
        <div class="modal-body">
          <div class="fb-ctx" id="fb-ctx"></div>
          <label class="fb-lbl" for="fb-comment">What is wrong / suggested correction (required)</label>
          <textarea id="fb-comment" class="fb-ta"></textarea>
          <label class="fb-lbl" for="fb-name">Your name (optional — remembered on this computer)</label>
          <input id="fb-name" class="fb-in" autocomplete="off">
          <p class="fb-note" id="fb-note"></p>
          <div class="fb-actions">
            <span class="fb-flash" id="fb-flash"></span>
            <button id="fb-cancel" class="info-btn">Cancel</button>
            <button id="fb-save" class="fb-primary">Save feedback</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(w);
    w.addEventListener("click", (e) => { if (e.target === w) closeDlg(); });
    $id("fb-close").onclick = closeDlg;
    $id("fb-cancel").onclick = closeDlg;
    $id("fb-save").onclick = save;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$id("fb-modal").classList.contains("hidden")) closeDlg();
    });

    const credit = document.querySelector("footer.credit") || document.body;
    const bar = document.createElement("div");
    bar.className = "fb-bar";
    bar.id = "fb-bar";
    bar.innerHTML = `
      ${FSA ? `<button class="fb-b" id="fb-connect" title="One common fdms-feedback.json on a network drive — every computer appends to it">Feedback file: connect shared file…</button>` : ""}
      <button class="fb-b" id="fb-export" title="Download the feedback stored on this computer as a JSON file">Export feedback (<span id="fb-n">0</span>)</button>
      <span id="fb-status"></span>`;
    credit.appendChild(bar);
    if (FSA) $id("fb-connect").onclick = connectFile;
    $id("fb-export").onclick = exportLocal;
    refreshBar();
  }

  const closeDlg = () => $id("fb-modal").classList.add("hidden");
  const setStatus = (t) => { $id("fb-status").textContent = t; };
  const refreshBar = () => { $id("fb-n").textContent = String(localRecs().length); };

  /* ── parse the prefilled feedback URL ──
     18/10/2026: ΔΕΝ είναι πια απόλυτο URL. Το neutralise_externals μετατρέπει
     το `https://github.com/<repo>/issues/new?…` σε fragment του ίδιου εγγράφου
     (`#fdms-feedback/issues/new?…`), ώστε ο σύνδεσμος να μην μπορεί ΠΟΤΕ να
     φύγει από το αρχείο — ούτε με μεσαίο κλικ, ούτε με «νέα καρτέλα». Το
     query μένει αυτούσιο, αλλά το `new URL(href)` που διάβαζε το searchParams
     πετά TypeError σε σχετική διεύθυνση, κι ένα `new URL(href, location.href)`
     θα έβαζε το query ΜΕΣΑ στο fragment (το "?" έρχεται μετά το "#"), οπότε
     το searchParams θα γύριζε άδειο. Άρα το query διαβάζεται από το ίδιο το
     κείμενο — καθαρό ES5, χωρίς URL/URLSearchParams, όπως και το υπόλοιπο
     αρχείο. encodeURIComponent δεν παράγει ποτέ "+", αλλά ο παλιός κώδικας
     αποκωδικοποιούσε μέσω searchParams που το δέχεται ως διάστημα: το "+"
     μένει να αποκωδικοποιείται το ίδιο, για να μη χαθεί τίποτα από
     χειρόγραφο href. */
  function qparam(s, key) {
    const m = new RegExp("[?&]" + key + "=([^&#]*)").exec(s);
    if (!m) return "";
    try { return decodeURIComponent(m[1].replace(/\+/g, "%20")); }
    catch (e) { return m[1]; }
  }

  function parseFb(href) {
    let title = "", body = "";
    try {
      title = qparam(href, "title");
      body = qparam(href, "body");
    } catch (e) {}
    const ctx = { mode_id: "", level: "", item: "", file: "", quote: "" };
    let m = /^Feedback:\s*(.+?)\s*·\s*level\s*(\S+)\s*$/.exec(title);   // remarksearch format
    if (m) { ctx.mode_id = m[1]; ctx.level = m[2]; }
    else if ((m = /^Feedback:\s*(.+)$/.exec(title))) {                   // per-remark format
      const da = /-d(\d)a(\d)$/.exec(m[1]);
      if (da) { ctx.mode_id = m[1].slice(0, da.index); ctx.level = `desired ${da[1]} → achieved ${da[2]}`; }
      else ctx.mode_id = m[1];
    }
    for (const line of body.split("\n")) {
      let mm;
      if ((mm = /\*\*Item:\*\*\s*(.+)$/.exec(line))) ctx.item = mm[1].split("· **File:**")[0].trim();
      if ((mm = /\*\*File:\*\*\s*`([^`]+)`/.exec(line))) ctx.file = mm[1].trim();
      if (!ctx.quote && /^>\s?\S/.test(line)) ctx.quote = line.replace(/^>\s?/, "").trim();
    }
    return ctx;
  }

  function noteText() {
    if (fileHandle) return `Saving appends to the shared file “${fileHandle.name}”. If the file is unreachable, the record is kept on this computer instead (footer → Export feedback).`;
    if (FSA) return "No shared feedback file is connected — the record stays ON THIS COMPUTER until you export it (footer → “Export feedback”) and hand the JSON over. To pool feedback automatically, connect the common JSON file on the network drive (footer → “Feedback file: connect shared file…”).";
    return "This browser cannot write files directly (Firefox has no such API) — records stay ON THIS COMPUTER until you export them (footer → “Export feedback”) and hand the JSON file over.";
  }

  function openDialog(ctx) {
    cur = ctx;
    $id("fb-ctx").innerHTML = `
      <div class="fb-meta">${esc(ctx.mode_id || "—")}${ctx.level ? " · " + esc(ctx.level) : ""}</div>
      ${ctx.item ? `<div style="font-size:13px;margin-top:3px">${esc(ctx.item)}</div>` : ""}
      ${ctx.file ? `<div class="fb-meta" style="color:var(--muted);margin-top:3px">${esc(ctx.file)}</div>` : ""}
      ${ctx.quote ? `<div class="q">“${esc(ctx.quote)}”</div>` : ""}`;
    $id("fb-comment").value = "";
    try { $id("fb-name").value = localStorage.getItem(LS_NAME) || ""; } catch (e) {}
    $id("fb-note").textContent = noteText();
    $id("fb-flash").textContent = "";
    $id("fb-modal").classList.remove("hidden");
    $id("fb-comment").focus();
  }

  async function save() {
    const comment = $id("fb-comment").value.trim();
    if (!comment) { $id("fb-flash").textContent = "A comment is required."; $id("fb-comment").focus(); return; }
    const name = $id("fb-name").value.trim();
    try { localStorage.setItem(LS_NAME, name); } catch (e) {}
    const rec = {
      id: rid(), ts: new Date().toISOString(), name,
      mode_id: cur.mode_id || null, level: cur.level || null, item: cur.item || null,
      file: cur.file || null, quote: cur.quote || null, comment,
    };
    if (fileHandle) {
      try {
        const n = await appendShared(rec);
        closeDlg();
        setStatus(`Feedback saved to “${fileHandle.name}” (${n} records) ✓`);
        return;
      } catch (err) {
        saveLocal(rec);
        closeDlg();
        setStatus(`Shared file unavailable (${(err && err.message) || err}) — record kept on this computer; use “Export feedback”.`);
        return;
      }
    }
    saveLocal(rec);
    closeDlg();
    setStatus("Feedback saved on this computer ✓ — use “Export feedback” to hand it over.");
  }

  function exportLocal() {
    const a = localRecs();
    if (!a.length) { setStatus("No feedback stored on this computer yet."); return; }
    let who = "";
    try { who = localStorage.getItem(LS_NAME) || ""; } catch (e) {}
    who = who.replace(/[^\w\u0370-\u03ff.-]+/g, "_").replace(/^_+|_+$/g, "") || "device";
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `fdms-feedback-${who}-${date}.json`;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Exported ${a.length} record(s) — the download stays valid; hand the JSON file over.`);
  }

  /* ── intercept every "/issues/new" link (capture phase: block navigation
        and the app's outside-click / dropdown handlers) ── */
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const a = t && t.closest('a[href*="/issues/new"]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    openDialog(parseFb(a.getAttribute("href") || ""));
  }, true);

  buildDom();

  /* restore the persisted shared-file handle (permission re-confirmed on first save) */
  (async () => {
    if (!FSA) return;
    const h = await idbGet("handle");
    if (h && typeof h.getFile === "function") {
      fileHandle = h;
      setStatus(`Shared file: ${h.name} (permission is confirmed on first save)`);
    }
  })();
})();
"""


# ────────────────────────────────────────────────────────────────────
# 5. Source preparation (modern app/ files → export-ready text)
# ────────────────────────────────────────────────────────────────────

def prepare_appjs() -> str:
    """Neutralise the dynamic module loader. mifchart.js and remarksearch.js are
    inlined right after app.js instead; schedsync.js is the one module that does
    NOT travel — it talks to GitHub, which on a closed network can only fail and
    would put a live https endpoint inside the file."""
    src = read_text(APP / "app.js")
    out, n = re.subn(
        r"/\* MIF progress chart module[\s\S]*?document\.head\.appendChild\(sys\);\s*\n\}",
        "/* [offline build] dynamic module loaders removed — mifchart.js and "
        "remarksearch.js are inlined below; schedsync.js excluded (closed network). */",
        src,
    )
    if n != 1:
        fail(f"dynamic loader block in app.js: expected 1 match, got {n}")

    # 18/10/2026 — ΤΟ ΥΠΟΛΕΙΜΜΑ ΤΟΥ ΣΥΜΒΟΥΛΟΥ ΠΟΥ ΔΕΝ ΕΒΛΕΠΕ ΚΑΝΕΙΣ.
    # Ο έλεγχος «advisor residue» της build_main_html τρέχει πάνω στο ΚΕΛΥΦΟΣ,
    # πριν μπουν τα scripts — οπότε έβλεπε ότι έφυγαν η καρτέλα και ο <main>,
    # και δεν έβλεπε ότι μέσα στην app.js έμενε το καλώδιο που τους ένωνε:
    #   if ($("tab-advisor")) $("tab-advisor").onclick = () => {
    #     switchView("advisor"); if (window.advInit) window.advInit(); };
    # Στην πράξη ήταν αβλαβές (και τα δύο lookups είναι null/undefined, γι' αυτό
    # και γράφτηκε με guard), αλλά το παραδοτέο κουβαλούσε τα ονόματα
    # «tab-advisor» και «advInit» — δηλαδή την απόδειξη ότι υπάρχει κάτι που
    # του λείπει. Η απόφανση ήταν να μη ΜΕΝΕΙ τίποτα του συμβούλου: φεύγει το
    # καλώδιο μαζί με το σχόλιό του, και ο έλεγχος υπολειμμάτων ξανατρέχει
    # πάνω σε ΟΛΟ το αρχείο — βλ. run_gate. Το ίδιο σχήμα με το `inset` του
    # Γύρου 24: κανόνας που επιβαλλόταν στο ένα μισό και όχι στο άλλο.
    out = sub1(r'/\* 17/10/2026 — «Σύμβουλος»[\s\S]*?\n'
               r'if \(\$\("tab-advisor"\)\)[^\n]*\n',
               lambda m: "/* [offline build] that tab's wiring is removed with the tab "
                         "itself; nothing of it travels. */\n",
               out, "advisor tab wiring in app.js")

    # 18/10/2026 — ΤΟ ΙΔΙΟ ΣΧΗΜΑ, ΜΙΑ ΜΕΡΑ ΜΕΤΑ, ΓΙΑ ΤΟ BRIDGE. Η κλήση είναι
    # ΦΥΛΑΓΜΕΝΗ (`&& window.schBridgeLeave`) και στην πράξη αβλαβής — αυτή
    # ακριβώς ήταν και η υπεράσπιση του advInit. Φεύγει για τον ίδιο λόγο:
    # στο παραδοτέο της Μοίρας δεν μένει το όνομα ενός module που δεν υπάρχει,
    # και η custody του Bridge (να μη ζήσει η αναφορά με τα ΑΛΗΘΙΝΑ ΟΝΟΜΑΤΑ
    # πέρα από την καρτέλα της) δεν έχει τι να φυλάξει όταν δεν υπάρχει
    # καρτέλα να γράψει αναφορά.
    out = sub1(r'[ \t]*/\* CUSTODY \(Round 18[\s\S]*?\n'
               r'[ \t]*if \(view !== "scheduler" && window\.schBridgeLeave\)[^\n]*\n',
               lambda m: "  /* [offline build] the Bridge does not travel (Supabase is "
                         "cloud), so its custody call goes with it. */\n",
               out, "Bridge custody call in app.js switchView")
    return out


# ────────────────────────────────────────────────────────────────────
#  ΤΟ BRIDGE ΒΓΑΙΝΕΙ ΑΠΟ ΤΟ ΕΞΑΓΟΜΕΝΟ (απόφανση ιδιοκτήτη, 18/10/2026:
#  «ό,τι δημιουργεί πρόβλημα για το export απλά δεν το συμπεριλαμβάνουμε»)
#
#  ΤΟ ΓΕΓΟΝΟΣ: ο συγχρονισμός του Bridge είναι Supabase — cloud. Στο κλειστό
#  δίκτυο το `W.fetch` που διαβάζει την ώρα της κλήσης πέφτει πάνω στο offline
#  shim, άρα η καρτέλα δεν υπολειτουργεί: ΑΠΟΤΥΓΧΑΝΕΙ ΠΑΝΤΑ, και το κάνει
#  μπροστά σε έναν εκπαιδευτή που δεν έχει κανέναν να ρωτήσει. 526.526 bytes
#  για να αποτύχει.
#
#  ΑΛΛΑ ΤΟ BRIDGE ΔΕΝ ΕΙΝΑΙ ΑΠΟΜΟΝΩΜΕΝΟ, ΚΑΙ ΕΔΩ ΕΙΝΑΙ Ο ΚΙΝΔΥΝΟΣ. Δύο βρόχοι
#  της scheduler.js περνούν ΟΛΟΚΛΗΡΗ τη λίστα PANES και καλούν μέθοδο πάνω στο
#  στοιχείο κάθε pane ΧΩΡΙΣ ΕΛΕΓΧΟ για null:
#      for (const p of PANES) $id("sch-" + p).innerHTML = msg;          (boot error)
#      for (const p of PANES) $id("sch-" + p).classList.toggle(…);      (ΚΑΘΕ ΚΛΙΚ)
#  Ο δεύτερος είναι ο φονικός: τρέχει σε κάθε κλικ σε υποκαρτέλα του Scheduler.
#  Χωρίς το <section id="sch-bridge">, το `$id` γυρίζει null, ο handler πετάει
#  TypeError ΠΡΙΝ το render() — και ο χρήστης βλέπει υποκαρτέλες που δεν
#  αλλάζουν ΠΟΤΕ. Board, Roster, Training Log, Balance: όλα νεκρά, χωρίς μήνυμα.
#  Αυτό δεν θα το βλέπαμε εμείς· θα το έβλεπε η Μοίρα.
#
#  Η ΘΕΡΑΠΕΙΑ ΕΙΝΑΙ ΣΤΗ ΡΙΖΑ, ΟΧΙ ΣΤΑ ΦΥΛΛΑ: βγαίνει το "bridge" ΑΠΟ ΤΗ ΛΙΣΤΑ,
#  κι έτσι και οι δύο βρόχοι γίνονται σωστοί χωρίς να τους αγγίξει κανείς — τρία
#  pane, τρία στοιχεία, κανένα null. Αν αντί γι' αυτό βάζαμε φύλακα σε κάθε
#  βρόχο, θα είχαμε δύο διορθώσεις αντί για μία και η επόμενη λίστα θα ξανάσκαγε.
#  Μαζί φεύγουν τα τρία καλώδια που δεν οδηγούν πουθενά: η custody κλήση
#  (schBridgeLeave), η γραμμή dispatch και η renderBridge() — η οποία ΜΟΝΗ ΤΗΣ
#  θα έσκαγε σε null ($id("sch-bridge").innerHTML) αν κάτι την καλούσε ποτέ.
#
#  ΤΟ ΜΑΘΗΜΑ ΤΟΥ advInit, ΓΡΑΜΜΕΝΟ ΜΙΑ ΜΕΡΑ ΠΡΙΝ: ο έλεγχος υπολειμμάτων έτρεχε
#  στο ΚΕΛΥΦΟΣ και το καλώδιο έμενε μέσα στην app.js. Γι' αυτό ο έλεγχος του
#  Bridge (gate_scan_unit) τρέχει πάνω στο ΟΛΟΚΛΗΡΟ αρχείο.
#  app/scheduler.js ΔΕΝ ΑΓΓΙΖΕΤΑΙ: η φιλοξενούμενη εφαρμογή κρατά το Bridge.
# ────────────────────────────────────────────────────────────────────

def prepare_scheduler() -> str:
    src = read_text(APP / "scheduler.js")
    # ① Η ΡΙΖΑ: η λίστα των pane. Τα δύο ανοχύρωτα `for (const p of PANES)`
    #    γίνονται ασφαλή με αυτή τη μία γραμμή και με καμία άλλη.
    src = sub1(r'const PANES = \["board", "roster", "log", "balance", "bridge"\];',
               lambda m: 'const PANES = ["board", "roster", "log", "balance"];',
               src, "scheduler PANES list (the Bridge pane leaves the unit build)")
    # ② Η custody κλήση στο wireSubtabs: φυλαγμένη (`&& window.schBridgeLeave`),
    #    αλλά σύρμα προς module που δεν ταξιδεύει. Φεύγει για τον ίδιο λόγο που
    #    έφυγε το advInit: το παραδοτέο δεν κουβαλά τα ονόματα αυτού που του λείπει.
    src = sub1(r'[ \t]*if \(from === "bridge"[^\n]*\n', lambda m: "",
               src, "scheduler Bridge custody call (schBridgeLeave)")
    # ③ Η γραμμή dispatch: απρόσιτη μόλις φύγει το κουμπί, αλλά απρόσιτο ≠ απών.
    src = sub1(r'[ \t]*else if \(ui\.pane === "bridge"\) renderBridge\(\);\n',
               lambda m: "", src, "scheduler render() dispatch to the Bridge pane")
    # ④ Η ίδια η renderBridge: ΑΦΥΛΑΚΤΗ από μέσα — `$id("sch-bridge")` γυρίζει
    #    null και το `el.innerHTML` του fallback σκάει. Απρόσιτη σήμερα, βόμβα
    #    την ημέρα που κάποιος προσθέσει τρόπο να φτάσει εκεί.
    src = sub1(r"[ \t]*function renderBridge\(\) \{[\s\S]*?\n[ \t]*\}\n",
               lambda m: "", src, "scheduler renderBridge() (shell of a tab that is gone)")
    return src


def prepare_currency() -> str:
    """ΤΟ ΣΗΜΑ «WA» ΤΗΣ ΚΑΡΤΑΣ ΚΑΙ ΤΟ ΟΝΟΜΑ ΠΟΥ ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΛΕΕΙ.

    Το κελί του εξαμήνου βάζει ένα σήμα «WA» πάνω σε κάθε καταγραφή που δεν
    την πληκτρολόγησε η Μοίρα, και το tooltip του εξηγούσε ΠΟΙΟΣ την έγραψε:
    «recorded by the Bridge…».  Στο εξαγόμενο δεν υπάρχει Bridge.

    ΓΙΑΤΙ ΔΕΝ ΕΙΝΑΙ ΑΔΥΝΑΤΟ ΝΑ ΕΜΦΑΝΙΣΤΕΙ: το σήμα ζωγραφίζεται όταν η
    καταγραφή κουβαλά `src: "wa:…"`.  Το store φεύγει ΑΔΕΙΟ, άρα καμία τέτοια
    καταγραφή δεν ταξιδεύει μαζί — αλλά ο χρήστης φορτώνει επιτόπου ⭱ Import
    ένα backup που βγήκε από τον υπολογιστή του ιδιοκτήτη, κι εκεί ο Bridge
    ΕΧΕΙ γράψει.  Οπότε το tooltip μπορεί κάλλιστα να εμφανιστεί στη Μοίρα και
    να ονοματίσει καρτέλα που δεν υπάρχει — και να υποσχεθεί «lane» προς ένα
    σύστημα που αυτό το αρχείο δεν αγγίζει ποτέ.  Το σήμα ΜΕΝΕΙ (η πληροφορία
    «αυτό δεν το τύπωσε η Μοίρα» είναι αληθινή και χρήσιμη)· αλλάζει μόνο το
    ποιος λέγεται ότι το έγραψε."""
    src = read_text(APP / "currency.js")
    old = ('title="${esc("recorded by the Bridge out of this instructor\'s own "\n'
           '        + "Wings Ahead currency claim — " + String(e.src).slice(WA_SRC.length)\n'
           '        + ". Wings Ahead has no admin write path for these rows, so the lane is one-way and nothing here "\n'
           '        + "is ever pushed back.")}"')
    new = ('title="${esc("recorded from this instructor\'s own Wings Ahead currency claim — "\n'
           '        + String(e.src).slice(WA_SRC.length)\n'
           '        + ". It came in with the data that was loaded on this computer; this file reads it and '
           'sends nothing anywhere.")}"')
    return sub1(re.escape(old), lambda m: new, src,
                "currency WA-badge tooltip (it named the Bridge)")


def prepare_mifchart() -> str:
    src = read_text(APP / "mifchart.js")
    # CSS-in-JS min() (Fx75) → px + max-width (visually identical)
    return sub1(r"width:min\(1240px,96vw\)", lambda m: "width:1240px;max-width:96vw",
                src, "mifchart modal width min()")


def prepare_schedstore() -> str:
    """THE ONE COMPUTED OBJECT KEY IN THE APP, and why it does not travel.

    `{ [CFG_KEY]: rec }` is the only computed key in app/, and Babel compiles a
    computed key into `_defineProperty` → `_toPropertyKey` → `_toPrimitive`,
    whose body reads `t[Symbol.toPrimitive]`. Firefox 32 has no Symbol at all
    (it arrived in 36), so that line is a ReferenceError waiting for the day
    the key is an object rather than a string.

    Today it is safe by luck: CFG_KEY is the string "editor_lock", and
    _toPrimitive returns non-objects before it ever touches Symbol. Luck is not
    a floor. Writing the same object the long way removes the helper chain
    entirely, which is why the gate can then assert that `Symbol.toPrimitive`
    does not appear ANYWHERE in the emitted file — every surviving mention of
    Symbol sits behind a live `typeof Symbol` test.

    This is the export's rewrite, not the app's: app/schedstore.js keeps the
    modern line, and the hosted app is untouched."""
    src = read_text(APP / "schedstore.js")
    src = sub1(
        r"S\(\)\.setConfig\(\{ \[CFG_KEY\]: rec \}\)",
        lambda m: "S().setConfig((function () { var o = {}; o[CFG_KEY] = rec; return o; })())",
        src, "schedstore computed key { [CFG_KEY]: rec }")
    return retell_closed_network(src)


# ────────────────────────────────────────────────────────────────────
#  ΤΑ ΚΕΙΜΕΝΑ ΠΟΥ ΜΙΛΟΥΝ ΓΙΑ ΚΟΥΜΠΙ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ (απόφανση 18/10/2026)
#
#  ΤΟ ΠΕΡΙΣΤΑΤΙΚΟ: οι διάλογοι ↺ Reset / ⭱ Import / ⭳ Export του schedstore.js
#  προειδοποιούσαν τον εκπαιδευτή ότι «το αντίγραφο στο GitHub ΔΕΝ πειράζεται»,
#  ότι μένει άθικτος «ο κωδικός του ☁ Sync», και ότι ο κωδικός επεξεργασίας
#  «ταξιδεύει στις άλλες συσκευές με τον συγχρονισμό».  Στο εξαγόμενο το
#  `schedsync.js` ΔΕΝ ΤΑΞΙΔΕΥΕΙ: δεν υπάρχει κουμπί ☁ Sync, δεν υπάρχει ⭱ Push,
#  δεν υπάρχει αντίγραφο στο GitHub, δεν υπάρχουν «άλλες συσκευές».  Μια
#  προειδοποίηση για λειτουργία που λείπει δεν καθησυχάζει: στέλνει τον χρήστη
#  να ψάξει κουμπί που δεν θα βρει, και του υπόσχεται αντίγραφο ασφαλείας που
#  δεν υπάρχει.  Η δεύτερη είναι η επικίνδυνη — κάποιος θα πατήσει ↺ Reset
#  πιστεύοντας ότι «το GitHub το έχει».
#
#  ΚΑΙ ΕΝΑ ΔΕΥΤΕΡΟ ΨΕΜΑ, ΠΟΥ ΤΟ ΒΡΗΚΕ ΑΥΤΟΣ Ο ΓΥΡΟΣ: ο διάλογος λέει «rebuilds
#  it from the seed file that ships with the app».  Στο εξαγόμενο το seed είναι
#  ΑΔΕΙΟ (`{}`, βλ. EMPTY_SEED) — άρα το ↺ Reset δεν «επαναφέρει», ΑΔΕΙΑΖΕΙ.
#  Αυτό ο χρήστης πρέπει να το ξέρει ΠΡΙΝ πληκτρολογήσει RESET.
#
#  ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΟ app/: ακριβώς όπως η απογύμνωση του attribution και η
#  αδρανοποίηση των συνδέσμων.  Στη φιλοξενούμενη εφαρμογή το ☁ Sync, το
#  GitHub και οι άλλες συσκευές ΥΠΑΡΧΟΥΝ, και εκεί τα κείμενα είναι αληθινά.
#  Κάθε αντικατάσταση είναι sub1 με μέτρηση: αν κάποιος ξαναγράψει μία από
#  αυτές τις προτάσεις στο app/, το build σταματά και το βλέπει άνθρωπος.
# ────────────────────────────────────────────────────────────────────

_CLOSEDNET_RETELL = [
    # ① Η ΑΡΝΗΣΗ ΤΟΥ WINGS AHEAD EXPORT — έδειχνε σε καρτέλα που δεν υπάρχει πια.
    ("This file is a WINGS AHEAD EXPORT, not a store backup — use Scheduler → "
     "“Bridge”, which only reads it, compares it with this store and writes nothing.",
     "This file is a WINGS AHEAD EXPORT, not a scheduler backup — this build cannot "
     "read it at all. ⭱ Import takes the file ⭳ Export writes "
     "(scheduler-backup-YYYY-MM-DD.json) and nothing else.",
     "WA-export refusal toast (pointed at the Bridge tab)"),
    # ② Ο ΔΙΑΛΟΓΟΣ ΤΟΥ ↺ RESET — το seed είναι άδειο, και δεν υπάρχει GitHub.
    ('body: "Roster, training log, availability, duties, gates, day plans, the Bridge change log "\n'
     '        + "and the Bridge <b>push ledger</b> are all discarded. "\n'
     '        + "The editor code goes with them, so this device is left with no code set — and so does the "\n'
     '        + "Wings Ahead bridge credential, which is re-pasted by hand. "\n'
     '        + "Throwing the push ledger away does not remove one row from Wings Ahead: it forgets WHICH "\n'
     '        + "row belongs to which FDMS event, so every flight looks unpushed and the next push meets its "\n'
     '        + "own rows as conflicts, on the report, settled by hand. "\n'
     '        + "This browser’s sync settings and the copy on GitHub are NOT touched.",',
     'body: "Roster, training log, availability, duties, gates, currency entries and day plans "\n'
     '        + "are all discarded. The editor code goes with them, so this computer is left with no "\n'
     '        + "code set. "\n'
     '        + "IN THIS FILE THE SEED IS EMPTY: what you get back is a BLANK Scheduler, not the data "\n'
     '        + "this file arrived with — ↺ Reset here EMPTIES, it does not restore. "\n'
     '        + "Nothing is sent anywhere and nothing outside this browser is touched; there is no copy "\n'
     '        + "of this data on any other computer. The ONLY way back is a ⭳ Export taken before this, "\n'
     '        + "loaded again with ⭱ Import.",',
     "↺ Reset dialog body (GitHub copy · sync settings · «rebuilds from the seed»)"),
    # ③ Ο ΤΙΤΛΟΣ ΚΑΙ ΤΟ ΚΟΥΜΠΙ ΤΟΥ ΙΔΙΟΥ ΔΙΑΛΟΓΟΥ: «to the seed file» σε αρχείο
    #    που κουβαλά άδειο seed είναι το ίδιο ψέμα, δύο λέξεις πιο σύντομο.
    ('ico: "↺", word: "RESET", go: "Reset to the seed",',
     'ico: "↺", word: "RESET", go: "Empty the Scheduler",',
     "↺ Reset confirm button («to the seed» — the seed is empty here)"),
    ('title: "Reset the scheduler to the seed file?",',
     'title: "Empty the whole Scheduler on this computer?",',
     "↺ Reset dialog title"),
    # ΚΑΙ ΤΟ TOAST ΠΟΥ ΑΚΟΛΟΥΘΕΙ: «Reset to seed.» σε αρχείο με άδειο seed λέει
    # στον χρήστη ότι κάτι επανήλθε. Δεν επανήλθε: αδειάστηκε.
    ('toast(ok ? "Reset to seed." : "Seed file not reachable — store emptied.", ok ? "good" : "bad");',
     'toast(ok ? "Scheduler emptied." : "Scheduler emptied — this file carries no seed data.", ok ? "good" : "bad");',
     "↺ Reset result toast («Reset to seed.»)"),
    # ④ ΤΟ TOOLTIP ΤΟΥ ⭳ EXPORT — το bridge token και το «Bridge → ⚙».
    ('+ "The ONE thing it leaves out is the Wings Ahead bridge token: the file wanders, so the "\n'
     '      + "credential does not travel in it and an ⭱ Import never brings one back — you paste it once, "\n'
     '      + "in Bridge → ⚙. The URL and the anon key do travel; they are public values. "\n',
     '+ "It is the whole store and nothing but the store. "\n',
     "⭳ Export tooltip (the Wings Ahead token and «Bridge → ⚙»)"),
    # ⑤ ΤΟ TOOLTIP ΤΟΥ ⭱ IMPORT — «nothing in the cloud until the next push».
    ('+ "It touches nothing in the cloud until the next push, and "\n'
     '      + "nothing outside the Scheduler. It refuses a global roster file and a Wings Ahead export BY NAME, "\n',
     '+ "It sends nothing anywhere — there is no cloud in this file — and it touches "\n'
     '      + "nothing outside the Scheduler. It refuses a global roster file and a Wings Ahead export BY NAME, "\n',
     "⭱ Import tooltip (the cloud and the next push)"),
    # ⑥ ΤΟ TOOLTIP ΤΟΥ ↺ RESET — ο μεγάλος: ☁ Sync, GitHub, ⭳ Pull, ⭱ Push.
    ('reset: "Throws the whole store away and rebuilds it from the seed file that ships with the app. "\n'
     '      + "Roster, training log, availability, duties, gates, currency, day plans, the Bridge change log, "\n'
     '      + "the Bridge push ledger and config all go — the editor code with them, so this device is left "\n'
     '      + "with no code set, and the Wings Ahead bridge token with them too. "\n'
     '      + "It removes NOTHING from Wings Ahead: what it throws away is the memory of which row is whose, "\n'
     '      + "so the next push meets its own rows as conflicts on the report. "\n'
     '      + "It needs ✎ Editor mode and makes you type RESET. "\n'
     '      + "It does NOT touch this browser’s sync settings or the ☁ Sync access code (those live outside the store), "\n'
     '      + "and it does NOT touch the GitHub copy — a later ⭳ Pull brings the old data back, while a ⭱ Push after this "\n'
     '      + "replaces the repo with the seed. Take a ⭳ Export first.",',
     'reset: "Throws the whole store away. The seed inside this file is EMPTY, so what is left is a "\n'
     '      + "BLANK Scheduler — it EMPTIES, it does not restore. "\n'
     '      + "Roster, training log, availability, duties, gates, currency, day plans and config all go — "\n'
     '      + "the editor code with them, so this computer is left with no code set. "\n'
     '      + "It needs ✎ Editor mode and makes you type RESET. "\n'
     '      + "It sends nothing anywhere and there is no copy of this data on any other computer: the ONLY "\n'
     '      + "way back is a ⭳ Export taken first. Take one now if you have not.",',
     "↺ Reset tooltip (☁ Sync access code · the GitHub copy · ⭳ Pull · ⭱ Push)"),
    # ⑦ Ο ΚΩΔΙΚΟΣ ΕΠΕΞΕΡΓΑΣΙΑΣ ΔΕΝ ΤΑΞΙΔΕΥΕΙ ΠΟΥΘΕΝΑ. Τρία κείμενα το έλεγαν.
    ('+ "so the next ⭱ Push carries it to every other device — each of them then asks for this code before "\n'
     '      + "anything may be changed there. No scheduler data is touched, and the code itself is never stored, "\n',
     '+ "and it stays in THIS browser: this file has no channel to another computer, so every machine "\n'
     '      + "that opens it sets its own code. No scheduler data is touched, and the code itself is never stored, "\n',
     "✎ editor-code tooltip («the next ⭱ Push carries it to every other device»)"),
    ('+ "be typed first. Every OTHER device falls back to view-only until the new code is typed there. "\n',
     '+ "be typed first. No other computer is affected — this file has no channel to one. "\n',
     "✎ change-code tooltip («every OTHER device»)"),
    # ⑧α ΤΟ «⋯» ΠΟΥ ΔΙΑΦΗΜΙΖΕ ΤΟ SEED. Μόλις το κουμπί έγινε «Empty the
    #    Scheduler», το tooltip του μενού που το στεγάζει έμενε να λέει «↺ Reset
    #    to the seed» — δύο κείμενα για το ίδιο κουμπί, που δεν συμφωνούν.
    ('more: "Opens the two controls that can REPLACE THE WHOLE STORE — ⭱ Import a backup and ↺ Reset to the seed. "',
     'more: "Opens the two controls that can REPLACE THE WHOLE STORE — ⭱ Import a backup and ↺ Reset, which EMPTIES it. "',
     "«⋯» tooltip («↺ Reset to the seed» — the seed is empty here)"),
    # ⑧ ΚΑΙ ΤΑ ΤΡΙΑ ΥΠΟΛΟΙΠΑ «ΑΛΛΕΣ ΣΥΣΚΕΥΕΣ». Τα βρήκε η επαλήθευση μετά τα
    #    έξι πρώτα, σαρώνοντας το ΠΑΡΑΓΟΜΕΝΟ για τη φράση αντί για τον διάλογο:
    #    δύο tooltip και ΕΝΑ TOAST που ο χρήστης βλέπει τη στιγμή που αλλάζει
    #    κωδικό. Υπόσχονται συγχρονισμό που δεν υπάρχει — και το τρίτο δίνει
    #    οδηγία («οι άλλες συσκευές να πληκτρολογήσουν τον νέο») σε κάποιον που
    #    δεν έχει άλλες συσκευές.
    ('+ "no scheduler data changes, the code itself is untouched, and other devices are unaffected. "',
     '+ "no scheduler data changes and the code itself is untouched. "',
     "✎ lock tooltip («other devices are unaffected»)"),
    ('<p class="hint">Every other device falls back to view-only until the new code is typed there.</p>',
     '<p class="hint">Only this computer is affected: the code lives in this browser and nowhere else.</p>',
     "✎ change-code dialog hint («every other device»)"),
    ('say("code changed ✓ — other devices must type the new one");',
     'say("code changed ✓ — it applies to this computer");',
     "✎ change-code toast («other devices must type the new one»)"),
    ('+ "Setting it writes a verifier into the scheduler config, which the sync carries to your other devices.");',
     '+ "Setting it writes a verifier into the scheduler config of THIS browser and nowhere else.");',
     "👁 view-button tooltip («which the sync carries to your other devices»)"),
    ('"No editor code has been set yet. Set one now: it is stored as a salted PBKDF2-SHA256 verifier inside '
     'the store, so it travels to your other devices with the sync — never as plain text, and never '
     'recoverable from here."',
     '"No editor code has been set yet. Set one now: it is stored as a salted PBKDF2-SHA256 verifier inside '
     'the store of THIS browser — never as plain text, never recoverable from here, and never sent anywhere."',
     "✎ editor dialog hint («it travels to your other devices with the sync»)"),
]


def retell_closed_network(src: str) -> str:
    """Κάθε πρόταση που περιγράφει λειτουργία εκτός του ενός αρχείου,
    ξαναγραμμένη ώστε να λέει την αλήθεια του κλειστού δικτύου."""
    for old, new, label in _CLOSEDNET_RETELL:
        src = sub1(re.escape(old), lambda m, n=new: n, src,
                   f"closed-network retelling — {label}")
    return src


def prepare_schedval() -> str:
    src = read_text(APP / "schedval.js")
    return sub1(r"width:min\(760px,94vw\)", lambda m: "width:760px;max-width:94vw",
                src, "schedval modal width min()")


# ────────────────────────────────────────────────────────────────────
#  ΟΙ ΕΞΩΤΕΡΙΚΟΙ ΣΥΝΔΕΣΜΟΙ (απόφανση 18/10/2026)
#
#  Τι υπάρχει πραγματικά στο app/ και τι του συμβαίνει στο export:
#    · 3× `https://github.com/<repo>/issues/new?…`  — τα κουμπιά Feedback σε
#      app.js, description.js, remarksearch.js.  ΑΥΤΑ αδρανοποιούνται εδώ.
#    · 1× `https://api.github.com`  — schedsync.js, ΔΕΝ είναι στο SCRIPT_CHAIN.
#    · 1× `http://127.0.0.1:8771`   — advisor.js, κόβεται ολόκληρος.
#    · `http://www.w3.org/2000/svg` — XML namespace, ΜΕΝΕΙ: δεν είναι αίτημα.
#    · `https://<project>.supabase.co` — placeholder κειμένου στο schedbridge.js·
#      το endpoint είναι ρύθμιση του χρήστη, και το `W.fetch` διαβάζεται την
#      ώρα της κλήσης, άρα πέφτει πάνω στο offline shim.  Δεν είναι σύνδεσμος.
#    · Το `<link rel=manifest>` και το `apple-touch-icon` ζουν μέσα στο μπλοκ
#      hosted:start/hosted:end και φεύγουν εκεί.
#  Ο builder δεν εμπιστεύεται αυτή τη λίστα: ο `gate_scan_external` ξανασαρώνει
#  το τελικό αρχείο και σκάει σε ό,τι δεν είναι στη λευκή λίστα.
#
#  ΓΙΑΤΙ FRAGMENT ΚΑΙ ΟΧΙ ΑΠΛΩΣ preventDefault.  Το FEEDBACK_JS πιάνει το click
#  στη φάση capture — αλλά ένα `href` δεν ακολουθείται μόνο με κλικ.  Μεσαίο
#  κλικ, Ctrl+κλικ, «Άνοιγμα σε νέα καρτέλα», ακόμη και το απλό πέρασμα του
#  ποντικιού που δείχνει τη διεύθυνση στη status bar: ο σύνδεσμος υπάρχει.  Στο
#  κλειστό δίκτυο ένα αίτημα προς github.com δεν αποτυγχάνει γρήγορα — περιμένει
#  το timeout, με τον εκπαιδευτή να κοιτά μια λευκή καρτέλα.  Οπότε παύει να
#  είναι σύνδεσμος: γίνεται fragment του ίδιου εγγράφου.  Το path `/issues/new`
#  και όλο το query μένουν ακέραια, γιατί ο selector `a[href*="/issues/new"]`
#  και η `parseFb` του FEEDBACK_JS διαβάζουν από εκεί τα title/body.
FB_LOCAL_PREFIX = "#fdms-feedback"

_EXT_NEUTRALISE = [
    # app.js, remarksearch.js — template literal: `https://github.com/${REPO}/issues/new?…`
    (re.compile(r"https://github\.com/\$\{REPO\}(?=/issues/new\?)"),
     FB_LOCAL_PREFIX, "github issue URL (template literal)"),
    # description.js — concatenation: "https://github.com/" + REPO + "/issues/new?title="
    (re.compile(r'"https://github\.com/"\s*\+\s*REPO\s*\+\s*"(?=/issues/new\?)'),
     '"' + FB_LOCAL_PREFIX, "github issue URL (concatenation)"),
    # ο ίδιος λόγος, το δεύτερο μισό: ένα νέο tab για ένα fragment του ΙΔΙΟΥ
    # αρχείου σημαίνει ξαναφόρτωμα 13 MB για να δει ο χρήστης ό,τι έβλεπε ήδη.
    (re.compile(r' target="_blank" rel="noopener"'),
     "", 'target="_blank" on a Feedback anchor'),
    # Ο ΤΕΤΑΡΤΟΣ ΕΦΥΓΕ ΜΑΖΙ ΜΕ ΤΟ ΑΡΧΕΙΟ ΤΟΥ (18/10/2026). Ήταν το
    # `placeholder="https://&lt;project&gt;.supabase.co"` του πεδίου «Project
    # URL» του Bridge, και ήταν ο λόγος που η λευκή λίστα γράφτηκε ανάποδα: τον
    # βρήκε ο gate_scan_external μόλις πρωτοέτρεξε, κανείς δεν τον ήξερε.
    # Τώρα το `schedbridge.js` ΔΕΝ ΤΑΞΙΔΕΥΕΙ (ο συγχρονισμός του είναι Supabase,
    # δηλαδή cloud), άρα ο κανόνας δεν έχει αντικείμενο και φεύγει — αν έμενε,
    # θα έσκαγε το build ζητώντας μία αντικατάσταση σε κείμενο που δεν υπάρχει.
    # Η ιστορία μένει γραμμένη γιατί είναι ΑΥΤΗ που δικαιολογεί τη λευκή λίστα.
    # Το ίδιο `supabase` είναι τώρα needle του gate_scan_unit: αν ξαναφανεί από
    # οποιαδήποτε πόρτα, το build σταματά.
    # ΤΟ ΠΑΛΙΟ ΣΧΟΛΙΟ ΤΟΥ ΤΕΤΑΡΤΟΥ, για το ιστορικό: τον βρήκε ο gate_scan_external
    # την πρώτη φορά που έτρεξε, κι αυτό είναι όλο το νόημα της λευκής λίστας:
    # schedbridge.js, `placeholder="https://&lt;project&gt;.supabase.co"` στο
    # πεδίο «Project URL» του Bridge.  ΔΕΝ είναι αίτημα — είναι υπόδειγμα
    # κειμένου σε άδειο input — αλλά είναι η μόνη απόλυτη διεύθυνση που θα
    # επιβίωνε σε ένα αρχείο που διαφημίζει «δεν ζητά ΤΙΠΟΤΑ από το δίκτυο»,
    # και διαβάζεται από τον χρήστη ως ζωντανός προορισμός.  Το σχήμα φεύγει·
    # το υπόδειγμα παραμένει κατανοητό.  (Το endpoint του Bridge δεν είναι
    # καρφωμένο πουθενά: το γράφει ο χρήστης και το `W.fetch` διαβάζεται την
    # ώρα της κλήσης, οπότε πέφτει πάνω στο offline shim όπως κάθε άλλο fetch.)
]

# Πόσες φορές ΠΡΕΠΕΙ να βρεθεί το κάθε μοτίβο σε ΟΛΑ τα modules μαζί. Αν αλλάξει
# ο αριθμός, κάποιος πρόσθεσε ή αφαίρεσε κουμπί Feedback: να το δει άνθρωπος μία
# φορά πριν φύγει το αρχείο, αντί να περάσει σιωπηλά.
_EXT_EXPECT = {"github issue URL (template literal)": 2,
               "github issue URL (concatenation)": 1,
               'target="_blank" on a Feedback anchor': 3}


def neutralise_externals(mods: dict) -> tuple:
    """Αδρανοποιεί κάθε εξωτερικό σύνδεσμο στα modules που ταξιδεύουν.

    Δουλεύει πάνω στο ΑΝΤΙΓΡΑΦΟ του κώδικα που ετοιμάζει ο builder, όχι στο
    app/: η φιλοξενούμενη εφαρμογή κρατά τα κουμπιά Feedback της ως αληθινά
    GitHub issues, γιατί εκεί υπάρχει δίκτυο και εκεί είναι το κανάλι."""
    hits, notes = {}, []
    for key in list(mods):
        src = mods[key]
        for rx, repl, label in _EXT_NEUTRALISE:
            src, n = rx.subn(repl, src)
            if n:
                hits[label] = hits.get(label, 0) + n
                notes.append(f"{key}.js: {label} → neutralised ×{n}")
        mods[key] = src
    for label, want in _EXT_EXPECT.items():
        got = hits.get(label, 0)
        if got != want:
            fail(f"external-link neutralisation: expected {want}× '{label}' "
                 f"across the bundled modules, found {got}. app/ changed — look "
                 f"at it once before the unit does.")
    return mods, notes


# ────────────────────────────────────────────────────────────────────
#  ΤΟ CREDIT ΤΗΣ AI (απόφανση 28/08/2026, εφαρμόζεται 18/10/2026)
#
#  Το ΠΟΥ γίνεται αυτό είναι μέρος της απόφανσης, όχι λεπτομέρεια υλοποίησης:
#  στο δημόσιο repo και στη ζωντανή εφαρμογή το credit ΜΕΝΕΙ.  Φεύγει μόνο από
#  το υπηρεσιακό παραδοτέο, άρα φεύγει ΕΔΩ, από το αντίγραφο, και το
#  app/index.html δεν ακουμπιέται ποτέ για αυτόν τον λόγο.
#
#  Φεύγει η `<span class="credit-line">`, ΟΧΙ ο `<footer class="credit">`:
#  το FEEDBACK_JS κάνει `document.querySelector("footer.credit") || document.body`
#  για να κρεμάσει τη μπάρα «Export feedback (N)».  Χωρίς τον footer η μπάρα
#  προσκολλάται στο <body> και χάνει το border-top, το padding και το φόντο της.
_ATTRIBUTION_RE = re.compile(r'[ \t]*<span class="credit-line">[\s\S]*?</span>\n')

# Ό,τι δεν επιτρέπεται να έχει επιβιώσει μετά την αφαίρεση. Η λίστα είναι οι
# ΛΕΞΕΙΣ του credit, όχι το markup: αν κάποιος ξαναγράψει τη γραμμή αλλιώς, το
# regex από πάνω θα αστοχήσει σιωπηλά και ΑΥΤΟ είναι που θα το πιάσει.
# «Kalamata coffee» ΚΑΙ ΟΧΙ «Kalamata»: η Καλαμάτα είναι αεροδρόμιο και υπάρχει
# νόμιμα δύο φορές στα δεδομένα («may be flown inside Kalamata MTMA»). Η γυμνή
# λέξη θα ήταν βόμβα για όποιον μετακινούσε αυτόν τον έλεγχο μετά το data bundle.
_ATTRIBUTION_NEEDLES = ("credit-line", "Claude", "Anthropic", "riding the right seat",
                        "Kalamata coffee")


def strip_attribution(html: str) -> str:
    html = sub1(_ATTRIBUTION_RE.pattern, lambda m: "", html,
                "AI credit line (unit-facing build ONLY — app/index.html keeps it)")
    for needle in _ATTRIBUTION_NEEDLES:
        if needle in html:
            fail(f"attribution residue in the unit build: {needle!r} survived the "
                 f"strip — the credit line was rewritten and the regex missed it")
    return html


def prepare_cssjs(name: str, src: str) -> tuple:
    """THE FLOOR PATCH FOR THE RULES A MODULE WRITES FROM A STRING.

    Until Round 24 this did ONE thing — the grid-gap longhand beside every
    `gap:` — and patch_css did everything else, over the <style> block only.
    The FF32 verify found what that cost: `.mc-modal` (mifchart.js) and
    `.sv-modal` (schedval.js) declare `position:fixed;inset:0` inside a template
    literal, the inset patch never reached them, and on Fx32-65 the
    Schedule-Validation and minimums backdrops collapsed to a content-sized box
    in the top-left corner instead of covering the viewport.

    So a module's own rules now go through EXACTLY the patch the stylesheet goes
    through (patch_decls), and a flex container declared in a module gets the
    same generated html.no-flexgap rules — appended to the very string the
    module injects, so the fallback travels inside the <style> element the rules
    themselves came from and cannot drift away from them.

    app/ is not touched. The hosted app keeps `inset`, keeps `gap`, and renders
    exactly as it did."""
    tot, notes = {}, []
    # literal by literal, back to front, so the offsets ahead stay valid
    for a, b in reversed(_js_literal_spans(src)):
        real = src[a:b]
        text = _descape(real)
        if not _stylesheet_shaped(text):
            continue
        blocks = [(at, sel.strip(), i0, i1) for at, sel, i0, i1 in _leaf_blocks(text)
                  if _looks_css(sel, text[i0:i1])]
        if not blocks:
            continue
        blank = _blank_comments(text)
        known_flex = set()
        for _at, sel, i0, i1 in blocks:
            if re.search(r"display\s*:\s*(inline-)?flex", blank[i0:i1]):
                for part in sel.split(","):
                    known_flex.add(part.strip())
        boxes = box_facts(blocks, blank)
        flex_rules, _orphan, _n_shape = collect_flex_rules(blocks, blank, known_flex)
        # patch the declarations back to front (the offsets move under us)
        for _at, _sel, i0, i1 in reversed(blocks):
            body = real[i0:i1]
            new, n = patch_decls(body)
            for k, v in n.items():
                tot[k] = tot.get(k, 0) + v
            if new != body:
                real = real[:i0] + new + real[i1:]
        if flex_rules:
            rules, nn = flexgap_sheet(flex_rules, boxes, name)
            notes += nn
            if rules:
                blob = "\n".join(rules)
                # it is going INSIDE a JavaScript string literal: nothing in it
                # may close or escape that string, and a single-quoted or
                # double-quoted host cannot take a raw newline.
                if re.search(r"""[`'"\\]|\$\{""", blob):
                    fail(f"{name}: the generated flex-gap rules are not safe to "
                         f"inline into a JS string literal:\n  {blob[:200]}")
                sep = "\n" if "\n" in real else " "
                real = real + sep + blob.replace("\n", sep) + sep
        src = src[:a] + real + src[b:]
    if tot:
        notes.insert(0, f"{name}: CSS-in-JS floor patch — "
                     + ", ".join(f"{k}×{v}" for k, v in sorted(tot.items()) if v))
    return src, notes


def extract_prepaint(index_html: str) -> str:
    m = re.search(r"<script>\n(/\* Palette before first paint[\s\S]*?)\n</script>", index_html)
    if not m:
        fail("pre-paint palette script not found in app/index.html")
    return m.group(1)


# ────────────────────────────────────────────────────────────────────
# 6. HTML assembly
# ────────────────────────────────────────────────────────────────────

def script_tag(label: str, body: str) -> str:
    b = body.strip()
    if re.search(r"</(script|style)", b, re.I):
        fail(f"script '{label}' contains '</script'/'</style' — inline-unsafe")
    return f"<script>\n/* ═══ {label} ═══ */\n{b}\n</script>"


def build_main_html(css: str, emblem_uri: str, guard_js: str, prepaint_js: str,
                    scripts: str) -> str:
    html = read_text(APP / "index.html")

    # the capability guard goes FIRST, before the pre-paint palette script
    html = sub1(r"<script>\n/\* Palette before first paint[\s\S]*?\n</script>",
                lambda m: (script_tag("FDMS capability guard (build_offline.py)", guard_js)
                           + "\n<script>\n" + prepaint_js.strip() + "\n</script>"),
                html, "head scripts (guard + pre-paint)")

    # inline the stylesheet
    html = sub1(r'<link rel="stylesheet" href="styles\.css[^"]*">',
                lambda m: "<style>\n" + css + "\n</style>", html, "stylesheet link")

    # emblem as data: URI + visible ✈ fallback
    html = sub1(r'src="assets/364mea\.png"',
                lambda m: f'src="{emblem_uri}"', html, "emblem src")
    html = sub1(r'''onerror="this\.style\.display='none'"''',
                lambda m: '''onerror="this.replaceWith('✈')"''', html, "emblem onerror")

    # ROUND 22 — NOTHING IS STUBBED OUT ANY MORE. Every tab that exists in
    # app/index.html ships: Remarks · Description · Requirements · Flowchart ·
    # Scheduler (Board/Roster/Log/Balance/Bridge) · Currency · Validate. The
    # roster used to be the reason three <main>s were emptied; the export now
    # ships an EMPTY STORE instead, so there is nothing to hide.
    # The tripwire that used to be "5 hidden tabs / 3 main stubs" is now this
    # assertion: every view id app.js can switch to must be present, and no
    # element may still be a stub.
    for vid in ["view-remarks", "view-description", "view-requirements",
                "view-flowchart", "view-scheduler", "view-currency"]:
        if f'id="{vid}"' not in html:
            fail(f"view {vid} missing from app/index.html — layout changed?")
    if "stub:" in html:
        fail("a leftover stub marker is in the assembled HTML")

    # 17/10/2026 — THE ADVISOR DOES NOT TRAVEL. «Σύμβουλος» (app/advisor.js)
    # talks to the owner's local proxy, which talks to an API over the network.
    # On the closed network that can only fail, and the file would carry a
    # loopback URL, a Greek start-command and the word «API». So, like
    # schedsync.js (see prepare_appjs), it is cut out — here by the two marked
    # blocks in app/index.html (the tab and the <main>), and below by the
    # generic <script src> drop, which never inlines it because it is not in
    # SCRIPT_CHAIN. app.js's switchView tolerates the missing view/tab.
    html = sub1(r"[ \t]*<!-- advisor:start[\s\S]*?<!-- advisor:end -->\n", lambda m: "", html,
                "advisor blocks (tab + main)", count=2)

    # 18/10/2026 — ΤΟ BRIDGE ΔΕΝ ΤΑΞΙΔΕΥΕΙ. Ο συγχρονισμός του είναι Supabase,
    # δηλαδή cloud: στο κλειστό δίκτυο το fetch του πέφτει πάνω στο offline shim
    # και η καρτέλα ΔΕΝ μπορεί να δουλέψει ποτέ. Μια καρτέλα που θα αποτυγχάνει
    # πάντα, σε χέρια που δεν έχουν κανέναν να ρωτήσουν, είναι χειρότερη από
    # καρτέλα που δεν υπάρχει — «ό,τι δημιουργεί πρόβλημα για το export απλά δεν
    # το συμπεριλαμβάνουμε» (ιδιοκτήτης, 18/10/2026).
    # Δύο μπλοκ, όπως ο σύμβουλος: το κουμπί της υποκαρτέλας και το <section>.
    # Το schedbridge.js φεύγει από το SCRIPT_CHAIN και τα καλώδια προς αυτό από
    # τα prepare_scheduler / prepare_appjs — ΟΧΙ με edit στο app/.
    html = sub1(r"[ \t]*<!-- bridge:start[\s\S]*?<!-- bridge:end -->\n", lambda m: "", html,
                "bridge blocks (subtab + pane shell)", count=2)

    # Το ίδιο, για ό,τι ανήκει ΜΟΝΟ στη φιλοξενούμενη εφαρμογή: το web app
    # manifest και το εικονίδιο εγκατάστασης. Στο κλειστό δίκτυο δεν υπάρχει
    # διακομιστής να τα σερβίρει — θα έμεναν κρεμασμένοι σύνδεσμοι μέσα σε ένα
    # αρχείο που υποτίθεται ότι δεν ζητά ΤΙΠΟΤΑ από το δίκτυο.
    html = sub1(r"[ \t]*<!-- hosted:start[\s\S]*?<!-- hosted:end -->\n", lambda m: "", html,
                "hosted-only blocks (manifest + install icon)", count=1)

    # drop all external <script src> tags, then inline our chain before </body>
    # (12 tags: app · description · flowchart · schedval · schedstore · scheduler ·
    #  schedconsq · boardtrees · schedboard · schedbridge · currency · advisor.
    #  TEN are inlined from SCRIPT_CHAIN; advisor.js AND schedbridge.js are
    #  dropped here and NOT inlined — both need a network the unit does not
    #  have. The count is the tripwire on app/index.html: a new module must
    #  be looked at once — added to SCRIPT_CHAIN in main() and to the floor
    #  sweep, or deliberately excluded like advisor.js — before it moves.)
    html = sub1(r'[ \t]*<script src="[^"]+"></script>\n', lambda m: "", html,
                "external script tags", count=12)

    # The residue tripwire: nothing of the advisor may be in the shell — not the
    # view, not the tab, not the script, not its Greek label, not its boot hook.
    # (Checked on the shell BEFORE the data bundle and scripts are spliced in.
    #  18/10/2026: ΚΑΙ πάνω σε ολόκληρο το αρχείο, στο run_gate — ο έλεγχος
    #  εδώ ήταν μισός, και το μισό που έλειπε κουβαλούσε το «advInit».)
    for needle in _ADVISOR_NEEDLES + ("manifest.webmanifest", "hosted:start"):
        if needle in html:
            fail(f"advisor residue in the unit build: {needle!r} survived assembly")
    # Και το ίδιο για το Bridge, στο κέλυφος. Ο πλήρης έλεγχος (markup + scripts
    # + data) είναι ο gate_scan_unit στο run_gate: ΑΥΤΟ ήταν το μάθημα του
    # advInit, που έμενε μέσα στην app.js επειδή ο έλεγχος εδώ ήταν μισός.
    for needle in _BRIDGE_NEEDLES:
        if needle in html:
            fail(f"Bridge residue in the unit build: {needle!r} survived assembly")

    # 18/10/2026 — το credit της AI φεύγει ΕΔΩ, από το κέλυφος, πριν μπει
    # τίποτε άλλο μέσα: έτσι το tripwire της strip_attribution κρίνει ΜΟΝΟ το
    # markup της εφαρμογής και δεν μπορεί να πέσει σε λέξη του data bundle.
    html = strip_attribution(html)

    html = sub1(r"</body>", lambda m: scripts + "\n</body>", html, "</body>")

    html = sub1(r"<!DOCTYPE html>",
                lambda m: "<!DOCTYPE html>\n"
                          f"<!-- Phase 2 FDMS — single-file offline build {STAMP}\n"
                          "     generated by tools/build_offline.py; do not edit by hand.\n"
                          f"     Browser floor: {FLOOR}. Every inline script is pure ES5,\n"
                          "     proved by parsing each one with acorn at ecmaVersion 5.\n"
                          "     Self-contained: no network request of any kind is made.\n"
                          "     The scheduler store ships EMPTY — load data on site through\n"
                          "     Scheduler → «⋯» → ⭱ Import (needs the editor lock open). -->",
                html, "doctype marker")
    return html


# ────────────────────────────────────────────────────────────────────
# 7. README for the IT department (Greek)
# ────────────────────────────────────────────────────────────────────

README_TEMPLATE = """\
Phase 2 FDMS — μία εφαρμογή, ΕΝΑ αρχείο (offline)
=================================================
Έκδοση: {stamp}          Αρχείο: {name} ({size_mb} MB)

ΤΙ ΕΙΝΑΙ
Ολόκληρο το Phase 2 FDMS σε ΕΝΑ αυτόνομο αρχείο HTML: Remarks, Description,
Requirements, Phase II Flowchart, Scheduler (Board / Roster / Training Log /
Balance), Instructor Currency και Schedule Validation.

ΕΓΚΑΤΑΣΤΑΣΗ — ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ
- Άνοιγμα με διπλό κλικ. Όλα τα δεδομένα, το CSS, το JavaScript και το έμβλημα
  είναι ενσωματωμένα μέσα στο αρχείο.
- Συμβατό με Mozilla Firefox {floor_short} ή νεότερο, καθώς και με οποιονδήποτε
  σύγχρονο Chrome / Edge.
- ΔΙΟΡΘΩΘΗΚΕ: το σφάλμα σύνταξης («SyntaxError») που εμφάνιζε το παλαιότερο
  αρχείο στον Firefox 72 της Μονάδας, και άφηνε τη σελίδα κενή, δεν υπάρχει
  πλέον — όλος ο κώδικας του αρχείου γράφεται τώρα σε παλαιά έκδοση JavaScript.
- ΔΕΝ απαιτείται internet, server, εγκατάσταση προγράμματος ή δικαιώματα
  διαχειριστή. Η σελίδα ΔΕΝ στέλνει και ΔΕΝ λαμβάνει τίποτα από το δίκτυο —
  λειτουργεί εξ ολοκλήρου τοπικά μέσα στον browser.
- Μπορεί να αντιγραφεί ελεύθερα σε υπολογιστές ή σε κοινόχρηστο δίσκο.
- Αν ο browser είναι πολύ παλιός για την εφαρμογή, η σελίδα ΔΕΝ βγαίνει λευκή:
  εμφανίζει αγγλικό μήνυμα που ονομάζει ακριβώς τι λείπει.

ΔΕΔΟΜΕΝΑ — ΤΟ ΑΡΧΕΙΟ ΕΡΧΕΤΑΙ ΑΔΕΙΟ
- Δεν περιέχει ΚΑΝΕΝΑ ονοματεπώνυμο, call sign, ΑΜ ή στοιχείο μαθητή/εκπαιδευτή.
- Ο Scheduler ξεκινά με ΑΔΕΙΑ βάση. Η φόρτωση γίνεται επιτόπου:
    Scheduler → ✎ Editor (ορίζεται κωδικός επεξεργασίας την πρώτη φορά)
              → «⋯» → ⭱ Import → επιλογή αρχείου → πληκτρολόγηση REPLACE
- Τα δεδομένα μένουν ΤΟΠΙΚΑ στον κάθε υπολογιστή (localStorage του browser).
- Αντίγραφο ασφαλείας: «⋯» → ⭳ Export (κατεβάζει scheduler-backup-<ημ/νία>.json).

ΗΜΕΡΟΜΗΝΙΕΣ ΣΕ ΠΟΛΥ ΠΑΛΙΟ FIREFOX
Ο Firefox απέκτησε ημερολόγιο (date picker) στην έκδοση 57. Σε παλαιότερη
έκδοση τα πεδία ημερομηνίας γίνονται απλά κουτιά κειμένου — γράφετε
2026-08-28 (ή 28/08/2026, μετατρέπεται αυτόματα). Στον Firefox 57+ και σε
Chrome/Edge εμφανίζεται κανονικά το ημερολόγιο.

ΣΧΟΛΙΑ ΕΚΠΑΙΔΕΥΤΩΝ (FEEDBACK)
- Κάθε παρατήρηση έχει κουμπί «Feedback» για διορθώσεις/σχόλια.
- Στον Firefox τα σχόλια αποθηκεύονται ΤΟΠΙΚΑ. Με το «Export feedback (N)»
  (κάτω μέρος της σελίδας) εξάγονται ως μικρό JSON, το οποίο παραδίδεται στον
  συντάκτη της εφαρμογής. Δεν απαιτείται ενέργεια από το Τμήμα Πληροφορικής.

ΕΠΙΚΟΙΝΩΝΙΑ
Για οποιαδήποτε απορία ή διόρθωση: Ν. Κορωνιάδης — n.koroniadis@cityu.gr
"""


# ────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────

# THE SCRIPT CHAIN — the whole app, in app/index.html's own order, with the two
# dynamically-injected modules folded in where app.js would have injected them.
# schedsync.js is deliberately absent (see prepare_appjs); so is advisor.js
# (see build_main_html) — both talk to the network.
SCRIPT_CHAIN = [
    ("app.js (loader block neutralized by build_offline.py)", "app"),
    ("mifchart.js", "mifchart"),
    ("remarksearch.js", "remarksearch"),
    ("description.js", "description"),
    ("flowchart.js", "flowchart"),
    ("schedval.js", "schedval"),
    ("schedstore.js", "schedstore"),
    ("scheduler.js", "scheduler"),
    ("schedconsq.js", "schedconsq"),
    ("boardtrees.js", "boardtrees"),
    ("schedboard.js", "schedboard"),
    ("currency.js", "currency"),
]


def main() -> None:
    if ARGS.gate_selftest:
        gate_selftest()

    # 18/10/2026 — schedbridge.js ΕΞΩ, όπως το advisor.js και το schedsync.js:
    # ο συγχρονισμός του είναι Supabase (cloud), άρα στη Μοίρα είναι μια καρτέλα
    # 526.526 bytes που θα αποτυγχάνει πάντα. Το <script src> του μένει στο
    # app/index.html και πέφτει στο γενικό κόψιμο των tags — ο μετρητής των 12
    # δεν κουνιέται, ακριβώς όπως με τον σύμβουλο.
    sources = ["app.js", "mifchart.js", "remarksearch.js", "description.js",
               "flowchart.js", "schedval.js", "schedstore.js", "scheduler.js",
               "schedconsq.js", "boardtrees.js", "schedboard.js",
               "currency.js"]
    for f in [APP / "index.html", APP / "styles.css",
              APP / "assets" / "364mea.png", DATA / "flowchart2.json"] + \
             [APP / s for s in sources]:
        if not f.is_file():
            fail(f"missing source file: {f}")
    if not NO_TRANSPILE:
        deps()   # resolve the external toolchain + version-check up front

    index_html = read_text(APP / "index.html")
    css, css_notes = patch_css(read_text(APP / "styles.css"))
    prepaint_raw = extract_prepaint(index_html)

    raw = {
        "app": prepare_appjs(),
        "mifchart": prepare_mifchart(),
        "schedval": prepare_schedval(),
        "schedstore": prepare_schedstore(),
        "scheduler": prepare_scheduler(),
        "currency": prepare_currency(),
    }
    for s in sources:
        key = s[:-3]
        if key not in raw:
            raw[key] = read_text(APP / s)
    # THE SAME CSS FLOOR PATCH FOR EVERY BLOCK THAT WRITES CSS FROM A STRING —
    # the app's modules AND the builder's own, because a hand-patched island
    # beside a generated sheet is the shape of the defect this round fixed.
    own = {"capability-guard": CAPABILITY_GUARD_JS, "prepaint": prepaint_raw,
           "runtime-shims": RUNTIME_SHIMS_JS, "fetch-shim": FETCH_SHIM_JS,
           "date-fallback": DATE_FALLBACK_JS, "feedback": FEEDBACK_JS}

    # 18/10/2026 — ΠΡΙΝ από Babel και πριν από κάθε έλεγχο: οι εξωτερικοί
    # σύνδεσμοι αδρανοποιούνται στην ΠΗΓΗ. Αν γίνονταν μετά, θα έπρεπε να
    # αναγνωρίσουμε τη διεύθυνση μέσα σε μεταγλωττισμένο κώδικα, κι αυτό είναι
    # ακριβώς το είδος του «πέρασε από τη μία πύλη και όχι από την άλλη» που
    # έσπασε το inset στον Γύρο 24.
    raw, ext_notes = neutralise_externals(raw)

    cssjs_notes = []
    for key in list(raw):
        raw[key], nn = prepare_cssjs(key + ".js", raw[key])
        cssjs_notes += nn
    for key in list(own):
        own[key], nn = prepare_cssjs(key, own[key])
        cssjs_notes += nn

    for name, src in [("styles.css", css)] + [(k + ".js", v) for k, v in raw.items()]:
        if re.search(r"</(script|style)", src, re.I):
            fail(f"{name} contains a '</script'/'</style' sequence — inline-unsafe")

    png = (APP / "assets" / "364mea.png").read_bytes()
    emblem_uri = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    # ── transpile EVERYTHING that ships as inline JS, in ONE node run ──
    #    The guard and the shims go through Babel too. They are written in ES5
    #    by hand, so Babel has nothing to do to them — but running them through
    #    the same pipe means there is no block in the file that only a human
    #    ever checked.
    batch = [(k, v) for k, v in own.items()] + \
            [(k + ".js", v) for k, v in raw.items()]
    done = transpile_all(batch)
    guard_js = done["capability-guard"]
    prepaint_js = done["prepaint"]
    shims_js = done["runtime-shims"]
    fetch_js = done["fetch-shim"]
    datefb_js = done["date-fallback"]
    feedback_js = done["feedback"]
    mods = {k: done[k + ".js"] for k in raw}

    bundle = collect_data()
    data_js = data_bundle_js(bundle)          # generated ES5-safe object literal
    scripts = "\n".join(
        [script_tag(f"{SHIM_MARK} (build_offline.py) — each installs only when the "
                    f"API is missing", shims_js),
         script_tag(f"Embedded data bundle — {len(bundle)} JSON files", data_js),
         script_tag("Offline fetch shim", fetch_js),
         script_tag("Typed-date fallback (build_offline.py)", datefb_js)]
        + [script_tag(label, mods[key]) for label, key in SCRIPT_CHAIN]
        + [script_tag("Offline feedback module (build_offline.py)", feedback_js)]
    )
    html = build_main_html(css, emblem_uri, guard_js, prepaint_js, scripts)

    # ── QUALITY GATE (hard fail — nothing is written on violation) ──
    notes = run_gate(html, OUT_HTML.name)

    # ── write (or, under --dry-run, deliberately do not) ──
    html_bytes = html.encode("utf-8")
    size = len(html_bytes)
    readme = README_TEMPLATE.format(stamp=STAMP, name=OUT_HTML.name,
                                    size_mb=f"{size / 1048576:.1f}",
                                    floor_short=FLOOR.replace("Firefox ", ""))
    if DRY_RUN:
        print("DRY RUN — the build and every gate ran; NOTHING was written.")
        print(f"would write : {OUT_HTML}  ({size:,} bytes)")
        print(f"      sha256: {hashlib.sha256(html_bytes).hexdigest()}")
        print(f"would write : {OUT_README}  "
              f"({len(readme.encode('utf-8-sig')) + readme.count(chr(10)):,} bytes)")
        if ARGS.inspect_to:
            # Ο ΑΠΑΡΑΒΑΤΟΣ ΚΑΝΟΝΑΣ, γραμμένος σε κώδικα: ο φάκελος του
            # ιδιοκτήτη δεν δέχεται γράψιμο από εδώ, ούτε κατά λάθος, ούτε με
            # σχετική διαδρομή που καταλήγει μέσα του.
            dest = Path(ARGS.inspect_to).expanduser().resolve()
            if dest == EXPORT.resolve() or EXPORT.resolve() in dest.parents:
                fail(f"--inspect-to refuses {dest}: it is inside the owner's "
                     f"{EXPORT}, which only a real build may ever write to")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(html, encoding="utf-8", newline="\n")
            print(f"inspect copy: {dest}  (identical bytes, for verification only)")
    else:
        if ARGS.inspect_to:
            fail("--inspect-to is a verification aid for --dry-run only; a real "
                 "build writes the deliverable and nothing else")
        EXPORT.mkdir(parents=True, exist_ok=True)
        OUT_HTML.write_text(html, encoding="utf-8", newline="\n")
        size = OUT_HTML.stat().st_size
        OUT_README.write_text(readme, encoding="utf-8-sig", newline="\r\n")

    print(f"floor       : {FLOOR}  (every inline script emitted as {ES_TARGET})")
    print(f"modules     : {len(SCRIPT_CHAIN)} app modules "
          f"+ guard/shims/fetch/date/feedback  (schedsync.js, advisor.js and "
          f"schedbridge.js excluded — all three need the network)")
    print(f"data bundle : {len(bundle)} JSON files, "
          f"{sum(len(json.dumps(v, ensure_ascii=False)) for v in bundle.values()) / 1e6:.1f} MB raw"
          f"  (data/scheduler/seed.json shipped EMPTY)")
    for x in data_census(bundle):
        print(x)
    print(f"emblem      : {len(png)} bytes PNG -> {len(emblem_uri)} chars data URI")
    print(f"transpile   : @babel/core {BABEL_VERSION} + preset-env "
          f"{PRESET_ENV_VERSION} → {ES_TARGET}"
          + ("  ** SKIPPED (--no-transpile) **" if NO_TRANSPILE else ""))
    print(f"proof       : acorn {ACORN_VERSION}, ecmaVersion 5, every inline script"
          + ("  ** SKIPPED **" if NO_TRANSPILE else ""))
    print(f"build deps  : {deps() if not NO_TRANSPILE else '(skipped)'}")
    print(f"output      : {OUT_HTML}  ({size:,} bytes = {size / 1048576:.2f} MB)"
          + ("  ** NOT WRITTEN (--dry-run) **" if DRY_RUN else ""))
    print(f"readme      : {OUT_README}"
          + ("  ** NOT WRITTEN (--dry-run) **" if DRY_RUN else ""))
    for x in ext_notes:
        print(f"no-network  : {x}")
    for x in css_notes:
        print(f"css patch   : {x}")
    for x in cssjs_notes:
        print(f"css-in-js   : {x}")
    for x in notes:
        print(f"css note    : {x}")
    if size > MAX_BYTES:
        fail(f"output exceeds the {MAX_BYTES // 1048576} MB guard")
    print("OK")


if __name__ == "__main__":
    main()
