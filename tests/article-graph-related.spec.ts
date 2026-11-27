import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const slug='organizing-intelligence-ai-economy';
const payload=JSON.parse(readFileSync('public/claim-graph.json','utf8'));
const manifest=JSON.parse(readFileSync('public/graph-view.json','utf8'));
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
for(const width of [1280,390])test(`article related details preserve source, scroll and comments ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(`/knowdes/${slug}#wages`);
 await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','ready');
 const button=page.locator('[data-related-anchor]').first();
 await button.scrollIntoViewIfNeeded();
 const anchor=await button.getAttribute('data-related-anchor');
 const source=page.locator('[data-comment-article]');
 const text=await source.textContent();
 expect(await source.locator('[data-related-anchor]').count()).toBe(0);
 let y=await page.evaluate(()=>scrollY),url=page.url();
 await button.focus();await page.keyboard.press('Enter');
 const modal=page.getByRole('dialog',{name:'関連する別記事の主張'});
 await expect(modal).toBeVisible();await expect(modal.getByRole('region',{name:'主張の根拠'})).toBeVisible();
 await expect(modal.getByRole('region',{name:'探索用の接点'})).toBeVisible();
 expect(await page.evaluate(()=>scrollY)).toBe(y);expect(page.url()).toBe(url);
 await page.keyboard.press('Escape');await expect(modal).not.toBeVisible();await expect(button).toBeFocused();
 expect(await page.evaluate(()=>scrollY)).toBe(y);expect(await source.textContent()).toBe(text);
 // An actual article range still offers the comment icon, and selecting it alone opens neither UI.
 await page.locator(`[data-comment-article] p[id]`).first().scrollIntoViewIfNeeded();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.locator(`[data-comment-article] p[id]`).first().evaluate(p=>{const n=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode()!;const r=document.createRange();r.setStart(n,0);r.setEnd(n,10);const s=getSelection()!;s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));});
 await expect(page.getByRole('button',{name:'選択した引用にコメントを開く'})).toBeVisible();
 await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('iframe.giscus-frame')).toHaveCount(0);
 await page.evaluate(()=>getSelection()?.removeAllRanges());
 await button.scrollIntoViewIfNeeded();y=await page.evaluate(()=>scrollY);await button.click();await expect(modal).toBeVisible();
 const related=modal.getByRole('region',{name:'探索用の接点'}).getByRole('button').first();
 const initial=await modal.locator('blockquote').first().textContent();await related.click();
 await expect(modal.locator('blockquote').first()).not.toHaveText(initial!);
 expect(await page.evaluate(()=>scrollY)).toBe(y);
 await expect(modal.getByRole('heading',{name:'関連する別記事の主張'})).toBeFocused();
 const link=modal.getByRole('link',{name:'元の記事でこの段落を読む'});const href=await link.getAttribute('href');
 expect(href).toMatch(/^\/knowdes\/[^#]+#.+/);await link.click();await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'));
 await expect(page.getByRole('dialog')).not.toBeVisible();
 expect(await page.locator('canvas:not([data-page-transition])').count()).toBe(0);expect(requests.some(u=>/ParagraphGraphScene|node_modules\/.*(?:three|reagraph)/.test(u))).toBe(false);
 expect(errors).toEqual([]);expect(anchor).toBeTruthy();
});
test('multiple claims and section evidence have exact entrances',async({page})=>{
 await page.goto(`/knowdes/${slug}`);await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','ready');
 const b=page.locator('[data-related-claim-count]:not([data-related-claim-count="1"])').first();await b.click();
 const nav=page.getByRole('navigation',{name:'この箇所を根拠にする主張'});await expect(nav).toBeVisible();
 const count=await nav.getByRole('button').count();expect(count).toBeGreaterThan(1);await nav.getByRole('button').nth(1).click();await expect(nav.getByRole('button').nth(1)).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'関連する主張を閉じる'}).click();
 const section=page.getByRole('button',{name:/この節の根拠に関連する別記事/}).first();const anchor=await section.getAttribute('data-related-anchor');expect(await page.locator(`[data-comment-article] [id="${anchor}"]`).count()).toBe(1);
});
test('valid envelope with wrong article version is unavailable, not zero candidates',async({page})=>{
 const altered=structuredClone(payload);altered.claims.sources[slug]='0'.repeat(64);for(const [id,c] of Object.entries<any>(altered.claims.summaries))if(id.startsWith(slug+':'))for(const e of [...c.evidence,...(c.relatedPoints??[]).flatMap((p:any)=>p.evidence)])if(e.kind==='block')e.sourceHash='0'.repeat(64);const bytes=JSON.stringify(altered);
 await page.route('**/graph-view.json',r=>r.fulfill({json:{...manifest,payloadHash:digest(bytes),sourceSetHash:digest(JSON.stringify(Object.entries(altered.claims.sources).sort(([a],[b])=>a<b?-1:a>b?1:0)))}}));
 await page.route('**/claim-graph.json',r=>r.fulfill({body:bytes,contentType:'application/json'}));
 await page.goto(`/knowdes/${slug}`);await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','mismatch');
 await expect(page.locator('[data-related-anchor]')).toHaveCount(0);await expect(page.getByText('本文と関連データの版が一致しないため、関連箇所を表示していません。')).toBeVisible();
});
test('invalid delivery never opens a details button',async({page})=>{
 await page.route('**/claim-graph.json',r=>r.fulfill({json:{}}));await page.goto(`/knowdes/${slug}`);
 await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','unavailable');await expect(page.locator('[data-related-anchor]')).toHaveCount(0);
});
test('failed refresh closes once and recovery does not reopen or steal focus',async({page})=>{
 let fail=false;await page.route('**/claim-graph.json',r=>fail?r.fulfill({status:503,body:'unavailable'}):r.continue());
 await page.goto(`/knowdes/${slug}`);await page.locator('[data-related-anchor]').first().click();await expect(page.getByRole('dialog')).toBeVisible();
 fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','unavailable');await expect(page.getByRole('dialog')).not.toBeVisible();
 const link=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'KNo(w)des',exact:true});await link.focus();
 fail=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','ready');
 await expect(page.getByRole('dialog')).not.toBeVisible();await expect(link).toBeFocused();
});
test('shared graph detail retains concept navigation',async({page})=>{
 const node=payload.nodes.find((n:any)=>n.tags.length&&payload.claims.links.neighbors[n.id].length);
 await page.goto(`/knowdes?view=graph&node=${encodeURIComponent(node.id)}`);
 const chips=page.getByRole('list',{name:'この主張の概念'});await expect(chips).toBeVisible();await chips.getByRole('button').first().click();
 await expect(page.getByRole('heading',{name:'選んだ概念',exact:true})).toBeVisible();
});
test('Escape in related details preserves an already open comment and its URL',async({page})=>{
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'<button>GitHubでログイン</button>'}));
 await page.goto(`/knowdes/${slug}`);await page.locator('[data-article-comment-button]').click();
 const comment=page.locator('aside[aria-label="引用コメント"]');await expect(comment).toBeVisible();await expect(page).toHaveURL(/comment=article/);
 const url=page.url();await page.locator('[data-related-anchor]').first().click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(comment).toBeVisible();expect(page.url()).toBe(url);
});

