// Read-only local browser checks; use an isolated Chromium on port 9227.
import assert from 'node:assert/strict';

const target = await (await fetch('http://127.0.0.1:9227/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
const errors = [];
socket.onmessage = ({ data }) => {
  const event = JSON.parse(data);
  if (event.id) {
    const job = pending.get(event.id);
    pending.delete(event.id);
    if (event.error) job.reject(new Error(event.error.message)); else job.resolve(event.result);
  } else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(new Error(`Timeout: ${method}`)); }, 45000);
  pending.set(next, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  socket.send(JSON.stringify({ id: next, method, params }));
});
const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Evaluation failed');
  return result.result.value;
};
const waitFor = async expression => {
  for (let i = 0; i < 180; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Not ready: ${expression}`);
};
const key = async (key, code, keyCode, modifiers = 0) => {
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, modifiers });
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.navigate', { url: 'http://localhost:3000/work' });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('header button') && Object.keys(document.querySelector('header button')).some(k=>k.startsWith('__reactProps'))`);
  for (const [width, height] of [[280,720],[390,844],[844,390],[1024,768],[1199,700]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.querySelector('button[aria-label="Open menu"]').click()`);
    await waitFor(`!!document.getElementById('mobile-navigation') && !!document.activeElement?.closest('#mobile-navigation')`);
    const layout = await evaluate(`(() => {
      const menu = document.getElementById('mobile-navigation'), button = document.querySelector('button[aria-label="Close menu"]');
      const rect = button.getBoundingClientRect();
      return { closeReachable: button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)), touchSize: Math.min(rect.width,rect.height), overflow:menu.scrollWidth>menu.clientWidth+1,
        linksFit:[...menu.querySelectorAll('a')].every(a=>{const r=a.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44;}) };
    })()`);
    assert.equal(layout.closeReachable, true, `Menu covers its close button at ${width}`);
    assert.ok(layout.touchSize >= 44, 'Menu button touch size');
    assert.equal(layout.overflow, false, 'Horizontal menu overflow');
    assert.equal(layout.linksFit, true, `Menu link bounds at ${width}`);
    await evaluate(`document.getElementById('mobile-navigation').querySelector('a:last-child').focus()`);
    await key('Tab', 'Tab', 9);
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Close menu', 'Focus must stay in the menu');
    await key('Tab', 'Tab', 9, 8);
    assert.equal(await evaluate(`document.activeElement === document.querySelector('#mobile-navigation a:last-child')`), true);
    await key('Escape', 'Escape', 27);
    await waitFor(`!document.getElementById('mobile-navigation')`);
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Open menu');
    console.log(`Menu passed: ${width}x${height}`);
  }
  // Resizing an open menu must unlock scrolling and restore desktop navigation.
  await evaluate(`document.querySelector('button[aria-label="Open menu"]').click()`);
  await waitFor(`!!document.getElementById('mobile-navigation')`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await waitFor(`!document.getElementById('mobile-navigation')`);
  assert.equal(await evaluate(`document.documentElement.style.overflow === 'hidden' || document.body.style.overflow === 'hidden'`), false, 'Page remains scroll locked');
  for (const motion of ['reduce', 'no-preference']) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:3000/#contact' });
    await waitFor(`document.readyState === 'complete' && !!document.getElementById('contact') && Math.abs(document.getElementById('contact').getBoundingClientRect().top-76)<3`);
    await evaluate(`document.querySelector('button[aria-label="Open menu"]').click()`);
    await waitFor(`!!document.getElementById('mobile-navigation')`);
    await evaluate(`document.querySelector('#mobile-navigation a[href="/#services"]').click()`);
    await waitFor(`location.hash === '#services' && !document.getElementById('mobile-navigation') && Math.abs(document.getElementById('services').getBoundingClientRect().top-76)<3`);
    await evaluate(`history.back()`);
    await waitFor(`location.hash === '#contact' && Math.abs(document.getElementById('contact').getBoundingClientRect().top-76)<3`);
    console.log(`Section/header clearance passed: ${motion}`);
  }
  assert.deepEqual(errors, []);
  console.log('Navigation layout, close button, keyboard loop, and resize passed.');
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:9227/json/close/${target.id}`);
}
