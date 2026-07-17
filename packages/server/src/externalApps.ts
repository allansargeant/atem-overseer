import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import type { DeviceConfig, OverseerConfig } from './config.js';
import type { ExternalAppInfo } from './types.js';

type Plat = 'darwin' | 'win32' | 'linux';

interface AppDef {
  label: string;
  /** true when the app is opened with the device pre-selected (a URL scheme /
   *  argument targets it); false when we can only launch the app. */
  autoSelect: boolean;
  build: (p: Plat, ctx: Ctx) => string[] | null; // argv, or null if unsupported on p
}

interface Ctx {
  ip: string;
  host: string;
  name: string;
}

// Launch an argv on macOS/Windows/Linux. BMD desktop apps expose no public
// per-device deep link, so those launch only; MixEffect connects by address via
// its URL scheme (best-effort — override in config if your build differs).
const DEFAULTS: Record<string, AppDef> = {
  'software-control': {
    label: 'ATEM Software Control',
    autoSelect: false,
    build: (p) => {
      if (p === 'darwin') return ['open', '-a', 'ATEM Software Control'];
      if (p === 'win32') return ['cmd', '/c', 'start', '', 'ATEM Software Control'];
      return null;
    },
  },
  setup: {
    label: 'ATEM Setup',
    autoSelect: false,
    build: (p) => {
      if (p === 'darwin') return ['open', '-a', 'Blackmagic ATEM Setup'];
      if (p === 'win32') return ['cmd', '/c', 'start', '', 'Blackmagic ATEM Setup'];
      return null;
    },
  },
  mixeffect: {
    label: 'MixEffect',
    autoSelect: true,
    build: (p, ctx) => {
      const url = `mixeffect://switcher?address=${encodeURIComponent(ctx.ip || ctx.host)}`;
      if (p === 'darwin') return ['open', url];
      if (p === 'win32') return ['cmd', '/c', 'start', '', url];
      if (p === 'linux') return ['xdg-open', url];
      return null;
    },
  },
  fleet: {
    label: 'ATEM Fleet Manager',
    autoSelect: false,
    build: (p) => {
      if (p === 'darwin') return ['open', '-a', 'ATEM Fleet Manager'];
      if (p === 'win32') return ['cmd', '/c', 'start', '', 'ATEM Fleet Manager'];
      return null;
    },
  },
};

export interface LaunchResult {
  ok: boolean;
  autoSelect: boolean;
  message: string;
}

function currentPlat(): Plat | null {
  const p = platform();
  return p === 'darwin' || p === 'win32' || p === 'linux' ? p : null;
}

function subst(argv: string[], ctx: Ctx): string[] {
  return argv.map((a) =>
    a.replace(/\{ip\}/g, ctx.ip).replace(/\{host\}/g, ctx.host).replace(/\{name\}/g, ctx.name),
  );
}

export class ExternalApps {
  constructor(private cfg: OverseerConfig) {}

  /** merged app definition (defaults + config override) for a key */
  private def(key: string): AppDef | null {
    const base = DEFAULTS[key];
    const ov = this.cfg.externalApps?.[key];
    if (!base && !ov) return null;
    return {
      label: ov?.label ?? base?.label ?? key,
      autoSelect: ov?.autoSelect ?? base?.autoSelect ?? false,
      build: (p, ctx) => {
        const tpl = ov?.[p];
        if (tpl && tpl.length) return subst(tpl, ctx);
        return base ? base.build(p, ctx) : null;
      },
    };
  }

  list(): ExternalAppInfo[] {
    const p = currentPlat();
    const keys = new Set([...Object.keys(DEFAULTS), ...Object.keys(this.cfg.externalApps ?? {})]);
    return [...keys].map((key) => {
      const d = this.def(key)!;
      return {
        key,
        label: d.label,
        autoSelect: d.autoSelect,
        available: !!(p && d.build(p, { ip: '', host: '', name: '' })),
      };
    });
  }

  launch(key: string, device: DeviceConfig): LaunchResult {
    const d = this.def(key);
    if (!d) return { ok: false, autoSelect: false, message: `unknown app: ${key}` };
    const p = currentPlat();
    if (!p) return { ok: false, autoSelect: false, message: 'unsupported platform' };

    const ip = device.address;
    const argv = d.build(p, { ip, host: device.address, name: device.name });
    if (!argv || argv.length === 0) {
      return { ok: false, autoSelect: false, message: `${d.label} is not available on this platform` };
    }

    try {
      const [cmd, ...args] = argv;
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.on('error', () => undefined);
      child.unref();
      return {
        ok: true,
        autoSelect: d.autoSelect,
        message: d.autoSelect
          ? `Opening ${d.label} → ${device.name}`
          : `Launched ${d.label}. Connect to ${ip} (copied to clipboard).`,
      };
    } catch (err) {
      return { ok: false, autoSelect: false, message: (err as Error).message };
    }
  }
}
