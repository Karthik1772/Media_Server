# Media Server

A small, private media server you run on your own PC. It shares a folder over your home Wi-Fi and gives your phone, tablet and laptop a Netflix-style web page for browsing movies, series, photos and short videos, with real posters, fast photo thumbnails and a full video player with audio-track and subtitle switching.

- **One Python process**, no database, no build step.
- **No required packages.** Pillow, pillow-heif and ffmpeg are optional extras that unlock more features (see [Requirements](#requirements)).
- **Private by default.** Only your own PC and devices on your local network can connect.

---

## Contents

1. [Features at a glance](#features-at-a-glance)
2. [Requirements](#requirements)
3. [Install](#install)
4. [Project layout](#project-layout)
5. [Running the server](#running-the-server)
6. [Configuration](#configuration)
7. [Browsing the library](#browsing-the-library)
8. [Posters for films](#posters-for-films)
9. [Photos and thumbnails](#photos-and-thumbnails)
10. [Short-video previews](#short-video-previews)
11. [The video player](#the-video-player)
12. [Audio tracks and subtitles](#audio-tracks-and-subtitles)
13. [Cache folders](#cache-folders)
14. [Security](#security)
15. [HTTP API reference](#http-api-reference)
16. [Git, `.gitignore` and `.env`](#git-gitignore-and-env)
17. [Troubleshooting](#troubleshooting)
18. [Known limits](#known-limits)

---

## Features at a glance

| Area | What you get |
|---|---|
| Browsing | Folders, breadcrumbs, search, sort (name / newest / largest), grid or list view, light and dark theme |
| Film posters | Official posters found once per title (TMDB or Wikipedia), changeable by search or by pasting a TMDB / Wikipedia link |
| Photos | 360 px thumbnails in the grid, a lighter 1600 px copy in the viewer, an **Original** button, HEIC support |
| Short videos | A preview frame for videos in the `Photos` folder |
| Player | Custom controls, touch gestures (MX Player style), speed, aspect modes, lock, picture-in-picture, fullscreen, resume where you stopped |
| Audio | Switch between the audio languages inside a file; AC3 / DTS tracks the browser cannot decode are converted automatically |
| Subtitles | Embedded subtitles and `.srt` / `.vtt` / `.ass` / `.ssa` files next to the video; size, colour and delay controls; the file's own "default" subtitle is turned on automatically |
| Speed | HTTP keep-alive, long browser caching of every generated file, background pre-generation of thumbnails |
| Safety | Local-network-only access, strict allow-list for downloaded posters, server code is never served |

---

## Requirements

| Requirement | Needed for | Required? |
|---|---|---|
| **Python 3.8 or newer** | Running the server | **Yes** |
| **Pillow** (`pip install pillow`) | Fast photo thumbnails and viewer copies (WebP) | Recommended |
| **pillow-heif** (`pip install pillow-heif`) | Showing iPhone / Android `.heic` photos | Only if you have HEIC photos |
| **ffmpeg + ffprobe** | Switching audio language, reading embedded subtitles, preview frames for short videos, converting AC3/DTS audio | Recommended |
| A free **TMDB API key** | Posters from TMDB (otherwise Wikipedia is used) | Optional |

What works without each optional piece:

- **No Pillow:** photo thumbnails fall back to ffmpeg (JPEG). With neither, the original photos are loaded.
- **No pillow-heif:** `.heic` photos show a placeholder tile with a hint instead of a broken image.
- **No ffmpeg / ffprobe:** the player works, but the audio menu cannot list or switch languages and embedded subtitles cannot be read. External `.srt` and `.vtt` files still work.
- **No TMDB key:** posters come from Wikipedia only.

The server prints one line at start-up telling you what it found, for example:
`Tools: Pillow yes · pillow-heif NO (...) · ffmpeg yes · ffprobe yes`.

---

## Install

1. **Install Python 3.8+** from python.org (tick *Add Python to PATH* on Windows).
2. **Install the optional extras** (a terminal / PowerShell):

   ```
   pip install pillow pillow-heif
   ```

3. **Install ffmpeg** (it includes ffprobe):
   - Windows: `winget install ffmpeg` (or download a build and add its `bin` folder to PATH).
   - macOS: `brew install ffmpeg`
   - Linux: `sudo apt install ffmpeg`

   Check with `ffmpeg -version` and `ffprobe -version`.
4. **Copy the project files** (see [Project layout](#project-layout)) to a folder on your PC.
5. **(Optional) add your TMDB key** to `.env` (see [Configuration](#configuration)).

---

## Project layout

```
Media Server/                 <- put this folder inside the folder you want to share
├── server.py                 the web server: routing, logging, security, API
├── posters.py                every cache: posters, thumbnails, audio/subtitle tracks
├── .env                      your secrets (TMDB key). Ignored by git.
├── .gitignore                keeps caches and .env out of git
├── README.md                 this file
└── ui/
    ├── index.html            page template (browse page, player, photo viewer, poster dialog)
    ├── style.css             all styling, light + dark theme
    ├── app.js                the whole front end: browsing, player, gestures, menus
    └── assets/
        └── video.jpg         default image for videos without a poster
```

These folders are **created automatically** next to `server.py` the first time they are needed (all ignored by git):

```
films_thumbnails/  short_video_thumbnails/  photo_thumbnails/
photo_previews/    subtitle_cache/          audio_track_cache/
```

---

## Running the server

```
python server.py
```

By default it shares **the folder above the one containing `server.py`**. For example, with `E:\Media Server\server.py` it shares `E:\`.

To share a different folder for one run:

```
python server.py "D:\Movies"
```

When it starts you see a box like this:

```
│  Folder  E:\                          │
│  Phone   http://192.168.1.20:2904     │
│  Local   http://localhost:2904        │
│  Access  this network only            │
```

- Open the **Local** address on the PC.
- Open the **Phone** address on any device on the same Wi-Fi (or the phone's hotspot network the PC is joined to).
- If the phone cannot connect, allow Python through the Windows firewall for *Private networks* when Windows asks.

Every request is logged on one line (`REQUEST`, `RESPONSE`, `DONE`, `ABORTED`, `ERROR`). `ABORTED` is normal when you skip or close a video. Type `cls` or `clear` in the console to redraw the log. Press `Ctrl+C` to stop; a session summary is printed.

Background work (poster lookups, photo thumbnails, preview frames) starts a moment after launch and reports progress in the console with a `◆` prefix.

---

## Configuration

### Settings at the top of `server.py`

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `2904` | Port the server listens on |
| `MEDIA_ROOT` | folder above `server.py` | Folder that is shared (overridden by `python server.py "path"`) |
| `ONLY_LOCAL_NETWORK` | `True` | Accept only this PC and private network addresses (192.168.x.x, 10.x.x.x, 172.16–31.x.x) |
| `EXTRA_ALLOWED_NETWORKS` | `()` | Extra allowed ranges, e.g. `("100.64.0.0/10",)` for a Tailscale VPN |
| `POSTER_FOLDERS` | `("Vedios", "Videos")` | Videos inside folders with these names (anywhere in the tree, any capitalisation) get official posters |
| `PREVIEW_FOLDERS` | `("Photos",)` | Videos inside folders with these names get a preview frame; photos here get thumbnails pre-built in the background |
| `PREVIEW_MAX_MB` | `500` | Videos bigger than this keep the default image instead of a preview frame |
| `AUDIO_CACHE_MAX_GB` | `5` | Size limit of `audio_track_cache`; the least recently used tracks are deleted first |
| `HIDDEN` | system + cache folders | Names that never appear in listings |

### `.env` (secrets)

A plain text file next to `server.py`:

```
TMDB_API_KEY=your_key_here
```

- Get a free key at <https://www.themoviedb.org/settings/api>. Both the classic API key and the long "read access token" (starts with `eyJ`) work.
- Leave it empty to use Wikipedia only.
- Lines starting with `#` are comments. Quotes around the value are optional.
- A real environment variable named `TMDB_API_KEY` overrides the file.
- If TMDB rejects the key, the server logs it and carries on with Wikipedia.

The file is read by a tiny built-in reader, so no extra package is needed.

---

## Browsing the library

- **Breadcrumbs** across the top jump to any parent folder.
- **Search** filters the current folder. Press `/` to focus the search box.
- **Sort:** Name, Newest, Largest. **View:** grid or list. **Theme:** the sun / moon button (follows your system theme the first time).
- Cards show the file type; videos show a **progress bar** for how far you watched.
- Tapping a video opens the player; tapping a photo opens the viewer. Next / previous steps through the folder.
- Your sort, view, theme and watch progress are stored in **your browser** (`localStorage`), per device.
- Hidden from listings: the server's own folder, the cache folders, anything starting with a dot (such as `.env`) and system folders like `$RECYCLE.BIN`. Files inside the server's own folder are never served either, apart from the few UI and cache files the page needs.

---

## Posters for films

Videos inside a folder named in `POSTER_FOLDERS` get a portrait poster instead of the default image.

**How the automatic lookup works**

1. The file name is cleaned into a title and year (for example `Test.Movie.2020.mkv` → "Test Movie", 2020), using the folder name as a language hint where helpful.
2. The server asks **TMDB** (if a key is set) and then **Wikipedia**, once per title, in the background.
3. The best confident match is downloaded and saved in `films_thumbnails`. It is **never changed again** automatically.
4. No confident match → the default image stays.

**Changing a poster yourself:** press the ✎ button on a card.

- **Search:** type a title (and optional year) and pick from the TMDB / Wikipedia results.
- **Paste a link:** a TMDB movie or TV page (`themoviedb.org/movie/603-…`), a Wikipedia article (`xx.wikipedia.org/wiki/…`), or a direct image link from `image.tmdb.org` or `upload.wikimedia.org`.
  TMDB *page* links need the TMDB key; direct image links do not.
- **Reset to default poster** removes your choice.

Your choice is saved permanently and the automatic scan will never override it.

**Safety rules for downloaded images:** only the hosts above are allowed, redirects to any other host are refused, only JPG / PNG / WebP are accepted, and the maximum size is 5 MB. Anything else shows a clear error message.

---

## Photos and thumbnails

A phone photo is often 3–6 MB. Loading a grid of them over Wi-Fi is slow and wastes data, so the server makes small copies once and reuses them.

| Copy | Size | Used for | Folder |
|---|---|---|---|
| Thumbnail | 360 px on the long edge, WebP quality 78 | Grid and list cards | `photo_thumbnails` |
| Viewer copy | 1600 px, WebP quality 82 | Full-screen viewer (an **Original** button loads the full file) | `photo_previews` |

How it behaves:

- **Created on demand and cached.** The first time a thumbnail is needed the server builds it, and every later request is served from disk. Photos in the `Photos` folder are also **pre-built in the background** at start-up (two at a time).
- **Fast decoding.** Pillow decodes JPEGs at a reduced size, which is several times faster than a full decode. Phone rotation (EXIF) is respected and metadata is stripped.
- **Smart skipping.** Originals under 150 KB are used as they are for the grid, and under 800 KB for the viewer, because a copy would save nothing.
- **Never stale.** Each file name is a hash of the photo's path, size and modified time. Edit a photo and it simply gets a new thumbnail; unchanged photos are never rebuilt.
- **Cached by the browser for a year**, so a thumbnail is downloaded only once per device.
- **Safe fallback.** If a copy cannot be made, the original image is used.
- Formats resized: JPG, PNG, WebP, BMP, TIFF, HEIC / HEIF. GIF, SVG and AVIF are always shown as the original.
- Neighbouring photos are preloaded in the viewer for instant next / previous.

### HEIC / HEIF photos

Most browsers (everything except Safari) cannot display HEIC. These photos are therefore **always converted** to WebP, whatever their size, and the **Original** button is hidden for them.

- Install the converter once: `pip install pillow-heif`, then restart the server.
- Without it, a HEIC photo shows a placeholder tile and, when opened, a message telling you what to install. (ffmpeg can read some newer HEIC files as a fallback, but pillow-heif is the reliable route, especially for iPhone photos.)

---

## Short-video previews

Videos inside a `PREVIEW_FOLDERS` folder (`Photos` by default) show a real frame instead of the default image.

- If **ffmpeg** is installed the server captures the frame itself.
- Otherwise the **browser** captures a frame the first time the card is seen and uploads it, after which it is cached like any other file.
- Videos larger than `PREVIEW_MAX_MB` keep the default image, and a video whose preview fails is remembered so it is not retried on every visit.
- Frames are stored in `short_video_thumbnails`.

---

## The video player

The browser still decodes the video, but every control is custom-built.

### On-screen controls

Seek bar (with buffered progress and a hover time tooltip) · previous / next · back and forward 10 s · play / pause · mute and volume slider (hidden on phones, which use the hardware buttons) · playback speed 0.5×–2× · **Audio & subtitles** menu · picture fit (Fit → Fill → Stretch) · picture-in-picture · lock controls · fullscreen.

The title bar also has **Close**, **VLC** (opens the stream in VLC: an intent on Android, a link on iOS, a copied address on desktop) and a **download** button.

Controls fade away after about three seconds while playing and return on any movement or tap.

### Touch gestures (phones and tablets)

| Gesture | Action |
|---|---|
| Single tap | Show / hide the controls |
| Double-tap left third | Back 10 s (keep tapping to keep skipping) |
| Double-tap right third | Forward 10 s |
| Double-tap centre | Play / pause |
| Swipe left / right | Seek (a full-width swipe ≈ 150 s) |
| Swipe up / down on the **left** half | Brightness |
| Swipe up / down on the **right** half | Volume |
| Lock button | Hides every control and ignores gestures; tap the screen and then the lock icon to unlock |

### Mouse

Click the picture to play / pause · double-click for fullscreen · mouse wheel changes volume · click or drag the seek bar.

### Keyboard

| Key | Action |
|---|---|
| `Space` or `K` | Play / pause |
| `←` / `→` | Back / forward 10 s |
| `↑` / `↓` | Volume up / down |
| `N` / `P` | Next / previous video |
| `F` | Fullscreen |
| `M` | Mute |
| `C` | Cycle subtitles |
| `A` | Cycle audio track |
| `<` or `,` / `>` or `.` | Slower / faster |
| `Esc` | Close the open menu, otherwise close the player |

### Remembered between visits

Resume position and progress bar (per video) · volume and mute · playback speed · subtitle size and colour · your audio and subtitle choices (see below).

If the browser cannot play a file (typically HEVC video inside an MKV), a message appears; use the **VLC** or **download** button instead.

---

## Audio tracks and subtitles

Open the **CC** button in the player.

### Audio

- The video's **first audio track plays directly from the file**, with no waiting.
- Choosing another language makes the server **extract that track once** to AAC (160 kbps stereo, or a straight copy if it is already stereo AAC) and store it in `audio_track_cache`. A progress percentage is shown. The extra audio then plays from a hidden audio element that is **kept in sync** with the muted video (corrected whenever it drifts more than 0.3 s), and follows seeking, pausing and speed changes.
- Tracks the browser **cannot decode** (AC3 / E-AC3 without codec support, DTS, TrueHD) are converted automatically, even for the first track, so the video is not silent. The first play of such a film needs a one-time wait; afterwards it is instant.
- Up to two conversions run at once. The cache is trimmed to `AUDIO_CACHE_MAX_GB`, deleting the least recently used first. Roughly 100–150 MB per 2-hour film per extra track.

### Subtitles

Sources:

- **Embedded text subtitles** (SRT, ASS/SSA, WebVTT, MOV_TEXT …), read with ffmpeg and converted to WebVTT once (`subtitle_cache`). On a very large MKV the first conversion has to read through the file and can take a while.
- **Files next to the video** with the same name start: `Movie.srt`, `Movie.en.srt`, `Movie.Hindi.vtt`, `Movie.2020.hi.ass` … Supported: `.srt`, `.vtt`, `.ass`, `.ssa` (up to 20 per video, same folder). The language is guessed from the part of the name after the movie title. UTF-8, UTF-16 and Windows-1252 text are handled.
- **Image-based subtitles** (PGS, VobSub) cannot be converted; they are listed greyed out as "image-based".

Which subtitle is turned on automatically, in this order:

1. What **you** chose for this video (including "Off").
2. Your **usual subtitle language**, from your last manual choice.
3. The track the **file itself flags as default** (or forced), shown with a small "default" label in the menu.
4. Otherwise subtitles stay off. (If you last chose "Off", that wins over step 3.)

Subtitles are drawn by the page itself, so you can change **size** (50–250 %), **colour** (4 choices) and **delay** (±0.5 s steps, for subtitles that run early or late).

Audio and subtitle choices are saved per video, and your last audio / subtitle **language** is applied to the next video that has it.

---

## Cache folders

All are created next to `server.py`, rebuilt automatically, safe to delete (you only lose the saved work), and excluded from git.

| Folder | Contents | Notes |
|---|---|---|
| `films_thumbnails` | Film posters (+ `posters.json` index) | Manual choices are kept even if the scan would pick differently |
| `short_video_thumbnails` | Preview frames (+ `thumbs.json`) | For videos in the `Photos` folder |
| `photo_thumbnails` | 360 px WebP/JPEG thumbnails | Named by hash of path + size + date |
| `photo_previews` | 1600 px viewer copies | Same naming |
| `subtitle_cache` | WebVTT subtitles | Tiny |
| `audio_track_cache` | Extracted AAC audio (`.m4a`) | Size-capped, oldest removed first |

**Upgrading from the old names:** `poster_cache` and `thumb_cache` are renamed automatically to `films_thumbnails` and `short_video_thumbnails` on the first start, keeping everything already cached.

Half-written `.tmp` files left by a crash are cleaned at start-up.

---

## Security

- **Local network only (default).** Connections are accepted only from this PC and private addresses. Anything from the public internet is refused even if a router rule or tunnel lets it reach the PC. Change `ONLY_LOCAL_NETWORK` or add `EXTRA_ALLOWED_NETWORKS` only if you understand the exposure.
- **Plain HTTP, no login.** Anyone on your Wi-Fi can browse what you share. Do not share a folder with private files on a network you do not trust, and do not port-forward this server to the internet.
- **Server code is protected.** `server.py`, `posters.py`, `.env` and every file in the server's own folder are never served; only the UI files and generated cache files are.
- **Path safety.** Every file path from the browser is validated and must resolve inside the shared folder.
- **Downloads are allow-listed.** Pasted links can only lead to TMDB or Wikipedia image hosts, redirects elsewhere are refused, and size and type are checked (this also prevents the server being tricked into reaching other devices on your network).
- **Secrets stay out of code.** The TMDB key lives in `.env`, which `.gitignore` excludes. If a key was ever committed or shared before you moved it to `.env`, create a new one.

---

## HTTP API reference

Used by the page; listed for completeness. All are served under `/__api/`.

| Method and path | Purpose |
|---|---|
| `GET /__api/poster-search?q=&year=&kind=` | Poster candidates from TMDB / Wikipedia |
| `POST /__api/poster-select` | Apply a poster. JSON: `action` (`select`, `url`, `reset`), `video_key`, `candidate_id`, `link`, `title` |
| `POST /__api/thumb?key=` | Browser uploads a captured preview frame (`failed=1` marks a failure) |
| `GET /__api/photo-thumb?key=&k=thumb\|view&s=` | Builds (if missing) and returns a photo thumbnail or viewer copy |
| `GET /__api/tracks?key=` | Audio and subtitle tracks of a video |
| `GET /__api/subtitle?key=&id=` | One subtitle as WebVTT (`e0`, `e1` … embedded; `x…` external file) |
| `GET /__api/audio-prepare?key=&a=` | Start / poll extraction of audio track `a`; returns `status`, `progress`, `url` |

Static cache files are served from `/__film/`, `/__short/`, `/__photo/`, `/__photoview/` and `/__audio/` with a one-year `immutable` cache header. UI files come from `/__ui/`.

---

## Git, `.gitignore` and `.env`

- `.gitignore` excludes `.env`, all cache folders (current and old names), `*.tmp`, `__pycache__`, virtual environments and editor / OS clutter.
- The repository then contains only `server.py`, `posters.py`, `README.md`, `.gitignore` and the `ui/` folder (including `ui/assets/video.jpg`).
- When cloning on another PC, create a new `.env` with your TMDB key.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Phone cannot open the address | Same Wi-Fi? Allow Python through the Windows firewall (Private networks). Keep `ONLY_LOCAL_NETWORK = True` only if the phone is on a private address. |
| Photo grid is slow, full-size photos load | Install Pillow (`pip install pillow`) and restart; check the `Tools:` line |
| `.heic` photo shows a placeholder tile | `pip install pillow-heif`, restart the server |
| No audio / subtitle languages in the menu | Install ffmpeg **and** ffprobe, and make sure both run from a terminal |
| Video plays but has no sound | The audio is probably AC3 / DTS; with ffmpeg installed it converts automatically on first play, otherwise use VLC |
| "This browser can't play this file" | Usually HEVC video in an MKV. Use the **VLC** button or download it |
| A subtitle is listed but greyed out | It is image-based (PGS / VobSub) and cannot be shown |
| Subtitles appear early or late | Open CC → Subtitle style → Delay |
| Embedded subtitle takes long the first time | Large MKVs must be read through once; later opens are instant |
| No poster found for a film | Rename the file as `Title Year.ext`, use the ✎ button, or paste a TMDB / Wikipedia link |
| TMDB posters never appear | No / invalid key in `.env` (the console says so); Wikipedia is used instead |
| "Couldn't download that image" | The PC needs internet access for poster links; only TMDB and Wikipedia links are accepted |
| Changed a poster / photo but still see the old one | Refresh the page; generated files are cached by the browser under a new name each time something changes |
| Want everything rebuilt | Stop the server and delete the cache folders |

---

## Known limits

- **HEIC and real-device testing.** The photo, subtitle, audio-sync and player features were tested automatically (including in a headless Chromium browser and a simulated phone), but real HEIC decoding depends on pillow-heif on your machine, and finger gestures and AAC audio playback are worth checking on your own phone and browsers.
- **Single default audio.** The browser plays the first audio track of a file directly. Other tracks (and undecodable ones) use the extract-and-sync method described above, which can differ from the picture by a fraction of a second.
- **iPhone fullscreen.** iPhones cannot fullscreen a web element, so the fullscreen button is hidden there; the player already fills the screen.
- **Native fullscreen menus.** Our subtitles and menus live in the page, so they are available in the page's fullscreen mode but not in a browser's built-in video fullscreen.
- **No login, HTTP only.** See [Security](#security).
- **MKV support** depends on the browser's codecs, not on the server.
