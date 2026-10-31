// Local-only Chromium CDP checks. Requires next dev :3000 and an isolated browser :9227.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const tabs = await (await fetch('http://127.0.0.1:9227/json/list')).json();
const tab = tabs.find(t => t.type === 'page' && /^(about:blank|http:\/\/(localhost|127\.0\.0\.1):3000)/.test(t.url));
assert.ok(tab, 'Use an isolated local browser');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const jobs = new Map(), errors = [];
ws.onmessage = ({ data }) => {
  const e = JSON.parse(data);
  if (e.id) { const job = jobs.get(e.id); jobs.delete(e.id); if (e.error) job?.reject(new Error(e.error.message)); else job?.resolve(e.result); }
  if (e.method === 'Runtime.exceptionThrown') errors.push(e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timeout = setTimeout(() => { jobs.delete(id); reject(new Error(method + ' timeout')); }, 45000);
    jobs.set(id, { resolve: r => { clearTimeout(timeout); resolve(r); }, reject: e => { clearTimeout(timeout); reject(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'Evaluation failed');
  return r.result.value;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await wait(200); }
  throw new Error('Timed out: ' + expression);
}
const read = () => evaluate(`Array.from(document.querySelectorAll('#clients [data-marquee]'),v=>({x:new DOMMatrixReadOnly(getComputedStyle(v.firstElementChild).transform).m41,half:v.firstElementChild.scrollWidth/2,direction:v.dataset.direction}))`);
const delta = (a, b) => { const d = b.x - a.x, h = a.half; return ((d + h / 2) % h + h) % h - h / 2; };
const output = path.join(os.tmpdir(), 'dds-tracks-qa');
await mkdir(output, { recursive: true });
try {
  await send('Page.enable'); await send('Runtime.enable');
  for (const [width, height, name] of process.argv.includes('--directions-only') ? [] : process.argv.includes('--mobile-only') ? [[390,844,'mobile']] : [[1440,900,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: `http://localhost:3000/?tracks-check=${name}#clients` });
    await until(`location.search==='?tracks-check=${name}' && document.querySelectorAll('#clients [data-marquee]').length===3 && !!document.querySelector('#clients [data-marquee]').firstElementChild.style.transform && !document.querySelector('.intro-curtain')`);
    await evaluate(`document.querySelector('#clients').scrollIntoView({behavior:'instant'})`);
    await wait(500);
    assert.deepEqual((await read()).map(r => r.direction), ['left','right','left']);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), name + ' no horizontal page overflow');
    const still = await read(); await wait(200);
    assert.deepEqual(await read(), still, 'Reduced motion keeps the tracks still');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    await wait(250);
    const before = await read(); await wait(350); const after = await read();
    assert.ok(delta(before[0],after[0]) < 0 && delta(before[1],after[1]) > 0 && delta(before[2],after[2]) < 0, name + ' all three tracks alternate');
    const point = await evaluate(`(()=>{const b=document.querySelector('#clients [data-marquee]').getBoundingClientRect();return {x:Math.min(innerWidth-35,b.left+b.width*.7),y:b.top+b.height/2}})()`);
    async function swipe(delay, hold = 0) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 8; i++) {
        await wait(delay);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x - i * 15, y: point.y, button: 'left', buttons: 1 });
      }
      await wait(hold);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x - 120, y: point.y, button: 'left', clickCount: 1 });
      await wait(40);
      const begin = (await read())[0]; await wait(420); const end = (await read())[0];
      return Math.abs(delta(begin, end));
    }
    const slow = await swipe(80), fast = await swipe(8), stopped = await swipe(8,180);
    // CDP delivery latency changes absolute fling distance on busy hosts; compare speeds,
    // while deterministic unit tests verify exact velocity and refresh-rate-independent decay.
    assert.ok(fast > slow * 1.7 && fast > 5, name + ` speed-sensitive glide (${slow.toFixed(1)} slow / ${fast.toFixed(1)} fast)`);
    assert.ok(stopped < 1, 'Holding before release stops inertia');
    await evaluate(`document.documentElement.setAttribute('data-dds-edit','')`);
    await wait(250);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('#clients [data-marquee]')).filter(e=>e.getClientRects().length).length`), 2, 'Editing shows one canonical track per list');
    assert.equal(await evaluate(`document.querySelectorAll('#clients [data-ed-add-list="clients"]').length`), 1);
    const edit = await read(); await wait(200); assert.deepEqual(await read(), edit, 'Editing does not auto-drift');
    await evaluate(`document.documentElement.removeAttribute('data-dds-edit')`);
    await wait(250);
    if (name === 'mobile') {
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      async function touchSwipe(delay) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0 }] });
        for (let i = 1; i <= 8; i++) {
          await wait(delay);
          await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - i * 15, y: point.y, id: 0 }] });
        }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(40);
        const begin = (await read())[0]; await wait(420);
        return Math.abs(delta(begin, (await read())[0]));
      }
      const slowTouch = await touchSwipe(80), fastTouch = await touchSwipe(8);
      assert.ok(fastTouch > slowTouch * 1.5 && fastTouch > 5, `Native touch swipe speed controls momentum (${slowTouch.toFixed(1)} slow / ${fastTouch.toFixed(1)} fast)`);
      console.log('Native touch: fast swipe coasts farther than slow swipe');
      const scroll = await evaluate('scrollY');
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0 }] });
      for (let i = 1; i <= 8; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - i * 15, id: 0 }] }); await wait(20);
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(300);
      assert.ok(await evaluate('scrollY') > scroll + 20, 'Vertical touches still scroll the page');
      await evaluate(`document.querySelector('#clients').scrollIntoView({behavior:'instant'})`); await wait(250);
      await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));
    console.log(name + ': alternating tracks, responsive bounds, glide speed, hold-to-stop and portal controls passed');
  }
  // A same-origin parent drives the real preview protocol, without saving any content.
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.navigate', { url: 'http://localhost:3000/?directions-check#clients' });
  await until(`location.search==='?directions-check' && document.querySelector('#clients') && !document.querySelector('.intro-curtain')`);
  await evaluate(`(()=>{const f=document.createElement('iframe');f.id='track-preview-check';f.style='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647';f.src='/?portal-preview#clients';document.body.append(f)})()`);
  await until(`document.querySelector('#track-preview-check')?.contentDocument?.querySelectorAll('#clients [data-marquee]').length===3 && !!document.querySelector('#track-preview-check').contentDocument.querySelector('#clients [data-marquee]').firstElementChild.style.transform`);
  await evaluate(`document.querySelector('#track-preview-check').contentDocument.querySelector('#clients').scrollIntoView({behavior:'instant'})`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  const previewRead = () => evaluate(`Array.from(document.querySelector('#track-preview-check').contentDocument.querySelectorAll('#clients [data-marquee]'),v=>({x:new DOMMatrixReadOnly(v.style.transform||v.firstElementChild.style.transform).m41,half:v.firstElementChild.scrollWidth/2,direction:v.dataset.direction}))`);
  const content = JSON.parse(await readFile(new URL('../content/site-content.json',import.meta.url),'utf8'));
  const keys = ['productionDirection','productionSecondDirection','filmmakersDirection'];
  for (const directions of [['right','left','right'],['left','right','left']]) {
    keys.forEach((key,i)=>{content.home.clients[key]=directions[i]});
    await wait(1000);
    const before = await previewRead();
    await evaluate(`document.querySelector('#track-preview-check').contentWindow.postMessage(${JSON.stringify({source:'dds-portal',type:'content',content})},location.origin)`);
    await until(`Array.from(document.querySelector('#track-preview-check').contentDocument.querySelectorAll('#clients [data-marquee]'),v=>v.dataset.direction).join(',')===${JSON.stringify(directions.join(','))}`);
    const changed = await previewRead();
    changed.forEach((r,i)=>assert.ok(Math.abs(delta(before[i],r))<60,'Changing direction preserves the current position'));
    await wait(1000);
    const start = await previewRead(); await wait(350); const end = await previewRead();
    directions.forEach((direction,i)=>assert.ok(direction==='right'?delta(start[i],end[i])>0:delta(start[i],end[i])<0,'Preview applies each independent direction'));
  }
  await evaluate(`document.querySelector('#track-preview-check').remove()`);
  console.log('Live direction settings: all tracks reverse independently without resetting position; no saved content changed');
  assert.deepEqual(errors, [], 'No browser exceptions');
  console.log('Screenshots: ' + output);
} finally { ws.close(); }
