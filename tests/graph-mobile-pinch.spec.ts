import {test,expect} from '@playwright/test';

test.setTimeout(180_000);
for(const embedded of [false,true])test(`two-finger distance controls map zoom around its midpoint (${embedded?'home':'blog'})`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto(embedded?'/':'/blog?view=graph');
 const host=embedded?page.getByTestId('home-graph'):page.locator('#main');
 if(embedded){await expect(page.getByTestId('fluid-backdrop')).not.toHaveAttribute('data-state','idle');await host.scrollIntoViewIfNeeded();await expect(host.getByTestId('graph-canvas')).toBeVisible({timeout:30000});await host.getByRole('button',{name:'graph viewを操作',exact:true}).click();}
 const map=host.getByTestId('graph-canvas');await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:30000});await expect(map).not.toHaveAttribute('data-moving','true');
 const cdp=await context.newCDPSession(page);
 const measure=()=>map.evaluate(el=>{const p=el.querySelector('[data-wx][data-wy]')!;const r=p.getBoundingClientRect();return {zoom:Number((el as HTMLElement).dataset.zoom),x:r.x,y:r.y,scale:visualViewport!.scale,scroll:scrollY};});
 const box=(await map.boundingBox())!;const center={x:box.x+box.width*.47,y:box.y+box.height*.42};
 expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,center)).toBe('CANVAS');
 const pinch=async(from:number,to:number,leaveOne=false,shift=0)=>{
  const points=(d:number)=>[{x:center.x-d/2,y:center.y,id:1},{x:center.x+d/2,y:center.y,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(from)});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(from+(to-from)*i/8).map(p=>({...p,x:p.x+shift*i/8}))});await page.waitForTimeout(25);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:leaveOne?[points(to)[1]]:[]});
  await expect(map).not.toHaveAttribute('data-moving','true');
 };
 const before=await measure();await pinch(80,160);const expanded=await measure();
 console.log('pinch trace',{embedded,before,expanded,center});
 expect(expanded.zoom/before.zoom).toBeCloseTo(2,1);
 expect(Math.abs(expanded.x-(center.x+(before.x-center.x)*2))).toBeLessThan(3);
 expect(Math.abs(expanded.y-(center.y+(before.y-center.y)*2))).toBeLessThan(3);
 expect(expanded.scale).toBe(1);expect(expanded.scroll).toBe(before.scroll);
 await pinch(160,80,true);const shrunk=await measure();expect(shrunk.zoom).toBeCloseTo(before.zoom,1);
 // One finger remains down after pinch: pan resumes without a jump or synthetic selection.
 for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x-40+i*5,y:center.y,id:1}]});await page.waitForTimeout(30);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(map).not.toHaveAttribute('data-moving','true');
 const panned=await measure();expect(panned.x-shrunk.x).toBeGreaterThan(20);expect(panned.x-shrunk.x).toBeLessThan(40);
 await expect(host.getByTestId('graph-sheet')).toBeHidden();
 expect(page.url()).not.toMatch(/[?&](node|article)=/);
 // Pinches obey both zoom bounds; another gesture still responds at either limit.
 for(let i=0;i<3;i++)await pinch(50,250);expect((await measure()).zoom).toBeLessThanOrEqual(12.01);
 await pinch(250,50);expect((await measure()).zoom).toBeLessThan(12);
 for(let i=0;i<3;i++)await pinch(250,50);expect((await measure()).zoom).toBeGreaterThanOrEqual(.69);
 await pinch(80,160);expect((await measure()).zoom).toBeGreaterThan(1);
 // A moving midpoint pans while zooming, without changing the world coordinates.
 const movedBefore=await measure();await pinch(80,120,false,20);const moved=await measure();
 expect(Math.abs(moved.x-(center.x+20+(movedBefore.x-center.x)*1.5))).toBeLessThan(3);
 // Interrupted touch and long-press context menu must not select a node or poison the next gesture.
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:center.x-40,y:center.y,id:1},{x:center.x+40,y:center.y,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 const canvas=map.locator('canvas');
 expect(await canvas.evaluate(el=>!el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})))).toBe(true);
 await expect(host.getByTestId('graph-sheet')).toBeHidden();
 const afterCancel=await measure();await pinch(120,80);expect((await measure()).zoom/afterCancel.zoom).toBeCloseTo(2/3,1);
 // Resize changes the fit denominator, never the actual world-unit pixel scale.
 const separation=()=>map.evaluate(el=>{const [a,b]=[...el.querySelectorAll('[data-wx][data-wy]')].slice(0,2).map(e=>e.getBoundingClientRect());return Math.hypot(a.x-b.x,a.y-b.y);});
 const distance=await separation();await page.setViewportSize({width:430,height:844});
 await expect(map).not.toHaveAttribute('data-moving','true');
 await expect.poll(async()=>Math.abs(await separation()-distance)).toBeLessThan(1);
 const resizedBox=(await map.boundingBox())!;center.x=resizedBox.x+resizedBox.width*.47;center.y=resizedBox.y+resizedBox.height*.42;
 const resized=await measure(),resizedDistance=await separation();await pinch(80,120);
 console.log('resize pinch trace',{embedded,before:resized,after:await measure(),distanceBefore:resizedDistance,distanceAfter:await separation()});
 // data-zoom is relative to a responsive fit; compare physical scale across a resize instead.
 expect(await separation()/resizedDistance).toBeCloseTo(1.5,1);
 await context.close();
});


