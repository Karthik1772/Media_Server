"""
posters.py - movie posters and video previews for the media server.
Imported by server.py. No third-party packages needed.

  Vedios folder -> the official movie / show poster, looked up ONCE per title when
                   the server starts (TMDB if you add a free key, else Wikipedia) and
                   saved on disk. It never changes unless you change it yourself.
  Photos folder -> one preview frame for videos up to PREVIEW_MAX_MB, made once
                   (ffmpeg if installed, otherwise by the browser) and saved on disk.
  Everything else, and anything without a confident match -> the static default image.
"""

import difflib
import hashlib
import http.client
import json
import os
import re
import shutil
import subprocess
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

POSTER_PREFIX = "/__poster/"
THUMB_PREFIX = "/__thumb/"
VIDEO_EXTS = {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".wmv", ".flv", ".3gp"}
IMAGE_HOSTS = (
    "image.tmdb.org",
    "upload.wikimedia.org",
)  # posters may only come from here
HIDDEN_DIRS = {
    "poster_cache",
    "thumb_cache",
    "$recycle.bin",
    "system volume information",
}
MANUAL = {"manual", "upload", "fallback"}  # choices the scan must never override
RETRY_NOT_FOUND_DAYS = 7
RETRY_THUMB_DAYS = 30
MAX_IMAGE_BYTES = 5 * 1024 * 1024
UA = "MediaServer/1.0 (personal home media library)"
LANG_FOLDERS = {
    "hindi": "hi",
    "telugu": "te",
    "tamil": "ta",
    "kannada": "kn",
    "malayalam": "ml",
    "english": "en",
    "marathi": "mr",
    "bengali": "bn",
    "punjabi": "pa",
    "gujarati": "gu",
}

# ---- state (filled in by configure) ----
ROOT = ""
POSTER_DIR = ""
THUMB_DIR = ""
POSTER_INDEX_PATH = ""
THUMB_INDEX_PATH = ""
POSTER_SCOPE = set()
PREVIEW_SCOPE = set()
PREVIEW_MAX = 500 * 1024 * 1024
TMDB_KEY = ""
FFMPEG = None
POSTERS = {}  # video key -> poster entry
THUMBS = {}  # video key -> preview entry
CANDIDATES = {}  # candidate id -> candidate (for the "change poster" picker)
LOCK = threading.RLock()
_log = print


class FetchError(Exception):
    """Network problem (offline, timeout, rate limit...). Never cached as 'not found'."""


def log(msg):
    _log(msg)


# ----------------------------------------------------------------------------
# setup + disk index
# ----------------------------------------------------------------------------
def configure(
    *, root, base_dir, poster_folders, preview_folders, preview_max_mb, tmdb_key, log_fn
):
    global ROOT, POSTER_DIR, THUMB_DIR, POSTER_INDEX_PATH, THUMB_INDEX_PATH
    global POSTER_SCOPE, PREVIEW_SCOPE, PREVIEW_MAX, TMDB_KEY, FFMPEG, _log
    ROOT = os.path.abspath(root)
    POSTER_DIR = os.path.join(base_dir, "poster_cache")
    THUMB_DIR = os.path.join(base_dir, "thumb_cache")
    POSTER_INDEX_PATH = os.path.join(POSTER_DIR, "posters.json")
    THUMB_INDEX_PATH = os.path.join(THUMB_DIR, "thumbs.json")
    POSTER_SCOPE = {n.lower() for n in poster_folders}
    PREVIEW_SCOPE = {n.lower() for n in preview_folders}
    PREVIEW_MAX = int(preview_max_mb) * 1024 * 1024
    TMDB_KEY = (tmdb_key or os.environ.get("TMDB_API_KEY", "")).strip()
    FFMPEG = shutil.which("ffmpeg")
    _log = log_fn or print
    os.makedirs(POSTER_DIR, exist_ok=True)
    os.makedirs(THUMB_DIR, exist_ok=True)
    _load_indexes()


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            value = json.load(fh)
            return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def _load_indexes():
    with LOCK:
        POSTERS.clear()
        THUMBS.clear()
        for key, entry in _read_json(POSTER_INDEX_PATH).items():
            if not isinstance(entry, dict):
                continue
            # older versions saved every failed lookup forever - let those be retried
            if entry.get("source") == "not-found" and "checked" not in entry:
                continue
            POSTERS[key] = entry
        for key, entry in _read_json(THUMB_INDEX_PATH).items():
            if isinstance(entry, dict):
                THUMBS[key] = entry


