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

// A small stand-in for the Public Suffix List, which is too large to ship in
// the script: multi-label country suffixes, plus hosting platforms whose
// subdomains belong to unrelated people.
const SUFFIXES = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'com.hk', 'org.hk', 'com.tw', 'org.tw', 'com.sg', 'com.my',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'co.kr', 'or.kr',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au',
  'co.nz', 'co.in', 'com.br', 'com.mx', 'co.za',
  'github.io', 'gitee.io', 'gitlab.io', 'blogspot.com', 'wordpress.com',
  'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'web.app',
  'firebaseapp.com', 'herokuapp.com', 'notion.site',
]);

// Sites whose subdomains are separate products, e.g. zhidao.baidu.com and
// baijiahao.baidu.com. Blocking one of them should not block the rest.
const PORTALS = new Set([
  'baidu.com', 'qq.com', 'tencent.com', 'google.com', 'google.cn', 'microsoft.com',
  'apple.com', 'sina.com.cn', 'sina.cn', 'sohu.com', '163.com', 'aliyun.com', 'alibaba.com',
]);

/** `a.b.example.co.uk` -> `example.co.uk`. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.');
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** What "block this site" should cover for a result on `host`. */
export function siteOf(host: string): string {
  const domain = registrableDomain(host);
  return PORTALS.has(domain) ? stripWww(host.toLowerCase()) : domain;
}
