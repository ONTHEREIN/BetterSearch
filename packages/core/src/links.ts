/**
 * Query parameters that only identify the click for analytics. Generic names
 * such as `from` or `ref` are left alone: too many sites use them for real.
 */
const TRACKING = [/^utm_/, /^spm(_id_from)?$/, /^(gclid|fbclid|msclkid|yclid|dclid)$/, /^mc_(cid|eid)$/];

/** `url` without tracking parameters; unparsable input is returned as is. */
export function stripTracking(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const keys = [...parsed.searchParams.keys()];
  const drop = keys.filter((key) => TRACKING.some((re) => re.test(key)));
  if (!drop.length) return url;
  for (const key of drop) parsed.searchParams.delete(key);
  return parsed.href;
}
