"""
Streamify  -  run with:  python server.py

Serves the folder you start it from, with:
  * a responsive Netflix-style web UI (phone / tablet / laptop)
    -> files live in ./ui  (index.html, style.css, app.js)
  * HTTP Range support (video seeking works)
  * one-line colored request logs + session summary
No extra packages needed (Python 3.8+).
"""

import html
import http.server
import io
import ipaddress
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.parse
from datetime import datetime
from http import HTTPStatus
from urllib.parse import quote, unquote

import posters  # every cache: posters, thumbnails, audio / subtitle tracks (posters.py)

# Enable ANSI colors on Windows terminals (harmless elsewhere)
os.system("")

R = "\033[0m"
B = "\033[1m"
DIM = "\033[90m"
RED = "\033[91m"
GRN = "\033[92m"
YEL = "\033[93m"
BLU = "\033[94m"
MAG = "\033[95m"
ABORT_COL = "\033[38;5;208m"  # orange: different from yellow RESPONSE, red ERROR and the magenta VIDEO label
CYN = "\033[96m"

PORT = 2904
CHUNK = 64 * 1024
NAME_W = 36  # visible width of the PATH column
RES_W = 66  # visible width of the RESULT column
LOG_LIFECYCLE = True  # True : REQUEST + RESPONSE + DONE/ABORTED lines per request
# False: only the final line (DONE / ABORTED / ERROR)
LINE_W = 10 + 10 + 17 + 8 + NAME_W + 2 + RES_W + 2 + 8
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_NAME = (
    "Streamify"  # shown in the console banner, the browser tab and the page header
)
UI_DIR = os.path.join(BASE_DIR, "ui")
UI_PREFIX = "/__ui/"  # URL prefix that maps to the ./ui folder

# ---- who may connect --------------------------------------------------------
# True: connections are accepted only from this PC and from private network addresses
# (your home / hotspot Wi-Fi: 192.168.x.x, 10.x.x.x, 172.16-31.x.x). Anything coming from
# the internet is refused, even if the router or a tunnel lets it reach this PC.
ONLY_LOCAL_NETWORK = True
EXTRA_ALLOWED_NETWORKS = ()  # e.g. ("100.64.0.0/10",) to also allow a Tailscale VPN

# ---- posters and previews ---------------------------------------------------
# Folders are matched by name, anywhere inside the shared folder (not case-sensitive).
POSTER_FOLDERS = (
    "Vedios",
    "Videos",
)  # videos in here get an official movie / show poster
PREVIEW_FOLDERS = ("Photos",)  # videos in here get a preview frame ...
PREVIEW_MAX_MB = 500  # ... but only up to this size; bigger ones show the default image
# Extra audio languages the player extracts are cached (audio_track_cache); the oldest are
# deleted when the folder grows beyond this many GB.
AUDIO_CACHE_MAX_GB = 5


def load_env(path):
    """Tiny .env reader (KEY=value lines, # comments, optional quotes) - no packages needed.
    Variables already set in the real environment win over the file."""
    try:
        with open(path, encoding="utf-8-sig") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        if name.lower().startswith("export "):
            name = name[7:].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].strip()
        if name:
            os.environ.setdefault(name, value)


load_env(os.path.join(BASE_DIR, ".env"))
# Optional, free: create a key at https://www.themoviedb.org/settings/api and put it in the
# .env file next to server.py:   TMDB_API_KEY=your_key_here
# Without it, Wikipedia is used for posters.
TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "").strip()

# Folder that gets shared. By default it is the folder ABOVE this one, so with
# E:\Streamify\server.py you share E:\  (Films, Web Series, photos ...).
# Change it to any path you like, e.g.  MEDIA_ROOT = r"E:\"
# You can also override it per run:   python server.py "D:\Movies"
MEDIA_ROOT = os.path.dirname(BASE_DIR)
HIDDEN = {
    "$recycle.bin",
    "system volume information",
    "thumbs.db",
    "desktop.ini",
    "found.000",
    "poster_cache",
    "thumb_cache",
    "films_thumbnails",
    "short_video_thumbnails",
    "photo_thumbnails",
    "photo_previews",
    "subtitle_cache",
    "audio_track_cache",
}

