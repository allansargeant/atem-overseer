import { useEffect, useRef } from 'react';
import mpegts from 'mpegts.js';

/**
 * Plays the ATEM's live output, ingested as http-flv by the server. mpegts.js
 * feeds the FLV straight into a <video> with no transcode. When the switcher
 * isn't publishing we show a multiview-style "no signal" slate instead.
 */
export function StreamView({
  flvUrl,
  live,
  muted,
}: {
  flvUrl: string | null;
  live: boolean;
  muted: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);

  useEffect(() => {
    if (!live || !flvUrl || !mpegts.isSupported()) return;
    const video = videoRef.current;
    if (!video) return;

    const player = mpegts.createPlayer(
      { type: 'flv', isLive: true, url: flvUrl },
      { enableStashBuffer: false, liveBufferLatencyChasing: true },
    );
    playerRef.current = player;
    player.attachMediaElement(video);
    player.load();
    Promise.resolve(player.play()).catch(() => undefined);

    return () => {
      try {
        player.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [flvUrl, live]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  if (!live) {
    return (
      <div className="nosignal">
        <div className="big">NO SIGNAL</div>
        <div>waiting for RTMP stream</div>
      </div>
    );
  }
  return <video ref={videoRef} muted={muted} playsInline autoPlay />;
}
