declare module 'node-media-server' {
  interface NmsConfig {
    rtmp?: {
      port: number;
      chunk_size?: number;
      gop_cache?: boolean;
      ping?: number;
      ping_timeout?: number;
    };
    http?: { port: number; allow_origin?: string; mediaroot?: string };
    logType?: number;
  }
  type NmsHandler = (id: string, streamPath: string, args?: Record<string, string>) => void;
  export default class NodeMediaServer {
    constructor(config: NmsConfig);
    run(): void;
    stop(): void;
    on(event: string, handler: NmsHandler): void;
  }
}