function expectedAnchorGroups(){
 const anchors=new Map<string,Set<string>>();
 for(const n of payload.nodes.filter((n:any)=>n.slug===slug&&payload.claims.links.neighbors[n.id].length))for(const e of payload.claims.summaries[n.id].evidence){const ids=anchors.get(e.anchor)??new Set<string>();ids.add(n.id);anchors.set(e.anchor,ids);}
 return new Map([...anchors].map(([anchor,ids])=>[anchor,[...ids].sort()]));
}
for(const width of [1280,390])test(`one entrance per popup and unique target number ${width}`,async({browser},testInfo)=>{
 const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,viewport:{width,height:850},isMobile:width===390,hasTouch:width===390});const page=await context.newPage();
 await page.goto(`/knowdes/${slug}`);await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','ready');
 const dom=await page.locator('[data-comment-article] [id]').evaluateAll(elements=>elements.map(e=>({id:e.id,valid:e.matches('p,h1,h2,h3,h4,h5,h6')})));
 const anchors=expectedAnchorGroups(),seen=new Set<string>(),expected:{anchor:string;ids:string[];targets:string[]}[]=[];
 for(const e of dom){const ids=anchors.get(e.id);if(!ids||!e.valid||dom.filter(d=>d.id===e.id).length!==1)continue;const key=JSON.stringify(ids);if(seen.has(key))continue;seen.add(key);expected.push({anchor:e.id,ids,targets:[...new Set<string>(ids.flatMap(id=>payload.claims.links.neighbors[id].map((n:any)=>n.id)))]});}
 const buttons=page.locator('[data-related-anchor]');await expect(buttons).toHaveCount(expected.length);
 for(let i=0;i<expected.length;i++){await expect(buttons.nth(i)).toHaveAttribute('data-related-anchor',expected[i].anchor);await expect(buttons.nth(i)).toHaveAttribute('title',`関連先${expected[i].targets.length}箇所`);await expect(buttons.nth(i).locator('svg text')).toHaveText(String(expected[i].targets.length));}
 // Use a multi-origin entrance whose destinations overlap, so a simple sum cannot pass.
 const item=expected.find(e=>e.ids.length>1&&e.targets.length<e.ids.reduce((sum,id)=>sum+payload.claims.links.neighbors[id].length,0))!;expect(item).toBeDefined();
 const button=page.locator(`[data-related-anchor="${item.anchor}"]`);await button.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>({y:scrollY,url:location.href}));
 if(width===390)await button.tap();else await button.click();
 const modal=page.getByRole('dialog'),choices=modal.getByRole('navigation',{name:'この箇所を根拠にする主張'}).getByRole('button');await expect(choices).toHaveCount(item.ids.length);
 const shown=new Set<string>();
 for(let i=0;i<item.ids.length;i++){
  await choices.nth(i).click();const candidates=modal.getByRole('region',{name:'探索用の接点'}).locator('li');const neighbors=payload.claims.links.neighbors[item.ids[i]];await expect(candidates).toHaveCount(neighbors.length);
  for(let j=0;j<neighbors.length;j++){const target=payload.nodes.find((n:any)=>n.id===neighbors[j].id);await expect(candidates.nth(j).locator('blockquote')).toHaveText(target.text);await expect(candidates.nth(j).getByRole('link',{name:'候補の原文へ ↗',includeHidden:true})).toHaveAttribute('href',`/knowdes/${target.slug}#${payload.claims.summaries[target.id].evidence[0].anchor}`);shown.add(target.id);}
 }
 expect(shown.size).toBe(item.targets.length);await page.getByRole('button',{name:'関連する主張を閉じる'}).click();expect(await page.evaluate(()=>scrollY)).toBe(before.y);expect(page.url()).toBe(before.url);
 await expect(button).toBeFocused();await expect(page.locator('[data-comment-article] [data-related-anchor]')).toHaveCount(0);await context.close();
});
test('missing and duplicate representative anchors fall back to the next valid source',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/claim-graph.json',async r=>{await gate;await r.continue();});
 await page.goto(`/knowdes/${slug}`);await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 const order=await page.locator('[data-comment-article] [id]').evaluateAll(elements=>elements.map(e=>e.id));
 const groups=new Map<string,string[]>();for(const [anchor,ids] of expectedAnchorGroups()){if(!order.includes(anchor))continue;const key=JSON.stringify(ids),a=groups.get(key)??[];a.push(anchor);groups.set(key,a);}
 const group=[...groups.values()].find(a=>a.length>=3)!.sort((a,b)=>order.indexOf(a)-order.indexOf(b));expect(group).toBeDefined();
 await page.evaluate(([missing,duplicate])=>{document.getElementById(missing)!.removeAttribute('id');const e=document.getElementById(duplicate)!;e.after(e.cloneNode(false));},group.slice(0,2));release();
 await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','ready');await expect(page.locator(`[data-related-anchor="${group[2]}"]`)).toHaveCount(1);
 for(const anchor of group.filter((_,i)=>i!==2))await expect(page.locator(`[data-related-anchor="${anchor}"]`)).toHaveCount(0);
});
