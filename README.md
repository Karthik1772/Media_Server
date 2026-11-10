# Streamly 🎬

**Streamly** ("Stream Easy") is a private, Netflix-style web app that streams the movies, series, photos and videos on your PC to your phone, tablet or laptop over your home Wi-Fi. Built with plain Python and vanilla JavaScript, it needs no database and no build step, so it is easy to run, easy to read and easy to extend.

---

## 🚀 Features

- **Library Browsing**: Folders, breadcrumbs, search, sorting (name / newest / largest), grid or list view and a light / dark theme.
- **Film Posters**: Official posters found once per title from TMDB or Wikipedia. Change one by searching or by pasting a TMDB / Wikipedia link.
- **Fast Photos**: 360 px thumbnails in the grid, a lighter 1600 px copy in the viewer, and an **Original** button for full quality.
- **HEIC Support**: iPhone / Android `.heic` photos are converted so they show in any browser.
- **Short-Video Previews**: A real preview frame for videos in the `Photos` folder.
- **Custom Video Player**: Seek bar, speed control, picture modes (Fit / Fill / Stretch / 100%), pinch-to-zoom, picture-in-picture, fullscreen, controls lock and resume where you stopped.
- **Touch Gestures**: Double-tap to skip 10 s, swipe to seek, swipe for volume and brightness (MX Player style).
- **Audio Track Switching**: Pick between the languages inside a file. AC3 / DTS audio the browser can't decode is converted automatically.
- **Subtitles**: Embedded subtitles plus `.srt` / `.vtt` / `.ass` / `.ssa` files next to the video, with size, colour and delay controls. A subtitle the file marks as default turns on by itself.
- **Add Your Own Subtitles**: In the player's Audio & subtitles menu choose _Add subtitle file_ (or drop an `.srt` / `.vtt` on the player) to load one from the device you're watching on. It is remembered in that browser for that video.
- **Loading Effects**: Spinner with a label while a movie loads or buffers, a progress chip while subtitles and audio are prepared, shimmer placeholders for posters and photos, and a soft card entrance (respects _reduce motion_).
- **Smart Caching**: Every generated file is cached on disk and in the browser, and thumbnails are pre-built in the background.
- **Private by Default**: Only your PC and devices on your local network can connect.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.8+ using only the standard library (`http.server`)
- **Frontend**: Vanilla HTML, CSS and JavaScript (no framework, no build step)
- **Images**: [Pillow](https://pypi.org/project/pillow/) and [pillow-heif](https://pypi.org/project/pillow-heif/) _(optional)_
- **Audio / Subtitles / Frames**: [FFmpeg](https://ffmpeg.org/) and ffprobe _(optional)_
- **Poster Sources**: [TMDB](https://www.themoviedb.org/) and Wikipedia
- **Database**: None. Files on disk, small JSON indexes, and your browser's `localStorage`

What each optional piece unlocks:

| Optional tool    | Unlocks                                             | Without it                                                  |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Pillow           | Fast photo thumbnails                               | ffmpeg is used, or the original photo loads                 |
| pillow-heif      | `.heic` photos                                      | A placeholder tile with a hint                              |
| ffmpeg + ffprobe | Audio switching, embedded subtitles, preview frames | Player still works; only external `.srt` / `.vtt` subtitles |
| TMDB key         | Posters from TMDB                                   | Wikipedia posters only                                      |

---

## 📁 Project Structure

```
Streamly/
├── server.py          # Web server: routing, logging, security, API
├── posters.py         # All caches: posters, thumbnails, audio and subtitle tracks
├── .env               # Your TMDB API key (ignored by git)
├── .gitignore         # Keeps caches and .env out of git
├── README.md
└── ui/
    ├── index.html     # Page template: browse page, player, photo viewer, poster dialog
    ├── style.css      # Styling with light and dark themes
    ├── app.js         # Front end: browsing, player, gestures, menus
    └── assets/
        └── video.jpg  # Default image for videos without a poster
```

These cache folders are created automatically next to `server.py`:

| Folder                    | Contents                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| `films_thumbnails/`       | Film posters                                                                  |
| `short_video_thumbnails/` | Preview frames for short videos                                               |
| `photo_thumbnails/`       | 360 px photo thumbnails                                                       |
| `photo_previews/`         | 1600 px copies for the photo viewer                                           |
| `subtitle_cache/`         | Subtitles converted to WebVTT                                                 |
| `audio_track_cache/`      | Extra audio languages extracted to AAC (capped at 5 GB, oldest removed first) |

> Upgrading? The old `poster_cache` and `thumb_cache` folders are renamed automatically on first start, and nothing already cached is lost.

---

## 🚧 Getting Started

### Prerequisites

- [Python 3.8+](https://www.python.org/downloads/) installed (tick _Add Python to PATH_ on Windows)
- _(Optional)_ [FFmpeg](https://ffmpeg.org/download.html), e.g. `winget install ffmpeg` on Windows, `brew install ffmpeg` on macOS or `sudo apt install ffmpeg` on Linux
- _(Optional)_ A free [TMDB API key](https://www.themoviedb.org/settings/api)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   ```

2. **Install the optional image libraries:**

   ```bash
   pip install pillow pillow-heif
   ```

3. **Add your TMDB key** _(optional)_ in a `.env` file next to `server.py`:

   ```
   TMDB_API_KEY=your_key_here
   ```

4. **Start the server:**

   ```bash
   python server.py
   ```

   By default it shares the folder **above** the project folder. To share another folder:

   ```bash
   python server.py "D:\Movies"
   ```

5. **Open it:** use the `Local` address on this PC, or the `Phone` address printed in the console on any device on the same Wi-Fi.

```
│  Folder  E:\                          │
│  Phone   http://192.168.1.20:2904     │
│  Local   http://localhost:2904        │
│  Access  this network only            │
```

> If your phone can't connect, allow Python through the Windows firewall for **Private networks**.

---

## ⚙️ Configuration

Settings live at the top of `server.py`:

| Setting                  | Default                  | Meaning                                                                       |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------- |
| `APP_NAME`               | `Streamly`               | Name shown in the console, browser tab and page header                        |
| `PORT`                   | `2904`                   | Port the server listens on                                                    |
| `MEDIA_ROOT`             | folder above `server.py` | Folder that gets shared                                                       |
| `ONLY_LOCAL_NETWORK`     | `True`                   | Accept only this PC and private network addresses                             |
| `EXTRA_ALLOWED_NETWORKS` | `()`                     | Extra allowed ranges, e.g. `("100.64.0.0/10",)` for Tailscale                 |
| `POSTER_FOLDERS`         | `("Vedios", "Videos")`   | Videos in folders with these names get official posters                       |
| `PREVIEW_FOLDERS`        | `("Photos",)`            | Videos here get preview frames; photos here are thumbnailed in the background |
| `PREVIEW_MAX_MB`         | `500`                    | Bigger videos keep the default image                                          |
| `AUDIO_CACHE_MAX_GB`     | `5`                      | Size limit of the audio cache                                                 |

Secrets go in `.env`. A real environment variable named `TMDB_API_KEY` overrides the file, and without a key Wikipedia is used.

---

## 🎞️ Posters

- Videos in a `Vedios` / `Videos` folder get a poster looked up **once** per title in the background and saved. It never changes on its own.
- Press the ✎ button on a card to **search** for a different poster or **paste a link**.
- Accepted links: a `themoviedb.org` movie / TV page (works without an API key), a `wikipedia.org` article, or an image link from `media.themoviedb.org` / `image.tmdb.org` / `upload.wikimedia.org`. Nothing else is downloaded, redirects elsewhere are refused, and images are limited to JPG / PNG / WebP under 5 MB.
- Your choice is saved permanently and the automatic scan never overrides it.

---

## 📷 Photos

- Thumbnails and viewer copies are created on first request, cached, and served with a one-year browser cache. Photos in the `Photos` folder are also pre-built at start-up.
- File names include the photo's path, size and date, so an edited photo gets a fresh thumbnail automatically.
- Photos under 150 KB (grid) or 800 KB (viewer) are used as they are. HEIC photos are always converted.
- Rotation from phones is respected. GIF, SVG and AVIF show as the original.

---

## 🎮 Player Controls

**Touch**

| Gesture                           | Action                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| Single tap                        | Show the controls for 10 s, or hide them until you tap again |
| Double-tap left / right           | Back / forward 10 s                                          |
| Double-tap centre                 | Play / pause                                                 |
| Swipe left / right                | Seek                                                         |
| Swipe up / down on the left half  | Brightness                                                   |
| Swipe up / down on the right half | Volume                                                       |
| Pinch with two fingers            | Zoom up to 5× (one finger then moves the picture)            |
| Picture button                    | Cycle Fit → Fill → Stretch → 100% (also resets zoom)         |

**Keyboard**

| Key           | Action                      |
| ------------- | --------------------------- |
| `Space` / `K` | Play / pause                |
| `←` `→`       | Back / forward 10 s         |
| `↑` `↓`       | Volume                      |
| `N` / `P`     | Next / previous video       |
| `F`           | Fullscreen                  |
| `M`           | Mute                        |
| `C`           | Cycle subtitles             |
| `A`           | Cycle audio track           |
| `<` / `>`     | Slower / faster             |
| `Esc`         | Close menu, then the player |

**Mouse**: click to play / pause, double-click for fullscreen, scroll to change volume.

> **Picture modes:** _Fit_ shows the whole picture, _Fill_ crops the edges to fill the screen, _Stretch_ distorts it to fill the screen, _100%_ shows the original pixels. When a video already has the same shape as your screen (for example 16:9 on a 16:9 screen) these look alike, so use pinch-to-zoom to enlarge the picture.

Your volume, speed, subtitle style, audio / subtitle choices and watch progress are remembered per device.

---

## 💬 Audio and Subtitles

- The first audio track plays straight from the file. Choosing another language extracts it **once** (with a progress percentage), caches it, and plays it in sync with the video.
- Subtitle files must start with the video's name, e.g. `Movie.srt`, `Movie.en.srt`, `Movie.Hindi.vtt`.
- Automatic subtitle choice, in order: your choice for this video → your usual language → the file's own default track → off.
- Image-based subtitles (PGS / VobSub) can't be shown and appear greyed out.

---

## 🔒 Security

- Only this PC and private-network addresses can connect (`ONLY_LOCAL_NETWORK`).
- There is **no login and no HTTPS**, so don't expose this server to the internet or use it on networks you don't trust.
- `server.py`, `posters.py` and `.env` are never served. Every requested path must stay inside the shared folder.
- Poster downloads are limited to TMDB and Wikipedia hosts.
- Keep your TMDB key in `.env`. If it was ever committed or shared before, generate a new one.

---

## 🧰 Troubleshooting

| Problem                          | Fix                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Phone can't connect              | Same Wi-Fi? Allow Python through the Windows firewall (Private networks)                  |
| Photos load slowly               | `pip install pillow`, restart, and check the `Tools:` line at start-up                    |
| `.heic` shows a placeholder      | `pip install pillow-heif`, restart                                                        |
| No audio / subtitle menu entries | Install ffmpeg **and** ffprobe                                                            |
| Video has no sound               | The audio is probably AC3 / DTS. With ffmpeg it converts on first play, otherwise use VLC |
| "Can't play this file"           | Usually HEVC inside an MKV. Use the **VLC** or download button                            |
| Subtitles early or late          | CC menu → Subtitle style → Delay                                                          |
| No poster found                  | Name the file `Title Year.ext`, or use the ✎ button                                       |
| Want everything rebuilt          | Stop the server and delete the cache folders                                              |

---

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any enhancements or bug fixes.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🧑‍💻 Author

**Karthik S Kashyap**
[GitHub](https://github.com/Karthik1772) • [LinkedIn](https://www.linkedin.com/in/karthik-s-kashyap-648908251/) • [Portfolio](https://karthik-s-kashyap.vercel.app/)

---
