export type AnnotationParagraph = { anchor: string; text: string };
export type AnnotationRange = { anchor: string; start: number; end: number };
export type AnnotationSegment = AnnotationRange & {
  paragraphTextHash: string; exact: string; prefix: string; suffix: string;
};
export type CommentAnnotation = {
  version: 1; renderVersion: 1; slug: string; bodyRevision: string;
  segments: AnnotationSegment[]; quote: string;
};
const encoder = new TextEncoder();
const anchorPattern = /^p-[a-f0-9]{16}(?:-\d+)?(?:-p)*$/;
export async function annotationHash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function boundary(text: string, offset: number) {
  return !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]));
}
export function canonicalAnnotation(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalAnnotation).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonicalAnnotation(record[key])).join(',') + '}';
}
export function encodeAnnotation(value: CommentAnnotation): string {
  const bytes = encoder.encode(canonicalAnnotation(value));
  if (bytes.length > 3072) throw new Error('引用の情報が長すぎます。短い範囲を選んでください。');
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function createAnnotation(slug: string, bodyRevision: string, paragraphs: AnnotationParagraph[], ranges: AnnotationRange[]): Promise<CommentAnnotation> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !/^[a-f0-9]{64}$/.test(bodyRevision)) throw new Error('Invalid article identity');
  if (!ranges.length || ranges.length > 3) throw new Error('引用は1〜3段落の範囲で選んでください。');
  if (new Set(paragraphs.map(p => p.anchor)).size !== paragraphs.length) throw new Error('Ambiguous paragraph identity');
  let previous = -1;
  const segments: AnnotationSegment[] = [];
  for (const range of ranges) {
    const index = paragraphs.findIndex(p => p.anchor === range.anchor);
    if (!anchorPattern.test(range.anchor) || index < 0 || index <= previous || (previous >= 0 && index !== previous + 1)) throw new Error('Invalid paragraph order');
    const { text } = paragraphs[index];
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > text.length || range.start >= range.end || !boundary(text, range.start) || !boundary(text, range.end)) throw new Error('Invalid text offsets');
    if (segments.length && (segments[segments.length - 1].end !== paragraphs[previous].text.length || range.start !== 0)) throw new Error('Non-contiguous selection');
    segments.push({ anchor: range.anchor, start: range.start, end: range.end,
      paragraphTextHash: await annotationHash(text), exact: text.slice(range.start, range.end),
      prefix: Array.from(text.slice(0, range.start)).slice(-32).join(''), suffix: Array.from(text.slice(range.end)).slice(0, 32).join('') });
    previous = index;
  }
  const quote = segments.map(s => s.exact).join('\n\n');
  if (!quote.trim() || Array.from(quote).length > 240) throw new Error('引用は240文字以内で選んでください。');
  const value: CommentAnnotation = { version: 1, renderVersion: 1, slug, bodyRevision, segments, quote };
  encodeAnnotation(value);
  return value;
}
export async function validateAnnotation(value: unknown, slug: string, bodyRevision: string, paragraphs: AnnotationParagraph[]): Promise<boolean> {
  try {
    const a = value as CommentAnnotation;
    if (!a || a.version !== 1 || a.renderVersion !== 1 || a.slug !== slug || a.bodyRevision !== bodyRevision || !Array.isArray(a.segments)) return false;
    const expected = await createAnnotation(slug, bodyRevision, paragraphs, a.segments);
    return canonicalAnnotation(value) === canonicalAnnotation(expected);
  } catch { return false; }
}
/** Structural validation is suitable for archived quotes, never proof of current placement. */
export function parseAnnotation(encoded: string): CommentAnnotation | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 4096) return null;
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    if(bytes.length>3072)return null;
    const a = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as CommentAnnotation;
    if(!a || a.version!==1 || a.renderVersion!==1 || typeof a.slug!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug) || typeof a.bodyRevision!=='string' || !/^[a-f0-9]{64}$/.test(a.bodyRevision) || !Array.isArray(a.segments) || a.segments.length<1 || a.segments.length>3)return null;
    const segments:AnnotationSegment[]=[];
    for(const s of a.segments){
      if(!s || typeof s.anchor!=='string' || !anchorPattern.test(s.anchor) || typeof s.paragraphTextHash!=='string' || !/^[a-f0-9]{64}$/.test(s.paragraphTextHash) || !Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || s.start<0 || s.end<=s.start)return null;
      if(typeof s.exact!=='string' || typeof s.prefix!=='string' || typeof s.suffix!=='string' || s.exact.length!==s.end-s.start || Array.from(s.prefix).length>32 || Array.from(s.suffix).length>32)return null;
      if([s.exact,s.prefix,s.suffix].some(t=>new TextDecoder().decode(encoder.encode(t))!==t))return null;
      segments.push({anchor:s.anchor,start:s.start,end:s.end,paragraphTextHash:s.paragraphTextHash,exact:s.exact,prefix:s.prefix,suffix:s.suffix});
    }
    if(new Set(segments.map(s=>s.anchor)).size!==segments.length)return null;
    const quote=segments.map(s=>s.exact).join('\n\n');
    if(!quote.trim() || Array.from(quote).length>240 || a.quote!==quote)return null;
    const expected:CommentAnnotation={version:1,renderVersion:1,slug:a.slug,bodyRevision:a.bodyRevision,segments,quote};
    return canonicalAnnotation(a)===canonicalAnnotation(expected)?expected:null;
  } catch { return null; }
}
export async function decodeAnnotation(encoded: string, slug: string, bodyRevision: string, paragraphs: AnnotationParagraph[]): Promise<CommentAnnotation | null> {
  const value=parseAnnotation(encoded);
  return value && await validateAnnotation(value,slug,bodyRevision,paragraphs)?value:null;
}
