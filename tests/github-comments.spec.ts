import {test,expect} from '@playwright/test';
for(const width of [1280,390])test(`range comments preserve selection and revision at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><button>GitHubでログイン</button>'}));
 await page.route('https://raw.githubusercontent.com/**/annotations.json',r=>r.fulfill({status:503,body:'unavailable'}));
 await page.goto('/blog/postcapitalism-mason-gabriel');
 await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 const frame=page.locator('iframe[title="GitHubコメント"]');await expect(frame).toHaveCount(0);
 async function select(index:number){return page.evaluate(index=>{const p=document.querySelectorAll('[data-comment-article] p[id^="p-"]')[index];const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);const node=walker.nextNode()!;const range=document.createRange();range.setStart(node,0);range.setEnd(node,Math.min(12,node.textContent!.length));const s=getSelection()!;s.removeAllRanges();s.addRange(range);document.dispatchEvent(new Event('selectionchange'));return range.toString();},index);}
 const quote=await select(0);const open=page.getByRole('button',{name:'引用にコメント',exact:true});await expect(open).toBeVisible();expect(await page.evaluate(()=>getSelection()?.toString())).toBe(quote);
 await open.focus();await page.keyboard.press('Enter');await expect(frame).toHaveCount(1);await expect(page.locator('aside[aria-label="引用コメント"]')).toHaveCSS('background-color','rgb(245, 245, 237)');
 const src=(await frame.getAttribute('src'))!,params=new URL(src).searchParams,encoded=new URL(page.url()).searchParams.get('annotation')!;
 expect(params.get('term')).toMatch(/^range:postcapitalism-mason-gabriel:[a-f0-9]{64}:[a-f0-9]{64}$/);expect(params.get('description')).toContain(quote);expect(params.get('description')).toContain('portfolio-annotation-v1:');
 await page.evaluate(()=>{(window as unknown as {oldCommentWindow:Window|null}).oldCommentWindow=(document.querySelector('iframe[title="GitHubコメント"]') as HTMLIFrameElement).contentWindow;});
 await page.getByRole('button',{name:'コメントを閉じる'}).click();await expect(frame).toHaveCount(0);await expect(page.locator('[data-comment-article] p[id^="p-"]').first()).toBeFocused();
 await select(1);await open.click();await expect(frame).toHaveCount(1);
 await page.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://giscus.app',source:(window as unknown as {oldCommentWindow:Window}).oldCommentWindow,data:{giscus:{discussion:{url:'https://github.com/70ki8suda/portfolio/discussions/999'},resizeHeight:9000}}})));
 await expect(page.getByRole('link',{name:'GitHubで開く',exact:true})).not.toHaveAttribute('href',/\/999$/);await expect(frame).not.toHaveCSS('height','9000px');
 await page.goto(`/blog/postcapitalism-mason-gabriel?annotation=${encoded}&giscus=synthetic-session#p-test`);
 await expect(page).not.toHaveURL(/giscus=/);await expect(frame).toHaveCount(1);expect(new URL((await frame.getAttribute('src'))!).searchParams.get('session')).toBe('synthetic-session');expect(new URL(page.url()).hash).toBe('#p-test');
 const old=JSON.parse(Buffer.from(encoded,'base64url').toString());old.bodyRevision='0'.repeat(64);
 await page.goto(`/blog/postcapitalism-mason-gabriel?annotation=${Buffer.from(JSON.stringify(old)).toString('base64url')}`);
 await expect(page.getByRole('status').filter({hasText:'引用を復元できません'})).toBeVisible();await expect(frame).toHaveCount(0);
 await expect(page.getByText('コメントの一覧を確認できません')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('persistent ranges retain duplicate conversations and never highlight empty threads',async({page})=>{
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><p>会話</p>'}));
 await page.route('https://raw.githubusercontent.com/**/annotations.json',r=>r.fulfill({status:503,body:'unavailable'}));
 await page.goto('/blog/postcapitalism-mason-gabriel');await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 await page.evaluate(()=>{const p=document.querySelector('[data-comment-article] p[id^="p-"]')!;const node=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode()!;const r=document.createRange();r.setStart(node,1);r.setEnd(node,6);getSelection()!.removeAllRanges();getSelection()!.addRange(r);document.dispatchEvent(new Event('selectionchange'));});
 await page.getByRole('button',{name:'引用にコメント',exact:true}).click();const frame=page.locator('iframe[title="GitHubコメント"]');await expect(frame).toHaveCount(1);
 const params=new URL((await frame.getAttribute('src'))!).searchParams,encoded=new URL(page.url()).searchParams.get('annotation')!,annotation=JSON.parse(Buffer.from(encoded,'base64url').toString());
 const now=new Date().toISOString();const entries=[1,2,3].map(number=>({id:`D_${number}`,number,url:`https://github.com/70ki8suda/portfolio/discussions/${number}`,updatedAt:now,term:params.get('term'),annotation,comments:number===3?0:1,replies:0}));
 await page.route('https://raw.githubusercontent.com/**/annotations.json',r=>r.fulfill({json:{version:1,repo:'70ki8suda/portfolio',complete:true,startedAt:now,generatedAt:now,sourceSha:'a'.repeat(40),generation:'1:1',entries}}));
 let apiCalls=0;let delayOne=false;let releaseOne=()=>{};const gate=new Promise<void>(resolve=>{releaseOne=resolve;});
 await page.route('https://giscus.app/api/discussions?**',async r=>{apiCalls++;const number=new URL(r.request().url()).searchParams.get('number');if(delayOne&&number==='1')await gate;await r.fulfill({json:{id:`D_${number}`,url:`https://github.com/70ki8suda/portfolio/discussions/${number}`}});});
 await page.goto('/blog/postcapitalism-mason-gabriel');await expect(page.getByText('引用への会話 2件。',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'会話 #3（0件）'})).toHaveCount(0);
 const highlighted=await page.evaluate(()=>{const registry=(CSS as unknown as {highlights:Map<string,Set<Range>>}).highlights;return Array.from(registry.get('blog-comments')??[],range=>range.toString());});
 expect(highlighted).toEqual([annotation.quote,annotation.quote]);
 await page.getByRole('button',{name:'会話 #2（1件）'}).click();await expect(frame).toHaveCount(1);expect(new URL((await frame.getAttribute('src'))!).searchParams.get('number')).toBe('2');
 const articleButton=page.getByRole('button',{name:'GitHubでコメントする',exact:true});await articleButton.focus();const beforeCalls=apiCalls;
 const refreshed=page.waitForResponse(r=>r.url().endsWith('/annotations.json'));await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));await refreshed;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(articleButton).toBeFocused();expect(apiCalls).toBe(beforeCalls);
 delayOne=true;await page.getByRole('button',{name:'会話 #1（1件）'}).click();await expect.poll(()=>apiCalls).toBe(beforeCalls+1);
 page.on('dialog',d=>d.accept());await articleButton.click();await expect(frame).toHaveAttribute('src',/term=article/);
 const late=page.waitForResponse(r=>r.url().includes('/api/discussions?')&&r.url().includes('number=1'));releaseOne();await late;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(frame).toHaveAttribute('src',/term=article/);
 await page.getByRole('button',{name:'コメントを閉じる'}).click();await expect(articleButton).toBeFocused();
});
test('DOM selection offsets cross emphasis, links and Japanese multi-paragraph text exactly',async({page})=>{
 await page.goto('/blog/postcapitalism-mason-gabriel');await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 const result=await page.evaluate(async()=>{
  const moduleUrl='/src/blog/annotationDom.ts';const dom=await import(moduleUrl);const root=document.createElement('div');root.innerHTML='<p id="p-1111111111111111">前<strong>強調</strong><a href="#">リンク</a>後</p><p id="p-2222222222222222">日本語😀の続き</p>';document.body.append(root);
  const range=document.createRange();range.setStart(root.querySelector('strong')!.firstChild!,0);range.setEnd(root.querySelectorAll('p')[1].firstChild!,5);const s=getSelection()!;s.removeAllRanges();s.addRange(range);const ranges=dom.selectedAnnotationRanges(root,s);const texts=ranges.map((r:{anchor:string;start:number;end:number})=>{const p=root.querySelector(`[id="${r.anchor}"]`)!;return p.textContent!.slice(r.start,r.end);});root.remove();return {ranges,texts};
 });
 expect(result.ranges).toEqual([{anchor:'p-1111111111111111',start:1,end:7},{anchor:'p-2222222222222222',start:0,end:5}]);expect(result.texts).toEqual(['強調リンク後','日本語😀']);
});
test('closing invalidates an in-flight manual quote without reopening the draft',async({page})=>{
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><p>会話</p>'}));
 await page.goto('/blog/postcapitalism-mason-gabriel');await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();await page.getByRole('button',{name:'GitHubでコメントする',exact:true}).click();await expect(page.locator('iframe[title="GitHubコメント"]')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'選択した対象へのコメント'})).toBeFocused();
 await page.locator('summary').filter({hasText:'引用範囲を指定する'}).evaluate((e:HTMLElement)=>e.click());
 const textarea=page.getByRole('textbox',{name:'引用する文字を選択'});await textarea.focus();await textarea.evaluate((e:HTMLTextAreaElement)=>{e.setSelectionRange(0,5);e.dispatchEvent(new Event('select',{bubbles:true}));document.dispatchEvent(new Event('selectionchange'));});
 const confirm=page.getByRole('button',{name:'選択した引用を確認'});await expect(confirm).toBeEnabled();
 await page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle);Object.defineProperty(crypto.subtle,'digest',{configurable:true,value:async(...args:Parameters<SubtleCrypto['digest']>)=>{const result=await original(...args);await new Promise<void>(resolve=>{(window as unknown as {releaseDigest:()=>void}).releaseDigest=resolve;});return result;}});});
 await confirm.evaluate((e:HTMLButtonElement)=>e.click());await expect.poll(()=>page.evaluate(()=>typeof(window as unknown as {releaseDigest?:()=>void}).releaseDigest)).toBe('function');
 await page.getByRole('button',{name:'コメントを閉じる'}).click();await page.evaluate(()=>(window as unknown as {releaseDigest:()=>void}).releaseDigest());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(page.locator('aside[aria-label="引用コメント"]')).toHaveCount(0);
});