def save_posters():
    with LOCK:
        _write_json(POSTER_INDEX_PATH, POSTERS)


def save_thumbs():
    with LOCK:
        _write_json(THUMB_INDEX_PATH, THUMBS)


# ----------------------------------------------------------------------------
# folders / scopes
# ----------------------------------------------------------------------------
def scope_of(key):
    """'poster' (Vedios), 'preview' (Photos) or 'other', from the folders in the path."""
    for part in key.split("/")[:-1]:
        low = part.lower()
        if low in POSTER_SCOPE:
            return "poster"
        if low in PREVIEW_SCOPE:
            return "preview"
    base = os.path.basename(
        ROOT.rstrip("\\/")
    ).lower()  # server started inside Vedios itself
    if base in POSTER_SCOPE:
        return "poster"
    if base in PREVIEW_SCOPE:
        return "preview"
    return "other"


def _scope_dirs(names):
    if os.path.basename(ROOT.rstrip("\\/")).lower() in names:
        return [ROOT]
    out = []
    try:
        entries = os.listdir(ROOT)
    except OSError:
        return out
    for n in entries:
        p = os.path.join(ROOT, n)
        if n.lower() in names and os.path.isdir(p):
            out.append(p)
    return out


def _walk_videos(names):
    for top in _scope_dirs(names):
        for cur, dirs, files in os.walk(top):
            dirs[:] = [
                d
                for d in dirs
                if not d.startswith(".") and d.lower() not in HIDDEN_DIRS
            ]
            for f in files:
                if os.path.splitext(f)[1].lower() in VIDEO_EXTS:
                    full = os.path.join(cur, f)
                    yield os.path.relpath(full, ROOT).replace(os.sep, "/"), f, full


def lang_hint(key):
    for part in key.split("/")[:-1]:
        code = LANG_FOLDERS.get(part.lower())
        if code:
            return code
    return ""


def safe_parts(value):
    value = urllib.parse.unquote(str(value or "")).replace("\\", "/").strip("/")
    return [p for p in value.split("/") if p not in ("", ".", "..")]


def safe_key(value):
    return "/".join(safe_parts(value))


def abs_for_key(key):
    parts = safe_parts(key)
    if not parts or os.path.splitext(parts[-1])[1].lower() not in VIDEO_EXTS:
        raise ValueError("Invalid video path.")
    full = os.path.abspath(os.path.join(ROOT, *parts))
    try:
        inside = os.path.commonpath([full, ROOT]) == ROOT
    except ValueError:
        inside = False
    if not inside or not os.path.isfile(full):
        raise ValueError("Video not found.")
    return full


# ----------------------------------------------------------------------------
# file name -> clean title / year / series
# ----------------------------------------------------------------------------
YEAR_RE = r"(?<!\d)((?:19[2-9]|20[0-3])\d)(?!\d)"
EP_RE = re.compile(r"(?<![A-Za-z])S(\d{1,2})[ ._-]*E(\d{1,3})(?!\d)", re.I)
SITE_RE = re.compile(
    r"^\s*(?:www\.\S+?|[\w-]+\.(?:com|net|org|ing|rocks|ws|tv|to|cc|me|biz|info|xyz|pw|ink|mx|vip|lol))\s*[-–—]+\s*",
    re.I,
)
JUNK_RE = re.compile(
    r"\b(?:2160p|1440p|1080p|720p|576p|480p|360p|4k|uhd|hd-?rip|hdtv|hdcam|web-?rip|web-?dl|"
    r"blu-?ray|brrip|bdrip|dvdrip|dvdscr|x26[45]|h[ .]?26[45]|hevc|avc|10bit|8bit|aac\d?|ac3|"
    r"dts|atmos|amzn|nf|dsnp|jio|zee5|esubs?|dual audio|multi)\b",
    re.I,
)
CAMERA_RE = re.compile(
    r"^(?:VID|IMG|PXL|MVI|DSC|MOV|PHOTO)[-_ ]?\d|^video[_ ]\d{6,}|^Snapchat-|^InShot|"
    r"^WhatsApp (?:Video|Image)|^Screen ?recording|^\d{6,}(?:\D|$)|^[0-9a-f]{24,}$",
    re.I,
)


