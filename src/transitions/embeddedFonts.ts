/**
 * The dom-to-canvas capture draws the page copy through an SVG image, which cannot
 * reach the site's web fonts. This builds `@font-face` rules with the font files inlined
 * for the faces the page has actually loaded, so the captured text matches the page.
 */

interface FaceRule {
  family: string;
  style: string;
  weight: string;
  stretch: string;
  unicodeRange: string;
  url: string;
  format: string | null;
}

const normalize = (value: string) => value.replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeRange = (value: string) => value.replace(/\s+/g, '').toLowerCase() || 'u+0-10ffff';

/** Picks the first `url()` of a `src` descriptor, with its `format()` when given. */
export function firstFontSource(src: string): { url: string; format: string | null } | null {
  const match = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/.exec(src);
  if (!match) return null;
  return { url: match[1] ?? match[2] ?? match[3], format: match[4] ?? null };
}

function collectFaceRules(): FaceRule[] {
  const rules: FaceRule[] = [];
  const visit = (list: CSSRuleList, base: string) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSFontFaceRule) {
        const source = firstFontSource(rule.style.getPropertyValue('src'));
        if (!source) continue;
        let url: string;
        try { url = new URL(source.url, base).href; } catch { continue; }
        rules.push({
          family: rule.style.getPropertyValue('font-family'),
          style: rule.style.getPropertyValue('font-style') || 'normal',
          weight: rule.style.getPropertyValue('font-weight') || 'normal',
          stretch: rule.style.getPropertyValue('font-stretch') || 'normal',
          unicodeRange: rule.style.getPropertyValue('unicode-range'),
          url,
          format: source.format,
        });
      } else if ('cssRules' in rule) {
        // @layer, @media and @supports blocks.
        visit((rule as CSSGroupingRule).cssRules, base);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { visit(sheet.cssRules, sheet.href ?? document.baseURI); } catch { /* cross-origin sheet */ }
  }
  return rules;
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const dataUrls = new Map<string, Promise<string | null>>();

function inline(url: string) {
  let pending = dataUrls.get(url);
  if (!pending) {
    pending = fetch(url).then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
      .then(toDataUrl)
      .catch(() => null);
    dataUrls.set(url, pending);
  }
  return pending;
}

let cached: { key: string; css: Promise<string> } | undefined;

/** `@font-face` CSS for every loaded web font, with the files inlined. Empty when there are none. */
export function embeddedFontCss(): Promise<string> {
  if (!document.fonts) return Promise.resolve('');
  const loaded = new Set<string>();
  for (const face of Array.from(document.fonts)) {
    if (face.status === 'loaded') loaded.add(`${normalize(face.family)}|${normalize(face.style)}|${normalize(face.weight)}|${normalizeRange(face.unicodeRange)}`);
  }
  // Pages load different faces and subsets, so the result is kept per set of loaded faces.
  const key = Array.from(loaded).sort().join(';');
  if (cached?.key !== key) cached = { key, css: buildCss(loaded) };
  return cached.css;
}

async function buildCss(loaded: Set<string>): Promise<string> {
  if (loaded.size === 0) return '';
  const used = collectFaceRules().filter((rule) => (
    loaded.has(`${normalize(rule.family)}|${normalize(rule.style)}|${normalize(rule.weight)}|${normalizeRange(rule.unicodeRange)}`)
  ));
  const css = await Promise.all(used.map(async (rule) => {
    const data = await inline(rule.url);
    if (!data) return '';
    const format = rule.format ? ` format("${rule.format}")` : '';
    const range = rule.unicodeRange ? `unicode-range:${rule.unicodeRange};` : '';
    return `@font-face{font-family:${rule.family};font-style:${rule.style};font-weight:${rule.weight};font-stretch:${rule.stretch};${range}src:url("${data}")${format};}`;
  }));
  return css.join('');
}
