import { GARYS_GUIDE_SLUG, legacyGarysChapter } from './legacyPosts';

export const SITE_ORIGIN = 'https://70ki8suda.com';
export const canonicalPostUrl = (slug?: string) => `${SITE_ORIGIN}/knowdes${slug ? `/${encodeURIComponent(slug)}` : ''}`;

/** Rewrite presentation URLs, never source Markdown or comment identity. */
export function normalizePostHref(href: string | undefined): string | undefined {
  if (!href) return href;
  return href.replace(/^(https:\/\/70ki8suda\.com)?\/blog(?=\/|[?#]|$)/, '$1/knowdes');
}

/** Raw query bytes are intentional: duplicate keys and encoded values must survive. */
export function legacyPostRedirect(pathname: string, searchStr = '', hash = ''): string | undefined {
  const match = /^\/(?:blog|knowdes)\/([^/]+)\/?$/.exec(pathname);
  let chapter: string | undefined;
  // Decode one segment only; malformed encodings and decoded separators are not aliases.
  if (match) {
    try { chapter = legacyGarysChapter(decodeURIComponent(match[1])); } catch { /* Unknown path: let the destination return 404. */ }
  }
  if (chapter) return `/knowdes/${GARYS_GUIDE_SLUG}${searchStr}#${chapter}`;
  if (!/^\/blog(?:\/|$)/.test(pathname)) return undefined;
  return pathname.replace(/^\/blog/, '/knowdes') + searchStr + (hash ? `#${hash.replace(/^#/, '')}` : '');
}

/** An article/section reference is not a paragraph-level explicit edge. */
export function paragraphLinkTarget(link: string, sourceSlug: string): {slug: string; anchor: string} | undefined {
  const url = new URL(link, canonicalPostUrl(sourceSlug));
  const match = /^\/(?:blog|knowdes)\/([^/]+)$/.exec(url.pathname);
  if (url.origin !== SITE_ORIGIN || !match || !/^#p-[\w-]+$/.test(url.hash)) return undefined;
  return {slug: match[1], anchor: url.hash.slice(1)};
}

/** Legacy history entries can retain query spelling before Router normalizes it. */
export function legacyRouteRedirect(location: {pathname: string; searchStr: string; hash: string}): string | undefined {
  if (typeof window !== 'undefined' && window.location.pathname === location.pathname) {
    return legacyPostRedirect(window.location.pathname, window.location.search, window.location.hash);
  }
  return legacyPostRedirect(location.pathname, location.searchStr, location.hash);
}