def norm(text):
    text = (
        unicodedata.normalize("NFKD", str(text))
        .encode("ascii", "ignore")
        .decode()
        .lower()
    )
    return re.sub(r"[^a-z0-9]+", "", text)


def sim(a, b):
    a, b = norm(a), norm(b)
    return difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def title_sim(variant, *titles):
    """Best similarity between a file-name title and a database title.
    A title that only matches before its subtitle ('Chup: Revenge of the Artist')
    counts a little less than an exact match."""
    best = 0.0
    for t in titles:
        if not t:
            continue
        best = max(best, sim(variant, t))
        head = re.split(r"\s*[:\-–—]\s+", t, maxsplit=1)[0]
        if head != t:
            best = max(best, sim(variant, head) - 0.05)
    return best


def parse_name(filename):
    """-> {'kind','title','year','variants','group'} or None when it isn't a movie/show name."""
    base = os.path.splitext(filename)[0]
    if re.search(r"metadata-temp|\.part$|\.tmp$", base, re.I) or CAMERA_RE.search(base):
        return None
    s = SITE_RE.sub("", base)
    kind = "movie"
    m = EP_RE.search(s)
    if m:
        kind = "tv"
        s = s[: m.start()]
    s = re.sub(r"[._]+", " ", s)

    year = None
    chosen = re.search(r"[\(\[]\s*" + YEAR_RE + r"\s*[\)\]]", s)
    if not chosen:
        found = list(re.finditer(YEAR_RE, s))
        chosen = found[-1] if found else None
    if chosen:
        year = int(chosen.group(1))
        before, after = s[: chosen.start()], s[chosen.end() :]
        s = before if re.sub(r"[\s\-_()\[\]]+", "", before) else after

    junk = JUNK_RE.search(s)
    if junk and s[: junk.start()].strip(" -()[]"):
        s = s[: junk.start()]
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = re.sub(r"\s+", " ", s).strip(" -_.,()[]")
    if not s:
        if not chosen:
            return None
        s, year = chosen.group(1), None  # the title IS a number, e.g. "2012"

    variants = [s]
    stripped = re.match(
        r"^\d{1,3}\s+(\S.*)$", s
    )  # "32 Black Widow" (watch-order number)
    if stripped:
        variants.append(stripped.group(1))
    group = (
        "tv:" + norm(variants[-1]) if kind == "tv" else f"movie:{norm(s)}:{year or ''}"
    )
    return {
        "kind": kind,
        "title": s,
        "year": year,
        "variants": variants,
        "group": group,
    }


# ----------------------------------------------------------------------------
# network helpers
# ----------------------------------------------------------------------------
def http_get(url, headers=None, timeout=8, limit=3_000_000):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read(limit + 1)
    except urllib.error.HTTPError as exc:
        raise FetchError(f"HTTP {exc.code}") from None
    except (
        urllib.error.URLError,
        http.client.HTTPException,
        OSError,
        ValueError,
    ) as exc:
        raise FetchError(str(exc)) from None


def http_json(url, headers=None, timeout=8):
    try:
        return json.loads(http_get(url, headers, timeout).decode("utf-8", "replace"))
    except ValueError:
        raise FetchError("unreadable response") from None


