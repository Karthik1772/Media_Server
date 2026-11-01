"""
posters.py - every cache of the media server (posters, thumbnails, audio / subtitle tracks).
Imported by server.py. Pillow (pip install pillow) and ffmpeg are optional but recommended.

Cache folders (created next to server.py):
  films_thumbnails        movie / show posters (Vedios folder). Looked up ONCE per title
                          (TMDB if you add a free key, else Wikipedia); never changes unless
                          you change it yourself (search, or paste a TMDB / Wikipedia link).
  short_video_thumbnails  one preview frame per video in the Photos folder (up to
                          PREVIEW_MAX_MB), made once by ffmpeg or by the browser.
  photo_thumbnails        360 px WebP/JPEG thumbnails of photos - the grid loads these
                          instead of the full-size originals (Pillow, else ffmpeg).
  photo_previews          1600 px copies used by the full-screen photo viewer.
  subtitle_cache          embedded / external subtitles converted to WebVTT.
  audio_track_cache       extra audio languages extracted to AAC so the player can switch.
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

try:  # optional - fast photo thumbnails:  pip install pillow
    from PIL import Image, ImageOps
    from PIL import features as _pil_features

    PIL_OK = True
    WEBP_OK = bool(_pil_features.check("webp"))
    RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS
except Exception:  # not installed -> ffmpeg (or the original image) is used instead
    PIL_OK = WEBP_OK = False
    RESAMPLE = None

try:  # optional - iPhone / Android HEIC photos:  pip install pillow-heif
    from pillow_heif import register_heif_opener

    register_heif_opener()
    HEIF_OK = PIL_OK
except Exception:
    HEIF_OK = False

FILM_PREFIX = "/__film/"  # films_thumbnails
SHORT_PREFIX = "/__short/"  # short_video_thumbnails
PHOTO_PREFIX = "/__photo/"  # photo_thumbnails
VIEW_PREFIX = "/__photoview/"  # photo_previews
AUDIO_PREFIX = "/__audio/"  # audio_track_cache
CACHE_PREFIXES = (FILM_PREFIX, SHORT_PREFIX, PHOTO_PREFIX, VIEW_PREFIX, AUDIO_PREFIX)
VIDEO_EXTS = {".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".wmv", ".flv", ".3gp"}
IMAGE_HOSTS = (
    "image.tmdb.org",
    "upload.wikimedia.org",
)  # posters may only come from here
HIDDEN_DIRS = {
    "poster_cache",
    "thumb_cache",
    "films_thumbnails",
    "short_video_thumbnails",
    "photo_thumbnails",
    "photo_previews",
    "subtitle_cache",
    "audio_track_cache",
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
FILMS_DIR = ""
SHORT_DIR = ""
PHOTO_DIR = ""
VIEW_DIR = ""
SUB_DIR = ""
AUDIO_DIR = ""
ROUTES = ()  # (url prefix, folder) pairs served as static cache files
PHOTO_EXT = ".jpg"  # ".webp" when Pillow can write WebP
AUDIO_CACHE_MAX = 5 * 1024**3
POSTER_INDEX_PATH = ""
THUMB_INDEX_PATH = ""
POSTER_SCOPE = set()
PREVIEW_SCOPE = set()
PREVIEW_MAX = 500 * 1024 * 1024
TMDB_KEY = ""
FFMPEG = None
FFPROBE = None
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
def _migrate_old_caches(base_dir):
    """poster_cache -> films_thumbnails, thumb_cache -> short_video_thumbnails.
    Nothing already cached is lost or downloaded again."""
    for old, new in (
        ("poster_cache", "films_thumbnails"),
        ("thumb_cache", "short_video_thumbnails"),
    ):
        src, dst = os.path.join(base_dir, old), os.path.join(base_dir, new)
        if os.path.isdir(src) and not os.path.exists(dst):
            try:
                os.rename(src, dst)
                log(f"Cache folder renamed: {old} -> {new}")
            except OSError as exc:
                log(f"Couldn't rename {old} to {new} ({exc}) - starting {new} empty.")


def configure(
    *,
    root,
    base_dir,
    poster_folders,
    preview_folders,
    preview_max_mb,
    tmdb_key,
    log_fn,
    audio_cache_max_gb=5,
):
    global ROOT, FILMS_DIR, SHORT_DIR, PHOTO_DIR, VIEW_DIR, SUB_DIR, AUDIO_DIR
    global POSTER_INDEX_PATH, THUMB_INDEX_PATH, POSTER_SCOPE, PREVIEW_SCOPE, PREVIEW_MAX
    global TMDB_KEY, FFMPEG, FFPROBE, PHOTO_EXT, AUDIO_CACHE_MAX, ROUTES, _log
    _log = log_fn or print
    ROOT = os.path.abspath(root)
    _migrate_old_caches(base_dir)
    FILMS_DIR = os.path.join(base_dir, "films_thumbnails")
    SHORT_DIR = os.path.join(base_dir, "short_video_thumbnails")
    PHOTO_DIR = os.path.join(base_dir, "photo_thumbnails")
    VIEW_DIR = os.path.join(base_dir, "photo_previews")
    SUB_DIR = os.path.join(base_dir, "subtitle_cache")
    AUDIO_DIR = os.path.join(base_dir, "audio_track_cache")
    POSTER_INDEX_PATH = os.path.join(FILMS_DIR, "posters.json")
    THUMB_INDEX_PATH = os.path.join(SHORT_DIR, "thumbs.json")
    POSTER_SCOPE = {n.lower() for n in poster_folders}
    PREVIEW_SCOPE = {n.lower() for n in preview_folders}
    PREVIEW_MAX = int(preview_max_mb) * 1024 * 1024
    AUDIO_CACHE_MAX = int(float(audio_cache_max_gb) * 1024**3)
    TMDB_KEY = (tmdb_key or os.environ.get("TMDB_API_KEY", "")).strip()
    FFMPEG = shutil.which("ffmpeg")
    FFPROBE = shutil.which("ffprobe")
    if not FFPROBE and FFMPEG:  # ffprobe normally sits next to ffmpeg
        sibling = os.path.join(
            os.path.dirname(FFMPEG), "ffprobe.exe" if os.name == "nt" else "ffprobe"
        )
        if os.path.isfile(sibling):
            FFPROBE = sibling
    PHOTO_EXT = ".webp" if (PIL_OK and WEBP_OK) else ".jpg"
    ROUTES = (
        (FILM_PREFIX, FILMS_DIR),
        (SHORT_PREFIX, SHORT_DIR),
        (PHOTO_PREFIX, PHOTO_DIR),
        (VIEW_PREFIX, VIEW_DIR),
        (AUDIO_PREFIX, AUDIO_DIR),
    )
    for folder in (FILMS_DIR, SHORT_DIR, PHOTO_DIR, VIEW_DIR, SUB_DIR, AUDIO_DIR):
        os.makedirs(folder, exist_ok=True)
        for leftover in os.listdir(folder):  # half-written files from a crash
            if leftover.endswith(".tmp"):
                try:
                    os.remove(os.path.join(folder, leftover))
                except OSError:
                    pass
    _load_indexes()


def cache_path(url_path):
    """/__photo/abc.webp -> the file in its cache folder (None if it isn't a cache URL)."""
    for prefix, folder in ROUTES:
        if url_path.startswith(prefix):
            return os.path.join(folder, os.path.basename(url_path[len(prefix) :]))
    return None


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


def _walk_files(names, exts):
    for top in _scope_dirs(names):
        for cur, dirs, files in os.walk(top):
            dirs[:] = [
                d
                for d in dirs
                if not d.startswith(".") and d.lower() not in HIDDEN_DIRS
            ]
            for f in files:
                if os.path.splitext(f)[1].lower() in exts:
                    full = os.path.join(cur, f)
                    yield os.path.relpath(full, ROOT).replace(os.sep, "/"), f, full


def _walk_videos(names):
    return _walk_files(names, VIDEO_EXTS)


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


def abs_for_key(key, exts=None):
    parts = safe_parts(key)
    if not parts or os.path.splitext(parts[-1])[1].lower() not in (exts or VIDEO_EXTS):
        raise ValueError("Invalid file path.")
    full = os.path.abspath(os.path.join(ROOT, *parts))
    try:
        inside = os.path.commonpath([full, ROOT]) == ROOT
    except ValueError:
        inside = False
    if not inside or not os.path.isfile(full):
        raise ValueError("File not found.")
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
class _SameHostRedirect(urllib.request.HTTPRedirectHandler):
    """Follow redirects only to the image hosts, so a link can't bounce us elsewhere."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _image_host_ok(newurl):
            raise urllib.error.URLError("redirected to a site that isn't allowed")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_IMAGE_OPENER = urllib.request.build_opener(_SameHostRedirect)


def http_get(url, headers=None, timeout=8, limit=3_000_000, opener=None):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9",
            **(headers or {}),
        },
    )
    try:
        open_url = opener.open if opener else urllib.request.urlopen
        with open_url(req, timeout=timeout) as resp:
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
    path = os.path.join(FILMS_DIR, name)
    if not os.path.isfile(path):
        with open(path, "wb") as fh:
            fh.write(data)
    return name


def _image_host_ok(url):
    parsed = urllib.parse.urlparse(str(url or ""))
    host = (parsed.hostname or "").lower()
    return parsed.scheme in ("http", "https") and any(
        host == h or host.endswith("." + h) for h in IMAGE_HOSTS
    )


def download_image(url):
    if not _image_host_ok(url):
        return None
    data = http_get(
        url,
        {"Accept": "image/*,*/*;q=0.8"},
        timeout=12,
        limit=MAX_IMAGE_BYTES,
        opener=_IMAGE_OPENER,
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
    if f and os.path.isfile(os.path.join(FILMS_DIR, os.path.basename(f))):
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
    if f and os.path.isfile(os.path.join(FILMS_DIR, os.path.basename(f))):
        return FILM_PREFIX + quote(os.path.basename(f))
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
        os.path.join(SHORT_DIR, os.path.basename(e["file"]))
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
        return SHORT_PREFIX + quote(os.path.basename(THUMBS[key]["file"]))
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
        ok = ffmpeg_frame(full, os.path.join(SHORT_DIR, name))
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
    with open(os.path.join(SHORT_DIR, name), "wb") as fh:
        fh.write(data)
    with LOCK:
        THUMBS[key] = {"file": name, "sig": sig, "status": "ok"}
        save_thumbs()
    return SHORT_PREFIX + name


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
# photo thumbnails (photo_thumbnails) and viewer images (photo_previews)
#   grid cards load a ~360 px WebP instead of the multi-megabyte original, and the
#   full-screen viewer loads a 1600 px copy first (with an "Original" button).
#   Made by Pillow (JPEG "draft" mode decodes at 1/2, 1/4 or 1/8 size = much faster),
#   else ffmpeg, else the original file is simply used.
# ----------------------------------------------------------------------------
HEIF_EXTS = {
    ".heic",
    ".heif",
}  # browsers (except Safari) can't show these: always converted
RESIZE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"} | HEIF_EXTS
IMAGE_EXTS = RESIZE_EXTS | {".gif", ".svg", ".avif"}
THUMB_SIDE, THUMB_QUALITY = 360, 78
VIEW_SIDE, VIEW_QUALITY = 1600, 82
THUMB_MIN_BYTES = 150 * 1024  # smaller originals are already as light as a thumbnail
VIEW_MIN_BYTES = 800 * 1024
PHOTO_FAILED = {}  # key -> sig of images that couldn't be resized (original is used)
_PHOTO_SEM = threading.BoundedSemaphore(3)  # never resize more than 3 at once
_STRIPES = [threading.Lock() for _ in range(32)]  # same image asked twice -> built once


def can_resize(ext=""):
    if ext in HEIF_EXTS:  # needs pillow-heif (ffmpeg only reads some newer HEIC files)
        return HEIF_OK or bool(FFMPEG)
    return PIL_OK or bool(FFMPEG)


def _photo_name(key, sig, kind):
    digest = hashlib.sha1(f"{key}|{sig}|{kind}".encode("utf-8")).hexdigest()[:24]
    return digest + PHOTO_EXT


def _photo_url(key, sig, kind):
    """Cached file -> its static URL (browser-cached for a year). Not made yet -> the
    on-demand endpoint, which makes it on the first request and then serves it."""
    name = _photo_name(key, sig, kind)
    folder, prefix = (
        (VIEW_DIR, VIEW_PREFIX) if kind == "view" else (PHOTO_DIR, PHOTO_PREFIX)
    )
    if os.path.isfile(os.path.join(folder, name)):
        return prefix + name
    query = urllib.parse.urlencode({"key": key, "k": kind, "s": sig})
    return "/__api/photo-thumb?" + query


def _pil_resize(src, tmp, side, quality):
    with Image.open(src) as im:
        try:
            im.draft("RGB", (side, side))  # JPEG: decode at a reduced size
        except Exception:
            pass
        im = ImageOps.exif_transpose(im)  # phone photos: honour the rotation
        alpha = im.mode in ("RGBA", "LA") or (
            im.mode == "P" and "transparency" in im.info
        )
        if WEBP_OK:
            im = im.convert("RGBA" if alpha else "RGB")
        elif alpha:
            rgba = im.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.split()[-1])
            im = flat
        else:
            im = im.convert("RGB")
        try:
            im.thumbnail((side, side), RESAMPLE, reducing_gap=2.0)
        except TypeError:  # very old Pillow
            im.thumbnail((side, side), RESAMPLE)
        if WEBP_OK:
            im.save(tmp, "WEBP", quality=quality, method=4)  # no EXIF kept
        else:
            im.save(tmp, "JPEG", quality=quality, optimize=True, progressive=True)


def _ffmpeg_image(src, out, scale_side=None):
    """ffmpeg decodes any image it can read to a JPEG file (optionally scaled)."""
    cmd = [FFMPEG, "-nostdin", "-loglevel", "error", "-y", "-i", src, "-frames:v", "1"]
    if scale_side:
        cmd += [
            "-vf",
            f"scale='if(gt(iw,ih),min({scale_side},iw),-2)':"
            f"'if(gt(iw,ih),-2,min({scale_side},ih))'",
        ]
    cmd += ["-q:v", "2" if not scale_side else "4", "-c:v", "mjpeg"]
    cmd += ["-f", "image2", "-update", "1", out]
    _run(cmd, 90)


def _make_resized(src, dst, side, quality):
    tmp = dst + ".tmp"
    mid = dst + ".dec.tmp"
    try:
        heif = os.path.splitext(src)[1].lower() in HEIF_EXTS
        if PIL_OK and (HEIF_OK or not heif):
            _pil_resize(src, tmp, side, quality)
        elif (
            PIL_OK and FFMPEG
        ):  # .heic without pillow-heif: ffmpeg decodes, Pillow encodes
            _ffmpeg_image(src, mid)
            _pil_resize(mid, tmp, side, quality)
        elif FFMPEG:  # no Pillow at all: ffmpeg scales and writes a JPEG
            _ffmpeg_image(src, tmp, scale_side=side)
        else:
            return False
        if os.path.getsize(tmp) < 100:
            raise OSError("empty output")
        os.replace(tmp, dst)
        return True
    except Exception:
        for leftover in (tmp,):
            try:
                os.remove(leftover)
            except OSError:
                pass
        return False
    finally:
        try:
            os.remove(mid)
        except OSError:
            pass


def photo_file(key, kind):
    """Path of the cached thumbnail ('thumb') or viewer copy ('view'), made if missing."""
    full = abs_for_key(key, RESIZE_EXTS)
    st = os.stat(full)
    if not can_resize(os.path.splitext(full)[1].lower()):
        raise ValueError(
            "No image converter available (pip install pillow pillow-heif)."
        )
    kind = "view" if kind == "view" else "thumb"
    sig = _sig(st.st_size, st.st_mtime)
    path = os.path.join(
        VIEW_DIR if kind == "view" else PHOTO_DIR, _photo_name(key, sig, kind)
    )
    if os.path.isfile(path):
        return path
    side, quality = (
        (VIEW_SIDE, VIEW_QUALITY) if kind == "view" else (THUMB_SIDE, THUMB_QUALITY)
    )
    with _STRIPES[hash(path) % len(_STRIPES)]:
        if os.path.isfile(path):  # another request finished it while we waited
            return path
        with _PHOTO_SEM:
            ok = _make_resized(full, path, side, quality)
    if not ok:
        PHOTO_FAILED[key] = sig
        raise ValueError("Couldn't resize this image.")
    return path


def scan_photos():
    """Pre-make the thumbnails for the Photos folder in the background (2 at a time)."""
    if not can_resize():
        log(
            "Photos: install Pillow for fast thumbnails (pip install pillow) - "
            "until then the original photos are loaded."
        )
        return
    todo = []
    for key, _f, full in _walk_files(PREVIEW_SCOPE, RESIZE_EXTS):
        try:
            st = os.stat(full)
        except OSError:
            continue
        heif = os.path.splitext(full)[1].lower() in HEIF_EXTS
        if (st.st_size < THUMB_MIN_BYTES and not heif) or (
            heif and not can_resize(".heic")
        ):
            continue
        name = _photo_name(key, _sig(st.st_size, st.st_mtime), "thumb")
        if not os.path.isfile(os.path.join(PHOTO_DIR, name)):
            todo.append(key)
    if not todo:
        log("Photos: all thumbnails already cached.")
        return
    tool = "Pillow" if PIL_OK else "ffmpeg"
    log(f"Photos: making {len(todo)} thumbnail(s) with {tool}.")
    done = [0]

    def work(key):
        try:
            photo_file(key, "thumb")
        except (ValueError, OSError):
            pass
        with LOCK:
            done[0] += 1
            if done[0] % 100 == 0:
                log(f"Photos: {done[0]}/{len(todo)}")

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(work, todo))
    log(f"Photos done: {len(todo)} thumbnail(s) checked.")


# ----------------------------------------------------------------------------
# audio tracks + subtitles for the player   (needs ffmpeg + ffprobe;
# external .srt / .vtt files next to a video work without them)
#   subtitles -> converted to WebVTT once (subtitle_cache)
#   audio     -> the default track plays from the video itself; any other language is
#                extracted once to AAC (audio_track_cache) and played in sync with it
# ----------------------------------------------------------------------------
SUB_EXTS = {".srt", ".vtt", ".ass", ".ssa"}
TEXT_SUBS = {
    "subrip",
    "srt",
    "ass",
    "ssa",
    "webvtt",
    "mov_text",
    "text",
    "microdvd",
    "subviewer",
    "sami",
    "jacosub",
    "realtext",
}  # text subtitles; image ones (PGS, VobSub...) can't become WebVTT
LANG3 = {
    "eng": "en",
    "hin": "hi",
    "tel": "te",
    "tam": "ta",
    "kan": "kn",
    "mal": "ml",
    "mar": "mr",
    "ben": "bn",
    "pan": "pa",
    "guj": "gu",
    "urd": "ur",
    "fre": "fr",
    "fra": "fr",
    "ger": "de",
    "deu": "de",
    "spa": "es",
    "ita": "it",
    "por": "pt",
    "rus": "ru",
    "jpn": "ja",
    "kor": "ko",
    "chi": "zh",
    "zho": "zh",
    "ara": "ar",
    "tur": "tr",
    "tha": "th",
    "ind": "id",
    "dut": "nl",
    "nld": "nl",
    "swe": "sv",
    "pol": "pl",
}
LANG_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "te": "Telugu",
    "ta": "Tamil",
    "kn": "Kannada",
    "ml": "Malayalam",
    "mr": "Marathi",
    "bn": "Bengali",
    "pa": "Punjabi",
    "gu": "Gujarati",
    "ur": "Urdu",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
    "tr": "Turkish",
    "th": "Thai",
    "id": "Indonesian",
    "nl": "Dutch",
    "sv": "Swedish",
    "pl": "Polish",
}
CODEC_NAMES = {
    "ac3": "AC3",
    "eac3": "E-AC3",
    "dts": "DTS",
    "truehd": "TrueHD",
    "aac": "AAC",
    "mp3": "MP3",
    "opus": "Opus",
    "vorbis": "Vorbis",
    "flac": "FLAC",
    "subrip": "SRT",
    "ass": "ASS",
    "ssa": "SSA",
    "webvtt": "VTT",
    "mov_text": "TX3G",
    "hdmv_pgs_subtitle": "PGS",
    "dvd_subtitle": "VobSub",
}
CHANNELS = {1: "1.0", 2: "2.0", 6: "5.1", 8: "7.1"}
PROBES = {}  # key -> (sig, {"audio": [...], "subs": [...], "duration": s})
AUDIO_JOBS = {}  # cached file name -> {"status", "progress", "error", "t"}
_AUDIO_SEM = threading.BoundedSemaphore(2)


def norm_lang(code):
    """'eng' / 'en' / 'English' -> 'en' ('' when unknown)."""
    code = re.sub(r"[^a-z]", "", str(code or "").lower())[:3]
    if code in ("", "und", "zxx", "mis", "mul"):
        return ""
    return code if len(code) == 2 else LANG3.get(code, code)


def lang_name(code):
    return LANG_NAMES.get(code, code.upper())


def _run(cmd, timeout):
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return subprocess.run(
        cmd, capture_output=True, timeout=timeout, creationflags=flags
    )


def probe_media(key, full, st):
    """ffprobe the audio / subtitle streams once per file (None without ffprobe)."""
    sig = _sig(st.st_size, st.st_mtime)
    with LOCK:
        hit = PROBES.get(key)
    if hit and hit[0] == sig:
        return hit[1]
    if not FFPROBE:
        return None
    show = (
        "stream=codec_type,codec_name,channels:stream_tags=language,title"
        ":stream_disposition=default,forced:format=duration"
    )
    try:
        r = _run(
            [FFPROBE, "-v", "error", "-show_entries", show, "-of", "json", full], 45
        )
        data = json.loads(r.stdout.decode("utf-8", "replace") or "{}")
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    media = {"audio": [], "subs": [], "duration": 0.0}
    try:
        media["duration"] = float((data.get("format") or {}).get("duration") or 0)
    except (TypeError, ValueError):
        pass
    for stream in data.get("streams") or []:
        kind = stream.get("codec_type")
        if kind not in ("audio", "subtitle"):
            continue
        tags = {str(k).lower(): str(v) for k, v in (stream.get("tags") or {}).items()}
        item = {
            "codec": str(stream.get("codec_name") or ""),
            "lang": norm_lang(tags.get("language")),
            "title": tags.get("title", "").strip(),
            "default": bool((stream.get("disposition") or {}).get("default")),
            "forced": bool((stream.get("disposition") or {}).get("forced")),
            "ch": int(stream.get("channels") or 0),
        }
        media["audio" if kind == "audio" else "subs"].append(item)
    with LOCK:
        if len(PROBES) > 500:
            PROBES.clear()
        PROBES[key] = (sig, media)
    return media


def _external_subs(full):
    """Subtitle files that sit next to the video: Movie.srt, Movie.en.srt, Movie.Hindi.vtt ..."""
    folder = os.path.dirname(full)
    stem = os.path.splitext(os.path.basename(full))[0].lower()
    out = []
    try:
        names = sorted(os.listdir(folder), key=str.lower)
    except OSError:
        return out
    for fname in names:
        base, ext = os.path.splitext(fname)
        low = base.lower()
        if ext.lower() not in SUB_EXTS or not low.startswith(stem):
            continue
        tail = low[len(stem) :]
        if tail and tail[0] not in ".-_ ([":
            continue  # "Movie 2.srt" belongs to another video
        tail = tail.strip(" .-_()[]")
        lang = norm_lang(re.split(r"[.\-_ ]+", tail)[0]) if tail else ""
        if lang not in LANG_NAMES:
            lang = ""
        path = os.path.join(folder, fname)
        out.append(
            {
                "id": "x" + hashlib.sha1(fname.encode("utf-8")).hexdigest()[:8],
                "path": path,
                "name": fname,
                "lang": lang,
                "extra": "" if lang else tail,
                "ext": ext.lower(),
            }
        )
    return out[:20]


def _audio_label(n, a):
    parts = [lang_name(a["lang"]) if a["lang"] else f"Track {n + 1}"]
    if a["title"] and a["title"].lower() != parts[0].lower():
        parts.append(a["title"])
    codec = CODEC_NAMES.get(a["codec"], a["codec"].upper())
    layout = CHANNELS.get(a["ch"], f"{a['ch']}ch" if a["ch"] else "")
    parts.append(f"{codec} {layout}".strip())
    return " · ".join(p for p in parts if p)


def tracks_info(key):
    """Everything the player's Audio / Subtitles menu needs for one video."""
    full = abs_for_key(key)
    media = probe_media(key, full, os.stat(full))
    audio, subs = [], []
    if media:
        for n, a in enumerate(media["audio"]):
            audio.append(
                {
                    "i": n,
                    "lang": a["lang"],
                    "codec": a["codec"],
                    "default": a["default"],
                    "label": _audio_label(n, a),
                }
            )
        for n, sub in enumerate(media["subs"]):
            label = lang_name(sub["lang"]) if sub["lang"] else f"Subtitle {n + 1}"
            if sub["title"] and sub["title"].lower() != label.lower():
                label += " · " + sub["title"]
            label += " · " + CODEC_NAMES.get(sub["codec"], sub["codec"].upper())
            subs.append(
                {
                    "id": f"e{n}",
                    "lang": sub["lang"],
                    "label": label,
                    "ok": bool(FFMPEG) and sub["codec"] in TEXT_SUBS,
                    "default": sub[
                        "default"
                    ],  # flagged "default" inside the video file
                    "forced": sub["forced"],
                }
            )
    for ext_sub in _external_subs(full):
        label = lang_name(ext_sub["lang"]) if ext_sub["lang"] else ext_sub["name"]
        if ext_sub["extra"] and ext_sub["lang"] == "":
            label = ext_sub["name"]
        subs.append(
            {
                "id": ext_sub["id"],
                "lang": ext_sub["lang"],
                "label": label + " · file",
                "default": False,
                "forced": False,
                "ok": ext_sub["ext"] in (".srt", ".vtt") or bool(FFMPEG),
            }
        )
    return {"ffmpeg": bool(FFMPEG and FFPROBE), "audio": audio, "subs": subs}


def _decode_text(raw):
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8", "replace")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", "replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", "replace")


