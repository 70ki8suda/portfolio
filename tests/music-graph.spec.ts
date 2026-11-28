import {test,expect} from '@playwright/test';
test.skip(process.env.MUSIC_GRAPH_PREVIEW!=='1','Synthetic local music preview only');
for(const width of [320,390,1280])test(`music graph metadata navigation and article switch at ${width}`,async({browser})=>{
 const c=await browser.newContext({viewport:{width,height:850},hasTouch:width<500,isMobile:width<500,extraHTTPHeaders:{'X-Site-QA':'1'},reducedMotion:'reduce'}),p=await c.newPage();const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('/knowdes?media=music');await expect(p.getByText('合成データのローカルプレビュー', {exact:true})).toBeVisible();await expect(p.getByTestId('music-graph')).toHaveAttribute('data-ready','true');
  await expect(p.getByRole('button',{name:'アーティストから選ぶ',exact:true})).toBeVisible();await p.getByRole('group',{name:'表示する粒度'}).getByRole('button',{name:'曲',exact:true}).click();await expect(p.getByTestId('music-graph')).toHaveAttribute('data-ready','true',{timeout:30000});
  await p.getByRole('button',{name:'曲から選ぶ',exact:true}).click();await p.getByRole('button',{name:'架空の曲 1',exact:true}).click();await expect(p.getByRole('dialog',{name:'音楽の詳細'})).toBeVisible();await expect(p.getByRole('link',{name:'Spotifyで曲を開く'})).toHaveAttribute('href',/^https:\/\/open\.spotify\.com\/track\//);
  await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);await expect(p.getByRole('button',{name:'架空の曲 1',exact:true})).toBeFocused();
  await p.getByRole('button',{name:'曲から選ぶ',exact:true}).click();await p.getByRole('button',{name:'音楽グラフを操作',exact:true}).click();await p.getByRole('button',{name:'音楽グラフを拡大',exact:true}).click();await p.getByRole('button',{name:'全体',exact:true}).click();
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path:`/tmp/spotify-music-graph/preview-${width}.png`});
  await p.getByRole('link',{name:'記事',exact:true}).click();await expect(p).not.toHaveURL(/media=music/);await expect(p.getByTestId('music-graph')).toHaveCount(0);expect(errors).toEqual([]);
 }finally{await c.close();}
});
test('unknown, zero, disconnected and rate-limit states are distinct',async({page})=>{
 for(const [status,label] of [['empty','聴いた音楽の記録はまだありません。'],['disconnected','音楽の接続は解除されています。'],['rate_limited','Spotifyの利用制限により、更新を待っています。'],['unavailable','音楽を読み込めませんでした。']]){
  await page.route(/\/api\/music(\?|$)/,r=>r.fulfill({json:{version:1,status}}));await page.goto('/knowdes?media=music');await expect(page.getByText(label,{exact:true})).toBeVisible();await expect(page.getByTestId('music-graph')).toHaveCount(0);await page.unroute(/\/api\/music(\?|$)/);
 }
 await page.route(/\/api\/music(\?|$)/,r=>r.fulfill({json:{status:'empty'}}));await page.goto('/knowdes?media=music');await expect(page.getByText('音楽を読み込めませんでした。',{exact:true})).toBeVisible();
});
test('music touch pinch zooms after activation and returns to page scrolling',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:850},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Site-QA':'1'}});const page=await context.newPage();
 try{
 await page.goto('/knowdes?media=music');const map=page.getByTestId('music-graph');await expect(map).toHaveAttribute('data-ready','true');await map.scrollIntoViewIfNeeded();
 await page.getByRole('button',{name:'音楽グラフを操作',exact:true}).click();await map.scrollIntoViewIfNeeded();const box=(await map.boundingBox())!;const x=box.x+box.width/2,y=Math.min(box.y+box.height/2,700);const cdp=await context.newCDPSession(page);const points=(d:number)=>[{x:x-d/2,y,id:1},{x:x+d/2,y,id:2}];
 console.log('touch hit',await page.evaluate(({x,y})=>[document.elementFromPoint(x-35,y)?.outerHTML.slice(0,200),document.elementFromPoint(x+35,y)?.outerHTML.slice(0,200)],{x,y}));
 const before=Number(await map.getAttribute('data-zoom'));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(70)});
 for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(70+i*8)});await page.waitForTimeout(25);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>Number(await map.getAttribute('data-zoom'))).toBeGreaterThan(before*1.3);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.setViewportSize({width:430,height:780});await expect.poll(async()=>Number(await map.getAttribute('data-zoom'))).toBeGreaterThan(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'ページ操作へ',exact:true}).click();await expect(map).toHaveCSS('touch-action','pan-y');
 }finally{await context.close();}
});
for(const mobile of [false,true])test(`label drag is pan, not selection (${mobile?'touch':'mouse'})`,async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:850},hasTouch:mobile,isMobile:mobile,extraHTTPHeaders:{'X-Site-QA':'1'}}),p=await c.newPage();
 try{await p.goto('/knowdes?media=music');const map=p.getByTestId('music-graph');await expect(map).toHaveAttribute('data-ready','true');await p.getByRole('button',{name:'音楽グラフを操作',exact:true}).click();await map.scrollIntoViewIfNeeded();const label=p.locator('.music-label:visible').first();const box=(await label.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 const before=await map.getAttribute('data-x');
 if(mobile){const s=await c.newCDPSession(p);await s.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=6;i++){await s.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*8,y,id:1}]});await p.waitForTimeout(30);}await s.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 else{await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+48,y,{steps:6});await p.mouse.up();}
 await expect.poll(()=>map.getAttribute('data-x')).not.toBe(before);await expect(p.getByRole('dialog')).toHaveCount(0);
 if(mobile){const r=(await p.locator('.music-label:visible').first().boundingBox())!,a={x:Math.round(r.x+r.width/2-15),y:Math.round(r.y+r.height/2),id:1},b={x:a.x+30,y:a.y,id:2};const session=await c.newCDPSession(p);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});await p.evaluate(()=>{document.addEventListener('touchend',e=>{(window as unknown as {musicEnd:unknown}).musicEnd={remaining:[...e.touches].map(t=>t.clientX),ended:[...e.changedTouches].map(t=>t.clientX)};},{once:true});});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[b]});expect(await p.evaluate(()=>(window as unknown as {musicEnd:unknown}).musicEnd)).toEqual({remaining:[a.x],ended:[b.x]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x+12}]});await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(p.getByRole('dialog')).toHaveCount(0);}

 await p.locator('.music-label:visible').first().click();await expect(p.getByRole('dialog')).toBeVisible();
 for(const button of [p.getByRole('button',{name:'音楽グラフを拡大',exact:true}),p.getByRole('button',{name:'音楽グラフを縮小',exact:true}),p.getByRole('button',{name:'音楽の詳細を閉じる'})]){const r=(await button.boundingBox())!;expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}
 }finally{await c.close();}
});
for(const width of [390,1280])test(`home shows the music map as a section without taking over page scrolling at ${width}`,async({browser})=>{
 const c=await browser.newContext({viewport:{width,height:850},hasTouch:width<500,isMobile:width<500,extraHTTPHeaders:{'X-Site-QA':'1'},reducedMotion:'reduce'}),p=await c.newPage();const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto('/');const host=p.getByTestId('home-music');await expect(host).toHaveCount(1);
  // Nothing music-related is fetched or mounted above the fold.
  await expect(p.getByTestId('music-graph')).toHaveCount(0);
  await expect(p.getByRole('link',{name:/庭と網と輪と息/})).toBeVisible();await expect(p.getByTestId('home-graph')).toHaveCount(1);
  await host.scrollIntoViewIfNeeded();const map=p.getByTestId('music-graph');await expect(map).toHaveAttribute('data-ready','true',{timeout:30000});
  await expect(p.getByRole('heading',{level:2,name:'最近の音楽'})).toBeVisible();await expect(p.getByRole('heading',{level:1,name:'最近の音楽'})).toHaveCount(0);
  await expect(host.getByRole('link',{name:'Spotify',exact:true})).toHaveAttribute('href','https://open.spotify.com/');await expect(host.getByRole('link',{name:'音楽データについて'})).toHaveAttribute('href','/music-privacy');await expect(host.getByRole('link',{name:'音楽のページで見る'})).toHaveAttribute('href','/knowdes?media=music');
  // Until the reader opts in, a touch on the map still scrolls the page.
  expect(await map.evaluate(e=>getComputedStyle(e).touchAction)).toBe('pan-y');
  await map.scrollIntoViewIfNeeded();const before=await p.evaluate(()=>scrollY);const box=(await map.boundingBox())!;await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.wheel(0,-300);await expect.poll(()=>p.evaluate(()=>scrollY)).toBeLessThan(before);
  await host.scrollIntoViewIfNeeded();await expect(host.getByRole('group',{name:'表示する粒度'}).getByRole('button',{name:'アーティスト',exact:true})).toHaveAttribute('aria-pressed','true');await host.getByRole('group',{name:'表示する粒度'}).getByRole('button',{name:'曲',exact:true}).click();await expect(p.getByTestId('music-graph')).toHaveAttribute('data-ready','true',{timeout:30000});await host.scrollIntoViewIfNeeded();await host.getByRole('button',{name:'曲から選ぶ',exact:true}).click();await host.getByRole('button',{name:'架空の曲 1',exact:true}).click();await expect(p.getByRole('dialog',{name:'音楽の詳細'})).toBeVisible();await p.keyboard.press('Escape');await expect(p.getByRole('dialog')).toHaveCount(0);
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await host.scrollIntoViewIfNeeded();await p.screenshot({path:`/tmp/spotify-music-graph/home-${width}.png`});
  await p.evaluate(()=>scrollTo(0,0));await expect(p.getByTestId('music-graph')).toHaveCount(0);expect(errors).toEqual([]);
 }finally{await c.close();}
});
test('granularity switches between artists, albums and tracks; artists are the default and lines are only stated credits',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/music')requests.push(u.search);});
 await page.goto('/knowdes?media=music');const map=page.getByTestId('music-graph');await expect(map).toHaveAttribute('data-ready','true',{timeout:30000});
 const group=page.getByRole('group',{name:'表示する粒度'}),count=page.getByTestId('music-count');
 await expect(group.getByRole('button')).toHaveText(['アーティスト','アルバム','曲']);await expect(group.getByRole('button',{name:'アーティスト'})).toHaveAttribute('aria-pressed','true');
 expect(requests[0]).toBe('?view=artist');expect(requests.some(r=>r.includes('period'))).toBe(false);await expect(page.getByRole('group',{name:'表示する期間'})).toHaveCount(0);
 const kinds=()=>map.locator('.music-label').evaluateAll(els=>[...new Set(els.map(e=>(e.getAttribute('aria-label')??'').split(':')[0]))].sort());
 expect(await kinds()).toEqual(['アーティスト']);await expect(count).toContainText('同じ曲かアルバムに一緒にクレジット');
 // The synthetic library has both credited-together and unconnected artists: fewer lines than a full mesh, more than none.
 const artists=Number(await count.getAttribute('data-shown'));expect(artists).toBe(Number(await count.getAttribute('data-total')));expect(artists).toBeGreaterThan(5);
 // The switch works without entering the map, like any page control.
 await group.getByRole('button',{name:'アルバム'}).click();await expect(group.getByRole('button',{name:'アルバム'})).toHaveAttribute('aria-pressed','true');await expect(count).toHaveAttribute('data-total','17');await expect(map).toHaveAttribute('data-ready','true',{timeout:30000});expect(await kinds()).toEqual(['アルバム','アーティスト']);
 await page.getByRole('button',{name:'音楽グラフを操作',exact:true}).click();
 await group.getByRole('button',{name:'曲',exact:true}).click();await expect(count).toHaveAttribute('data-total','60');await expect(count).toHaveAttribute('data-shown','36');await expect(count).toContainText('60件のうち、新しく聴いた36件を表示');await expect(map).toHaveAttribute('data-ready','true',{timeout:30000});expect(await kinds()).toEqual(['アルバム','アーティスト','曲']);
 expect(requests.filter((r,i)=>requests.indexOf(r)===i)).toEqual(['?view=artist','?view=album','?view=track']);
 // The map stays entered across the switch; the popup is unchanged; Escape leaves and returns focus to the activation button.
 await expect(page.getByRole('button',{name:'ページ操作へ',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'曲から選ぶ',exact:true}).click();await expect(page.getByLabel('曲の一覧').getByRole('button')).toHaveCount(36);await page.getByRole('button',{name:'曲から選ぶ',exact:true}).click();
 await map.scrollIntoViewIfNeeded();if(await page.getByRole('button',{name:'音楽グラフを操作',exact:true}).count())await page.getByRole('button',{name:'音楽グラフを操作',exact:true}).click();await map.locator('.music-label:visible').first().click();await expect(page.getByRole('dialog',{name:'音楽の詳細'})).toBeVisible();await expect(page.getByRole('dialog').getByRole('link',{name:/^Spotifyで(曲|アルバム|アーティスト)を開く$/})).toHaveAttribute('href',/^https:\/\/open\.spotify\.com\//);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'音楽グラフを操作',exact:true})).toBeFocused();
 for(const view of ['artist','album','track']){await group.getByRole('button').nth(['artist','album','track'].indexOf(view)).click();await expect(count).toHaveAttribute('data-shown',/\d+/);await expect(map).toHaveAttribute('data-ready','true',{timeout:30000});await page.waitForTimeout(600);await map.scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/spotify-music-graph/view-${view}.png`});}
});