def _sniff_ext(data):
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    return None


def save_image_bytes(data):
    """Store image bytes under a content-hash name (new picture -> new URL -> no stale cache)."""
    ext = _sniff_ext(data)
    if not ext or len(data) > MAX_IMAGE_BYTES:
        return None
    name = hashlib.sha256(data).hexdigest()[:24] + ext
    path = os.path.join(POSTER_DIR, name)
    if not os.path.isfile(path):
        with open(path, "wb") as fh:
            fh.write(data)
    return name


def download_image(url):
    parsed = urllib.parse.urlparse(str(url or ""))
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not any(
        host == h or host.endswith("." + h) for h in IMAGE_HOSTS
    ):
        return None
    data = http_get(
        url, {"Accept": "image/*,*/*;q=0.8"}, timeout=12, limit=MAX_IMAGE_BYTES
    )
    return save_image_bytes(data)


# ----------------------------------------------------------------------------
# poster providers
# ----------------------------------------------------------------------------
def _tmdb_request(path, params):
    global TMDB_KEY
    q = dict(params)
    headers = {}
    if TMDB_KEY.startswith("eyJ"):  # v4 read-access token
        headers["Authorization"] = "Bearer " + TMDB_KEY
    else:
        q["api_key"] = TMDB_KEY
    try:
        return http_json(
            "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(q),
            headers,
        )
    except FetchError as exc:
        if "401" in str(exc):
            log("TMDB rejected the API key - using Wikipedia only. Check TMDB_API_KEY.")
            TMDB_KEY = ""
        raise


def tmdb_search(kind, title, year):
    params = {"query": title, "include_adult": "false", "language": "en-US"}
    if year:
        params["first_air_date_year" if kind == "tv" else "year"] = year
    return (
        _tmdb_request("/search/tv" if kind == "tv" else "/search/movie", params).get(
            "results"
        )
        or []
    )


def _tmdb_fields(kind, r):
    if kind == "tv":
        return r.get("name"), r.get("original_name"), r.get("first_air_date") or ""
    return r.get("title"), r.get("original_title"), r.get("release_date") or ""


def _tmdb_pick(kind, results, variant, year, lang):
    best = None
    for r in results[:15]:
        if not r.get("poster_path"):
            continue
        t1, t2, date = _tmdb_fields(kind, r)
        s = title_sim(variant, t1, t2)
        ry = int(date[:4]) if date[:4].isdigit() else None
        if year and ry is not None and abs(ry - year) > 1:
            continue
        if s < (0.6 if (year and ry is not None) else 0.85):
            continue
        score = (
            s
            + (0.1 if year and ry == year else 0)
            + (0.12 if lang and r.get("original_language") == lang else 0)
        )
        rank = (round(score, 3), float(r.get("popularity") or 0))
        if best is None or rank > best[0]:
            best = (rank, r)
    return best[1] if best else None


def tmdb_lookup(kind, variants, year, lang):
    for v in variants:
        hit = None
        if year:
            hit = _tmdb_pick(kind, tmdb_search(kind, v, year), v, year, lang)
        if not hit:
            hit = _tmdb_pick(kind, tmdb_search(kind, v, None), v, year, lang)
        if hit:
            name, _, date = _tmdb_fields(kind, hit)
            return {
                "provider": "tmdb",
                "image_url": "https://image.tmdb.org/t/p/w342" + hit["poster_path"],
                "matched": f"{name} ({date[:4]})" if date[:4] else str(name),
            }
    return None