def _srt_to_vtt(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"(\d{1,2}:\d{2}:\d{2}),(\d{1,3})", r"\1.\2", text)
    return "WEBVTT\n\n" + text.strip() + "\n"


def _ffmpeg_vtt(src, dst, stream=None):
    if not FFMPEG:
        raise ValueError("ffmpeg is needed to read this subtitle.")
    tmp = dst + ".tmp"
    cmd = [FFMPEG, "-nostdin", "-loglevel", "error", "-y", "-i", src]
    if stream is not None:
        cmd += ["-map", f"0:s:{stream}"]
    cmd += ["-f", "webvtt", tmp]
    try:
        r = _run(cmd, 900)  # a big MKV has to be read through once
    except (OSError, subprocess.SubprocessError):
        r = None
    if (
        not r
        or r.returncode != 0
        or not os.path.isfile(tmp)
        or os.path.getsize(tmp) < 10
    ):
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise ValueError("Couldn't read that subtitle track.")
    os.replace(tmp, dst)


def subtitle_vtt(key, sid):
    """WebVTT text of an embedded ('e0', 'e1'...) or external ('x1a2b3c4d') subtitle."""
    full = abs_for_key(key)
    st = os.stat(full)
    ext_sub = None
    if re.fullmatch(r"e\d{1,2}", sid):
        sig = _sig(st.st_size, st.st_mtime)
    elif re.fullmatch(r"x[0-9a-f]{8}", sid):
        ext_sub = next((x for x in _external_subs(full) if x["id"] == sid), None)
        if not ext_sub:
            raise ValueError("Subtitle file not found.")
        sst = os.stat(ext_sub["path"])
        sig = _sig(sst.st_size, sst.st_mtime)
    else:
        raise ValueError("Unknown subtitle.")
    name = hashlib.sha1(f"{key}|{sid}|{sig}".encode("utf-8")).hexdigest()[:24] + ".vtt"
    path = os.path.join(SUB_DIR, name)
    if not os.path.isfile(path):
        with _STRIPES[hash(path) % len(_STRIPES)]:
            if not os.path.isfile(path):
                if ext_sub is None:
                    n = int(sid[1:])
                    media = probe_media(key, full, st)
                    if (
                        not media
                        or n >= len(media["subs"])
                        or media["subs"][n]["codec"] not in TEXT_SUBS
                    ):
                        raise ValueError(
                            "That subtitle track can't be shown (image-based)."
                        )
                    _ffmpeg_vtt(full, path, stream=n)
                elif ext_sub["ext"] in (".srt", ".vtt"):
                    if os.path.getsize(ext_sub["path"]) > 5 * 1024 * 1024:
                        raise ValueError("Subtitle file is too large.")
                    with open(ext_sub["path"], "rb") as fh:
                        text = _decode_text(fh.read())
                    if ext_sub["ext"] == ".srt":
                        text = _srt_to_vtt(text)
                    elif not text.lstrip().startswith("WEBVTT"):
                        text = "WEBVTT\n\n" + text
                    with open(path + ".tmp", "w", encoding="utf-8", newline="\n") as fh:
                        fh.write(text)
                    os.replace(path + ".tmp", path)
                else:  # .ass / .ssa
                    _ffmpeg_vtt(ext_sub["path"], path)
    with open(path, "rb") as fh:
        return fh.read().decode("utf-8", "replace")


