const HOSTNAME = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/i;

/**
 * Pull the hostname out of the URL text an engine shows under a result, such as
 * `https://www.example.com › docs › intro` or `example.com/path`.
 */
export function hostFromDisplayUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.replace(/^\s*https?:\/\//i, '').match(HOSTNAME);
  return match ? match[0].toLowerCase() : null;
}

/** `www.example.com` -> `example.com`; other hosts are returned unchanged. */
export function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}
