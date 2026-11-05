# Streamify Media Server

A private, local-network media browser: a Next.js UI (glassmorphism design) on top of a Python HTTP server.

## Requirements

- Python 3.8 or newer
- Node.js 20.9 or newer (includes npm)
- Internet access on the first launch so npm can install the frontend dependencies

## Start the entire application

From the project root, run:

```bash
python server.py
```

The Python server automatically:
1. Installs the frontend dependencies (`npm install`) when `ui/node_modules` is missing or `package.json` / `package-lock.json` changed.
2. Starts the **Next.js dev server** (`npm run dev`) on `127.0.0.1` - no production build is made or used.
3. Serves everything on **one port, 2904**: the JSON API, posters/thumbnails and media streams are answered by Python, every other request (pages, `/_next/*`, hot-reload socket) is proxied to the dev server.

Open `http://localhost:2904` on the host computer. Other devices on the same private network can use the LAN address printed in the terminal. Edit anything in `ui/src` and the page updates live.

## What is shared

The whole **drive the project is on**. With the project in `E:\Media_Server`, every file and folder on `E:\` is browsable, and nothing outside `E:\` (other drives) can be reached. On macOS/Linux the folder above the project is shared instead.

Never shown or downloadable: this program folder (so `.env` and the caches stay private), dot-folders, Windows hidden/system items (`$RECYCLE.BIN`, `System Volume Information`, ...).

To share something else for one run:

```bash
python server.py "D:\\Media"
```

## Notes

- You do not need to run `npm run dev` yourself; `python server.py` starts and stops it.
- The dev server picks another free port automatically if 3000 is busy, and only listens on `127.0.0.1`, so the "local network only" rule of port 2904 protects it too.
- The server retains HTTP byte-range support for seeking in media files.
- Access is restricted to the host and private network by default. Do not expose the port directly to the public internet.
- Optional poster lookup can be configured with `TMDB_API_KEY` in a `.env` file beside `server.py`.
