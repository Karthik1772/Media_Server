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
