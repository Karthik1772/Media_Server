# Streamly backend architecture

- `server.py` is the single-command launcher (`python server.py`).
- `streamly_server/application.py` owns HTTP request handling and server lifecycle.
- `streamly_server/posters.py` is the canonical poster, thumbnail, preview, cache and media extraction implementation. There is no root-level `posters.py` compatibility shim.
- `features/library/service.py` scans folders and builds media-library payloads.
- `features/playback/service.py` exposes playback-facing audio/subtitle operations and delegates to the canonical `streamly_server.posters` engine.
- `shared/cache/manager.py` owns legacy cache migration. Keep this package at `streamly_server/shared/cache`; do not place it under `features`.

Keep `__init__.py` only where it provides a real package boundary or public export. Do not add empty package markers to every directory.