def _prune_dir(folder, max_bytes, keep):
    """Delete the least recently used files until the folder fits in max_bytes."""
    files = []
    for fname in os.listdir(folder):
        path = os.path.join(folder, fname)
        if fname.endswith(".tmp") or not os.path.isfile(path):
            continue
        try:
            files.append((os.path.getmtime(path), os.path.getsize(path), path))
        except OSError:
            continue
    total = sum(size for _m, size, _p in files)
    for _m, size, path in sorted(files):
        if total <= max_bytes:
            break
        if os.path.basename(path) == keep:
            continue
        try:
            os.remove(path)
            total -= size
        except OSError:
            pass


def _run_audio_job(name, full, n, track, duration, job):
    path = os.path.join(AUDIO_DIR, name)
    tmp = path + ".tmp"
    try:
        with _AUDIO_SEM:
            copy = track["codec"] == "aac" and 0 < track["ch"] <= 2
            cmd = [FFMPEG, "-nostdin", "-loglevel", "error", "-y", "-i", full]
            cmd += ["-map", f"0:a:{n}", "-vn", "-sn"]
            cmd += (
                ["-c:a", "copy"]
                if copy
                else ["-c:a", "aac", "-b:a", "160k", "-ac", "2"]
            )
            cmd += [
                "-movflags",
                "+faststart",
                "-f",
                "mp4",
                "-progress",
                "pipe:1",
                "-nostats",
                tmp,
            ]
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                creationflags=flags,
            )
            watchdog = threading.Timer(3 * 3600, proc.kill)
            watchdog.start()
            errors = []
            try:
                for raw in proc.stdout:
                    line = raw.decode("utf-8", "replace").strip()
                    m = re.match(r"out_time_(?:us|ms)=(\d+)", line)
                    if m:
                        if duration:
                            job["progress"] = min(
                                0.99, int(m.group(1)) / 1e6 / duration
                            )
                    elif line and not re.match(r"^[a-z_0-9]+=\S*$", line):
                        errors.append(line)
                code = proc.wait()
            finally:
                watchdog.cancel()
        if code != 0 or not os.path.isfile(tmp) or os.path.getsize(tmp) < 1000:
            raise ValueError(
                (errors[-1] if errors else "ffmpeg couldn't convert this track")[:200]
            )
        os.replace(tmp, path)
        job["progress"] = 1.0
        job["status"] = "done"
        _prune_dir(AUDIO_DIR, AUDIO_CACHE_MAX, keep=name)
    except Exception as exc:  # the job must always end up 'done' or 'error'
        job["status"] = "error"
        job["error"] = str(exc) or "Audio conversion failed."
        try:
            os.remove(tmp)
        except OSError:
            pass
    finally:
        job["t"] = time.time()


