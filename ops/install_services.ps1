# ════════════════════════════════════════════════════════════════════════════
# FDMS — ΟΙ ΔΥΟ ΥΠΗΡΕΣΙΕΣ ΤΩΝ WINDOWS            (ΕΝΕΡΓΕΙΑ ΤΟΥ ΙΔΙΟΚΤΗΤΗ)
# ════════════════════════════════════════════════════════════════════════════
# Τρέξε το σε ELEVATED PowerShell (Run as Administrator).
# Προαπαιτούμενο: nssm στο PATH (υπάρχει ήδη — winget install nssm).
#
# ΤΙ ΣΤΗΝΕΙ
#   fdms-app       tools\serve_app.py       127.0.0.1:8123  — η εφαρμογή
#   fdms-advisor   tools\advisor_proxy.py   127.0.0.1:8771  — ο σύμβουλος
#
# ΔΥΟ ΥΠΗΡΕΣΙΕΣ, ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΟΙ ΛΟΓΑΡΙΑΣΜΟΙ — ΚΑΙ Ο ΛΟΓΟΣ ΜΕΤΡΑΕΙ
#
#   fdms-app τρέχει ως LocalSystem. Δεν χρειάζεται ΤΙΠΟΤΑ: μόνο stdlib, καμία
#   μεταβλητή περιβάλλοντος, κανένα μυστικό. Ο απλός λογαριασμός αρκεί.
#
#   fdms-advisor ΔΕΝ μπορεί να τρέξει ως LocalSystem. Δύο λόγοι, και οι δύο
#   μετρημένοι σε αυτό το μηχάνημα:
#     1. `anthropic` και `cryptography` είναι εγκατεστημένα ΑΝΑ ΧΡΗΣΤΗ
#        (AppData\Roaming\Python\Python311\site-packages). Ο LocalSystem δεν τα
#        βλέπει — ακριβώς το μάθημα που είναι ήδη γραμμένο στο Pelops
#        (07/07/2026: «No module named uvicorn»).
#     2. Τα μυστικά — ANTHROPIC_API_KEY, FDMS_CASEFILE_URL/KEY, FDMS_ACCESS_* —
#        ζουν ως μεταβλητές περιβάλλοντος ΤΟΥ ΧΡΗΣΤΗ. Ο LocalSystem δεν τις
#        βλέπει, και η εναλλακτική θα ήταν να ΓΡΑΦΤΟΥΝ κάπου — στο μητρώο της
#        υπηρεσίας ή σε επίπεδο μηχανήματος. Ο κανόνας του ιδιοκτήτη είναι ότι
#        το κλειδί μένει μεταβλητή περιβάλλοντος και δεν γράφεται πουθενά.
#   Άρα ο σύμβουλος τρέχει ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ ΣΟΥ. Τα Windows αποθηκεύουν τον
#   κωδικό ως LSA secret· τον πληκτρολογείς εσύ στο παράθυρο των Windows και
#   δεν περνά ποτέ από αυτό το αρχείο ούτε από τη συνομιλία.
#
# ΤΙ ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ: ΚΑΝΕΝΑΣ ΚΑΝΟΝΑΣ FIREWALL. Και οι δύο δένονται ΜΟΝΟ στο
# loopback, και το cloudflared καλεί το 127.0.0.1 από μέσα — η κίνηση loopback
# δεν περνά ποτέ από το inbound firewall των Windows.
#
# ΔΕΝ ΑΓΓΙΖΕΙ ΤΙΠΟΤΑ ΤΟΥ PELOPS: ούτε τα tsi-*, ούτε τη θύρα 8100, ούτε το
# cloudflared, ούτε το config.yml. Μόνο δύο νέα ονόματα υπηρεσιών.
# ════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$root = "D:\FDMS"
$py   = "C:\Program Files\Python311\python.exe"

if (-not (Test-Path $py))   { throw "Δεν βρέθηκε η Python: $py" }
if (-not (Test-Path $root)) { throw "Δεν βρέθηκε η ρίζα: $root" }
New-Item -ItemType Directory -Force "$root\logs" | Out-Null

