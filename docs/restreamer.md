# Restreamer split pipeline

By default an ATEM streams straight into Overseer's built-in RTMP ingest. Enable
the **Restreamer integration** and the topology changes to a fan-out:

```
                         ┌──────────────────────────────────────────┐
 ATEM ──RTMP──▶ Restreamer (datarhei Core) ──▶ monitor copy ──▶ Overseer ingest ──▶ tile preview
                         │                    ├▶ YouTube
                         │                    ├▶ Twitch
                         └────────────────────┴▶ … more destinations
```

The ATEM streams **once**, to Restreamer. Overseer then asks Restreamer (over its
Core API) to run a *split process* that stream-copies (`-c copy`, so it's
CPU-cheap and lossless) the ingest to:

- **output 0 — the monitor copy**, pushed back into Overseer's own ingest so the
  tile preview keeps working exactly as before, and
- **outputs 1…N — your egress destinations** (YouTube/Twitch/custom RTMP),
  managed per-device from Overseer's gear panel.

## Enabling it

You need a running Restreamer / datarhei Core reachable from Overseer. Don't have
one? Grab a compose file from any device's ⚙ → **Restreamer → docker-compose.yml**
(or `GET /api/restreamer/compose`) and `docker compose up -d`.

Add a `restreamer` block to `atem-overseer.config.json`:

```json
{
  "restreamer": {
    "enabled": true,
    "url": "http://restreamer.local:8080",
    "username": "admin",
    "password": "…",
    "rtmpHost": "restreamer.local",
    "rtmpPort": 1935,
    "rtmpApp": "live",
    "rtmpToken": "optional-publish-token",
    "referencePrefix": "atem-overseer"
  }
}
```

- `url` / `username` / `password` — the Core API (Restreamer web UI login).
- `rtmpHost`/`rtmpPort`/`rtmpApp`/`rtmpToken` — how the **ATEM** reaches
  Restreamer's RTMP ingest. This is what the generated `Streaming.xml` and the
  "Apply local service to switcher" button now point at.

> **Ports:** if Restreamer runs on the *same host* as Overseer, give them
> different RTMP ports — both default to 1935. Separate hosts are simplest.

## Using it

Per device, open ⚙ → **Restreamer**:

1. **Provision** — creates/updates the split process on Restreamer and starts it.
2. **Point the ATEM** at the shown push URL (`rtmp://…/live/<deviceId>`). The
   Streaming.xml already targets Restreamer when the integration is on.
3. **Egress destinations** — add name + RTMP URL + stream key, toggle each on/off,
   **Save**. Saving re-syncs the live process. The monitor copy is always kept.
4. **Tear down** removes the process from Restreamer.

## How it's built (and porting to flock)

All the Restreamer logic lives in a standalone, framework-agnostic package,
[`packages/restreamer`](../packages/restreamer) (`@av/restreamer`) — a datarhei
Core client plus a `SplitManager`. It has **no Overseer coupling**: the app passes
in its own monitor-ingest URL and a `referencePrefix`.

To add the same feature to **flock**: copy `packages/restreamer` in, then wire ~4
REST endpoints to a `SplitManager`, passing flock's own ingest URL as the monitor
target and `referencePrefix: "flock"` (so both apps can share one Restreamer
without clobbering each other's processes). See the package's
[README](../packages/restreamer/README.md) for the exact contract.

## Caveat

This integration was developed and verified against an in-memory mock of the
datarhei Core API (the generated process JSON matches the documented v3 schema),
**not** against a live Restreamer. Verify against your instance before relying on
it for a show.