def audio_prepare(key, n):
    """Start (or report on) extracting audio track n. -> {'status','progress','url'}"""
    full = abs_for_key(key)
    st = os.stat(full)
    media = probe_media(key, full, st)
    if not FFMPEG or not media:
        raise ValueError(
            "Switching audio needs ffmpeg and ffprobe installed on this PC."
        )
    if not 0 <= n < len(media["audio"]):
        raise ValueError("No such audio track.")
    name = (
        hashlib.sha1(
            f"{key}|{_sig(st.st_size, st.st_mtime)}|a{n}".encode("utf-8")
        ).hexdigest()[:24]
        + ".m4a"
    )
    path = os.path.join(AUDIO_DIR, name)
    if os.path.isfile(path):
        try:
            os.utime(path)  # recently used -> pruned last
        except OSError:
            pass
        return {"status": "done", "progress": 1, "url": AUDIO_PREFIX + name}
    with LOCK:
        job = AUDIO_JOBS.get(name)
        if job and job["status"] == "running":
            return {"status": "running", "progress": round(job["progress"], 3)}
        if job and job["status"] == "error" and time.time() - job["t"] < 20:
            return {"status": "error", "error": job["error"]}
        job = {"status": "running", "progress": 0.0, "error": "", "t": time.time()}
        AUDIO_JOBS[name] = job
        threading.Thread(
            target=_run_audio_job,
            args=(name, full, n, media["audio"][n], media["duration"], job),
            daemon=True,
            name="audio-" + name[:6],
        ).start()
    return {"status": "running", "progress": 0}


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


