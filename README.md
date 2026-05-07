# mix-id

Identify every track in a DJ mix — from a local file or streaming URL.

Drop in a Mixcloud, SoundCloud, or YouTube link and get a full tracklist in seconds.

```
$ npx mix-id https://www.mixcloud.com/dj/my-set

📥 Downloading...
✅ my-set.mp3 (142.3 MB)

🎵 mix-id
──────────────────────────────────────────────────
File:     my-set.mp3
Duration: 1:30:12
Settings: 30s step, 18s sample
──────────────────────────────────────────────────

[00:00] 1% ✅ The Orb — Little Fluffy Clouds
[00:30] 1% ↩️  The Orb — Little Fluffy Clouds
[01:00] 2% ✅ Surface — Falling in Love
...

──────────────────────────────────────────────────
🎧 TRACKLIST — my-set.mp3
──────────────────────────────────────────────────
 1. [00:00] The Orb — Little Fluffy Clouds
 2. [01:00] Surface — Falling in Love
 3. [04:30] Madonna — Vogue
──────────────────────────────────────────────────

💾 Output:
   my-set_tracklist.txt
   my-set.cue
   my-set_tracklist.json
```

## Install

```bash
npm install -g mix-id
```

Or run directly (no install needed):

```bash
npx mix-id my-mix.mp3
```

### Dependencies

- **Node.js** 18+
- **ffmpeg** — audio processing
- **yt-dlp** — URL downloads (only needed for URLs)

On macOS, mix-id will **auto-install** ffmpeg and yt-dlp via Homebrew if they're missing. On Linux, install them manually with your package manager.

## Usage

```bash
# Local file
mix-id my-mix.mp3

# SoundCloud
mix-id https://soundcloud.com/dj/set-name

# Mixcloud
mix-id https://www.mixcloud.com/dj/show-name

# YouTube
mix-id https://www.youtube.com/watch?v=...

# Custom scan settings
mix-id my-mix.mp3 --step 30 --segment 20

# Resume from a specific position
mix-id my-mix.mp3 --start 3600
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--step` | auto | Seconds between scan points (30s for mixes ≤1hr, 60s for longer) |
| `--segment` | `18` | Sample length for recognition |
| `--start` | `0` | Skip to this position (seconds) |
| `--help` | | Show help |

### Smart step scaling

mix-id automatically adjusts scan resolution based on mix length:

- **≤1 hour** → 30s steps (~120 requests, more precise timestamps)
- **>1 hour** → 60s steps (~60-150 requests, avoids rate limits)

Override with `--step` if you want full control.

## Output

mix-id generates three files:

- **`_tracklist.txt`** — Paste-friendly format for Mixcloud, etc.
- **`.cue`** — CUE sheet with track markers and timestamps
- **`_tracklist.json`** — Structured data with full metadata

## Programmatic API

The main analysis flow can also be imported from ESM code:

```js
import { analyzeAudio } from 'mix-id/lib/analyze-audio.mjs';

const controller = new AbortController();
const result = await analyzeAudio('my-mix.mp3', {
  step: 30,
  segment: 18,
  signal: controller.signal,
}, {
  onSegmentResult(segment) {
    // Stream progress into your app UI.
  },
});
```

Cancellation is best-effort: mix-id checks `AbortSignal` before and after audio tool calls, between scan segments, and during retry waits. A recognition request already in flight may continue until the Shazam library returns.

## Cuezy Desktop MVP

This repo also includes a macOS-first Electron desktop MVP named **Cuezy**. It uses electron-vite with a secure preload bridge and calls the same reusable analysis core as the CLI.

```bash
npm run dev       # Electron development app
npm run build     # electron-vite build
npm run dist:mac  # unsigned local dmg + zip build
```

The desktop MVP supports local audio/VOD files only. URL downloads and yt-dlp remain CLI-only for now. ffmpeg and ffprobe must be available on PATH; bundling ffmpeg is a later packaging task.

Privacy note: audio is processed locally, but short snippets are sent to Shazam's public recognition endpoint for identification.

Public macOS distribution will require Developer ID signing and notarization. The MVP packaging config is intended for unsigned/ad-hoc local development builds.

Desktop packaging TODOs:

- Add app icon and DMG background/layout polish.
- Decide Apple Silicon arm64, Intel x64, and later universal build strategy.
- Add Developer ID signing, notarization, hardened runtime, and entitlements via environment variables.
- Add auto-update and clearer portable/zip distribution strategy.
- Bundle ffmpeg with `extraResources` / `asarUnpack`; do not pack executable binaries inside ASAR.
- Add yt-dlp GUI support only after the local-file MVP is solid.
- Add Electron fuses hardening and better installer metadata.

## How it works

1. Downloads audio from URL (if given) using yt-dlp
2. Splits the audio into overlapping segments
3. Fingerprints each segment via Shazam's recognition API
4. Deduplicates consecutive matches (handles DJ transitions)
5. Outputs clean tracklist in multiple formats

## Supported sources

Any URL that [yt-dlp](https://github.com/yt-dlp/yt-dlp) supports — that's **1000+ sites** including:

- SoundCloud
- Mixcloud
- YouTube
- Bandcamp
- And many more

Plus any local audio file (mp3, wav, flac, m4a, etc.)

## Tips

- **No API key needed.** mix-id uses Shazam's public recognition endpoint.
- **Transitions fuzzy?** Shazam sometimes bounces between two tracks during a mix. mix-id deduplicates these automatically.
- **Rate limited?** mix-id retries automatically with exponential backoff (10s → 20s → 40s). If you're scanning back-to-back, switch VPN/network for a fresh IP.
- **Resume a scan:** If a scan was interrupted, use `--start` to pick up where you left off (in seconds).
- **Want more precision?** Use `--step 30` on longer mixes, but be aware of potential rate limiting.

## License

MIT