def _wiki_pages(query):
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrlimit": 6,
        "gsrnamespace": 0,
        "prop": "pageimages|description",
        "piprop": "thumbnail",
        "pithumbsize": 400,
        "redirects": 1,
    }
    data = http_json(
        "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    )
    pages = ((data.get("query") or {}).get("pages") or {}).values()
    return sorted(pages, key=lambda p: p.get("index", 99))


def wiki_lookup(kind, variants, year, lang):
    noun = "TV series" if kind == "tv" else "film"
    for v in variants:
        best = None
        for p in _wiki_pages(f"{v} {year or ''} {noun}".replace("  ", " ")):
            thumb = (p.get("thumbnail") or {}).get("source")
            desc = (p.get("description") or "").lower()
            if not thumb:
                continue
            if kind == "movie" and "film" not in desc:
                continue
            if kind == "tv" and not any(
                w in desc for w in ("television", "tv series", "series", "sitcom")
            ):
                continue
            ptitle = re.sub(r"\s*\([^)]*\)\s*$", "", p.get("title", ""))
            s = title_sim(v, ptitle)
            dy = re.search(r"\b(19\d\d|20\d\d)\b", desc)
            if year and dy and abs(int(dy.group(1)) - year) > 1:
                continue
            if s < (0.6 if (year and dy) else 0.85):
                continue
            if best is None or s > best[0]:
                best = (s, p, thumb)
        if best:
            return {
                "provider": "wikipedia",
                "image_url": best[2],
                "matched": best[1].get("title", v),
            }
    return None


def resolve_online(info, lang):
    """-> ('found', entry) | ('none', None) | ('error', None)"""
    providers = ([tmdb_lookup] if TMDB_KEY else []) + [wiki_lookup]
    errors = 0
    for fn in providers:
        try:
            hit = fn(info["kind"], info["variants"], info["year"], lang)
            if not hit:
                continue
            fname = download_image(hit["image_url"])
        except FetchError:
            errors += 1
            continue
        if fname:
            return "found", {
                "file": fname,
                "source": hit["provider"],
                "title": hit["matched"],
                "year": info["year"] or "",
                "checked": int(time.time()),
            }
    return ("error", None) if errors else ("none", None)


# ----------------------------------------------------------------------------
# startup scan: posters (Vedios)
# ----------------------------------------------------------------------------
def _poster_needs_lookup(key):
    e = POSTERS.get(key)
    if not e:
        return True
    if e.get("source") in MANUAL:
        return False
    f = e.get("file")
    if f and os.path.isfile(os.path.join(POSTER_DIR, os.path.basename(f))):
        return False
    if (
        e.get("source") == "not-found"
        and time.time() - e.get("checked", 0) < RETRY_NOT_FOUND_DAYS * 86400
    ):
        return False
    return True


def scan_posters():
    groups, total, cached, skipped = {}, 0, 0, 0
    for key, fname, _full in _walk_videos(POSTER_SCOPE):
        total += 1
        info = parse_name(fname)
        if not info:
            skipped += 1
            continue
        if not _poster_needs_lookup(key):
            cached += 1
            continue
        g = groups.setdefault(
            info["group"], {"info": info, "keys": [], "lang": lang_hint(key)}
        )
        g["keys"].append(key)
    if not groups:
        log(
            f"Posters: {cached} cached, nothing new to look up ({total} video(s) checked)."
        )
        return
    source = (
        "TMDB + Wikipedia"
        if TMDB_KEY
        else "Wikipedia (add a TMDB key for better coverage)"
    )
    log(
        f"Posters: looking up {len(groups)} title(s) via {source}; {cached} already cached"
        + (f", {skipped} non-movie name(s) skipped." if skipped else ".")
    )

    st = {"found": 0, "none": 0, "err": 0, "done": 0, "streak": 0}
    stop = threading.Event()

    def work(item):
        if stop.is_set():
            return
        _gid, g = item
        status, entry = resolve_online(g["info"], g["lang"])
        with LOCK:
            now = int(time.time())
            if status == "error":
                st["err"] += 1
                st["streak"] += 1
                if st["streak"] >= 6 and st["found"] == 0:
                    stop.set()
                return
            st["streak"] = 0
            for k in g["keys"]:
                if POSTERS.get(k, {}).get("source") in MANUAL:
                    continue
                if status == "found":
                    POSTERS[k] = dict(entry)
                else:
                    POSTERS[k] = {
                        "file": "",
                        "source": "not-found",
                        "title": g["info"]["title"],
                        "year": g["info"]["year"] or "",
                        "checked": now,
                    }
            st["found" if status == "found" else "none"] += 1
            st["done"] += 1
            if st["done"] % 10 == 0:
                save_posters()
                log(f"Posters: {st['done']}/{len(groups)} checked")

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(work, groups.items()))
    save_posters()
    if stop.is_set() or (st["err"] and not st["found"] and not st["none"]):
        log(
            "Posters: can't reach the poster sources (offline?). Nothing was saved as 'not found' - "
            "it will try again next start."
        )
    else:
        log(
            f"Posters done: {st['found']} found, {st['none']} without a confident match "
            f"(default image)"
            + (
                f", {st['err']} unreachable (will retry next start)."
                if st["err"]
                else "."
            )
        )


