# @av/restreamer

A small, **framework-agnostic** client for [datarhei Core](https://docs.datarhei.com/core)
(the engine behind [Restreamer](https://datarhei.com/restreamer)) plus a
**split-channel** helper: fan one RTMP ingest out to a *monitor copy* (always the
first output) and *N egress destinations* (YouTube/Twitch/…), all stream-copied
so the split is CPU-cheap and lossless.

It has **no coupling to any app** — only Node's global `fetch` (or an injected
one). That's deliberate: it lives in Atem Overseer today and is meant to drop
into [flock](https://github.com/allansargeant) (or anything else) unchanged.

```
 encoder ──RTMP──▶  Restreamer / Core  ──▶ monitor copy  → your app's ingest
                          │              ├▶ destination 1 → rtmp://youtube…
                          └──────────────┴▶ destination 2 → rtmp://twitch…
```

## Usage

```ts
import { RestreamerClient, SplitManager } from '@av/restreamer';

const client = new RestreamerClient({
  url: 'http://restreamer.local:8080',
  username: 'admin',
  password: '…',
});

const split = new SplitManager(client, {
  referencePrefix: 'my-app',                 // namespaces processes on shared Restreamers
  ingest: { host: 'restreamer.local', port: 1935, app: 'live' },
});

// tell the encoder where to publish:
const push = split.ingestPushUrl('cam-a');   // rtmp://restreamer.local:1935/live/cam-a

// create/update the split: monitor copy + destinations
await split.sync('cam-a', 'rtmp://my-app-host:1935/live/cam-a', [
  { id: 'yt', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', streamKey: 'xxxx', enabled: true },
]);

const state = await split.state('cam-a', destinations, monitorUrl);   // running? provisioned?
await split.teardown('cam-a');
```

Without a live Restreamer (tests, demos), inject the mock transport:

```ts
import { RestreamerClient, createMockTransport } from '@av/restreamer';
const client = new RestreamerClient({ url: 'http://mock', username: 'x', password: 'y', fetch: createMockTransport() });
```

## Porting to another app (e.g. flock)

Everything app-specific is passed in, not baked in:

1. Copy this package (or add it to the workspace).
2. Provide your app's **own ingest URL** as the `monitorUrl` in `sync()` — that's
   where the automatic copy lands so your app can display it.
3. Choose a unique **`referencePrefix`** (e.g. `flock`) so two apps can share one
   Restreamer without touching each other's processes.
4. Persist the per-channel `Destination[]` wherever your app keeps config and pass
   the current set into `sync()`.

That's the whole contract — no imports to rewrite.

## API surface

- `RestreamerClient` — `ping`, `listProcesses`, `getProcess`/`tryGetProcess`,
  `getState`, `createProcess`, `updateProcess`, `deleteProcess`, `command`.
- `SplitManager` — `sync`, `state`, `teardown`, `processId`, `ingestPushUrl`.
- `buildSplitProcessConfig(spec)` — pure; returns the Core process JSON.
- `createMockTransport()` — in-memory Core for tests/demos.
