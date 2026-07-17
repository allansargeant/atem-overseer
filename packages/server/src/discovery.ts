import makeMdns from 'multicast-dns';
import type { DiscoveredDevice } from './types.js';

/** service types we treat as "an ATEM". Blackmagic's exact DNS-SD type isn't
 *  publicly documented and older ATEMs don't advertise at all, so we also
 *  enumerate every advertised type via the DNS-SD meta-query and keep any whose
 *  name looks Blackmagic/ATEM/NMOS. Manual add-by-IP remains the reliable path. */
const CANDIDATE_TYPES = [
  '_blackmagic._tcp.local',
  '_atem._tcp.local',
  '_nmos-node._tcp.local',
];
const META_QUERY = '_services._dns-sd._udp.local';
const MATCH = /blackmagic|atem|nmos/i;
const TTL_MS = 90_000;

interface Found {
  address: string;
  hostname: string | null;
  name: string;
  serviceType: string;
  lastSeen: number;
}

/**
 * Best-effort ATEM discovery over mDNS/DNS-SD. Emits nothing directly; the API
 * pulls `list()`. In `--mock` it seeds a couple of plausible switchers that
 * aren't in the managed fleet so the "discovered" list can be exercised.
 */
export class Discovery {
  private found = new Map<string, Found>();
  private mdns?: ReturnType<typeof makeMdns>;
  private aRecords = new Map<string, string>(); // host.local -> ip
  private activeTypes = new Set(CANDIDATE_TYPES);
  private timer?: NodeJS.Timeout;

  constructor(private mock: boolean) {}

  start(): void {
    if (this.mock) {
      const now = Date.now();
      for (const d of [
        { address: '10.0.0.21', hostname: 'studio-hd8.local', name: 'ATEM Television Studio HD8 ISO', serviceType: '_blackmagic._tcp' },
        { address: '10.0.0.22', hostname: 'sdi-extreme.local', name: 'ATEM SDI Extreme ISO', serviceType: '_blackmagic._tcp' },
      ]) {
        this.found.set(d.address, { ...d, lastSeen: now });
      }
      return;
    }

    try {
      this.mdns = makeMdns();
      this.mdns.on('response', (res) => this.onResponse(res));
      this.query();
      this.timer = setInterval(() => this.query(), 15_000);
    } catch (err) {
      console.error('[discovery] mDNS unavailable:', (err as Error).message);
    }
  }

  stop(): void {
    clearInterval(this.timer);
    try {
      this.mdns?.destroy();
    } catch {
      /* ignore */
    }
  }

  private query(): void {
    if (!this.mdns) return;
    this.mdns.query({ questions: [{ name: META_QUERY, type: 'PTR' }] });
    for (const t of this.activeTypes) {
      this.mdns.query({ questions: [{ name: t, type: 'PTR' }] });
    }
    // prune stale
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of this.found) if (v.lastSeen < cutoff) this.found.delete(k);
  }

  private onResponse(res: makeMdns.ResponsePacket): void {
    const records = [...(res.answers ?? []), ...(res.additionals ?? [])];

    // collect address records first
    for (const r of records) {
      if (r.type === 'A' && typeof r.data === 'string') this.aRecords.set(r.name, r.data);
    }

    for (const r of records) {
      // meta-query: learn new service types
      if (r.type === 'PTR' && r.name === META_QUERY && typeof r.data === 'string') {
        if (MATCH.test(r.data)) this.activeTypes.add(r.data);
        continue;
      }
      // instance pointer for a service type we care about
      if (r.type === 'PTR' && typeof r.data === 'string' && (MATCH.test(r.name) || this.activeTypes.has(r.name))) {
        this.mdns?.query({ questions: [{ name: r.data, type: 'SRV' }, { name: r.data, type: 'TXT' }] });
      }
      // SRV gives the target host + confirms an instance
      if (r.type === 'SRV' && r.data && typeof r.data === 'object' && MATCH.test(r.name)) {
        const target = (r.data as { target: string }).target;
        const ip = this.aRecords.get(target);
        if (ip) {
          const label = r.name.split('.')[0];
          this.found.set(ip, {
            address: ip,
            hostname: target.replace(/\.$/, ''),
            name: label || 'ATEM',
            serviceType: r.name.replace(/^[^.]+\./, '').replace(/\.local\.?$/, ''),
            lastSeen: Date.now(),
          });
        }
      }
    }
  }

  list(managed: Set<string>): DiscoveredDevice[] {
    return [...this.found.values()].map((f) => ({
      address: f.address,
      hostname: f.hostname,
      name: f.name,
      serviceType: f.serviceType,
      alreadyManaged: managed.has(f.address),
    }));
  }
}
