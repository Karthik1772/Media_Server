import http.server
import os
import re
import socket
import time
from datetime import datetime
from urllib.parse import unquote

# Enable ANSI colors on Windows terminals (harmless on other systems)
os.system("")

RESET = "\033[0m"
DIM = "\033[90m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"

PORT = 2904
CHUNK = 64 * 1024


def color_for(tag, msg):
    return {
        "REQUEST": CYAN,
        "RESPONSE": YELLOW,
        "DONE": GREEN,
        "ABORTED": RED,
        "ERROR": RED,
    }.get(tag, RESET)


def ts():
    return datetime.now().strftime("%H:%M:%S")


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024


def device(ua):
    ua = ua or "unknown"
    if "iPhone" in ua or "iPad" in ua:
        return "iOS"
    if "Android" in ua:
        return "Android"
    if "Windows" in ua:
        return "Windows"
    if "Macintosh" in ua:
        return "Mac"
    if "Linux" in ua:
        return "Linux"
    return ua[:30]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".mkv": "video/webm",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/mp4",
        ".m4v": "video/mp4",
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".png": "image/png",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
    }

    # ---------- logging helpers ----------
    def log_message(self, format, *args):
        pass  # silence the default one-line log; we log our own

    def log(self, tag, msg):
        c = color_for(tag, msg)
        print(
            f"{DIM}[{ts()}]{RESET} {c}{tag:<8}{RESET} "
            f"{DIM}{self.client_address[0]:<15}{RESET} {c}{msg}{RESET}",
            flush=True,
        )

    # ---------- status capture ----------
    def send_response(self, code, message=None):
        self.status = code
        super().send_response(code, message)

    # ---------- request lifecycle ----------
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass  # already logged in copyfile; avoid noisy tracebacks

    def send_head(self):
        self.range_ = None
        self.status = None
        self.t0 = time.time()
        self.sent = 0
        self.req_path = unquote(self.path.split("?")[0])
        range_header = self.headers.get("Range")

        self.log(
            "REQUEST",
            f"{self.command} {self.req_path} | {device(self.headers.get('User-Agent'))}"
            f" | Range: {range_header or '-'}",
        )

        fs_path = self.translate_path(self.path)

        # Directories, missing files, or no Range header -> default behaviour
        if not range_header or not os.path.isfile(fs_path):
            f = super().send_head()
            if f is None:
                self.log("RESPONSE", f"{self.status} (no body / redirect / error)")
            else:
                ctype = self.guess_type(fs_path)
                self.log("RESPONSE", f"{self.status} | {ctype} | full response")
            return f

        # ---- Range handling ----
        ctype = self.guess_type(fs_path)
        size = os.path.getsize(fs_path)
        m = re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())
        if not m or (m.group(1) == "" and m.group(2) == ""):
            self.send_error(416, "Bad Range")
            self.log("RESPONSE", "416 invalid Range header")
            return None

        if m.group(1) == "":  # suffix range: last N bytes
            start = max(size - int(m.group(2)), 0)
            end = size - 1
        else:
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
            end = min(end, size - 1)

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.send_header("Content-Length", "0")
            self.end_headers()
            self.log("RESPONSE", f"416 range {start}-{end} outside file size {size}")
            return None

        try:
            f = open(fs_path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            self.log("RESPONSE", "404 could not open file")
            return None

        self.range_ = (start, end)
        self.send_response(206)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self.log(
            "RESPONSE",
            f"206 | {ctype} | bytes {start}-{end} of {size} ({human(end - start + 1)})",
        )
        return f

    def copyfile(self, source, outputfile):
        try:
            if self.range_:
                start, end = self.range_
                source.seek(start)
                remaining = end - start + 1
                while remaining > 0:
                    chunk = source.read(min(CHUNK, remaining))
                    if not chunk:
                        break
                    outputfile.write(chunk)
                    self.sent += len(chunk)
                    remaining -= len(chunk)
            else:
                while True:
                    chunk = source.read(CHUNK)
                    if not chunk:
                        break
                    outputfile.write(chunk)
                    self.sent += len(chunk)
            self._done("DONE")
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self._done("ABORTED", "client closed connection (normal when a player seeks or probes)")

    def _done(self, tag, note=""):
        dur = max(time.time() - self.t0, 0.001)
        speed = human(self.sent / dur) + "/s"
        self.log(tag, f"{self.req_path} | sent {human(self.sent)} in {dur:.2f}s ({speed}) {note}")


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


if __name__ == "__main__":
    print(f"{CYAN}Serving folder : {os.getcwd()}{RESET}")
    print(f"{GREEN}Open on phone  : http://{local_ip()}:{PORT}{RESET}")
    print(f"{DIM}{'-' * 60}{RESET}")
    with Server(("0.0.0.0", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Stopped.{RESET}")