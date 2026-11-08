"""
Streamly  -  run with:  python server.py

Serves the folder you start it from, with:
  * a responsive Netflix-style web UI (phone / tablet / laptop)
    -> the web UI is the Next.js + React + Tailwind app in ./web, run live (hot reload);
       `python server.py --prod` serves its production build instead
  * HTTP Range support (video seeking works)
  * one-line colored request logs + session summary
No extra packages needed (Python 3.8+).
"""

import atexit
import html
import http.client
import http.server
import io
import ipaddress
import json
import os
import re
import select
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from datetime import datetime
from http import HTTPStatus
from urllib.parse import quote, unquote

from streamly_server import posters
from streamly_server.features.library.service import build_directory_data
from streamly_server.features.playback import service as playback

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
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_NAME = (
    "Streamly"  # shown in the console banner, the browser tab and the page header
)
WEB_DIR = os.path.join(BASE_DIR, "web")  # the React + Tailwind project (the only UI code)
UI_DIR = os.path.join(WEB_DIR, "out")  # what `next build` writes (static export, --prod mode)
UI_PREFIX = "/__ui/"  # URL prefix the UI is served under
# "dev"   = run the Next.js app live with its dev server (hot reload, no build step)  <- default
# "build" = serve the production build in web/dist   (python server.py --prod)
UI_MODE = "dev"
UI_DEV_PORT = int(os.environ.get("STREAMLY_UI_PORT", "5173"))  # the Next.js dev server listens on this PC only

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
# Extracted audio tracks live in cache/audio; oldest files are pruned beyond this limit.
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
# E:\Streamly\server.py you share E:\  (Films, Web Series, photos ...).
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
    "cache",
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
        ("UI", "live (Next.js dev server, hot reload)" if UI_MODE == "dev" else "production build"),
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
        rp = getattr(self, "req_path", "")
        ok = (getattr(self, "status", 0) or 0) < 400  # never cache an error page
        if UI_MODE == "dev" and rp.startswith(UI_PREFIX):
            # live mode: file names don't change when the code does, so never keep a copy
            self.send_header("Cache-Control", "no-store")
        elif ok and rp.startswith(UI_PREFIX + "img/"):
            self.send_header(
                "Cache-Control", "public, max-age=86400"
            )  # static images: a day
        elif ok and rp.startswith(posters.CACHE_PREFIXES):
            # file names contain a hash of the picture / size / date, so a new file = a new URL
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif ok and rp.startswith(UI_PREFIX + "_next/static/"):
            # the build gives these files a hash in their name, so a new build = a new URL
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

    # ---------- custom folder page / client-side listing API ----------
    def directory_data(self, path, request_path=None):
        """Delegate media listing to the library feature service."""
        return build_directory_data(
            path=path,
            request_path=request_path if request_path is not None else self.req_path,
            hidden=HIDDEN,
            base_dir=BASE_DIR,
            media_root=os.getcwd(),
            guess_type=self.guess_type,
            app_name=APP_NAME,
            posters=posters,
        )

    def list_directory(self, path):
        if self.req_path.startswith(UI_PREFIX):
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None
        try:
            data = self.directory_data(path)
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "No permission to list directory")
            return None
        encoded = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
        folder = self.req_path.strip("/").split("/")[-1]
        title = f"{folder} · {APP_NAME}" if folder else APP_NAME
        try:
            payload = render_ui_page(title, encoded).encode("utf-8", "replace")
        except OSError as exc:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"UI not available: {exc}")
            return None
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

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if UI_MODE == "dev" and parsed.path.startswith(UI_PREFIX):
            if self.headers.get("Upgrade", "").lower() == "websocket":
                return self.tunnel_ui()
            return self.proxy_ui()
        if UI_MODE == "dev" and self.headers.get("RSC"):
            # Next.js re-fetches the page it is on (a folder URL, here) after each code change;
            # the answer it wants comes from its own dev server, not from the folder listing
            return self.proxy_ui(path=UI_PREFIX + ("?" + parsed.query if parsed.query else ""))
        if not parsed.path.startswith("/__api/"):
            return super().do_GET()
        self._api_start(parsed)
        q = urllib.parse.parse_qs(parsed.query)

        def arg(name):
            return (q.get(name) or [""])[0].strip()

        try:
            if parsed.path == "/__api/library":
                requested = unquote((q.get("path") or ["/"])[0])
                # SPA folder navigation must stay inside the configured media root.
                relative = requested.replace("\\", "/").lstrip("/")
                target = os.path.realpath(os.path.join(os.getcwd(), relative))
                media_root = os.path.realpath(os.getcwd())
                try:
                    inside_media_root = os.path.commonpath((media_root, target)) == media_root
                except ValueError:
                    inside_media_root = False
                if not inside_media_root or not os.path.isdir(target):
                    return self._json_response({"error": "Folder not found"}, 404)
                try:
                    data = self.directory_data(target, requested if requested.startswith("/") else "/" + requested)
                except OSError as exc:
                    return self._json_response({"error": str(exc)}, 404)
                return self._json_response(data)
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
                    playback.tracks_info(posters.safe_key(arg("key")))
                )
            if parsed.path == "/__api/subtitle":  # one subtitle as WebVTT
                vtt = playback.subtitle_vtt(posters.safe_key(arg("key")), arg("id"))
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
                    playback.audio_prepare(posters.safe_key(arg("key")), track)
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
        if UI_MODE == "dev" and self.path.split("?")[0].startswith(UI_PREFIX):
            return self.proxy_ui(head=True)
        super().do_HEAD()
        self.emit()

    def _ui_request_state(self):
        """Handlers are reused on a keep-alive connection: forget the previous request."""
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
        self.fs_path = WEB_DIR
        self.quiet = True

    def proxy_ui(self, head=False, path=None):
        """Dev mode: hand /__ui/... requests to the Next.js dev server and relay its answer."""
        self._ui_request_state()
        try:
            conn = http.client.HTTPConnection("127.0.0.1", UI_DEV_PORT, timeout=60)
            # pass the browser's headers on (Next.js marks its "refresh" requests with a few of them),
            # except the ones that only make sense between the browser and this server
            drop = {"host", "connection", "keep-alive", "upgrade", "accept-encoding", "te", "origin", "referer", "content-length", "transfer-encoding"}
            fwd = {k: v for k, v in self.headers.items() if k.lower() not in drop}
            conn.request("HEAD" if head else "GET", path or self.path, headers=fwd)
            resp = conn.getresponse()
            body = resp.read()
            conn.close()
        except OSError:
            self.send_error(HTTPStatus.BAD_GATEWAY, "The web UI dev server is not running")
            self.emit()
            return
        self.send_response(resp.status)
        skip = ("connection", "transfer-encoding", "keep-alive", "content-length", "date", "server", "cache-control")
        for k, v in resp.getheaders():
            if k.lower() not in skip:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()  # adds our own Cache-Control: no-cache for the UI
        if not head and resp.status not in (204, 304):
            self.wfile.write(body)
        self.emit()

    def tunnel_ui(self):
        """Dev mode: relay the hot-reload WebSocket between the browser and the Next.js dev server."""
        self._ui_request_state()
        try:
            up = socket.create_connection(("127.0.0.1", UI_DEV_PORT), timeout=5)
        except OSError:
            self.send_error(HTTPStatus.BAD_GATEWAY, "The web UI dev server is not running")
            return
        lines = [f"{self.command} {self.path} {self.request_version}"]
        for k, v in self.headers.items():
            if k.lower() == "host":
                v = f"127.0.0.1:{UI_DEV_PORT}"
            elif k.lower() == "origin":
                v = f"http://127.0.0.1:{UI_DEV_PORT}"
            lines.append(f"{k}: {v}")
        self.close_connection = True
        client = self.connection
        try:
            up.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))
            up.settimeout(None)
            client.settimeout(None)
            while True:
                ready, _, _ = select.select([client, up], [], [], 30)
                for sock in ready:
                    data = sock.recv(65536)
                    if not data:
                        return
                    (up if sock is client else client).sendall(data)
        except OSError:
            pass
        finally:
            up.close()

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


