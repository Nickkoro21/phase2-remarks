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

    def _serve(self, head_only: bool):
        if self.path in ("", "/"):
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.send_header("Content-Length", "0")
            self._hardening()
            self.end_headers()
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
