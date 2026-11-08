# Streamly frontend architecture

This document describes the current frontend organization and the intentional boundaries used during the refactor.

## Project constraints

- Primary scope: `web/` (Next.js UI).
- The Python server and its API contracts are unchanged.
- Streamly is a personal media server; avoid enterprise-scale infrastructure and unnecessary abstractions.
- Existing user-visible features, browser storage formats, keyboard shortcuts, media URLs and workflows must be preserved.

## Architecture: feature-based MVVM

Each feature owns its presentation, state/data model and ViewModels:

- `model/`: feature types, Zustand stores, repositories, constants and domain/data helpers.
- `view/`: React components and visual composition.
- `viewmodel/`: hooks that coordinate state, actions and data for the View.

Not every feature needs all three folders. Add a module only when it has a real responsibility.

## Current feature map

```text
web/
├── app/                         # Next.js App Router entry points
├── features/
│   ├── library/
│   │   ├── model/                # Library Zustand store
│   │   ├── view/                 # Library, header, cards, grid, breadcrumbs
│   │   └── viewmodel/            # Filtering, sorting and view preferences
│   ├── player/
│   │   ├── model/                # Preferences store, API/storage repositories, types
│   │   ├── view/                 # Player and focused player UI components
│   │   └── viewmodel/            # Keyboard, gestures, wheel zoom, progress, preferences
│   ├── posters/
│   │   ├── model/                # Poster API, candidate and result types
│   │   ├── view/                 # Poster picker dialog
│   │   └── viewmodel/            # Search, validation, save and dialog state
│   ├── viewer/
│   │   ├── view/                 # Image viewer
│   │   └── viewmodel/            # Image navigation and keyboard actions
│   └── theme/
│       ├── view/                 # Theme toggle
│       └── viewmodel/            # Theme preference and transition behaviour
├── shared/
│   ├── api/                      # Shared fetch response helpers
│   └── components/               # Reusable UI primitives, navigation and splash
├── providers/                    # Application-level providers
├── hooks/                        # Legacy/general hooks (compatibility where needed)
└── lib/                          # Existing shared domain utilities and types
```

## State management

Zustand is used for shared client state with clear ownership:

- `features/library/model/libraryStore.ts`: search, sort and grid/list preference. Existing `sort` and `view` localStorage keys are retained.
- `features/player/model/playerPreferencesStore.ts`: volume, mute, speed and subtitle appearance. Existing storage keys are retained.

Transient state remains local when only one mounted feature owns it (for example, the active player session's video element lifecycle, temporary HUD, menu visibility, gesture pointer state and image viewer source). This avoids turning every local UI detail into global state or creating duplicate sources of truth.

## Data access

- `features/player/model/playerRepository.ts`: existing `/__api/subtitle`, `/__api/audio-prepare` and `/__api/tracks` endpoints, plus local subtitle persistence.
- `features/posters/model/posterRepository.ts`: existing `/__api/poster-search` and `/__api/poster-select` endpoints.
- `shared/api/client.ts`: small JSON/error helpers.

No endpoint path, HTTP method, request body or server-side implementation was changed.

## Compatibility

Files under `components/` that now re-export feature/shared modules are compatibility barrels. They allow any older import path to continue resolving while the canonical implementation lives in its feature folder. New code should import from `features/` or `shared/` directly.

## Player refactoring boundary

The player remains the most tightly coupled part of the UI because its media element, audio extraction, timers, playback tokens, track selection and event ordering form one session lifecycle. This pass extracted keyboard shortcuts, pointer/touch gestures, wheel zoom, playback progress, API calls, track storage helpers, constants and reusable player UI components. The main `Player.tsx` remains the composition/lifecycle coordinator; splitting its remaining audio/subtitle state machine further should be done as a dedicated follow-up with media regression testing, not by mechanically moving blocks.

## Visual direction

- Immersive cinematic library hero using an existing local poster/thumbnail as subtle backdrop when available.
- Balanced media density and consistent poster proportions.
- Dark and light themes retained.
- Restrained neutral surfaces and blue accent.
- CSS transitions by default; no additional animation dependency.
- Reduced-motion preferences respected.
- Theme, card and player-control transitions kept short and understated.

## Validation

See `TESTING.md` for the local commands and manual regression checklist. A successful syntax parse and local import-path check were performed while preparing this archive. Full TypeScript/build verification requires installing the project's npm dependencies in the user's local environment.
