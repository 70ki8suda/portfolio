import { expect, it } from 'vitest';
import { retrievalInputs } from '../../scripts/retrieval-corpus';
import { graphCorpus, digest } from '../../scripts/graph-corpus';
const source='---\ntitle: 共有の条件\ndescription: 説明\ndraft: false\ndate: "2026-11-01"\ntags: [共同体]\ngraph: true\n---\n## 条件\n\n最初の段落です。\n\n採用しない文脈です。\n\n最後の段落です。\n';
const files={'a.md':source};
const nodes=graphCorpus(files).nodes.map(n=>({...n,textHash:digest(n.text)}));
const adopted=[{...nodes[0],stance:'author' as const,context:'筆者の問い'},{...nodes[2],stance:'source' as const,context:'出典の説明'}];
it('preserves full body and excluded adjacent context with source identity',()=>{
 const rows=retrievalInputs(files,adopted);
 expect(rows).toHaveLength(2);expect(rows[0].next).toBe('採用しない文脈です。');expect(rows[1].previous).toBe('採用しない文脈です。');
 expect(rows[0].articleBody).toContain('## 条件');expect(rows[0].textHash).toBe(nodes[0].textHash);
});
it('ignores metadata dates and topic tags but binds every body edit',()=>{
 const before=retrievalInputs(files,adopted);
 expect(retrievalInputs({'a.md':source.replace('tags: [共同体]','tags: [共有]\nupdatedAt: "2026-11-13"')},adopted)).toEqual(before);
 const after=retrievalInputs({'a.md':source+'\n遠い節への追記です。\n'},adopted);
 expect(after[0].text).toBe(before[0].text);expect(after[0].articleBody).not.toBe(before[0].articleBody);
});
it('rejects stale adopted text or an excluded source article',()=>{
 expect(()=>retrievalInputs(files,[{...adopted[0],text:'古い本文'}])).toThrow();
 expect(()=>retrievalInputs({'a.md':source.replace('graph: true','graph: false')},adopted)).toThrow();
});
