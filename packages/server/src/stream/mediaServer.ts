import { EventEmitter } from 'node:events';
// node-media-server v2 ships no types; see types/node-media-server.d.ts
import NodeMediaServer from 'node-media-server';
import type { OverseerConfig } from '../config.js';
import type { StreamInfo } from '../atem/runner.js';

/**
 * Bundled RTMP ingest. Each ATEM is pointed (via the generated Streaming.xml)
 * at rtmp://<host>:<rtmpPort>/live/<deviceId>. We then expose the same feed as
 * low-latency http-flv at http://<host>:<httpPort>/live/<deviceId>.flv, which
 * mpegts.js plays directly in the browser — no transcode, no ffmpeg.
 *
 * The stream key IS the device id, which is how a published stream is matched
 * back to the device tile it belongs to.
 */
export class MediaServer extends EventEmitter {
  private nms: NodeMediaServer;
  private live = new Set<string>();

  constructor(private cfg: OverseerConfig) {
    super();
    this.nms = new NodeMediaServer({
      rtmp: {
        port: cfg.rtmpPort,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
      },
      http: {
        port: cfg.mediaHttpPort,
        allow_origin: '*',
        mediaroot: './.media',
      },
      logType: 1,
    });

    this.nms.on('postPublish', (_id: string, streamPath: string) => {
      const key = streamKey(streamPath);
      if (!key) return;
      this.live.add(key);
      this.emit('liveChanged', key, true);
    });
    this.nms.on('donePublish', (_id: string, streamPath: string) => {
      const key = streamKey(streamPath);
      if (!key) return;
      this.live.delete(key);
      this.emit('liveChanged', key, false);
    });
  }

  start(): void {
    this.nms.run();
  }

  stop(): void {
    try {
      this.nms.stop();
    } catch {
      /* ignore */
    }
  }

  streamInfo = (id: string): StreamInfo => {
    const base = `http://${this.cfg.publicHost}:${this.cfg.mediaHttpPort}/live/${id}.flv`;
    return { flvUrl: base, live: this.live.has(id) };
  };

  isLive(id: string): boolean {
    return this.live.has(id);
  }
}

function streamKey(streamPath: string): string | null {
  // "/live/cam-a" -> "cam-a"
  const parts = streamPath.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
