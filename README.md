# Streamly

A personal media server for browsing and streaming videos, photos, and audio from a folder on your computer. Streamly combines a Next.js and React interface with a lightweight Python HTTP server, so your existing media folders can be viewed through a browser on your computer, phone, or tablet.

The server serves the selected media directory without reorganizing your original files. It also provides poster artwork, video previews, photo thumbnails, and playback support through a centralized local cache.

---

## Contents

- [Highlights](#highlights)
- [How Streamly works](#how-streamly-works)
- [Technology stack](#technology-stack)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Media organization and folder views](#media-organization-and-folder-views)
- [Posters, thumbnails, and cache](#posters-thumbnails-and-cache)
- [Playback capabilities](#playback-capabilities)
- [HTTP API](#http-api)
- [Project structure](#project-structure)
- [Development and verification](#development-and-verification)
- [Network access and safety](#network-access-and-safety)
- [Troubleshooting](#troubleshooting)

---

## Highlights

### Personal media library

- Browse media directly from a folder selected at server startup.
- Navigate into folders and return to parent directories.
- Open a folder URL directly or refresh the browser without losing the current location.
- Keep the original directory structure and media files unchanged.
- View the library through a responsive browser interface.

### Adaptive folder presentation

Streamly classifies folders using the media found inside them rather than relying only on folder names.

| Folder contents | Presentation mode |
| --- | --- |
| Videos | Video-library view |
| Photos | Photo and album-oriented view |
| Photos and videos | Mixed view with All, Photos, and Videos filters |
| No photos or videos detected | Collections view |

Each folder is classified independently when opened. A photo album inside a video collection, or a video folder inside a photo collection, can therefore use its own appropriate presentation.

Folder discovery is bounded and briefly cached to keep scans manageable on large media directories.

### Video posters and previews

- Generate and cache poster artwork for supported video collections.
- Search for alternative poster candidates and select artwork for a video.
- Generate video preview frames where supported.
- Use local artwork when available.
- Use TMDB as the configured poster source, with Wikipedia as the fallback source.
- Keep generated artwork and indexes in the server cache rather than mixing them with original media.

### Photo browsing

- Generate cached photo thumbnails.
- Generate photo previews when supported.
- Support common image formats handled by the server and installed image libraries.
- Use Pillow when available for image processing; HEIC/HEIF support can be enabled with pillow-heif.

### Media playback

- Stream media files over HTTP.
- Support HTTP byte ranges for seeking and resuming video playback.
- Read available audio and subtitle track information.
- Serve subtitle tracks as WebVTT.
- Prepare extracted audio tracks for playback when the required media tools are available.

### Interface and interaction

- Next.js and React frontend styled with Tailwind CSS.
- Feature-oriented frontend organization for the library, player, posters, viewer, and theme.
- Zustand stores for shared library and player preferences.
- Dedicated ViewModels for filtering, sorting, poster workflows, image navigation, keyboard shortcuts, pointer gestures, zoom, and playback progress.
- Dark and light theme tokens.
- Responsive layouts for desktop, tablet, and phone-sized screens.

### Server visibility

- Colored request logs with request, response, completion, abort, and error states.
- Session totals for requests, bytes sent, aborted transfers, and errors.
- Device-family labels inferred from the browser user-agent.
- Local-network access restrictions enabled by default.

---

## How Streamly works

Streamly has two main parts:

1. **Python server** — selects and shares the media directory, handles HTTP requests, scans folders, serves media bytes, manages media-related API operations, and coordinates generated cache files.
2. **Web interface** — a Next.js and React application that presents the library and provides browsing and playback interactions.

The Python server starts the web interface in development mode by default. In production mode, it serves a static Next.js export from web/out/.

The browser accesses the application through the Python server. The web interface is mounted under /__ui/, while library and media operations are handled by the Python server.

---

## Technology stack

| Area | Technology |
| --- | --- |
| Backend | Python standard library |
| HTTP server | http.server, ThreadingHTTPServer |
| Frontend framework | Next.js 15 |
| UI library | React 18 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| State management | Zustand |
| Frontend utilities | clsx, tailwind-merge, class-variance-authority |
| Image processing | Pillow (optional) |
| HEIC / HEIF image support | pillow-heif (optional) |
| Video and audio processing | FFmpeg and FFprobe (optional, recommended) |
| Poster metadata source | TMDB, with Wikipedia fallback |

The backend uses Python's standard library for its HTTP server and core application flow. Image and media-processing packages are optional enhancements rather than requirements for starting the Python application.

---

## Requirements

### Required

- Python 3.8 or newer.
- Node.js and npm.
- A browser on the device used to access Streamly.
- A directory containing the media you want to share.

### Optional tools

| Tool | Purpose |
| --- | --- |
| FFmpeg | Video preview extraction and media processing |
| FFprobe | Media stream and track inspection |
| Pillow | Faster photo thumbnail processing |
| pillow-heif | HEIC / HEIF image decoding |
| TMDB API key | Poster lookup through TMDB |

Install optional Python image packages from the project root when needed:

~~~bash
python -m pip install Pillow pillow-heif
~~~

Install FFmpeg separately and make sure both ffmpeg and ffprobe are available on your system PATH.

---

## Quick start

### 1. Clone the repository

~~~bash
git clone https://github.com/Karthik1772/Media_Server.git
cd Media_Server
~~~

### 2. Install frontend dependencies

~~~bash
cd web
npm ci
cd ..
~~~

### 3. Start Streamly

~~~bash
python server.py
~~~

By default, Streamly shares the directory one level above the project directory. The server starts the Next.js development interface and prints the local and network addresses in the terminal.

Open the printed local address in a browser. To access Streamly from another device on the same network, open the printed network address on that device.

### 4. Select a different media directory

Pass the directory you want to share as the first argument:

~~~bash
python server.py "E:\Movies"
~~~

Another example:

~~~bash
python server.py "E:\Photos"
~~~

The supplied directory becomes the media root for that server session. The original media files are not moved or renamed.

### 5. Stop the server

Press Ctrl+C in the terminal running Streamly.

---

## Configuration

### Environment file

Streamly reads an optional .env file from the project root (the directory containing server.py).

Create a file named .env:

~~~env
TMDB_API_KEY=your_tmdb_api_key
~~~

The TMDB key is optional. Without it, the application uses its configured Wikipedia poster fallback.

Environment variables already defined in the process take precedence over values in the .env file.

### Available settings

| Setting | Default | Description |
| --- | --- | --- |
| TMDB_API_KEY | Empty | Optional key used for TMDB poster lookup |
| STREAMLY_UI_PORT | 5173 | Local port used by the Next.js development server |
| STREAMLY_UI | Development mode | Set to build to use the production UI build |

### Startup options

| Command | Description |
| --- | --- |
| python server.py | Start in development mode |
| python server.py "E:\Media" | Start in development mode with a selected media root |
| python server.py --prod | Build the frontend if needed and serve the production export |
| python server.py --build | Same production-build mode |
| python server.py --dev | Explicitly use development mode |

The media directory can be combined with a mode flag:

~~~bash
python server.py "E:\Media" --prod
~~~

---

## Media organization and folder views

Streamly reads the selected media directory in place. It does not require a specific folder hierarchy, but folders named Vedios or Videos are used by the poster feature as video-poster scopes, and folders named Photos are used as photo-preview scopes.

Example media directory:

~~~text
Media/
├── Vedios/
│   ├── Movies/
│   │   ├── Movie One (2024).mkv
│   │   └── Movie Two (2023).mp4
│   └── Web Series/
│       └── Series Name/
│           └── Season 01/
│               └── Series Name S01E01.mkv
│
└── Photos/
    ├── Trips/
    │   ├── Trip One/
    │   └── Trip Two/
    └── Family/
~~~

This is only an example. Streamly can browse other directory layouts too.

### Folder classification

The library scanner counts photos, videos, audio, other files, and subfolders. It uses the discovered photo and video counts to choose a folder presentation.

- A folder containing both photos and videos is classified as mixed.
- A folder containing videos but no photos is classified as video.
- A folder containing photos but no videos is classified as photo.
- A folder with neither photos nor videos is classified as a collection.

The scanner uses bounded recursive discovery, a short-lived in-memory cache, and does not follow directory symlinks during recursive classification.

---

## Posters, thumbnails, and cache

Generated media data is kept separately from the original media library.

The canonical poster and media-cache implementation is:

~~~text
streamly_server/posters.py
~~~

The cache is organized under a single cache/ directory beside the server application. It stores generated poster artwork, video previews, photo thumbnails, photo previews, subtitle data, extracted audio, and their indexes.

Legacy cache directories are migrated into the centralized cache location when the server initializes. The migration is designed not to overwrite files already present at the destination.

### Poster lookup

The application can use TMDB for poster discovery when TMDB_API_KEY is configured. Wikipedia is used as the fallback source. Poster image retrieval is restricted in the implementation to its configured image hosts.

### Video and photo previews

- Video preview frames are generated for supported media in the configured preview scope.
- The current preview scope is folders named Photos.
- The configured maximum video size for preview extraction is 500 MB.
- Photo thumbnails and previews are generated and cached on demand or by the background media workflow, depending on the operation.

### Cache notes

- Cache files are generated data, not replacements for original media.
- Cache URLs use dedicated prefixes served by the Python application.
- The audio cache has a configured maximum size of 5 GB, with older extracted files eligible for pruning.
- Hidden and cache directories are excluded from normal library browsing.

---

## Playback capabilities

### HTTP streaming and seeking

The Python server supports HTTP Range requests for files. This allows compatible browser media players to request specific byte ranges instead of downloading an entire video before seeking.

### Audio and subtitle tracks

The playback service exposes track information and delegates media probing and extraction to the shared media engine.

- Track metadata is available through the tracks API.
- Subtitle content is served in WebVTT format.
- Audio tracks can be prepared for playback through the audio preparation API.

Actual codec support depends on the browser and the media tools available on the host computer.

---

## HTTP API

The API is served by the Python application under /__api/.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /__api/library?path=/ | Retrieve library data for a folder |
| GET | /__api/poster-search?q=... | Search for poster candidates |
| POST | /__api/poster-select | Apply a poster action to a video |
| GET | /__api/photo-thumb?key=... | Generate or retrieve a photo thumbnail |
| POST | /__api/thumb?key=... | Save a browser-captured video thumbnail |
| GET | /__api/tracks?key=... | Retrieve audio and subtitle track information |
| GET | /__api/subtitle?key=...&id=... | Retrieve a subtitle track as WebVTT |
| GET | /__api/audio-prepare?key=...&a=... | Prepare an extracted audio track |

### API behavior

- Library paths are resolved inside the configured media root.
- Invalid or missing folders return an error response.
- Media keys are normalized and validated by the media service before file operations.
- API responses use JSON where appropriate; subtitle responses use text/vtt.
- The poster-selection and browser-thumbnail operations use POST requests.

These endpoints are application interfaces used by the frontend; they are not intended as a public internet API.

---

## Project structure

The following tree highlights the main source areas and their responsibilities. It is not an exhaustive listing of every frontend component.

~~~text
Media_Server/
│
├── server.py
│   └── Single-command Python entry point
│
├── streamly_server/
│   ├── application.py
│   │   └── HTTP handling, server lifecycle, routing and startup
│   │
│   ├── posters.py
│   │   └── Canonical poster, thumbnail, preview and media-cache engine
│   │
│   ├── features/
│   │   ├── library/
│   │   │   └── service.py
│   │   │       └── Folder scanning and adaptive media classification
│   │   │
│   │   └── playback/
│   │       └── service.py
│   │           └── Audio and subtitle playback operations
│   │
│   └── shared/
│       └── cache/
│           └── Cache migration helpers
│
├── web/
│   ├── src/
│   │   └── Frontend application and feature modules
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.js
│   ├── postcss.config.js
│   └── tsconfig.json
│
├── tests/
│   └── Backend regression tests
│
├── cache/
│   └── Generated server-side cache data
│
├── .env
└── README.md
~~~

### Backend responsibilities

| File or directory | Responsibility |
| --- | --- |
| server.py | Public launcher; delegates to the application module |
| streamly_server/application.py | HTTP request handling, routing, startup, network checks, and server lifecycle |
| streamly_server/posters.py | Canonical poster, thumbnail, preview, subtitle, audio extraction, and cache implementation |
| streamly_server/features/library/service.py | Folder listing and adaptive media classification |
| streamly_server/features/playback/service.py | Playback-facing audio and subtitle service boundary |
| streamly_server/shared/cache/ | Legacy cache migration helpers |

The playback service delegates to the shared media engine rather than maintaining a second implementation. The poster/media engine is located at streamly_server/posters.py; there is no separate root-level posters.py implementation.

---

## Development and verification

### Frontend development

From the web/ directory:

~~~bash
npm ci
npm run dev
~~~

The Python application normally starts the frontend development server for you when you run python server.py. Running the frontend separately is useful when working directly on the UI.

### Frontend checks

Run from web/:

~~~bash
npm run typecheck
npm run build
~~~

The available package scripts are:

| Script | Description |
| --- | --- |
| npm run dev | Start the Next.js development server |
| npm run build | Build the static frontend export |
| npm run typecheck | Run TypeScript type checking |

The Next.js configuration uses static export, the /__ui base path, trailing slashes, and unoptimized images to match the Python server's UI-serving behavior.

### Backend tests

Run from the repository root:

~~~bash
python -m unittest discover -s tests -v
~~~

The backend regression coverage includes adaptive folder classification, bounded scans, symlink handling, and safe cache migration.

### Python syntax check

Run from the repository root:

~~~bash
python -m py_compile server.py streamly_server/application.py streamly_server/posters.py streamly_server/features/*/*.py streamly_server/shared/cache/*.py
~~~

### Full verification

Before considering a change ready:

1. Run the backend test suite.
2. Run the Python syntax check.
3. Run npm ci in web/.
4. Run npm run typecheck and npm run build in web/.
5. Start Streamly on the machine containing the media library.
6. Manually verify folder navigation, browser refresh, photo and video views, poster behavior, seeking, and available audio/subtitle tracks.

---

## Network access and safety

Streamly binds its HTTP server on all network interfaces so devices on the local network can connect. However, the application also checks the connecting client address.

**Local-network-only access is enabled by default.** The server accepts loopback, private-network, and link-local addresses. Other addresses are refused. This is intended for use on a trusted home, office, or hotspot network—not as an internet-facing media hosting service.

Additional allowed networks can be configured in the Python application through EXTRA_ALLOWED_NETWORKS. Do this only when you understand the network exposure it creates.

Important considerations:

- Run Streamly only on networks you trust.
- The shared media directory is accessible to devices that can connect and pass the server's network check.
- Do not expose the server directly to the public internet.
- A TMDB API key belongs in your local .env file; do not commit real credentials.
- Keep generated caches and private media out of public repositories.

---

## Troubleshooting

### The web interface does not start

- Confirm Node.js and npm are installed.
- Run npm ci from the web/ directory.
- Check the frontend startup output and web/.next-dev.log.
- Confirm the configured UI port is not occupied. The default is 5173; it can be changed with STREAMLY_UI_PORT.

### The production UI is missing or outdated

Run:

~~~bash
python server.py --prod
~~~

Production mode builds the static frontend export when it is missing or older than the frontend source.

### A media folder is not opening

- Confirm the selected media root exists.
- Confirm the server process has permission to read the folder.
- Check that the requested folder is inside the selected media root.
- Check the terminal output for request errors.

### Posters are not appearing

- Confirm the media is inside a configured poster scope, currently Vedios or Videos.
- Configure TMDB_API_KEY if you want TMDB poster lookup.
- Check that the host has an internet connection for remote poster sources.
- Remember that poster lookup and artwork generation may take time.

### Video previews or photo thumbnails are unavailable

- Install FFmpeg and FFprobe and make sure they are on PATH.
- Install Pillow for image-processing support.
- Install pillow-heif if you need HEIC/HEIF image decoding.
- Check that the media file is readable and uses a supported format.

### A device on the network cannot connect

- Make sure both devices are connected to the same local network.
- Open the network URL printed by Streamly, not the localhost URL.
- Check the host computer's firewall rules.
- Remember that non-private/public client addresses are refused by default.

---

## License

No license information is currently specified in this repository. If you intend to distribute or reuse this project, add an explicit license file and update this section.
