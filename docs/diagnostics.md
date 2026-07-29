# Diagnostics

Three artefacts, because a failure on site needs different things at different
moments: something an operator can read now, something that survives a crash
nobody was watching, and something that can be sent in one piece afterwards.

Everything lives in `packages/server/src/diag/`. It is deliberately
self-contained so it can be copied into the other Node repos unchanged.

## Where things are written

| Platform | Directory |
| --- | --- |
| macOS | `~/Library/Logs/atem-overseer/` |
| Linux | `$XDG_STATE_HOME/atem-overseer/logs/` (default `~/.local/state/atem-overseer/logs/`) |
| Windows | `%LOCALAPPDATA%\atem-overseer\logs\` |

`ATEM_OVERSEER_LOG_DIR` overrides it, which is how you point a whole rack at
one collected location. The path is printed on the first line of every run.

## 1. The human log

`atem-overseer.YYYY-MM-DD.log`, rotated daily, seven files kept:

```
2026-07-29T13:44:56.949Z INFO  logging started version=0.2.0 gitRev=4825917c01ff logLevel=info
2026-07-29T13:44:56.956Z INFO  listening mock=true httpPort=4700 devices=["cam-a","cam-b"]
```

Console output goes to **stderr**; the file gets the same text without colour.
Anything on stdout is program output — `--collect-diagnostics` prints a path
there and nothing else, so it can be used in a script.

Level comes from `ATEM_OVERSEER_LOG`, defaulting to `info`:

```bash
ATEM_OVERSEER_LOG=debug npm start
```

File writes are **synchronous**, on purpose. An async write stream loses
whatever is still buffered when the crash handler calls `process.exit`, so the
log for the run that crashed comes out empty — precisely the run you needed.

`pino` provides the level and field API, but is *not* used with a transport:
transports run in a worker thread, and on a hard crash the tail can die with
the main thread before the worker drains it.

## 2. The crash report

Written by handlers on both `uncaughtException` and `unhandledRejection` — they
fail differently, and knowing which fired is part of the diagnosis, so the
report records it as `trigger`. An unhandled rejection usually means a missing
`await`.

`atem-overseer-crash-<timestamp>.json` contains:

| Field | Why it is there |
| --- | --- |
| `app.version`, `app.gitRev` | A version does not identify a tree three commits past the tag. `-dirty` means uncommitted changes. |
| `platform` | OS, arch, Node version, hostname, usable core count. |
| `process` | PID, argv, start time, uptime, and memory usage — a long-running media server that dies is often a leak, and `heapUsed` says so immediately. |
| `config` | Effective configuration with secret-looking keys replaced. |
| `error` | Name, message, stack as an array of frames. |
| `recentLog` | The last 500 log lines, oldest first, from an in-memory ring. |

## 3. The diagnostics bundle

```bash
npm start -- --collect-diagnostics
```

Writes `atem-overseer-diagnostics-<timestamp>.json` and prints its path. One
file, so "send me your diagnostics" is one instruction. It holds the identity
and config blocks, the last three log files (tail-capped at 5000 lines), the
five most recent crash reports embedded whole, and `collectionWarnings` for
anything unreadable — collection is best-effort, because a missing log file
must not stop the rest being sent.

## Redaction

Keys are matched case-insensitively with `-` and `_` removed against
`password`, `passwd`, `passphrase`, `secret`, `token`, `apikey`, `credential`,
`auth`, `private`, at any depth including inside arrays.

This is not theoretical here: `restreamer.password` and `restreamer.rtmpToken`
are real config fields and both come out as `<redacted>`. If you add a config
field holding a credential, check its name trips one of those words.

## Schema

Both documents carry `"schema": "stoatworks.diagnostics/1"` and a `kind` of
`crash-report` or `diagnostics-bundle`. Treat the schema string as the
contract; bump it if a field changes meaning.

## Trying it

```bash
npm run diag:crash-example --workspace @atem-overseer/server
```

Logs a few lines, then dies on an unawaited rejection. Read the JSON it leaves
behind — including that `password` and `rtmpToken` came out `<redacted>`.
