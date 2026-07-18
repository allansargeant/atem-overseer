import type { CoreProcess, CoreProcessConfig, FetchLike } from './types.js';

function res(status: number, body?: unknown): ReturnType<FetchLike> {
  const text = body === undefined ? '' : JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  });
}

/**
 * In-memory datarhei Core simulation exposing the same fetch surface as the real
 * API, so an app can run the full Restreamer flow (login, create/update/delete a
 * split process, query state) without any server. Used by Overseer's `--mock`.
 */
export function createMockTransport(): FetchLike {
  const processes = new Map<string, CoreProcess>();

  return (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;

    // auth
    if (pathname === '/api/login' && method === 'POST') {
      return res(200, { access_token: 'mock-access', refresh_token: 'mock-refresh' });
    }
    if (pathname === '/api/login/refresh') {
      return res(200, { access_token: 'mock-access' });
    }
    if (pathname === '/api') return res(200, { app: 'datarhei-core', version: 'mock' });

    // process collection
    if (pathname === '/api/v3/process') {
      if (method === 'GET') return res(200, [...processes.values()]);
      if (method === 'POST') {
        const cfg = body as CoreProcessConfig;
        const proc: CoreProcess = {
          id: cfg.id,
          reference: cfg.reference,
          config: cfg,
          state: { order: 'start', exec: 'running', last_logline: 'mock: running' },
        };
        processes.set(cfg.id, proc);
        return res(200, proc);
      }
    }

    // single process
    const m = pathname.match(/^\/api\/v3\/process\/([^/]+)(\/state|\/command|\/config)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const sub = m[2];
      const proc = processes.get(id);

      if (sub === '/command' && method === 'POST') {
        if (!proc) return res(404);
        const cmd = (body as { command: string }).command;
        proc.state = {
          order: cmd === 'stop' ? 'stop' : 'start',
          exec: cmd === 'stop' ? 'finished' : 'running',
          last_logline: `mock: ${cmd}`,
        };
        return res(200, {});
      }
      if (sub === '/state') {
        return proc ? res(200, proc.state) : res(404);
      }
      if (sub === '/config') {
        return proc ? res(200, proc.config) : res(404);
      }
      if (!sub) {
        if (method === 'GET') return proc ? res(200, proc) : res(404);
        if (method === 'PUT') {
          if (!proc) return res(404);
          proc.config = body as CoreProcessConfig;
          return res(200, proc);
        }
        if (method === 'DELETE') {
          return processes.delete(id) ? res(200, {}) : res(404);
        }
      }
    }

    return res(404, { message: `mock: no route for ${method} ${pathname}` });
  };
}
