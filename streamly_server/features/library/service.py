"""Folder listing and adaptive media classification for Streamly."""
from __future__ import annotations

import os
import threading
import time
from urllib.parse import quote

_SCAN_CACHE = {}
_SCAN_LOCK = threading.Lock()
_SCAN_TTL_SECONDS = 20
_MAX_SCAN_FILES = 1800
_MAX_SCAN_ENTRIES = 6000
_MAX_SCAN_DEPTH = 6


def _classify_counts(photos: int, videos: int) -> str:
    if photos and videos:
        return "mixed"
    if videos:
        return "video"
    if photos:
        return "photo"
    return "collections"


def _scan_folder(path, guess_type, hidden):
    """Return bounded recursive counts. Each folder is independently classified on navigation."""
    try:
        st = os.stat(path)
        cache_key = (os.path.normcase(os.path.realpath(path)), st.st_mtime_ns)
        now = time.monotonic()
        with _SCAN_LOCK:
            cached = _SCAN_CACHE.get(cache_key)
            if cached and now - cached[0] < _SCAN_TTL_SECONDS:
                return cached[1]
    except OSError:
        cache_key = None

    photos = videos = audio = other = folders = scanned = entries_seen = 0
    truncated = False
    preview = None
    stack = [(path, 0)]
    while stack:
        current, depth = stack.pop()
        try:
            entries = os.scandir(current)
        except OSError:
            continue
        with entries:
            for entry in entries:
                entries_seen += 1
                if entries_seen > _MAX_SCAN_ENTRIES:
                    truncated = True
                    break
                if entry.name.startswith(".") or entry.name.lower() in hidden:
                    continue
                try:
                    if entry.is_dir(follow_symlinks=False):
                        folders += 1
                        if depth < _MAX_SCAN_DEPTH:
                            stack.append((entry.path, depth + 1))
                        continue
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    scanned += 1
                    if scanned > _MAX_SCAN_FILES:
                        truncated = True
                        break
                    ctype = guess_type(entry.path) or ""
                    if ctype.startswith("image/"):
                        photos += 1
                        if preview is None:
                            preview = entry.path
                    elif ctype.startswith("video/"):
                        videos += 1
                    elif ctype.startswith("audio/"):
                        audio += 1
                    else:
                        other += 1
                except OSError:
                    continue
        if truncated:
            break

    result = {
        "photos": photos,
        "videos": videos,
        "audio": audio,
        "other": other,
        "subfolders": folders,
        "classification": _classify_counts(photos, videos),
        "scan_truncated": truncated,
        "preview_path": preview,
    }
    if cache_key:
        with _SCAN_LOCK:
            _SCAN_CACHE[cache_key] = (time.monotonic(), result)
            # Bound the in-memory cache; stale entries are harmless but should not accumulate.
            if len(_SCAN_CACHE) > 512:
                for key, value in list(_SCAN_CACHE.items())[:128]:
                    if time.monotonic() - value[0] > _SCAN_TTL_SECONDS:
                        _SCAN_CACHE.pop(key, None)
    return result


def build_directory_data(*, path, request_path, hidden, base_dir, media_root, guess_type, app_name, posters):
    items = []
    direct_photos = direct_videos = direct_audio = direct_other = 0
    for name in os.listdir(path):
        if name.startswith(".") or name.lower() in hidden:
            continue
        full = os.path.join(path, name)
        if os.path.normcase(os.path.abspath(full)) == os.path.normcase(base_dir):
            continue
        try:
            stat = os.stat(full)
        except OSError:
            continue
        is_dir = os.path.isdir(full)
        if is_dir:
            kind, count = "folder", 0
            try:
                count = sum(1 for entry in os.listdir(full) if not entry.startswith(".") and entry.lower() not in hidden)
            except OSError:
                pass
            summary = _scan_folder(full, guess_type, hidden)
        else:
            count = 0
            content_type = guess_type(full) or ""
            kind = "video" if content_type.startswith("video/") else (
                "image" if content_type.startswith("image/") else
                "audio" if content_type.startswith("audio/") else "file"
            )
            direct_videos += kind == "video"
            direct_photos += kind == "image"
            direct_audio += kind == "audio"
            direct_other += kind == "file"
            summary = None
        item = {
            "name": name,
            "dir": is_dir,
            "kind": kind,
            "size": 0 if is_dir else stat.st_size,
            "mtime": int(stat.st_mtime),
            "count": count,
            "url": quote(name) + ("/" if is_dir else ""),
        }
        if is_dir and summary:
            item.update({
                "mediaMode": summary["classification"],
                "mediaCounts": {"photos": summary["photos"], "videos": summary["videos"]},
                "nestedFolders": summary["subfolders"],
                "scanTruncated": summary["scan_truncated"],
            })
            preview = summary.get("preview_path")
            if preview:
                try:
                    pst = os.stat(preview)
                    key = os.path.relpath(preview, media_root).replace(os.sep, "/")
                    preview_data = posters.describe_image(key, os.path.basename(preview), pst.st_size, pst.st_mtime)
                    item["folderPreview"] = preview_data.get("thumb") or ("/" + quote(key, safe="/"))
                except OSError:
                    pass
        if kind in ("video", "image"):
            key = os.path.relpath(full, media_root).replace(os.sep, "/")
            if kind == "video":
                item.update(posters.describe_video(key, name, stat.st_size, stat.st_mtime))
            else:
                item.update(posters.describe_image(key, name, stat.st_size, stat.st_mtime))
        items.append(item)

    # The current folder's mode is based on all descendants, not its name. This lets a
    # selected root such as E:/photos enter Photo mode even when it contains only albums.
    summary = _scan_folder(path, guess_type, hidden)
    mode = summary["classification"]
    if direct_photos and direct_videos:
        mode = "mixed"
    elif direct_photos and not summary["videos"]:
        mode = "photo"
    elif direct_videos and not summary["photos"]:
        mode = "video"
    return {
        "path": request_path,
        "items": items,
        "app": app_name,
        "mediaMode": mode,
        "mediaCounts": {
            "photos": summary["photos"], "videos": summary["videos"],
            "audio": summary["audio"], "other": summary["other"],
            "subfolders": summary["subfolders"],
            "directPhotos": direct_photos, "directVideos": direct_videos,
            "directAudio": direct_audio, "directOther": direct_other,
        },
        "scanTruncated": summary["scan_truncated"],
    }
