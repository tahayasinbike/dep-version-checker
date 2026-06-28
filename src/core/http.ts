import * as https from 'https';

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export function fetchJson<T = any>(url: string, opts: FetchOptions = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'vscode-dep-version-checker/0.1',
          ...opts.headers,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          fetchJson<T>(new URL(res.headers.location, url).toString(), opts).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (e) {
            reject(new Error(`JSON parse error: ${url}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout: ${url}`)));
  });
}