# ΤΟ ΣΕΝΑΡΙΟ ΞΑΝΑΤΡΕΧΕΙ ΚΑΘΑΡΑ. Στην πρώτη δοκιμή (18/10) το δεύτερο τρέξιμο
# έβγαλε «The specified service already exists», και στο πρώτο ο σύμβουλος δεν
# ξεκίνησε: ο λογαριασμός μόλις είχε πάρει το δικαίωμα «Log on as a service»
# και ο SCM δεν το είχε δει ακόμη. Και τα δύο λύνονται ξηλώνοντας την παλιά
# υπηρεσία πρώτα, και με δεύτερη απόπειρα εκκίνησης.
function Remove-IfExists($name) {
    if (Get-Service $name -ErrorAction SilentlyContinue) {
        Write-Host "  (υπάρχει ήδη - ξηλώνεται για καθαρή εγκατάσταση)" -ForegroundColor DarkGray
        nssm stop $name confirm   2>$null | Out-Null
        nssm remove $name confirm 2>$null | Out-Null
        for ($i = 0; $i -lt 20 -and (Get-Service $name -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 500 }
    }
}

function Start-Robust($name) {
    for ($i = 1; $i -le 3; $i++) {
        try { Start-Service $name -ErrorAction Stop; return }
        catch {
            if ($i -eq 3) {
                Write-Host "  Η $name δεν ξεκινησε: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "  Δες: $root\logs\$name.err.log   ή τρέξε:  nssm edit $name" -ForegroundColor Red
                return
            }
            Write-Host "  δεν ξεκίνησε ($i/3) - δεύτερη απόπειρα σε 3 δευτ..." -ForegroundColor DarkYellow
            Start-Sleep -Seconds 3
        }
    }
}

function Set-Common($name) {
    nssm set $name AppDirectory      "$root"
    nssm set $name AppStdout         "$root\logs\$name.log"
    nssm set $name AppStderr         "$root\logs\$name.err.log"
    nssm set $name AppRotateFiles    1
    nssm set $name AppRotateOnline   1
    nssm set $name AppRotateBytes    10485760
    nssm set $name Start             SERVICE_AUTO_START
    nssm set $name AppExit Default   Restart
    nssm set $name AppRestartDelay   30000
}

# ── 1. Η ΕΦΑΡΜΟΓΗ — LocalSystem, τίποτα να της δώσεις ───────────────────────
Write-Host "`n== fdms-app ==" -ForegroundColor Cyan
Remove-IfExists fdms-app
nssm install fdms-app "$py" "tools\serve_app.py"
Set-Common fdms-app
nssm set fdms-app Description "FDMS - allow-list static server on 127.0.0.1:8123"

# ── 2. Ο ΣΥΜΒΟΥΛΟΣ — με τον λογαριασμό σου ──────────────────────────────────
Write-Host "`n== fdms-advisor ==" -ForegroundColor Cyan
Write-Host "Θα ζητηθεί ο λογαριασμός ΣΟΥ των Windows." -ForegroundColor Yellow
Write-Host "Γράψε τον ως  $env:COMPUTERNAME\$env:USERNAME  (ή  .\$env:USERNAME )." -ForegroundColor Yellow
$cred = Get-Credential -UserName "$env:COMPUTERNAME\$env:USERNAME" `
        -Message "Ο λογαριασμός με τον οποίο θα τρέχει ο σύμβουλος (χρειάζεται τις μεταβλητές περιβάλλοντος και τα πακέτα σου)"

Remove-IfExists fdms-advisor
nssm install fdms-advisor "$py" "tools\advisor_proxy.py"
Set-Common fdms-advisor
nssm set fdms-advisor Description "FDMS - advisor proxy on 127.0.0.1:8771 (needs the owner's env and user site-packages)"
nssm set fdms-advisor ObjectName $cred.UserName $cred.GetNetworkCredential().Password

# ── 3. Εκκίνηση ─────────────────────────────────────────────────────────────
Write-Host "`n== εκκίνηση ==" -ForegroundColor Cyan
Start-Robust fdms-app
Start-Robust fdms-advisor
Start-Sleep -Seconds 6
Get-Service fdms-app, fdms-advisor | Select-Object Name, Status, StartType | Format-Table -AutoSize

# ── 4. Η ΕΠΑΛΗΘΕΥΣΗ — ΤΟ ΜΟΝΟ ΠΟΥ ΑΠΟΔΕΙΚΝΥΕΙ ΟΤΙ ΠΕΡΑΣΑΝ ΤΑ ΜΥΣΤΙΚΑ ───────
# Αν κάποιο βγει «ΟΧΙ», η υπηρεσία τρέχει αλλά ΔΕΝ κληρονόμησε το περιβάλλον
# σου. Τότε δες τη σημείωση στο τέλος του αρχείου.
Write-Host "`n== επαλήθευση ==" -ForegroundColor Cyan
try {
    $h = Invoke-RestMethod "http://127.0.0.1:8771/health" -TimeoutSec 10
    $yn = { param($b) if ($b) { "ΝΑΙ" } else { "ΟΧΙ  <-- ΠΡΟΒΛΗΜΑ" } }
    Write-Host ("  ANTHROPIC_API_KEY : " + (& $yn $h.key_present))
    Write-Host ("  φάκελος υποθέσεων : " + (& $yn $h.casefile.configured))
    Write-Host ("  Cloudflare Access : " + (& $yn $h.access.configured))
    Write-Host ("  agents            : " + (($h.agents | ForEach-Object { $_.id }) -join ", "))
} catch {
    Write-Host "  Ο σύμβουλος δεν απάντησε στο /health: $_" -ForegroundColor Red
    Write-Host "  Δες: $root\logs\fdms-advisor.err.log" -ForegroundColor Red
}
try {
    $c = (Invoke-WebRequest "http://127.0.0.1:8123/app/" -UseBasicParsing -TimeoutSec 10).StatusCode
    Write-Host "  η εφαρμογή στο 8123 : $c"
} catch {
    Write-Host "  Η εφαρμογή δεν απάντησε: $_" -ForegroundColor Red
}

Write-Host @"

ΑΝ Η ΕΠΑΛΗΘΕΥΣΗ ΕΔΕΙΞΕ «ΟΧΙ»
  Η υπηρεσία τρέχει με τον λογαριασμό σου αλλά δεν πήρε τις μεταβλητές.
  Λύση ΧΩΡΙΣ να γραφτεί μυστικό πουθενά: βάλε τις ΙΔΙΕΣ μεταβλητές και σε
  επίπεδο μηχανήματος ΔΕΝ το προτείνουμε. Αντ' αυτού τρέξε:
      nssm edit fdms-advisor
  και στην καρτέλα Environment πρόσθεσε ΜΟΝΟ όσες λείπουν. Γράφονται στο
  μητρώο της υπηρεσίας, που διαβάζεται μόνο από διαχειριστές — πιο στενό από
  το να γίνουν μεταβλητές μηχανήματος, που τις διαβάζει κάθε χρήστης.

ΑΠΕΓΚΑΤΑΣΤΑΣΗ
      nssm stop fdms-advisor; nssm remove fdms-advisor confirm
      nssm stop fdms-app;     nssm remove fdms-app confirm
"@ -ForegroundColor DarkGray
