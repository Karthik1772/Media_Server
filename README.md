# Streamly

Streamly is a personal media server with a Next.js frontend and an existing Python media server.

## Frontend update

The current frontend refactor is focused on `web/` and introduces:

- Feature-based MVVM organization for library, player, posters, viewer and theme.
- Zustand stores for shared library preferences and player preferences.
- Feature repositories for the existing poster and player API calls.
- Dedicated ViewModels for library filtering/sorting, poster workflows, image navigation, player keyboard shortcuts, pointer gestures, wheel zoom and playback progress.
- An immersive library hero that uses existing local poster/thumbnail artwork when available.
- Balanced library density, refined dark/light tokens and shorter, subtle transitions.
- Compatibility re-exports under the former `components/` paths.

The Python backend and API contracts are intentionally unchanged.

## Run locally

Use the same Python server startup workflow you used before. For frontend development, open `web/` and run:

```bash
npm ci
npm run dev
```

Before using the updated application, validate it with:

```bash
npm run typecheck
npm run build
```

The Next.js configuration retains the existing static export and `/__ui` base path expected by `server.py`. For a complete manual regression list, see [`web/TESTING.md`](web/TESTING.md). For architecture details, see [`web/ARCHITECTURE.md`](web/ARCHITECTURE.md).

## Phase 2 backend layout

The Python entry point remains `python server.py`. The entry point now delegates to
`streamly_server/application.py`; the complete poster/media implementation lives in
`streamly_server/posters.py`. There is no root-level `posters.py` and no duplicate
poster implementation under `features/`. Shared cache migration helpers live under
`streamly_server/shared/cache/`.

All generated server-side cache data is stored under `cache/` beside the server
application. On startup, legacy cache directories are migrated into this root
without overwriting existing files. Existing API URL prefixes are retained.

Folder navigation uses `GET /__api/library?path=...` to refresh the library data
without a full document reload. Direct folder URLs and browser refresh continue
to work as before.

### Adaptive media folders

Streamly chooses the presentation for each selected folder from the media it contains, rather than relying on folder names. Video folders use the cinematic library, photo folders use album-first cards, and mixed folders provide All / Photos / Videos filters. Every nested folder is classified independently when opened, so photos inside a video root and videos inside a photo root are both supported. Folder discovery is bounded and cached briefly to keep large libraries responsive; original media paths are never reorganized.

## Python package structure

The Python backend is organized under `streamly_server/`. `server.py` remains the launcher. `streamly_server/application.py` owns HTTP/server lifecycle; feature code is separated into `features/library` and `features/playback`; the canonical poster/media engine lives at `streamly_server/posters.py`, and shared cache logic is in `streamly_server/shared/cache`. There is no root-level `posters.py`. See [`streamly_server/ARCHITECTURE.md`](streamly_server/ARCHITECTURE.md).

To select a different media root, pass it as the first argument, for example `python server.py "E:\\photos"` or `python server.py "E:\\Vedios"`.


## Phase 7 validation and hardening

The backend library scanner now has both a file cap and a total directory-entry cap, preventing very large trees containing mostly empty folders from monopolizing a scan. Directory symlinks are not followed. The automated backend regression suite covers adaptive folder classification, bounded scans, symlink handling, and safe cache migration.

Run backend checks from the project root:

```bash
python -m unittest discover -s tests -v
python -m py_compile server.py streamly_server/application.py streamly_server/posters.py streamly_server/features/*/*.py streamly_server/shared/cache/*.py
```

For full release verification, also run `npm ci` and `npm run check` from `web/`, then complete the manual media/player checks in `web/TESTING.md` on the Windows machine that contains the media library.