print_lock = threading.Lock()
stats = {"requests": 0, "bytes": 0, "aborted": 0, "errors": 0}
started_at = time.time()


# --------------------------------------------------------------------------
# Console helpers
# --------------------------------------------------------------------------
def ts():
    return datetime.now().strftime("%H:%M:%S")


def human(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return f"{int(n)} B" if u == "B" else f"{n:.1f} {u}"
        n /= 1024


def device(ua):
    ua = ua or ""
    for key, name in (
        ("iPhone", "iOS"),
        ("iPad", "iOS"),
        ("Android", "Android"),
        ("Windows", "Windows"),
        ("Macintosh", "Mac"),
        ("Linux", "Linux"),
    ):
        if key in ua:
            return name
    return "Other"


ANSI = re.compile(r"\[[0-9;]*m")
EVENT_COL = {
    "REQUEST": CYN,
    "RESPONSE": YEL,
    "DONE": GRN,
    "ABORTED": ABORT_COL,
    "ERROR": B + RED,
}


def vlen(text):
    """Visible length of a string (ignores color codes)."""
    return len(ANSI.sub("", text))


def phrase(code):
    try:
        return HTTPStatus(code).phrase
    except ValueError:
        return ""


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def banner(ip):
    w = 60
    rows = [
        ("Folder", os.getcwd()),
        ("Phone", f"http://{ip}:{PORT}"),
        ("Local", f"http://localhost:{PORT}"),
        (
            "Access",
            (
                "this network only"
                if ONLY_LOCAL_NETWORK
                else "ANYONE who can reach this PC"
            ),
        ),
    ]
    print(f"{CYN}╭{'─' * w}╮{R}")
    print(f"{CYN}│{R}{B}{('  ' + APP_NAME.upper()).ljust(w)}{R}{CYN}│{R}")
    print(f"{CYN}├{'─' * w}┤{R}")
    for k, v in rows:
        label = f"  {k:<8}"
        v = v[: w - len(label)]
        pad = " " * (w - len(label) - len(v))
        print(f"{CYN}│{R}{DIM}{label}{R}{GRN}{v}{R}{pad}{CYN}│{R}")
    print(f"{CYN}╰{'─' * w}╯{R}")
    print(
        f"  {CYN}REQUEST{R} asked   {YEL}RESPONSE{R} headers sent   {GRN}DONE{R} fully sent   "
        f"{ABORT_COL}ABORTED{R} client stopped   {B}{RED}ERROR{R} failed"
    )
    print(f"  {DIM}ABORTED is normal when you skip or close a video{R}\n")
    head = (
        "TIME".ljust(10)
        + "EVENT".ljust(10)
        + "IP".ljust(17)
        + "TYPE".ljust(8)
        + "PATH".ljust(NAME_W + 2)
        + "RESULT".ljust(RES_W + 2)
        + "DEVICE"
    )
    print(f"{DIM}{head}{R}")
    print(f"{DIM}{'─' * LINE_W}{R}")


# --------------------------------------------------------------------------
# Request handler
# --------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 keep-alive: a page with 100 thumbnails reuses one connection instead of
    # opening 100 (every response below sends a Content-Length, which keep-alive needs).
    protocol_version = "HTTP/1.1"

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".mkv": "video/webm",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/mp4",
        ".m4v": "video/mp4",
        ".avi": "video/x-msvideo",
        ".wmv": "video/x-ms-wmv",
        ".flv": "video/x-flv",
        ".3gp": "video/3gpp",
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".heic": "image/heic",
        ".heif": "image/heif",
        ".png": "image/png",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        ".opus": "audio/ogg",
        # Windows registry sometimes maps these wrongly, which breaks the UI
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
    }

    # ---------- serve ./ui files under /__ui/ ----------
    def translate_path(self, path):
        p = unquote(path.split("?", 1)[0].split("#", 1)[0])
        if p.startswith(UI_PREFIX):
            rel = [
                x for x in p[len(UI_PREFIX) :].split("/") if x not in ("", ".", "..")
            ]
            return os.path.join(UI_DIR, *rel)
        cached = posters.cache_path(p)  # /__film/, /__short/, /__photo/, /__audio/ ...
        if cached:
            return cached
        return super().translate_path(path)

    def send_header(self, keyword, value):
        k = keyword.lower()
        if k == "content-length":
            try:
                self.clen = int(value)
            except ValueError:
                pass
        elif k == "content-range":
            self.crange = value
        super().send_header(keyword, value)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        rp = getattr(self, "req_path", "")
        ok = (getattr(self, "status", 0) or 0) < 400  # never cache an error page
        if ok and rp.startswith(UI_PREFIX + "assets/"):
            self.send_header(
                "Cache-Control", "public, max-age=86400"
            )  # static images: a day
        elif ok and rp.startswith(posters.CACHE_PREFIXES):
            # file names contain a hash of the picture / size / date, so a new file = a new URL
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif rp.startswith(UI_PREFIX):
            self.send_header("Cache-Control", "no-cache")  # edits show up on refresh
        super().end_headers()
        code = getattr(self, "status", None) or 0
        if LOG_LIFECYCLE and 0 < code < 400 and not getattr(self, "quiet", True):
            text = f"{YEL}{code} {phrase(code)}{R}"
            if getattr(self, "clen", None) is not None:
                text += f"{DIM} · {human(self.clen)}{R}"
            if getattr(self, "crange", None):
                text += f"{DIM} · {self.crange}{R}"
            self.log_line("RESPONSE", text)
            self.resp_logged = True

    # ---------- quiet the defaults ----------
    def log_message(self, format, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except OSError:
            pass

    def finish(self):
        try:
            super().finish()
        except OSError:
            pass

    def send_response(self, code, message=None):
        self.status = int(code)
        super().send_response(code, message)

    # ---------- one-line log ----------
    def kind_of(self):
        if os.path.isdir(self.fs_path):
            return "FOLDER", YEL
        ct = self.guess_type(self.fs_path)
        if ct.startswith("video/"):
            return "VIDEO", MAG
        if ct.startswith("image/"):
            return "IMAGE", BLU
        if ct.startswith("audio/"):
            return "AUDIO", CYN
        return "FILE", DIM

    def log_line(self, event, result):
        kind, kcol = self.kind_of()
        name = self.req_path
        if len(name) > NAME_W:
            name = "…" + name[-(NAME_W - 1) :]
        pad = " " * max(RES_W - vlen(result), 0)
        line = (
            f"{DIM}{ts():<10}{R}"
            f"{EVENT_COL[event]}{event:<10}{R}"
            f"{DIM}{self.client_address[0]:<17}{R}"
            f"{kcol}{kind:<8}{R}"
            f"{name:<{NAME_W + 2}}"
            f"{result}{pad}  "
            f"{DIM}{device(self.headers.get('User-Agent'))}{R}"
        )
        with print_lock:
            print(line, flush=True)

    def log_req_line(self):
        rng = self.headers.get("Range")
        extra = f"  {DIM}Range: {rng}{R}" if rng else ""
        self.log_line("REQUEST", f"{self.command}{extra}")

    def emit(self, event=None):
        """Final log line. event: 'DONE' / 'ABORTED' / 'ERROR', or None for no-body replies."""
        if self.logged:
            return
        self.logged = True

        code = self.status or 0
        if code == 404 and self.req_path.endswith("favicon.ico"):
            return  # browsers always ask for this, ignore the noise
        if self.quiet and code < 400 and event != "ERROR":
            return  # css/js of the web UI, ignore the noise

        dur = max(time.time() - self.t0, 0.001)
        is_dir = os.path.isdir(self.fs_path)

        if event == "ERROR":
            ev = "ERROR"
            result = f"{RED}{code or '---'}  {self.err_note}{R}"
        elif code >= 400:
            ev = "ERROR"
            result = f"{RED}{code} {phrase(code)}{R}"
        elif event is None:  # redirect / HEAD: nothing was sent
            if self.resp_logged:
                return
            ev = "RESPONSE"
            result = f"{YEL}{code} {phrase(code)}{R}"
        else:
            ev = event
            start = self.range_[0] if self.range_ else 0
            fsize = self.file_size or 1
            pos = start + self.sent
            parts = [f"{DIM}{code}{R}"]
            if is_dir:
                parts.append(f"{DIM}listing{R}")
            if start > 0:
                parts.append(f"{YEL}↪ seek to {int(start * 100 / fsize)}%{R}")
            if ev == "ABORTED":
                parts.append(
                    f"{ABORT_COL}✖ stopped at {int(pos * 100 / fsize)}%{R} "
                    f"{DIM}({human(self.sent)} sent){R}"
                )
            else:
                parts.append(f"{GRN}✔ {human(self.sent)}{R}")
            parts.append(f"{DIM}{human(self.sent / dur)}/s · {dur:.1f}s{R}")
            result = "  ".join(parts)

        self.log_line(ev, result)
        with print_lock:
            stats["requests"] += 1
            stats["bytes"] += self.sent
            if ev == "ABORTED":
                stats["aborted"] += 1
            if ev == "ERROR":
                stats["errors"] += 1

    # ---------- custom folder page ----------
    def scan_directory_items(self, path):
        try:
            names = os.listdir(path)
        except OSError:
            return None

        items = []
        for n in names:
            if n.startswith(".") or n.lower() in HIDDEN:
                continue
            full = os.path.join(path, n)
            if os.path.normcase(os.path.abspath(full)) == os.path.normcase(BASE_DIR):
                continue  # don't show the media-server program folder itself
            try:
                st = os.stat(full)
            except OSError:
                continue
            isdir = os.path.isdir(full)
            if isdir:
                kind, count = "folder", 0
                try:
                    count = sum(1 for x in os.listdir(full) if not x.startswith("."))
                except OSError:
                    pass
            else:
                count = 0
                ct = self.guess_type(full)
                kind = (
                    "video"
                    if ct.startswith("video/")
                    else (
                        "image"
                        if ct.startswith("image/")
                        else "audio" if ct.startswith("audio/") else "file"
                    )
                )
            item = {
                "name": n,
                "dir": isdir,
                "kind": kind,
                "size": 0 if isdir else st.st_size,
                "mtime": int(st.st_mtime),
                "count": count,
                "url": quote(n) + ("/" if isdir else ""),
            }
            if kind in ("video", "image"):
                key = os.path.relpath(full, os.getcwd()).replace(os.sep, "/")
                if kind == "video":
                    item.update(posters.describe_video(key, n, st.st_size, st.st_mtime))
                else:  # thumbnail + viewer copy (the original is used if there is none)
                    item.update(posters.describe_image(key, n, st.st_size, st.st_mtime))
            items.append(item)
        return items

    def list_directory(self, path):
        if self.req_path.startswith(UI_PREFIX):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None

        items = self.scan_directory_items(path)
        if items is None:
            self.send_error(HTTPStatus.NOT_FOUND, "No permission to list directory")
            return None

        accept_header = self.headers.get("Accept", "")
        wants_json = "application/json" in accept_header or "json=1" in getattr(self, "path", "")

        template = None
        index_file = os.path.join(UI_DIR, "index.html")
        if not wants_json and os.path.isfile(index_file):
            try:
                with open(index_file, encoding="utf-8") as fh:
                    template = fh.read()
            except OSError:
                template = None

        if wants_json or template is None:
            body = json.dumps(
                {"path": self.req_path, "items": items, "app": APP_NAME},
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return io.BytesIO(body)

        data = json.dumps(
            {"path": self.req_path, "items": items, "app": APP_NAME}, ensure_ascii=False
        )
        data = data.replace("<", "\\u003c")
        folder = self.req_path.strip("/").split("/")[-1]
        title = f"{folder} · {APP_NAME}" if folder else APP_NAME
        payload = (
            template.replace("__TITLE__", html.escape(title))
            .replace("__APPNAME__", html.escape(APP_NAME))
            .replace("__DATA__", data)
        ).encode("utf-8", "replace")

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(payload)

    # ---------- cache / player API ----------
    def _send_bytes(self, body, ctype, cache="no-store", status=200):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _json_response(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_bytes(body, "application/json; charset=utf-8", status=status)

    def _read_body(self, limit):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > limit:
            raise ValueError(
                f"Invalid request size (maximum {limit // 1048576 or 1} MB)."
            )
        return self.rfile.read(length)

    def _api_start(self, parsed):
        # handlers are reused on a keep-alive connection: forget the previous request
        self.quiet = True
        self.req_path = parsed.path

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/__api/"):
            return super().do_GET()
        self._api_start(parsed)
        q = urllib.parse.parse_qs(parsed.query)

        def arg(name):
            return (q.get(name) or [""])[0].strip()

        try:
            if parsed.path == "/__api/browse":
                subpath = unquote(arg("path")).lstrip("/\\").replace("\\", "/")
                target = os.path.normpath(os.path.join(os.getcwd(), subpath))
                # Security: ensure target stays inside working directory
                base_cwd = os.path.normcase(os.path.abspath(os.getcwd()))
                norm_target = os.path.normcase(os.path.abspath(target))
                if not (norm_target == base_cwd or norm_target.startswith(base_cwd + os.sep)):
                    return self._json_response({"error": "Forbidden"}, 403)
                if not os.path.isdir(target):
                    return self._json_response({"error": "Folder not found"}, 404)
                items = self.scan_directory_items(target)
                if items is None:
                    return self._json_response({"error": "Cannot read folder"}, 403)
                req_path = "/" + subpath + ("/" if subpath and not subpath.endswith("/") else "")
                return self._json_response({"path": req_path, "items": items, "app": APP_NAME})
            if parsed.path == "/__api/poster-search":
                try:
                    results = posters.poster_candidates(
                        arg("q")[:160], arg("year")[:4], arg("kind")
                    )
                except posters.FetchError:
                    return self._json_response(
                        {
                            "error": "Couldn't reach the poster sources - check this PC's internet connection"
                        },
                        502,
                    )
                return self._json_response({"results": results})
            if (
                parsed.path == "/__api/photo-thumb"
            ):  # made on the first request, then cached
                try:
                    file_path = posters.photo_file(
                        posters.safe_key(arg("key")), arg("k")
                    )
                    with open(file_path, "rb") as fh:
                        data = fh.read()
                except (ValueError, OSError) as exc:
                    return self._json_response({"error": str(exc)}, 404)
                ctype = "image/webp" if file_path.endswith(".webp") else "image/jpeg"
                return self._send_bytes(
                    data, ctype, "public, max-age=31536000, immutable"
                )
            if parsed.path == "/__api/tracks":  # audio + subtitle tracks of a video
                return self._json_response(
                    posters.tracks_info(posters.safe_key(arg("key")))
                )
            if parsed.path == "/__api/subtitle":  # one subtitle as WebVTT
                vtt = posters.subtitle_vtt(posters.safe_key(arg("key")), arg("id"))
                return self._send_bytes(
                    vtt.encode("utf-8"),
                    "text/vtt; charset=utf-8",
                    "public, max-age=3600",
                )
            if parsed.path == "/__api/audio-prepare":  # extract an audio language once
                try:
                    track = int(arg("a"))
                except ValueError:
                    raise ValueError("Bad audio track.") from None
                return self._json_response(
                    posters.audio_prepare(posters.safe_key(arg("key")), track)
                )
        except (ValueError, OSError) as exc:
            return self._json_response({"error": str(exc)}, 400)
        except Exception as exc:  # a bug must not drop the connection silently
            return self._json_response({"error": f"Server error: {exc}"}, 500)
        return self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        self._api_start(parsed)
        try:
            if parsed.path == "/__api/poster-select":
                data = json.loads(self._read_body(64 * 1024).decode("utf-8"))
                url = posters.poster_apply(
                    data.get("action"),
                    posters.safe_key(data.get("video_key")),
                    candidate_id=str(data.get("candidate_id", "")),
                    link=str(data.get("link", ""))[:600],
                    title=str(data.get("title", ""))[:160],
                )
                return self._json_response({"ok": True, "poster": url})
            if parsed.path == "/__api/thumb":  # preview frame captured by the browser
                q = urllib.parse.parse_qs(parsed.query)
                key = posters.safe_key((q.get("key") or [""])[0])
                if (q.get("failed") or [""])[0] == "1":
                    posters.mark_thumb_failed(key)
                    return self._json_response({"ok": True, "poster": ""})
                url = posters.save_browser_thumb(key, self._read_body(1_000_000))
                return self._json_response({"ok": True, "poster": url})
        except (ValueError, OSError) as exc:
            self.close_connection = True  # the request body may be unread
            return self._json_response({"error": str(exc)}, 400)
        self.close_connection = True
        return self._json_response({"error": "Not found"}, 404)

    # ---------- request handling ----------
    def do_HEAD(self):
        super().do_HEAD()
        self.emit()

    def is_program_file(self):
        if self.req_path.startswith((UI_PREFIX,) + posters.CACHE_PREFIXES):
            return False  # these prefixes map to the few files the page really needs
        p = os.path.normcase(os.path.abspath(self.fs_path))
        b = os.path.normcase(BASE_DIR)
        return p == b or p.startswith(b + os.sep)

    def send_head(self):
        self.t0 = time.time()
        self.sent = 0
        self.range_ = None
        self.status = None
        self.logged = False
        self.file_size = 0
        self.clen = None
        self.crange = None
        self.err_note = ""
        self.resp_logged = False
        self.req_path = unquote(self.path.split("?")[0])
        self.fs_path = self.translate_path(self.path)
        self.quiet = self.req_path.startswith(
            (UI_PREFIX,) + posters.CACHE_PREFIXES
        ) or self.req_path.endswith("favicon.ico")
        rng = self.headers.get("Range")
        if LOG_LIFECYCLE and not self.quiet:
            self.log_req_line()

        # The program's own folder (server.py, posters.py, caches) is never shared
        if self.req_path.startswith(("/__api/",)) is False and self.is_program_file():
            self.send_error(404, "File not found")
            self.emit()
            return None

        # The ui folder is for its css/js only - never list it or serve its index
        if self.req_path.startswith(UI_PREFIX) and os.path.isdir(self.fs_path):
            self.send_error(404, "File not found")
            self.emit()
            return None

        # No Range header, or not a file -> default behaviour
        if not rng or not os.path.isfile(self.fs_path):
            f = super().send_head()
            if f is None:
                self.emit()
            else:
                f.seek(0, io.SEEK_END)
                self.file_size = f.tell()
                f.seek(0)
            return f

        # ---- Range request (video seeking / resuming) ----
        ctype = self.guess_type(self.fs_path)
        size = os.path.getsize(self.fs_path)
        self.file_size = size
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        if not m or (m.group(1) == "" and m.group(2) == ""):
            self.send_error(416, "Bad Range")
            self.emit()
            return None

        if m.group(1) == "":  # suffix range: last N bytes
            start = max(size - int(m.group(2)), 0)
            end = size - 1
        else:
            start = int(m.group(1))
            end = min(int(m.group(2)) if m.group(2) else size - 1, size - 1)

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.emit()
            return None

        try:
            f = open(self.fs_path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            self.emit()
            return None

        self.range_ = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        try:
            remaining = None
            if self.range_:
                start, end = self.range_
                source.seek(start)
                remaining = end - start + 1
            while remaining is None or remaining > 0:
                n = CHUNK if remaining is None else min(CHUNK, remaining)
                chunk = source.read(n)
                if not chunk:
                    break
                outputfile.write(chunk)
                self.sent += len(chunk)
                if remaining is not None:
                    remaining -= len(chunk)
            self.emit("DONE")
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.emit("ABORTED")
        except OSError as e:
            self.err_note = str(e)
            self.emit("ERROR")


def is_local_client(ip):
    """True for this PC and for private (home / office / hotspot) network addresses."""
    if not ONLY_LOCAL_NETWORK:
        return True
    try:
        addr = ipaddress.ip_address(str(ip).split("%")[0])
    except ValueError:
        return False
    if addr.version == 6 and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    if addr.is_loopback or addr.is_private or addr.is_link_local:
        return True
    return any(
        addr in ipaddress.ip_network(net, strict=False)
        for net in EXTRA_ALLOWED_NETWORKS
    )


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True
    _blocked_logged = {}

    def verify_request(self, request, client_address):
        ip = client_address[0]
        if is_local_client(ip):
            return True
        now = time.time()  # log each blocked address at most once a minute
        if now - self._blocked_logged.get(ip, 0) > 60:
            self._blocked_logged[ip] = now
            with print_lock:
                print(
                    f"{DIM}{ts():<10}{R}{B}{RED}{'BLOCKED':<10}{R}{DIM}{ip:<17}{R}"
                    f"{RED}refused - not on your local network{R}",
                    flush=True,
                )
                stats["errors"] += 1
        return False  # the connection is closed without any reply


def console_commands():
    """Read cls/clear without blocking HTTP serving; Ctrl+C still stops the server."""
    if not sys.stdin or not sys.stdin.isatty():
        return
    while True:
        try:
            command = sys.stdin.readline()
            if command == "":
                return
            command = command.strip().lower()
            if command in {"cls", "clear"}:
                with print_lock:
                    os.system("cls" if os.name == "nt" else "clear")
                    banner(local_ip())
            elif command:
                with print_lock:
                    print(
                        f"{DIM}Unknown command: {command}. Use cls or clear to redraw the log.{R}",
                        flush=True,
                    )
        except (EOFError, OSError):
            return


def poster_log(msg):
    with print_lock:
        print(f"  {CYN}◆{R} {DIM}{msg}{R}", flush=True)


def init_runtime(root):
    """Share `root` and set up posters/previews (also used by the tests)."""
    os.chdir(root)  # the server shares the current directory
    posters.configure(
        root=root,
        base_dir=BASE_DIR,
        poster_folders=POSTER_FOLDERS,
        preview_folders=PREVIEW_FOLDERS,
        preview_max_mb=PREVIEW_MAX_MB,
        tmdb_key=TMDB_API_KEY,
        audio_cache_max_gb=AUDIO_CACHE_MAX_GB,
        log_fn=poster_log,
    )


if __name__ == "__main__":
    legacy_missing = [
        f
        for f in ("index.html", "style.css", "app.js")
        if not os.path.isfile(os.path.join(UI_DIR, f))
    ]
    has_nextjs = os.path.isdir(os.path.join(BASE_DIR, "UI")) or os.path.isdir(os.path.join(BASE_DIR, "ui"))
    if legacy_missing and not has_nextjs:
        print(f"{RED}✖ Missing UI files in {UI_DIR}: {', '.join(legacy_missing)}{R}")
        raise SystemExit(1)
    root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else MEDIA_ROOT
    if not os.path.isdir(root):
        print(f"{RED}✖ Folder not found: {root}{R}")
        raise SystemExit(1)
    init_runtime(root)
    banner(local_ip())
    posters.start_background()  # poster + preview scans run in the background
    threading.Thread(
        target=console_commands, daemon=True, name="console-commands"
    ).start()
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            mins = (time.time() - started_at) / 60
            print(f"\n{DIM}{'─' * LINE_W}{R}")
            print(
                f"{B}Session summary{R}  "
                f"{stats['requests']} requests · {human(stats['bytes'])} sent · "
                f"{ABORT_COL}{stats['aborted']} stopped{R} · "
                f"{RED}{stats['errors']} errors{R} · {mins:.1f} min"
            )
