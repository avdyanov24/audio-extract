# Deploying to Hugging Face Spaces

Spaces is the only free host that runs this unmodified, because it runs a real
container rather than static files or short-lived functions. The `Dockerfile` at
the repo root is what it builds.

Read the two warnings at the bottom before committing to this. They are not
formalities — they decide whether this is worth doing at all.

## 1. Create the Space

At https://huggingface.co/new-space:

- **SDK**: Docker → Blank
- **Visibility**: Private
- **Hardware**: CPU basic (free)

Private matters. A public Space doing this is the shape of thing that attracts
takedown requests, and yours would be running with your cookies in it.

## 2. Keep the Space's README frontmatter

Spaces is configured by YAML frontmatter in the Space's own `README.md`. The UI
writes it when the Space is created. If you push this repo's README over it, the
Space loses its configuration and the build stops working.

Either keep the generated README on the Space, or make sure whatever `README.md`
lands there starts with:

```yaml
---
title: Audio Extract
emoji: 🎧
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---
```

`app_port: 7860` must match the `PORT` in the Dockerfile.

## 3. Set the secrets

In **Settings → Variables and secrets**, add these as *secrets*, not variables:

| Secret | Required | Value |
| --- | --- | --- |
| `AUTH_TOKEN` | Yes | A long random string. Generate with `openssl rand -hex 32` |
| `YTDLP_COOKIES_CONTENT` | In practice, yes | Entire contents of a Netscape-format `cookies.txt` |

Without `AUTH_TOKEN` the instance is open to anyone who finds the URL, and every
request spawns processes on the container. The server prints `auth open (local
mode)` at startup when it is unset — treat that as a warning in a hosted context.

Optional tuning, as variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `MAX_CONCURRENT_JOBS` | `2` | Free tier is 2 vCPU; ffmpeg will use everything you give it |
| `MAX_DURATION_MINUTES` | `120` | Lower this before you lower the disk budget |
| `MAX_DISK_MB` | `2048` | WAV is ~11 MB per minute, so this fills faster than you expect |
| `FILE_TTL_MINUTES` | `10` | How long a finished file survives |
| `RATE_LIMIT_MAX` | `20` | Requests per window, per client address |

## 4. Push

```bash
git remote add space https://huggingface.co/spaces/<your-username>/audio-extract
git push space main
```

The first build takes several minutes — it installs ffmpeg and pulls the yt-dlp
release binary. Watch the build log in the Space UI; a failure here is almost
always the apt step or a network blip on the yt-dlp download.

## 5. Getting the cookies

Use a **throwaway Google account**, never your main one. Accounts used this way
do get flagged.

Export `cookies.txt` in Netscape format from a browser where that account is
signed into YouTube, then paste the entire file contents into the
`YTDLP_COOKIES_CONTENT` secret. The server writes it to a `0600` file at startup
and hands the path to yt-dlp.

Never commit that file. `.gitignore` and `.dockerignore` both exclude
`cookies.txt` and `*.cookies` already.

---

## Two things that will bite you

**The IP problem does not go away.** Spaces egresses from a datacenter IP, and
YouTube blocks those. Cookies are what get you past it, and they are a
workaround rather than a fix. Expect it to work, then stop working, then work
again after you refresh the cookies. If that sounds tiring, run the tool locally
and reach it over Tailscale instead — same result, none of this.

**Cookies go stale silently.** They expire after a few weeks. The failure looks
identical to any other bot check: the error will say YouTube asked the machine to
verify it is not a bot. When that appears and the video is otherwise fine,
refresh the cookie secret first.

Also worth knowing: free Spaces sleep after roughly 48 hours of inactivity and
cold-start on the next request. Jobs are held in memory, so a sleep or a restart
loses any extraction in flight and every finished file that has not been
downloaded yet.