def describe_image(key, filename, size, mtime):
    """Thumbnail / viewer URLs for a photo ('' = just use the original file)."""
    ext = os.path.splitext(filename)[1].lower()
    heif = ext in HEIF_EXTS
    # "heic": the original can't be shown by most browsers - only the converted copies can
    out = {"key": key, "thumb": "", "view": "", "heic": heif}
    sig = _sig(size, mtime)
    if ext not in RESIZE_EXTS or not can_resize(ext) or PHOTO_FAILED.get(key) == sig:
        return out
    if heif or size >= THUMB_MIN_BYTES:
        out["thumb"] = _photo_url(key, sig, "thumb")
    if heif or size >= VIEW_MIN_BYTES:
        out["view"] = _photo_url(key, sig, "view")
    return out


def start_background():
    tools = [
        "Pillow " + ("yes" if PIL_OK else "NO (pip install pillow)"),
        "pillow-heif "
        + (
            "yes"
            if HEIF_OK
            else "NO (pip install pillow-heif - needed to show .heic photos)"
        ),
        "ffmpeg " + ("yes" if FFMPEG else "NO"),
        "ffprobe " + ("yes" if FFPROBE else "NO"),
    ]
    log(
        "Tools: "
        + " · ".join(tools)
        + " - audio/subtitle switching needs ffmpeg + ffprobe."
    )

    def guarded(fn, name):
        def run():
            try:
                fn()
            except Exception as exc:  # never let a scan crash the server
                log(f"{name} scan stopped: {exc}")

        threading.Thread(target=run, daemon=True, name=name).start()

    guarded(scan_posters, "poster")
    guarded(scan_thumbs, "preview")
    guarded(scan_photos, "photo")


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