def read_ui_page():
    """The page Next.js made: live from its dev server, or web/out/index.html after a build."""
    if UI_MODE == "dev":
        try:
            conn = http.client.HTTPConnection("127.0.0.1", UI_DEV_PORT, timeout=90)
            conn.request("GET", UI_PREFIX, headers={"Accept": "text/html"})
            resp = conn.getresponse()
            body = resp.read()
            conn.close()
        except OSError as exc:
            raise OSError("the web UI dev server is not running") from exc
        if resp.status != 200:
            raise OSError(f"the web UI dev server answered {resp.status}")
        return body.decode("utf-8")
    with open(os.path.join(UI_DIR, "index.html"), encoding="utf-8") as fh:
        return fh.read()


def render_ui_page(title, data):
    """The page for one folder: Next's page with this folder's listing (and title) filled in."""
    page = read_ui_page()
    page = page.replace("__DATA__", data, 1)  # app/layout.tsx leaves this placeholder
    if "<title" not in page:
        page = page.replace("</head>", f"<title>{html.escape(title)}</title></head>", 1)
    return page


_ui_proc = None


def ui_dev_listening():
    """True when something accepts connections on the dev server's port."""
    try:
        socket.create_connection(("127.0.0.1", UI_DEV_PORT), timeout=1).close()
        return True
    except OSError:
        return False


