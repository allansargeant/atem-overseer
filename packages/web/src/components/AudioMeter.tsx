import { useEffect, useRef, type MutableRefObject } from 'react';
import type { AudioLevels } from '../types';

const DB_MIN = -60;
const DB_MAX = 0;

function dbToFrac(db: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  return (clamped - DB_MIN) / (DB_MAX - DB_MIN);
}

/** colour for a given fraction of the bar (green -> amber -> red near the top) */
function segColor(frac: number): string {
  if (frac > 0.9) return '#ff3b30';
  if (frac > 0.75) return '#ffd23f';
  return '#37d67a';
}

/**
 * BMD-style vertical stereo meter. Reads the shared levels ref every animation
 * frame so it can run at display rate independent of React renders. Peaks hold
 * briefly then decay.
 */
export function AudioMeter({
  id,
  levelsRef,
}: {
  id: string;
  levelsRef: MutableRefObject<Map<string, AudioLevels>>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakHold = useRef<[number, number]>([DB_MIN, DB_MIN]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const lv = levelsRef.current.get(id);
      const chans = [lv?.leftLevel ?? DB_MIN, lv?.rightLevel ?? DB_MIN];
      const peaks = [lv?.leftPeak ?? DB_MIN, lv?.rightPeak ?? DB_MIN];

      const barW = 5;
      const gap = 3;
      const totalW = chans.length * barW + (chans.length - 1) * gap;
      const x0 = (cw - totalW) / 2;

      chans.forEach((db, i) => {
        const x = x0 + i * (barW + gap);
        // trough
        ctx.fillStyle = '#101317';
        ctx.fillRect(x, 0, barW, ch);

        // segmented fill (metering is telemetry — always shown, mute only
        // affects local audio playback, not the meter)
        const frac = dbToFrac(db);
        const fillH = frac * ch;
        const steps = 24;
        for (let s = 0; s < steps; s++) {
          const sf = s / steps;
          const segY = ch - sf * ch;
          if (ch - segY <= fillH) {
            ctx.fillStyle = segColor(sf);
            ctx.fillRect(x, segY - ch / steps + 1, barW, ch / steps - 1);
          }
        }

        // peak hold with decay
        const held = Math.max(peaks[i], peakHold.current[i] - 0.6);
        peakHold.current[i] = held < DB_MIN ? DB_MIN : held;
        if (held > DB_MIN) {
          const py = ch - dbToFrac(held) * ch;
          ctx.fillStyle = held > -6 ? '#ff3b30' : '#e7e8ea';
          ctx.fillRect(x, Math.max(0, py - 1), barW, 2);
        }
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [id, levelsRef]);

  return <canvas ref={canvasRef} width={20} height={100} />;
}
