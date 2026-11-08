# Streamly frontend validation checklist

Run these checks from the `web/` directory after extracting the final archive.

## 1. Install and build checks

```bash
npm ci
npm run typecheck
npm run build
```

The project uses Next.js static export and a `/__ui` base path. Confirm the build still produces the static output expected by the existing Python server. Do not change the backend to work around a frontend build issue.

## 2. Start the existing application

Start Streamly using the same command/workflow you used before this refactor. Test it through the Python server rather than opening the static export directly, because the server injects the current folder listing and serves the existing `/__api/*` endpoints.

## 3. Library regression checks

- [ ] Root library opens and shows the expected folder contents.
- [ ] Nested folder navigation works.
- [ ] Breadcrumb navigation works.
- [ ] Browser Back/Forward navigation works.
- [ ] Search filters the current folder and `/` focuses the search input.
- [ ] Name, newest and largest sorting work.
- [ ] Grid and list views work and retain the existing preferences.
- [ ] Folder-first ordering remains intact.
- [ ] Empty folder and no-search-results states are correct.
- [ ] Video preview/poster and image thumbnails load.
- [ ] Changing a poster updates the selected card and retains the saved choice after reload.
- [ ] Opening a media card opens the correct media item and the correct next/previous sequence.

## 4. Video and audio player regression checks

Use at least one small MP4 and one large/long video. If available, also test an MKV with multiple audio/subtitle tracks.

- [ ] Video starts, pauses and resumes.
- [ ] Seeking by seekbar works in both directions.
- [ ] Resume position is restored when reopening a partially watched video.
- [ ] Playback position is reset after the video ends.
- [ ] Next-up behaviour works at the end of a video.
- [ ] Playback speed changes and stays synchronized with extracted audio.
- [ ] Volume slider, mute and keyboard volume shortcuts work.
- [ ] Original audio track works.
- [ ] Alternate audio track preparation completes and audio stays synchronized.
- [ ] Switching back to the original audio track works.
- [ ] Track selection preferences are remembered as before.
- [ ] Player closes using the close button and Escape.
- [ ] Browser Back closes the player overlay.
- [ ] VLC/open-download actions still work.

## 5. Subtitle regression checks

- [ ] Embedded subtitle tracks load.
- [ ] Subtitle on/off works.
- [ ] Subtitle language selection works.
- [ ] Subtitle size and color preferences work.
- [ ] Subtitle delay controls work.
- [ ] Local `.srt` and `.vtt` files can be loaded.
- [ ] Local subtitle choices are remembered for the same video.
- [ ] Removing a local subtitle works.
- [ ] Malformed/empty subtitle files show a useful message without crashing playback.

## 6. Player interaction checks

- [ ] Space/K toggles playback.
- [ ] Left/Right arrows seek.
- [ ] Up/Down arrows change volume.
- [ ] N/P changes video when supported by the current list.
- [ ] F toggles fullscreen; M toggles mute.
- [ ] C cycles subtitles; A cycles audio.
- [ ] Plus/minus/zero zoom controls work.
- [ ] Mouse movement reveals controls and idle timeout hides them.
- [ ] Single and double taps retain their previous behaviour.
- [ ] Touch horizontal gesture seeks.
- [ ] Touch vertical gesture changes video brightness/volume on the expected side.
- [ ] Mouse vertical drag changes video brightness/volume on a laptop.
- [ ] Holding a playing video for 2 seconds boosts to 2x, then 3x and 4x; release restores the prior speed.
- [ ] Speed menu supports 0.5x through 4x.
- [ ] Volume slider/gesture/keyboard support 0–200% where Web Audio amplification is supported.
- [ ] Pinch zoom and pan work on a touch device.
- [ ] Ctrl+wheel/trackpad zoom and plain wheel volume work.
- [ ] Player lock/unlock works.
- [ ] Picture-in-picture and fullscreen work in supported browsers.

## 7. Poster, image viewer and theme checks

- [ ] Poster search works for movie and TV items.
- [ ] Selecting a poster saves it.
- [ ] Pasting an allowed TMDB/Wikipedia URL works; unsupported domains are rejected.
- [ ] Image viewer opens the correct image.
- [ ] Previous/next buttons, arrow keys and touch swipe work.
- [ ] Original image action works when available.
- [ ] HEIC fallback message remains correct.
- [ ] Dark theme and light theme both render correctly.
- [ ] Theme preference persists after reload.
- [ ] System theme is followed when no explicit preference exists.

## 8. Responsive and motion checks

Test at desktop, tablet and phone widths.

- [ ] Header/search remain usable at narrow widths.
- [ ] Poster grid keeps balanced density without horizontal overflow.
- [ ] List view remains readable on mobile.
- [ ] Player controls respect safe areas on mobile.
- [ ] Dialogs fit within the viewport and remain scrollable.
- [ ] Hover effects are subtle and do not shift layout.
- [ ] Hero artwork does not obscure title or controls.
- [ ] Reduced-motion OS setting disables/reduces nonessential transitions.

## 9. Data and compatibility checks

- [ ] Existing localStorage keys are still present and interpreted correctly: `sort`, `view`, `vol`, `muted`, `speed`, `subSize`, `subColor`, `trkpref2`, `trk2:*`, `lsub:*`, `lsubIdx`, `theme` and playback position keys.
- [ ] Existing Python API routes remain unchanged: `/__api/tracks`, `/__api/subtitle`, `/__api/audio-prepare`, `/__api/poster-search`, `/__api/poster-select` and `/__api/thumb`.
- [ ] Folder navigation uses `/__api/library` and updates the UI without a full document reload.
- [ ] Browser Back/Forward restores the correct folder without reloading the application.
- [ ] Selecting the original audio track returns to the embedded track without requesting a new extraction.
- [ ] Switching repeatedly to an already-extracted alternate track reuses the server cache.
- [ ] Every generated cache folder is beneath the single `cache/` root.
- [ ] Legacy cache folders migrate without overwriting colliding files.
- [ ] `python server.py` repairs a missing/incomplete Next.js installation before starting the UI.

## Report issues

If something fails, note the browser, device, media file/container, exact action and console/network error. Fix regressions before treating the refactor as complete.

## Adaptive media UI regression checks

- Open a video root containing both subfolders and video files: verify the familiar
  folder cards remain landscape cards and appear above the cinematic video view.
- Open a photo root containing both subfolders and photos: verify the same folder-card
  design remains and photos use the masonry gallery.
- Open a mixed root: verify folders remain navigable and All / Photos / Videos filters
  only affect direct media items.
- Open nested folders of each type and verify the layout follows their scanned contents,
  not their folder names.
- Open a video/photo from each layout and verify the existing player/viewer opens.
