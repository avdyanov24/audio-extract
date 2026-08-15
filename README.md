# audio-extract

Paste a YouTube link, get an audio file. Runs entirely on your own machine.

[![CI](https://github.com/avdyanov24/audio-extract/actions/workflows/ci.yml/badge.svg)](https://github.com/avdyanov24/audio-extract/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-informational)](package.json)
[![React](https://img.shields.io/badge/react-19-informational)](web/package.json)
[![Vite](https://img.shields.io/badge/vite-6-informational)](web/package.json)

## Why this exists

`yt-dlp -x --audio-format mp3 <url>` already does the work. What it does not give
you is a metadata preview before committing, a format picker, real progress, or a
readable reason when a video fails — you get a stack trace and a stderr dump. This
wraps the same two tools in an interface that answers those things, and throws the
file away ten minutes later so the temp directory does not fill up.

It is deliberately localhost-only. Hosted YouTube downloaders break almost
immediately because platform IPs are blocked, and keeping this on your own machine
sidesteps that entirely.

## Screenshot

<!-- TODO: replace with a capture of the metadata + format state -->
_Placeholder — screenshot pending._

## Features

- Metadata preview (title, uploader, duration, view count, thumbnail) before extracting
- MP3 at 128/192/320, plus M4A, WAV and FLAC
- Live progress over SSE with speed and ETA, split across download and encode stages
- Failures reported by cause — private, age-restricted, region-blocked, members-only,
  removed, rate-limited, or yt-dlp being out of date — not a generic error
- Startup preflight for `yt-dlp` and `ffmpeg` that prints the install command and exits
- M4A output remuxes rather than re-encoding when the source is already AAC
- Finished files deleted after 10 minutes (configurable)

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite 6 |
| Backend | Node 20+, Express 4 |
| Extraction | yt-dlp |
| Encoding | ffmpeg |
| Transport | Server-Sent Events for progress |

## Requirements

`yt-dlp` and `ffmpeg` must be on your PATH. The server checks both on startup and
tells you what to install if either is missing.

```bash
brew install yt-dlp ffmpeg
```

Keep yt-dlp current. YouTube changes break older versions, and the server warns
when yours is more than 60 days old.

## Local setup

```bash
git clone https://github.com/avdyanov24/audio-extract.git
cd audio-extract
npm install
cp .env.example .env   # optional, every value has a default
npm run dev
```

The UI runs at `http://127.0.0.1:5173` and the API at `http://127.0.0.1:5178`.
Vite proxies `/api` to the backend, so the browser stays on one origin.

To run it as a single process instead:

```bash
npm run build && npm start
```

## Configuration

All optional — see `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5178` | API port |
| `HOST` | `127.0.0.1` | Bind address |
| `FILE_TTL_MINUTES` | `10` | How long a finished file survives |
| `YTDLP_COOKIES` | unset | Path to a `cookies.txt`, needed for age-restricted videos |

## Project structure

```
audio-extract/
├── server/
│   ├── index.js              Express app, routes, job pipeline
│   └── lib/
│       ├── deps.js           yt-dlp / ffmpeg preflight and staleness check
│       ├── errors.js         yt-dlp stderr to human-readable cause
│       ├── extract.js        yt-dlp and ffmpeg process orchestration
│       ├── jobs.js           Job registry, progress events, TTL cleanup
│       └── youtube.js        URL validation, filename sanitising
├── web/
│   ├── index.html
│   └── src/
│       ├── App.jsx           Phase machine: idle → ready → extracting → done
│       ├── api.js            fetch wrappers and the SSE subscription
│       ├── format.js         Duration, byte and count formatting
│       ├── styles.css        Design tokens and every component rule
│       └── components/       UrlField, MetaCard, Segmented, Progress, ErrorPanel, Result
└── .github/workflows/ci.yml
```

## Roadmap

- ESLint and Prettier, wired into CI
- Unit tests for URL parsing, error classification and filename sanitising
- Playlist support (yt-dlp already handles it; the UI does not)
- Embedded cover art for MP3 and M4A
- Cancel an extraction in flight
- Trim to a time range before encoding

## License

MIT — see [LICENSE](LICENSE).

Intended for content you own, content licensed for reuse, and personal-use copies.
What you extract is your responsibility.