def stop_ui_dev():
    global _ui_proc
    proc, _ui_proc = _ui_proc, None
    if not proc or proc.poll() is not None:
        return
    try:
        if os.name == "nt":  # npm.cmd starts node as a child: take the whole tree down
            subprocess.call(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=5)
    except Exception:
        pass


def start_ui_dev():
    """Run `npm run dev` (Next.js) in the background and wait until it answers."""
    global _ui_proc
    npm = shutil.which("npm")
    if not npm:
        print(f"{RED}\u2716 The web UI needs Node.js (npm), which was not found.{R}")
        print("  Install Node.js from https://nodejs.org, then run  python server.py  again.")
        raise SystemExit(1)
    if ui_dev_listening():
        print(f"{DIM}Web UI dev server already running on port {UI_DEV_PORT} - using it.{R}\n")
        return
    shell = os.name == "nt"  # npm is npm.cmd on Windows
    env = dict(os.environ, NEXT_TELEMETRY_DISABLED="1")
    next_package = os.path.join(WEB_DIR, "node_modules", "next", "package.json")
    next_cli = os.path.join(WEB_DIR, "node_modules", ".bin", "next.cmd" if os.name == "nt" else "next")
    if not os.path.isfile(next_package) or not os.path.isfile(next_cli):
        print(f"{DIM}Installing or repairing the web UI packages ...{R}")
        install_command = [npm, "install", "--no-audit", "--no-fund"]
        if subprocess.call(install_command, cwd=WEB_DIR, shell=shell, env=env) != 0:
            print(f"{RED}\u2716 `npm install` failed - see the messages above.{R}")
            raise SystemExit(1)
    log_path = os.path.join(WEB_DIR, ".next-dev.log")
    log = open(log_path, "w", encoding="utf-8")
    extra = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if os.name == "nt"
        else {"start_new_session": True}
    )
    _ui_proc = subprocess.Popen(
        [npm, "run", "dev", "--", "-p", str(UI_DEV_PORT), "-H", "127.0.0.1"],
        cwd=WEB_DIR,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        shell=shell,
        **extra,
    )
    atexit.register(stop_ui_dev)
    print(f"{DIM}Starting the web UI (Next.js dev server) ...{R}", end="", flush=True)
    ready = False
    for _ in range(240):  # up to ~2 minutes (the first start compiles the app)
        if _ui_proc.poll() is not None:
            break
        if ui_dev_listening():
            try:  # the first request compiles the page, so give it time
                conn = http.client.HTTPConnection("127.0.0.1", UI_DEV_PORT, timeout=120)
                conn.request("GET", UI_PREFIX)
                ready = conn.getresponse().status == 200
                conn.close()
            except OSError:
                pass
            break
        time.sleep(0.5)
    if ready:
        print(f" {GRN}ready{R}\n")
        return
    print()
    print(f"{RED}\u2716 The web UI dev server did not start. Its log ({log_path}):{R}")
    try:
        print("".join(open(log_path, encoding="utf-8", errors="replace").readlines()[-15:]))
    except OSError:
        pass
    stop_ui_dev()
    raise SystemExit(1)


