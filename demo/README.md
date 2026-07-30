# atem-overseer's hosted demo

The dashboard talks to ATEM switchers over the LAN, so it can't be hosted in any
useful sense. What is at <https://atem-overseer.stoatworks-labs.com> is a
**click-through demo**: the real, unmodified dashboard, replaying responses
recorded from the server running its built-in `--mock` fleet.

The dashboard is driven almost entirely by a WebSocket, so the recording is 14
seconds of that telemetry — the audio meters move, the record timecode advances
and the media-pool bars drain, because that is what the server actually sent.

**What works:** the fleet tiles and their live state, the Devices panel with its
managed fleet and mDNS discovery results, and the per-device media pool and
restreamer reads.

**What doesn't:** Record, Stream, Save Config and anything else that changes a
switcher. Those are answered honestly — the banner says the click went nowhere —
rather than faking success. Control travels over the WebSocket rather than
`fetch`, so making it replay would need the recorder to drive control messages
too; worth doing, not done.

## What's here

| File | What it is |
|---|---|
| `record-demo.sh` | Rebuilds everything: starts the mock server, records, builds the web app, assembles |
| `record-fixtures.mjs` | Records a running backend's responses (vendored) |
| `demo-shim.js` | Replays the recording in the page over `fetch`/`WebSocket` (vendored) |
| `build-demo.sh` | Assembles the built web app + shim + fixtures into a site (vendored) |
| `serve-demo.py` | Serves it with a static host's headers, for local checking (vendored) |
| `demo-fixtures.json` | The recording. Regenerate it; don't hand-edit it |
| `dist/` | **Committed build output** — what Cloudflare Pages serves |

The vendored files come from `stoatworks-backend/pages-demo`. Fix them there and
copy out, or the copies drift.

## Rebuilding and publishing

```bash
demo/record-demo.sh                                          # record + build + assemble
demo/serve-demo.py --dir demo/dist    # check it locally first
git add demo/dist && git commit && git push   # Cloudflare publishes it
```

Cloudflare Pages publishes `demo/dist` from the repo with **no build command**.
It has to be committed: assembling the demo means running the app against its
mock devices and capturing what it says, which a build container can't do.

## Rules the demo has to keep

- **It always says it's a demo.** The banner isn't optional.
- **Fixtures are recorded, never authored.** A hand-written fixture is a guess
  about what the software does, and guesses drift away from the code.
- **A control that isn't recorded says so.** Don't "improve" an unrecorded
  action into a fake success message — that is a demo showing behaviour the
  software doesn't have.