LINK_HELP = (
    "Only TMDB and Wikipedia links work: a movie / TV page on themoviedb.org, "
    "a page on wikipedia.org, or an image link from image.tmdb.org / upload.wikimedia.org."
)


def resolve_link(link):
    """Pasted TMDB / Wikipedia link -> the poster image URL on an allowed image host."""
    link = str(link or "").strip()
    parsed = urllib.parse.urlparse(link)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not host:
        raise ValueError("Paste a full link starting with https://. " + LINK_HELP)
    if _image_host_ok(link):
        return link
    if host in ("themoviedb.org", "www.themoviedb.org"):
        m = re.match(r"^/(movie|tv)/(\d+)", parsed.path)
        if not m:
            raise ValueError(
                "That TMDB link isn't a movie or TV page. Open the movie on themoviedb.org "
                "and copy its address."
            )
        if not TMDB_KEY:
            raise ValueError(
                "TMDB page links need a TMDB API key in server.py - or paste the poster's "
                "image link (image.tmdb.org) instead."
            )
        detail = _tmdb_request(f"/{m.group(1)}/{m.group(2)}", {"language": "en-US"})
        if not detail.get("poster_path"):
            raise ValueError("That TMDB page has no poster.")
        return "https://image.tmdb.org/t/p/w500" + detail["poster_path"]
    if re.fullmatch(r"[a-z]{2,3}\.wikipedia\.org", host):
        m = re.match(r"^/wiki/(.+)$", parsed.path)
        if not m:
            raise ValueError("Use the address of a Wikipedia article (…/wiki/Title).")
        params = {
            "action": "query",
            "format": "json",
            "titles": urllib.parse.unquote(m.group(1)).replace("_", " "),
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": 500,
            "redirects": 1,
        }
        data = http_json(f"https://{host}/w/api.php?" + urllib.parse.urlencode(params))
        for page in ((data.get("query") or {}).get("pages") or {}).values():
            src = (page.get("thumbnail") or {}).get("source")
            if src:
                return src
        raise ValueError("That Wikipedia page has no poster image.")
    raise ValueError(LINK_HELP)


def poster_apply(action, key, *, candidate_id="", link="", title="", year=""):
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
    elif action == "url":
        try:
            fname = download_image(resolve_link(link))
        except FetchError:
            raise ValueError(
                "Couldn't download that image - check the link and this PC's internet connection."
            ) from None
        if not fname:
            raise ValueError(
                "That link isn't a usable image (JPG, PNG or WebP under 5 MB)."
            )
        entry = {"file": fname, "source": "manual", "title": title, "checked": now}
    elif action == "reset":
        entry = {"file": "", "source": "fallback", "title": title, "checked": now}
    else:
        raise ValueError("Unknown poster action.")
    with LOCK:
        for k in keys:
            POSTERS[k] = dict(entry)
        save_posters()
    return poster_url(key)