def poster_url(key):
    e = POSTERS.get(key) or {}
    f = e.get("file", "")
    if f and os.path.isfile(os.path.join(POSTER_DIR, os.path.basename(f))):
        return POSTER_PREFIX + quote(os.path.basename(f))
    return ""


# ----------------------------------------------------------------------------
# previews (Photos)
# ----------------------------------------------------------------------------
def _sig(size, mtime):
    return f"{int(size)}-{int(mtime)}"


def _thumb_name(key, sig):
    return hashlib.sha1(f"{key}|{sig}".encode("utf-8")).hexdigest()[:24] + ".jpg"


def thumb_state(key, size, mtime):
    e = THUMBS.get(key)
    if not e or e.get("sig") != _sig(size, mtime):
        return "todo"
    if e.get("file") and os.path.isfile(
        os.path.join(THUMB_DIR, os.path.basename(e["file"]))
    ):
        return "have"
    if (
        e.get("status") == "failed"
        and time.time() - e.get("checked", 0) < RETRY_THUMB_DAYS * 86400
    ):
        return "failed"
    return "todo"


def thumb_url(key, size, mtime):
    if thumb_state(key, size, mtime) == "have":
        return THUMB_PREFIX + quote(os.path.basename(THUMBS[key]["file"]))
    return ""


def ffmpeg_frame(src, dst):
    if not FFMPEG:
        return False
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    for seek in ("1", "0"):  # very short clips have no frame at 1 s
        cmd = [
            FFMPEG,
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            seek,
            "-i",
            src,
            "-frames:v",
            "1",
            "-vf",
            "scale=360:-2",
            "-q:v",
            "5",
            dst,
        ]
        try:
            r = subprocess.run(
                cmd, capture_output=True, timeout=30, creationflags=flags
            )
        except (OSError, subprocess.SubprocessError):
            return False
        if r.returncode == 0 and os.path.isfile(dst) and os.path.getsize(dst) > 500:
            return True
    return False


def scan_thumbs():
    if not FFMPEG:
        log(
            "Previews: ffmpeg not found - the browser will create each Photos preview once, "
            "the first time you open that folder (then it is cached)."
        )
        return
    todo = []
    for key, _f, full in _walk_videos(PREVIEW_SCOPE):
        try:
            st = os.stat(full)
        except OSError:
            continue
        if (
            st.st_size <= PREVIEW_MAX
            and thumb_state(key, st.st_size, st.st_mtime) == "todo"
        ):
            todo.append((key, full, st.st_size, st.st_mtime))
    if not todo:
        log("Previews: all Photos previews already cached.")
        return
    log(
        f"Previews: making {len(todo)} frame(s) with ffmpeg (videos up to {PREVIEW_MAX // 1048576} MB)."
    )
    done = [0]

    def work(item):
        key, full, size, mtime = item
        sig = _sig(size, mtime)
        name = _thumb_name(key, sig)
        ok = ffmpeg_frame(full, os.path.join(THUMB_DIR, name))
        with LOCK:
            THUMBS[key] = (
                {"file": name, "sig": sig, "status": "ok"}
                if ok
                else {
                    "file": "",
                    "sig": sig,
                    "status": "failed",
                    "checked": int(time.time()),
                }
            )
            done[0] += 1
            if done[0] % 20 == 0:
                save_thumbs()
                log(f"Previews: {done[0]}/{len(todo)}")

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(work, todo))
    save_thumbs()
    bad = sum(1 for k, *_ in todo if THUMBS.get(k, {}).get("status") == "failed")
    log(
        f"Previews done: {len(todo) - bad} created"
        + (f", {bad} unreadable (default image)." if bad else ".")
    )


