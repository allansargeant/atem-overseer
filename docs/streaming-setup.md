# Live preview & streaming setup

Atem Overseer can show each switcher's live program output right in its tile. It
does this without any cloud service or capture hardware: the ATEM streams to a
bundled RTMP server inside Overseer, which re-serves the feed as low-latency
http-flv that the browser plays with [mpegts.js](https://github.com/xqq/mpegts.js).

```
ATEM  ──RTMP──▶  Overseer (node-media-server :1935)  ──http-flv──▶  Browser tile
        rtmp://<host>:1935/live/<deviceId>            http://<host>:8000/live/<deviceId>.flv
```

The **stream key is the device id** — that's how a published feed is matched to
the correct tile.

## 1. Set `publicHost`

In `atem-overseer.config.json`, set `publicHost` to the address the ATEMs (and
the browsers) use to reach the machine running Overseer — usually its LAN IP:

```json
{ "publicHost": "192.168.1.50", "rtmpPort": 1935, "mediaHttpPort": 8000, "httpPort": 4700 }
```

This value is baked into both the generated `Streaming.xml` and the http-flv
playback URLs.

## 2. Point each switcher at Overseer

Two ways, depending on your ATEM model and workflow:

### A. Streaming.xml (ATEM Software Control)

1. In the dashboard, open a tile's **⚙ → Download Streaming.xml** (or the
   **Streaming.xml** button in the header).
2. Place it in ATEM Software Control's streaming support folder:
   - **macOS:** `~/Library/Application Support/Blackmagic Design/Switchers/Streaming.xml`
   - **Windows:** `%APPDATA%\Blackmagic Design\Switchers\Streaming.xml`
3. Restart ATEM Software Control. Under **Output → Live Stream**, pick service
   **"Atem Overseer (Local)"**.
4. Set the **stream key** to the switcher's Overseer **device id** (each id is
   listed in a comment at the top of the XML).

### B. Apply directly (newer ATEMs)

For switchers that accept a streaming service over the protocol, open the tile's
**⚙ → Apply local service to switcher**. Overseer pushes the RTMP URL and sets
the key to the device id for you.

## 3. Start streaming

Hit **► Stream** on the tile (or start the stream on the switcher). Within a
second or two the tile shows the **SIGNAL** chip and the live output replaces the
"NO SIGNAL" slate.

## Audio monitoring

Every tile meters the switcher's Fairlight program bus continuously — metering is
telemetry and is always shown. The **🔊 / 🔇** button only toggles whether *your
browser* plays that stream's audio, so you can listen to one wall at a time
without a wall of overlapping sound. Tiles start muted.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Tile stays "NO SIGNAL" | Switcher actually streaming? Key == device id? `publicHost` reachable from the ATEM? |
| Playback stutters | Network headroom; the tile's **Stream Bitrate** and stream-cache health reflect the encoder. |
| Firewall | Allow inbound TCP 1935 (RTMP) and 8000 (http-flv) on the Overseer machine. |
