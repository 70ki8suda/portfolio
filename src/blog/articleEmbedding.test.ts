import {expect,it} from 'vitest';
import {articleEmbeddingText} from '../../scripts/article-embedding';
it('covers prose, headings, quotes, lists, tables, alt, footnotes and the tail without source URLs/video IDs',()=>{
 const body='## Heading {#head}\n\nFirst [label](https://private.example).\n\n> Quote\n\n- List\n\n| A | B |\n|---|---|\n| cell | end |\n\n![visible alt](/image.png)\n\nText[^1]\n\n[^1]: footnote body\n\n```youtube\nsecretVideo\n```\n\nTail';
 const text=articleEmbeddingText('Title',body);
 for(const s of ['Title','Heading','First label','Quote','List','cell','visible alt','footnote body','Tail'])expect(text).toContain(s);
 for(const s of ['private.example','secretVideo','/image.png','{#head}'])expect(text).not.toContain(s);
 expect(articleEmbeddingText('Title',body+' changed')).not.toEqual(text);
});
it('refuses unreadable HTML rather than silently losing its text',()=>{
 expect(()=>articleEmbeddingText('T','<div>meaning</div>')).toThrow(/HTML/);
});
