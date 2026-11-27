import { describe, expect, it } from 'vitest';
import { canonicalPostUrl, normalizePostHref, legacyPostRedirect, paragraphLinkTarget } from './postPaths';

describe('canonical paths with legacy compatibility', () => {
 it('normalizes only same-site blog boundaries without rewriting raw search/hash', () => {
  for (const [old,next] of [['/blog','/knowdes'],['/blog/','/knowdes/'],['/blog/a?x=1&x=2&e=&q=%20#p-a','/knowdes/a?x=1&x=2&e=&q=%20#p-a'],['https://70ki8suda.com/blog/a#x','https://70ki8suda.com/knowdes/a#x']]) {
   expect(normalizePostHref(old)).toBe(next);expect(normalizePostHref(next)).toBe(next);
  }
  for(const value of [undefined,'/blogger','https://example.com/blog/a','//example.com/blog/a','javascript:alert(1)','#p-x'])expect(normalizePostHref(value)).toBe(value);
 });
 it('keeps raw duplicate query and client hash, with chapter precedence for Gary', () => {
  expect(legacyPostRedirect('/blog/a','?x=1&x=2&e=&q=%20','p-a')).toBe('/knowdes/a?x=1&x=2&e=&q=%20#p-a');
  expect(legacyPostRedirect('/blog/a','?x=1')).toBe('/knowdes/a?x=1');
  expect(legacyPostRedirect('/blog/garys-compound-interest','?discussion=7','old')).toBe('/knowdes/garys-economics-guide?discussion=7#compound-interest');
  expect(legacyPostRedirect('/knowdes/garys-compound-interest','?x=1')).toBe('/knowdes/garys-economics-guide?x=1#compound-interest');
  for (const prefix of ['/blog','/knowdes']) expect(legacyPostRedirect(`${prefix}/%67arys-compound-interest`,'?x=1&x=2&space=%20')).toBe('/knowdes/garys-economics-guide?x=1&x=2&space=%20#compound-interest');
  expect(legacyPostRedirect('/knowdes/garys%2Fcompound-interest')).toBeUndefined();
  expect(legacyPostRedirect('/knowdes/%E0%A4%A')).toBeUndefined();
  expect(legacyPostRedirect('/knowdes/a')).toBeUndefined();
  expect(legacyPostRedirect('/blogger/a')).toBeUndefined();
 });
 it('makes canonical URLs independent of browsing query/hash', () => {
  expect(canonicalPostUrl()).toBe('https://70ki8suda.com/knowdes');
  expect(canonicalPostUrl('test')).toBe('https://70ki8suda.com/knowdes/test');
 });
 it('resolves old and new exact paragraph references equally, never foreign origins or sections', () => {
  for(const path of ['/blog/other#p-123','/knowdes/other#p-123','https://70ki8suda.com/blog/other#p-123'])expect(paragraphLinkTarget(path,'source')).toEqual({slug:'other',anchor:'p-123'});
  expect(paragraphLinkTarget('#p-123','source')).toEqual({slug:'source',anchor:'p-123'});
  for(const path of ['https://example.com/blog/other#p-123','/blogger/other#p-123','/knowdes/other#section','/knowdes/other'])expect(paragraphLinkTarget(path,'source')).toBeUndefined();
 });
});
