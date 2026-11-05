#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ο SERVER ΤΗΣ ΕΦΑΡΜΟΓΗΣ — serve_app.py
════════════════════════════════════════════════════════════════════════════

ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Αντικαθιστά το `python -m http.server 8123`, που είχε δύο
ιδιότητες τις οποίες κανείς δεν είχε αποφασίσει:

  1. ΣΕΡΒΙΡΕ Ο,ΤΙ ΥΠΑΡΧΕΙ. Ο κανόνας ήταν «όλα, εκτός από τίποτα»: το
     `/.git/config` απαντούσε 200, ο φάκελος `tools/advisor/sessions/` —
     πραγματικά ονόματα μαθητών, gitignored ακριβώς γι' αυτό — ήταν
     περιηγήσιμος, και τα PDF των εγχειριδίων κατεβαίνονταν αυτούσια.
     ΤΟ ΟΥΣΙΩΔΕΣ ΔΕΝ ΕΙΝΑΙ ΠΟΙΑ ΑΡΧΕΙΑ ΗΤΑΝ ΕΚΕΙ ΧΘΕΣ: είναι ότι τη λίστα
     την όριζε ό,τι τύχαινε να πέσει στον φάκελο. Ένα backup, ένα csv με
     ονόματα, μια δοκιμαστική εξαγωγή του roster — στο δίκτυο την ίδια
     στιγμή, χωρίς να το σκεφτεί κανείς.
  2. ΔΕΝΟΤΑΝ ΣΕ 0.0.0.0. Κάθε διεπαφή του μηχανήματος, όχι μόνο το loopback.