def ui_is_current():
    """True when the production build exists and is newer than every source file in web/."""
    index = os.path.join(UI_DIR, "index.html")
    if not os.path.isfile(index) or not os.path.isdir(os.path.join(UI_DIR, "_next")):
        return False
    built = os.path.getmtime(index)
    for folder, dirs, files in os.walk(WEB_DIR):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "out", ".next")]
        for name in files:
            if name.endswith((".tsbuildinfo", ".log")) or name in ("next-env.d.ts", "package-lock.json"):
                continue  # generated by tools, not edited by hand
            try:
                if os.path.getmtime(os.path.join(folder, name)) > built + 1:
                    return False
            except OSError:
                pass
    return True


def ensure_ui_built():
    """Build the web app (web/ -> web/out) when it is missing or older than its source.

    Needs Node.js once. After that, `python server.py --prod` rebuilds only when something
    in web/ changed.
    """
    if ui_is_current():
        return
    npm = shutil.which("npm")
    if not npm:
        print(f"{RED}\u2716 The web UI needs to be built, but Node.js (npm) was not found.{R}")
        print(f"  Install Node.js from https://nodejs.org, then run  python server.py  again.")
        raise SystemExit(1)
    shell = os.name == "nt"  # npm is npm.cmd on Windows
    env = dict(os.environ, NEXT_TELEMETRY_DISABLED="1")
    print(f"{DIM}Building the web UI (Next.js + Tailwind) ...{R}")
    steps = []
    next_package = os.path.join(WEB_DIR, "node_modules", "next", "package.json")
    next_cli = os.path.join(WEB_DIR, "node_modules", ".bin", "next.cmd" if os.name == "nt" else "next")
    if not os.path.isfile(next_package) or not os.path.isfile(next_cli):
        steps.append([npm, "install", "--no-audit", "--no-fund"])
    steps.append([npm, "run", "build"])
    for cmd in steps:
        if subprocess.call(cmd, cwd=WEB_DIR, shell=shell, env=env) != 0:
            print(f"{RED}\u2716 `{' '.join(cmd[1:])}` failed - see the messages above.{R}")
            raise SystemExit(1)
    if not ui_is_current():
        print(f"{RED}\u2716 The build finished but {UI_DIR} is incomplete.{R}")
        raise SystemExit(1)
    print(f"{DIM}Web UI ready.{R}\n")


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


def main():
    global UI_MODE
    args = sys.argv[1:]
    if "--prod" in args or "--build" in args or os.environ.get("STREAMLY_UI") == "build":
        UI_MODE = "build"
    args = [a for a in args if a not in ("--prod", "--build", "--dev")]
    root = os.path.abspath(args[0]) if args else MEDIA_ROOT
    if not os.path.isdir(root):
        print(f"{RED}✖ Folder not found: {root}{R}")
        raise SystemExit(1)
    for _sig in ("SIGTERM", "SIGBREAK"):  # kill / closing the window: still stop the UI server
        if hasattr(signal, _sig):
            signal.signal(getattr(signal, _sig), lambda *_: sys.exit(0))
    if UI_MODE == "build":
        ensure_ui_built()
    else:
        start_ui_dev()
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