test('desktop wheel, ctrl-wheel and zoom buttons remain independent of page zoom',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/blog?view=graph');
 const map=page.getByTestId('graph-canvas');await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 const zoom=async()=>Number(await map.getAttribute('data-zoom'));
 const box=(await map.boundingBox())!;const p={x:box.x+box.width*.45,y:box.y+box.height*.4};await page.mouse.move(p.x,p.y);
 const before=await zoom();await page.mouse.wheel(0,-100);await expect.poll(zoom).toBeGreaterThan(before);
 const wheeled=await zoom();await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await expect.poll(zoom).toBeGreaterThan(wheeled);
 expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);
 await page.getByRole('button',{name:'全体',exact:true}).click();await expect.poll(zoom).toBe(1);
 await page.getByRole('button',{name:'段落',exact:true}).click();await expect(map).toHaveAttribute('data-level','paragraph');
});

test('two fingers resume after a third finger leaves',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto('/blog?view=graph');const map=page.getByTestId('graph-canvas');await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 const cdp=await context.newCDPSession(page);const pair=[{x:155,y:300,id:1},{x:235,y:300,id:2}],third={x:195,y:400,id:3};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pair});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...pair,third]});
 // CDP touchEnd lists the finger that leaves, not those that remain.
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[third]});
 const before=Number(await map.getAttribute('data-zoom'));
 for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...pair[0],x:155-i*5},{...pair[1],x:235+i*5}]});await page.waitForTimeout(30);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(map).not.toHaveAttribute('data-moving','true');
 expect(Number(await map.getAttribute('data-zoom'))/before).toBeCloseTo(2,1);await expect(page.getByTestId('graph-sheet')).toBeHidden();await context.close();
});

test('pinch takes over the displayed camera rather than its animation destination',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/blog?view=graph');const map=page.getByTestId('graph-canvas');await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 // Freeze the event ordering in one task: queue an animated move, then begin a pinch before the next frame.
 // Access the installed controls through React only in this regression; no production test hook.
 const result=await map.evaluate(el=>{
  const key=Object.keys(el).find(k=>k.startsWith('__reactFiber'))!;const pending=[(el as any)[key]],seen=new Set();let controls:any;
  while(pending.length&&!controls){const f=pending.pop();if(!f||seen.has(f))continue;seen.add(f);let h=f.memoizedState;while(h){const ref=h.memoizedState?.current;if(ref?.getControls)controls=ref.getControls();h=h.next;}pending.push(f.child,f.sibling);}
  if(!controls)throw new Error('installed camera controls not found');
  const read=()=>{const t=controls.getTarget(undefined,false);return {x:t.x,y:t.y,zoom:controls.camera.zoom};};
  const before=read();void controls.moveTo(before.x+500,before.y+300,0,true);void controls.zoomTo(before.zoom*2,true);
  const canvas=el.querySelector('canvas')!;const r=canvas.getBoundingClientRect();const touches=[-40,40].map((dx,i)=>new Touch({identifier:i,target:canvas,clientX:r.x+r.width/2+dx,clientY:r.y+r.height/2}));
  canvas.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:touches}));
  const after=read(),end=controls.getTarget();
  canvas.dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,touches:[],changedTouches:touches}));
  return {before,after,end:{x:end.x,y:end.y}};
 });
 expect(result.after).toEqual(result.before);expect(result.end.x).toBeCloseTo(result.before.x,8);expect(result.end.y).toBeCloseTo(result.before.y,8);
});