ΕΔΩ Ο ΚΑΝΟΝΑΣ ΑΝΤΙΣΤΡΕΦΕΤΑΙ: «ΤΙΠΟΤΑ, ΕΚΤΟΣ ΑΠΟ ΑΥΤΑ».

      app/**     →  .html .css .js .png .svg .ico .webp .woff2 .map
      data/**    →  ΜΟΝΟ .json
      οτιδήποτε άλλο  →  404

Η λίστα δεν είναι μαντεψιά: βγήκε διαβάζοντας ΚΑΘΕ fetch() και κάθε src/href
της ίδιας της εφαρμογής. Τα `data/README.md`, `data/USER_DECISIONS.md` και
`data/requirements/README.md` μένουν σκοπίμως απ' έξω — η σελίδα δεν τα ζητά.

ΔΕΝ ΚΑΝΕΙ ΚΑΤΑΛΟΓΟΥΣ. Ούτε ένα listing, πουθενά: ένας κατάλογος είναι χάρτης
για όποιον ψάχνει, και δεν τον χρειάζεται κανένας πραγματικός χρήστης.

ΤΟ LOOPBACK ΕΙΝΑΙ Η ΠΡΟΕΠΙΛΟΓΗ. Πίσω από Cloudflare Tunnel το `cloudflared`
συνδέεται στο 127.0.0.1 — δεν χρειάζεται τίποτα παραπάνω. Το `--host` υπάρχει
για όποιον ξέρει τι κάνει, και το λέει δυνατά όταν το χρησιμοποιεί.

ΤΡΕΞΙΜΟ:
    python tools/serve_app.py                 # 127.0.0.1:8123
    python tools/serve_app.py --port 8124
    python tools/serve_app.py --host 0.0.0.0  # με προειδοποίηση
"""
from __future__ import annotations

import argparse
import datetime
import mimetypes
import os
import pathlib
import posixpath
import re
import socket
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ── Η ΛΙΣΤΑ ─────────────────────────────────────────────────────────────────
# πρώτο τμήμα διαδρομής → οι επεκτάσεις που επιτρέπονται κάτω από αυτό.
ALLOW: dict[str, set[str]] = {
    "app":  {".html", ".css", ".js", ".png", ".svg", ".ico", ".webp", ".woff2", ".map",
             ".webmanifest"},
    "data": {".json"},
}
INDEX = "app/index.html"

# ── ΤΑ ΤΡΙΑ ΕΓΓΡΑΦΑ, ΟΝΟΜΑΣΤΙΚΑ ─────────────────────────── (05/11/2026) ──
# ΓΙΑΤΙ ΧΩΡΙΣΤΟΣ ΧΑΡΤΗΣ ΚΑΙ ΟΧΙ «.pdf» ΣΤΗ ΛΙΣΤΑ ΠΑΡΑΠΑΝΩ. Η ALLOW δουλεύει
# ανά ΚΑΤΑΛΟΓΟ και επέκταση: ένα «.pdf» κάπου εκεί μέσα θα σέρβιρε ΚΑΘΕ pdf
# που θα έπεφτε ποτέ σε εκείνον τον κατάλογο — και τα κανονιστικά κείμενα δεν
# είναι στατικά αρχεία της εφαρμογής, είναι η ΠΗΓΗ. Εδώ η λίστα είναι
# ΟΝΟΜΑΣΤΙΚΗ: τρία κλειδιά, τρία αρχεία, τίποτε άλλο δεν μπορεί να ζητηθεί,
# όσο κι αν παίξει κανείς με τη διαδρομή.
#
# ΤΑ ΑΡΧΕΙΑ ΖΟΥΝ ΣΤΗ ΡΙΖΑ ΚΑΙ ΕΙΝΑΙ gitignored — δεν ανεβαίνουν στο δημόσιο
# repo. Το κλειδί είναι λατινικό επίτηδες: το «3-01_2025_ΔΑΕ.pdf» σε URL θα
# γινόταν percent-encoded ελληνικό, που σπάει σε κάθε δεύτερο εργαλείο.
PDFS: dict[str, str] = {
    "3-01":     "3-01_2025_ΔΑΕ.pdf",
    "syllabus": "Phase_2_Syllabus_2025.pdf",
    "fek":      "fek_a_57_2020.pdf",
}


def resolve_pdf(url_path: str) -> pathlib.Path | None:
    """/pdf/<κλειδί> → το αρχείο, ή None. Καμία διαδρομή, μόνο κλειδί."""
    path = urllib.parse.unquote(urllib.parse.urlsplit(url_path).path, errors="replace")
    parts = [x for x in posixpath.normpath(path).lstrip("/").split("/") if x not in ("", ".")]
    if len(parts) != 2 or parts[0] != "pdf":
        return None
    name = PDFS.get(parts[1])
    if not name:
        return None
    f = ROOT / name
    return f if f.is_file() else None

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg":  "image/svg+xml",
    ".map":  "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json; charset=utf-8",
}


def resolve(url_path: str) -> pathlib.Path | None:
    """Επιστρέφει το αρχείο ΜΟΝΟ αν περνά τη λίστα. Αλλιώς None.

    Η σειρά των ελέγχων είναι σκόπιμη: πρώτα κανονικοποιούμε (ώστε τα `..`
    να έχουν ήδη καταρρεύσει), μετά ρωτάμε τη λίστα, και ΤΕΛΕΥΤΑΙΟ ρωτάμε
    το σύστημα αρχείων αν το πραγματικό μονοπάτι είναι ακόμη μέσα στη ρίζα —
    γιατί ένα symlink μπορεί να δείχνει οπουδήποτε.
    """
    path = urllib.parse.urlsplit(url_path).path
    path = urllib.parse.unquote(path, errors="replace")
    path = posixpath.normpath(path).lstrip("/")
    if path in ("", ".", "app"):
        path = INDEX
    elif path == "app/":
        path = INDEX

    parts = [p for p in path.split("/") if p not in ("", ".")]
    if not parts or ".." in parts:
        return None
    top = parts[0]
    if top not in ALLOW:
        return None
    if len(parts) < 2:
        return None

    cand = ROOT.joinpath(*parts)
    if cand.is_dir():
        cand = cand / "index.html"
        parts.append("index.html")
    if cand.suffix.lower() not in ALLOW[top]:
        return None

    try:
        real = cand.resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    if not real.is_file():
        return None
    try:
        real.relative_to(ROOT)          # symlink έξω από τη ρίζα → όχι
    except ValueError:
        return None
    return real


class Handler(BaseHTTPRequestHandler):
    server_version = "fdms-serve/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):   # noqa: A003 — μία γραμμή, χωρίς query
        sys.stderr.write("[%s] %s %s\n" % (
            datetime.datetime.now().strftime("%H:%M:%S"), self.address_string(), fmt % args))

    def _deny(self, code: int = 404):
        body = b"404\n"
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._hardening()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _hardening(self):
        # Τίποτα από αυτή τη σελίδα δεν ανήκει σε iframe ξένου, και κανένας
        # browser δεν πρέπει να μαντεύει τύπο περιεχομένου.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")

    def _serve_pdf(self, f: pathlib.Path, head_only: bool):
        """ΜΕ RANGE, ΚΑΙ ΑΥΤΟ ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Ο pdf.js ζητά το έγγραφο
        σε κομμάτια: ανοίγει τον πίνακα περιεχομένων από το ΤΕΛΟΣ του αρχείου
        και μετά μόνο τις σελίδες που δείχνει. Χωρίς Range κατεβάζει κάθε φορά
        και τα 3,6 MB για να δείξει μία σελίδα — και το κάνει ΞΑΝΑ σε κάθε
        παραπομπή που ανοίγει άλλο έγγραφο.

        Ένα μόνο εύρος εξυπηρετείται· τα πολλαπλά (multipart/byteranges) δεν
        τα ζητά κανένας browser για PDF, και μια μισοϋλοποιημένη εκδοχή τους
        είναι χειρότερη από καθαρή άρνηση — απαντάμε 200 ολόκληρο."""
        try:
            size = f.stat().st_size
        except OSError:
            self._deny(404)
            return
        rng = self.headers.get("Range", "")
        start, end = 0, size - 1
        partial = False
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng.strip()) if rng else None
        if m:
            a, b = m.group(1), m.group(2)
            if a:
                start = int(a)
                end = int(b) if b else size - 1
            elif b:                                   # bytes=-N → τα τελευταία N
                start = max(0, size - int(b))
            if start >= size or start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self._hardening()
                self.end_headers()
                return
            end = min(end, size - 1)
            partial = True
        length = end - start + 1
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        # Το έγγραφο δεν αλλάζει· το `no-cache` των υπολοίπων θα ξανακατέβαζε
        # megabytes σε κάθε παραπομπή. Αν αλλάξει έκδοση εγχειριδίου, αλλάζει
        # και το sha256 στο grounding.json — εκεί το πιάνουμε, όχι εδώ.
        self.send_header("Cache-Control", "private, max-age=3600")
        self._hardening()
        self.end_headers()
        if head_only:
            return
        with f.open("rb") as fh:
            fh.seek(start)
            left = length
            while left > 0:
                chunk = fh.read(min(1 << 16, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return                 # ο viewer έκλεισε στη μέση· φυσιολογικό
                left -= len(chunk)

    def _serve(self, head_only: bool):
        if self.path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.send_header("Content-Length", "0")
            self._hardening()
            self.end_headers()
            return
        pdf = resolve_pdf(self.path)
        if pdf is not None:
            self._serve_pdf(pdf, head_only)
            return
        f = resolve(self.path)
        if f is None:
            self._deny()
            return
        try:
            data = f.read_bytes()
        except OSError:
            self._deny(404)
            return
        ctype = TYPES.get(f.suffix.lower()) or mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        # Πάντα επανεπικύρωση: το `?v=` της σελίδας έχει ήδη ξεχαστεί μία φορά
        # και σέρβιρε παλιό JS για ώρες. Ο κύκλος 304 κοστίζει ένα ταξίδι.
        self.send_header("Cache-Control", "no-cache")
        self._hardening()
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def do_GET(self):   # noqa: N802
        self._serve(False)

    def do_HEAD(self):  # noqa: N802
        self._serve(True)


class Server(ThreadingHTTPServer):
    """allow_reuse_address OFF, όπως και στον proxy: στα Windows το SO_REUSEADDR
    επιτρέπει σε ΔΕΥΤΕΡΟ server να δεσμεύσει την ίδια θύρα και να σκιάσει τον
    πρώτο σιωπηλά. Καλύτερα να σκάσει με «η θύρα είναι πιασμένη»."""
    allow_reuse_address = False
    daemon_threads = True


class ServerV6(Server):
    address_family = socket.AF_INET6


def bind(host: str, port: int):
    return (ServerV6 if ":" in host else Server)((host, port), Handler)


def main() -> int:
    ap = argparse.ArgumentParser(description="Ο server της εφαρμογής FDMS — με ρητή λίστα, όχι ολόκληρος ο φάκελος.")
    ap.add_argument("--port", type=int, default=int(os.environ.get("FDMS_APP_PORT", "8123")))
    ap.add_argument("--host", default=os.environ.get("FDMS_APP_HOST", ""),
                    help="συγκεκριμένη διεύθυνση· κενό = ΚΑΙ ΤΑ ΔΥΟ loopback (127.0.0.1 και ::1)")
    args = ap.parse_args()

    # ΓΙΑΤΙ ΔΥΟ ΥΠΟΔΟΧΕΣ. Στα Windows το «localhost» λύνεται ΚΑΙ σε ::1 ΚΑΙ σε
    # 127.0.0.1. Ο παλιός `http.server` έδενε στο `::` — ΟΛΕΣ τις διεπαφές —
    # και έτσι τα κάλυπτε κατά λάθος. Δένοντας μόνο στο 127.0.0.1 θα σπάγαμε
    # το «localhost» σε browser που δοκιμάζει πρώτα IPv6· και η διεύθυνση ΔΕΝ
    # είναι διαπραγματεύσιμη: αλλάζοντάς την αλλάζει το origin, και μαζί του
    # χάνεται η αποθήκη του browser — κωδικός editor, ρυθμίσεις, δεδομένα.
    hosts = [args.host] if args.host else ["127.0.0.1", "::1"]
    servers = []
    for h in hosts:
        try:
            servers.append((h, bind(h, args.port)))
        except OSError as e:
            if args.host:
                print(f"Η θύρα {h}:{args.port} δεν δεσμεύεται ({e.strerror or e}).", file=sys.stderr)
                return 2
            print(f"  (το {h} δεν δεσμεύτηκε: {e.strerror or e} — συνεχίζω)")
    if not servers:
        print(f"Καμία διεύθυνση δεν δεσμεύτηκε στη θύρα {args.port}. Τρέχει ήδη κάτι;", file=sys.stderr)
        return 2

    print(f"FDMS — server στο http://localhost:{args.port}/app/")
    print("  διευθύνσεις: " + " · ".join(h for h, _ in servers))
    print(f"  ρίζα: {ROOT}")
    print("  σερβίρονται ΜΟΝΟ: " + " · ".join(f"{k}/** ({' '.join(sorted(v))})" for k, v in ALLOW.items()))
    have = [k for k, v in PDFS.items() if (ROOT / v).is_file()]
    miss = [k for k in PDFS if k not in have]
    print(f"  + /pdf/<κλειδί> ονομαστικά: {' '.join(have) or '(κανένα)'}"
          + (f"   ΛΕΙΠΟΥΝ: {' '.join(miss)}" if miss else ""))
    print("  όλα τα υπόλοιπα (tools/ specs/ .git/ *.pdf agents/ db/) → 404")
    if args.host and args.host not in ("127.0.0.1", "localhost", "::1"):
        print(f"  ΠΡΟΣΟΧΗ: δένεται στο {args.host} — ΟΧΙ μόνο loopback. Πίσω από tunnel δεν χρειάζεται.")
    print("  Ctrl+C για τερματισμό.")

    for _, srv in servers[1:]:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        servers[0][1].serve_forever()
    except KeyboardInterrupt:
        print("")
        print("τέλος.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
