/**
 * URL parsing and safety policy shared by the MAIN-world link UI and the
 * isolated-world relay. Keeping it dependency-free prevents the content script
 * from importing the preview renderer just to validate one metadata request.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'，。！？；：、)]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?，。！？；：、)\]}>]+$/;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  return [...new Set(matches.map((url) => url.replace(TRAILING_PUNCTUATION, '')))];
}

function normalizedHttpUrl(raw: string): URL | null {
  const candidate = raw.replace(TRAILING_PUNCTUATION, '');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.') || url.hostname.length > 253) return null;
    return url;
  } catch {
    return null;
  }
}

function isGitHubHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'github.com' || host === 'www.github.com';
}

export function isGitHubUrl(raw: string): boolean {
  const url = normalizedHttpUrl(raw);
  return url != null && isGitHubHost(url.hostname);
}

function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
  ) {
    return true;
  }

  const octets = host.split('.');
  if (octets.length === 4 && octets.every((octet) => /^\d+$/.test(octet))) {
    const values = octets.map(Number);
    if (values.some((value) => value < 0 || value > 255)) return true;
    return values[0] === 10
      || values[0] === 127
      || (values[0] === 169 && values[1] === 254)
      || (values[0] === 172 && values[1] >= 16 && values[1] <= 31)
      || (values[0] === 192 && values[1] === 168)
      || values[0] === 0;
  }

  const ipv6 = host.replace(/^\[|\]$/g, '');
  return ipv6 === '::1' || /^f[cd][0-9a-f:]*$/i.test(ipv6) || /^fe[89ab][0-9a-f:]*$/i.test(ipv6);
}

/** @internal exported for testing */
export function isOpaqueSegment(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8,}$/i.test(segment)) return true;
  return segment.length >= 16 && !/[-_\s]/.test(segment) && /\d/.test(segment) && /[a-z]/i.test(segment);
}

/** @internal exported for testing */
export function titleFromUrl(urlStr: string): string | null {
  let segments: string[];
  try {
    segments = new URL(urlStr).pathname.split('/').filter(Boolean);
  } catch {
    return null;
  }

  for (const segment of segments.reverse()) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      decoded = segment;
    }
    decoded = decoded.replace(/[-_][0-9a-f]{8,}$/i, '');
    decoded = decoded.replace(/\.(?:html?|php|aspx?|jsp)$/i, '');
    if (!decoded || isOpaqueSegment(decoded)) continue;
    const readable = decoded.replace(/[-_]+/g, ' ').trim();
    if (readable.length >= 2 && /\p{L}/u.test(readable)) return readable;
  }
  return null;
}

/** GitHub keeps its dedicated shortcut/card flow. */
export function extractExternalUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of extractUrls(text)) {
    const url = normalizedHttpUrl(raw);
    if (!url || isGitHubHost(url.hostname) || seen.has(url.href)) continue;
    seen.add(url.href);
    urls.push(url.href);
  }
  return urls;
}

/** Fast no-network fallback. The favicon request never carries URL query data. */
export function externalLinkFallback(urlStr: string): { title: string; icon: string } {
  const url = normalizedHttpUrl(urlStr);
  if (!url) return { title: urlStr, icon: '' };
  const domain = url.hostname.replace(/^www\./i, '');
  return {
    title: titleFromUrl(url.href) ?? domain,
    icon: `${url.origin}/favicon.ico`,
  };
}

/**
 * Returns a URL safe to request automatically for metadata. Normal link
 * buttons stay available even when this returns null.
 */
export function metadataFetchTarget(urlStr: string): string | null {
  const url = normalizedHttpUrl(urlStr);
  if (
    !url
    || url.protocol !== 'https:'
    || !!url.username
    || !!url.password
    || !!url.search
    || isPrivateNetworkHost(url.hostname)
    || isGitHubHost(url.hostname)
  ) {
    return null;
  }
  url.hash = '';
  return url.href;
}