def _eligible_preview(key):
    full = abs_for_key(key)
    st = os.stat(full)
    if scope_of(key) != "preview" or st.st_size > PREVIEW_MAX:
        raise ValueError("This video doesn't get a preview.")
    return st


def save_browser_thumb(key, data):
    """The browser captured a frame (used when ffmpeg isn't installed)."""
    st = _eligible_preview(key)
    if not data.startswith(b"\xff\xd8\xff") or len(data) > 1_000_000:
        raise ValueError("Preview must be a JPEG under 1 MB.")
    sig = _sig(st.st_size, st.st_mtime)
    name = _thumb_name(key, sig)
    with open(os.path.join(THUMB_DIR, name), "wb") as fh:
        fh.write(data)
    with LOCK:
        THUMBS[key] = {"file": name, "sig": sig, "status": "ok"}
        save_thumbs()
    return THUMB_PREFIX + name


def mark_thumb_failed(key):
    st = _eligible_preview(key)
    with LOCK:
        THUMBS[key] = {
            "file": "",
            "sig": _sig(st.st_size, st.st_mtime),
            "status": "failed",
            "checked": int(time.time()),
        }
        save_thumbs()


# ----------------------------------------------------------------------------
# what the page needs to know about each video
# ----------------------------------------------------------------------------
def describe_video(key, filename, size, mtime):
    scope = scope_of(key)
    info = parse_name(filename) if scope == "poster" else None
    out = {
        "scope": scope,
        "key": key,
        "poster": "",
        "capture": False,
        "big": False,
        "hint": info["kind"] if info else "movie",
        "q_title": info["variants"][0] if info else os.path.splitext(filename)[0],
        "q_year": info["year"] if info and info["year"] else "",
    }
    if scope == "poster":
        out["poster"] = poster_url(key)
    elif scope == "preview":
        if size > PREVIEW_MAX:
            out["big"] = True
        else:
            out["poster"] = thumb_url(key, size, mtime)
            out["capture"] = (
                not out["poster"]
                and not FFMPEG
                and thumb_state(key, size, mtime) == "todo"
            )
    return out


def start_background():
    def guarded(fn, name):
        def run():
            try:
                fn()
            except Exception as exc:  # never let a scan crash the server
                log(f"{name} scan stopped: {exc}")

        threading.Thread(target=run, daemon=True, name=name).start()

    guarded(scan_posters, "poster")
    guarded(scan_thumbs, "preview")


# ----------------------------------------------------------------------------
# "change poster" picker (manual correction)
# ----------------------------------------------------------------------------
def _remember(cand):
    now = time.time()
    for k in [k for k, v in CANDIDATES.items() if now - v["_t"] > 3600]:
        CANDIDATES.pop(k, None)
    cand["_t"] = now
    CANDIDATES[cand["id"]] = cand


def _candidate(image_url, title, year, source, note=""):
    return {
        "id": hashlib.sha256(image_url.encode("utf-8")).hexdigest()[:20],
        "title": title,
        "year": year,
        "image_url": image_url,
        "source": source,
        "note": note,
    }


