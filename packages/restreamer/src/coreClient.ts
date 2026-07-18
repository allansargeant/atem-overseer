import type {
  CoreProcess,
  CoreProcessConfig,
  CoreProcessState,
  FetchLike,
} from './types.js';

export interface RestreamerClientOptions {
  /** base URL of the datarhei Core / Restreamer, e.g. http://restreamer.local:8080 */
  url: string;
  username: string;
  password: string;
  /** override the fetch implementation (defaults to global fetch) */
  fetch?: FetchLike;
}

export class RestreamerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'RestreamerError';
  }
}

/**
 * Thin, dependency-free client for the datarhei Core v3 API (the engine behind
 * Restreamer). Handles JWT login + transparent refresh/re-login on 401, and the
 * process CRUD + command endpoints. Everything else in this package builds on it.
 */
export class RestreamerClient {
  private base: string;
  private fetch: FetchLike;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(private opts: RestreamerClientOptions) {
    this.base = opts.url.replace(/\/+$/, '');
    this.fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  }

  // ---- auth ----
  private async login(): Promise<void> {
    const res = await this.fetch(`${this.base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.opts.username, password: this.opts.password }),
    });
    if (!res.ok) throw new RestreamerError(`login failed (${res.status})`, res.status);
    const body = (await res.json()) as { access_token: string; refresh_token: string };
    this.accessToken = body.access_token;
    this.refreshToken = body.refresh_token;
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) return this.login();
    const res = await this.fetch(`${this.base}/api/login/refresh`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.refreshToken}` },
    });
    if (!res.ok) return this.login();
    const body = (await res.json()) as { access_token: string };
    this.accessToken = body.access_token;
  }

  /** authenticated request with one automatic refresh/re-login on 401 */
  private async req<T>(path: string, method: string, body?: unknown, retry = true): Promise<T> {
    if (!this.accessToken) await this.login();
    const res = await this.fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && retry) {
      await this.refresh();
      return this.req<T>(path, method, body, false);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new RestreamerError(`${method} ${path} -> ${res.status} ${text}`.trim(), res.status);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ---- reachability ----
  async ping(): Promise<boolean> {
    try {
      const res = await this.fetch(`${this.base}/api`, { method: 'GET' });
      return res.ok || res.status === 404; // any HTTP response means it's reachable
    } catch {
      return false;
    }
  }

  // ---- process API ----
  listProcesses(): Promise<CoreProcess[]> {
    return this.req<CoreProcess[]>('/api/v3/process', 'GET');
  }

  getProcess(id: string): Promise<CoreProcess> {
    return this.req<CoreProcess>(`/api/v3/process/${encodeURIComponent(id)}`, 'GET');
  }

  async tryGetProcess(id: string): Promise<CoreProcess | null> {
    try {
      return await this.getProcess(id);
    } catch (err) {
      if (err instanceof RestreamerError && err.status === 404) return null;
      throw err;
    }
  }

  getState(id: string): Promise<CoreProcessState> {
    return this.req<CoreProcessState>(`/api/v3/process/${encodeURIComponent(id)}/state`, 'GET');
  }

  createProcess(config: CoreProcessConfig): Promise<CoreProcess> {
    return this.req<CoreProcess>('/api/v3/process', 'POST', config);
  }

  updateProcess(id: string, config: CoreProcessConfig): Promise<CoreProcess> {
    return this.req<CoreProcess>(`/api/v3/process/${encodeURIComponent(id)}`, 'PUT', config);
  }

  deleteProcess(id: string): Promise<void> {
    return this.req<void>(`/api/v3/process/${encodeURIComponent(id)}`, 'DELETE');
  }

  command(id: string, command: 'start' | 'stop' | 'restart'): Promise<void> {
    return this.req<void>(`/api/v3/process/${encodeURIComponent(id)}/command`, 'POST', { command });
  }
}
