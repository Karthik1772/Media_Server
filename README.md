# Streamify Media Server

A private, local-network media browser built with a Next.js frontend and a Python HTTP server.

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
1. Checks whether the Next.js static export is missing or out of date.
2. Installs frontend dependencies with `npm ci` when `ui/node_modules` is missing.
3. Builds the Next.js app into `ui/out`.
4. Serves the frontend, JSON API, poster/thumbnail endpoints, and media streams from the same Python server on port `2904`.

Open `http://localhost:2904` on the host computer. Other devices on the same private network can use the LAN address printed in the terminal.

## Choose the media folder

By default, Streamify serves the folder one level above this project directory. You can pass a different folder:

```bash
python server.py "D:\\Media"
```

On macOS/Linux:

```bash
python server.py "/mnt/media"
```

## Notes

- You do not need to run `npm run dev` or `npm start` separately.
- The first launch may take a few minutes while npm installs dependencies and Next.js builds the UI.
- Subsequent launches reuse the build unless the frontend source/configuration has changed.
- The server retains HTTP byte-range support for seeking in media files.
- Access is restricted to the host and private network by default. Do not expose the port directly to the public internet.
- Optional poster lookup can be configured with `TMDB_API_KEY` in a `.env` file beside `server.py`.