def poster_candidates(title, year, kind="movie"):
    title = re.sub(r"\s+", " ", str(title or "")).strip()[:140]
    if not title:
        return []
    year = int(year) if str(year).isdigit() else None
    kind = "tv" if kind == "tv" else "movie"
    out, seen, tried, errors = [], set(), 0, 0

    def add(c):
        if c["image_url"] not in seen:
            seen.add(c["image_url"])
            out.append(c)

    if TMDB_KEY:
        tried += 1
        try:
            results = (tmdb_search(kind, title, year) if year else []) or tmdb_search(
                kind, title, None
            )
            results = [r for r in results if r.get("poster_path")][:8]
            for r in results:
                name, _o, date = _tmdb_fields(kind, r)
                add(
                    _candidate(
                        "https://image.tmdb.org/t/p/w342" + r["poster_path"],
                        name or title,
                        date[:4],
                        "TMDB",
                    )
                )
            for r in results[
                :2
            ]:  # the other posters of the best matches (e.g. every 3 Idiots poster)
                name, _o, date = _tmdb_fields(kind, r)
                imgs = _tmdb_request(
                    f"/{kind}/{r['id']}/images",
                    {"include_image_language": "en,hi,te,ta,kn,ml,null"},
                )
                posters = sorted(
                    imgs.get("posters") or [],
                    key=lambda p: -(p.get("vote_average") or 0),
                )
                for p in posters[:6]:
                    add(
                        _candidate(
                            "https://image.tmdb.org/t/p/w342" + p["file_path"],
                            name or title,
                            date[:4],
                            "TMDB",
                            "alternate poster",
                        )
                    )
        except FetchError:
            errors += 1
    tried += 1
    try:
        for p in _wiki_pages(
            f"{title} {year or ''} {'TV series' if kind == 'tv' else 'film'}".replace(
                "  ", " "
            )
        ):
            thumb = (p.get("thumbnail") or {}).get("source")
            if thumb:
                add(
                    _candidate(
                        thumb,
                        p.get("title", title),
                        "",
                        "Wikipedia",
                        p.get("description", ""),
                    )
                )
    except FetchError:
        errors += 1
    if not out and errors == tried:
        raise FetchError("unreachable")
    for c in out:
        _remember(c)
    return [{k: v for k, v in c.items() if k != "_t"} for c in out]


def sibling_keys(key):
    """Episodes of one show in the same folder share a poster."""
    parts = safe_parts(key)
    info = parse_name(parts[-1]) if parts else None
    if not info or info["kind"] != "tv":
        return [key]
    folder = os.path.join(ROOT, *parts[:-1])
    try:
        names = os.listdir(folder)
    except OSError:
        return [key]
    out = []
    for f in names:
        if os.path.splitext(f)[1].lower() in VIDEO_EXTS:
            other = parse_name(f)
            if other and other["group"] == info["group"]:
                out.append("/".join(parts[:-1] + [f]))
    return out or [key]


def poster_apply(action, key, *, candidate_id="", raw=None, title="", year=""):
    """Manual poster choice -> permanent. Returns the poster URL ('' after a reset)."""
    abs_for_key(key)
    if scope_of(key) != "poster":
        raise ValueError("Posters are only used for videos in the movies folder.")
    keys = sibling_keys(key)
    now = int(time.time())
    if action == "select":
        cand = CANDIDATES.get(candidate_id)
        if not cand:
            raise ValueError("That result expired - search again and pick one.")
        try:
            fname = download_image(cand["image_url"])
        except FetchError:
            raise ValueError("Couldn't download that image. Try another one.") from None
        if not fname:
            raise ValueError("That image isn't usable. Try another one.")
        entry = {
            "file": fname,
            "source": "manual",
            "title": cand["title"],
            "year": cand.get("year", ""),
            "checked": now,
        }
    elif action == "upload":
        fname = save_image_bytes(raw or b"")
        if not fname:
            raise ValueError("Choose a JPG, PNG or WebP image under 5 MB.")
        entry = {"file": fname, "source": "upload", "title": title, "checked": now}
    elif action == "reset":
        entry = {"file": "", "source": "fallback", "title": title, "checked": now}
    else:
        raise ValueError("Unknown poster action.")
    with LOCK:
        for k in keys:
            POSTERS[k] = dict(entry)
        save_posters()
    return poster_url(key)
