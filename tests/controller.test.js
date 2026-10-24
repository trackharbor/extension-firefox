import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/controller.js';

const target = 'https://api-partner.spotify.com/pathfinder/v2/query';
const headers = [
  { name: 'authorization', value: 'Bearer PRIVATE_A' },
  { name: 'client-token', value: 'PRIVATE_B' },
];
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

function event() {
  const listeners = [];
  return {
    registrations: [],
    addListener(fn, ...options) { listeners.push(fn); this.registrations.push(options); },
    emit(details) { return listeners.map(fn => fn(details)); },
  };
}

function fixture(overrides = {}) {
  const calls = { created: [], updated: [], removed: [], windows: [], clipboard: [], titles: [], badges: [], order: [] };
  const scheduled = new Map();
  let nextTimer = 0;
  const browser = {
    runtime: { getURL: path => `moz-extension://test/${path}` },
    tabs: {
      onRemoved: event(),
      async create(options) {
        calls.created.push(options);
        if (overrides.create) return overrides.create(options);
        return { id: 17 };
      },
      async update(id, options) {
        calls.updated.push({ id, options });
        await overrides.update?.(id, options);
      },
      async remove(id) {
        calls.order.push('remove'); calls.removed.push(id);
        await overrides.remove?.(id);
        browser.tabs.onRemoved.emit(id);
      },
    },
    windows: {
      onRemoved: event(),
      async create(options) {
        calls.order.push('window'); calls.windows.push(options);
        await overrides.window?.(options);
        return { id: 23 };
      },
    },
    browserAction: {
      async setTitle({ title }) { calls.titles.push(title); await overrides.title?.(); },
      async setBadgeText({ text }) { calls.badges.push(text); await overrides.badge?.(); },
    },
    webRequest: { onBeforeSendHeaders: event(), onErrorOccurred: event() },
  };
  const timers = {
    setTimeout(fn, ms) { scheduled.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout(id) { scheduled.delete(id); },
  };
  const controller = createController({
    browser, timers,
    async writeClipboard(text) { calls.clipboard.push(text); await overrides.copy?.(text); },
  });
  return {
    browser, calls, controller, scheduled,
    request(details = {}) {
      return browser.webRequest.onBeforeSendHeaders.emit({ tabId: 17, url: target, requestHeaders: headers, ...details });
    },
    error(details = {}) {
      browser.webRequest.onErrorOccurred.emit({ tabId: 17, type: 'xmlhttprequest', url: target, error: 'PRIVATE_ERROR', ...details });
    },
  };
}

function safeResult(f, pattern) {
  const result = f.controller.getResult();
  assert.equal(result.ok, false);
  assert.match(result.message, pattern);
  assert.doesNotMatch(JSON.stringify({ result, windows: f.calls.windows, titles: f.calls.titles }), /PRIVATE/);
  assert.equal(f.scheduled.size, 0);
}

test('creates blank tab first and captures a request synchronously during navigation', async () => {
  let f;
  f = fixture({ update: () => f.request() });
  await f.controller.start(); await flush();
  assert.deepEqual(f.calls.created, [{ url: 'about:blank', active: true }]);
  assert.deepEqual(f.calls.updated, [{ id: 17, options: { url: 'https://open.spotify.com/' } }]);
  assert.deepEqual(f.calls.clipboard, ['authorization: Bearer PRIVATE_A\nclient-token: PRIVATE_B']);
  assert.equal(f.controller.getResult().ok, true);
  assert.match(f.controller.getResult().message, /всё ок/);
  assert.deepEqual(f.calls.order, ['window', 'remove']);
  assert.deepEqual(f.calls.removed, [17]);
  assert.equal(f.scheduled.size, 0);
  assert.equal(f.calls.windows[0].type, 'popup');
  assert.equal(f.calls.windows[0].url, 'moz-extension://test/result.html#1');
  assert.doesNotMatch(JSON.stringify(f.controller.getResult()), /PRIVATE/);
});

test('registers a read-only header observer with requestHeaders', () => {
  const f = fixture();
  const [filter, extra] = f.browser.webRequest.onBeforeSendHeaders.registrations[0];
  assert.deepEqual(extra, ['requestHeaders']);
  assert.deepEqual(filter.urls, ['https://api-partner.spotify.com/pathfinder/v2/query*']);
  assert.deepEqual(f.request(), [undefined]);
});

test('ignores unrelated tabs, paths and requests without a complete pair', async () => {
  const f = fixture(); await f.controller.start();
  f.request({ tabId: 99 }); f.request({ url: `${target}/extra` });
  f.request({ requestHeaders: [headers[0]] }); f.request({ requestHeaders: [headers[1]] });
  f.request({ requestHeaders: undefined });
  await flush();
  assert.deepEqual(f.calls.clipboard, []);
  assert.deepEqual(f.calls.removed, []);
  assert.equal(f.controller.getResult(), null);
  f.request(); await flush();
  assert.equal(f.calls.clipboard.length, 1);
});

test('duplicate clicks and requests do not duplicate the operation', async () => {
  const f = fixture();
  await Promise.all([f.controller.start(), f.controller.start()]);
  f.request(); f.request(); await f.controller.start(); await flush();
  assert.equal(f.calls.created.length, 1);
  assert.equal(f.calls.clipboard.length, 1);
  assert.equal(f.calls.windows.length, 1);
  assert.deepEqual(f.calls.removed, [17]);
});

test('times out after 60000 ms and closes its tab', async () => {
  const f = fixture(); await f.controller.start();
  const [timeout] = f.scheduled.values(); assert.equal(timeout.ms, 60000);
  timeout.fn(); await flush();
  safeResult(f, /60 секунд/);
  assert.deepEqual(f.calls.removed, [17]);
});

test('timeout after incomplete credentials explains missing headers', async () => {
  const f = fixture(); await f.controller.start();
  f.request({ requestHeaders: [headers[0]] });
  [...f.scheduled.values()][0].fn(); await flush();
  safeResult(f, /authorization.*client-token/);
});

for (const [stage, pattern] of [
  ['create', /открыть вкладку/], ['update', /открыть Spotify/],
  ['copy', /буфер/], ['remove', /закрыть вкладку/],
]) {
  test(`handles ${stage} failure without exposing exception details`, async () => {
    const f = fixture({ [stage]: () => { throw Error('PRIVATE_ERROR'); } });
    await f.controller.start();
    if (stage === 'copy' || stage === 'remove') f.request();
    await flush(); safeResult(f, pattern);
    assert.deepEqual(f.calls.removed, stage === 'create' ? [] : [17]);
    assert.equal(f.calls.windows.length, 1);
  });
}

for (const details of [
  { url: 'https://open.spotify.com/', type: 'main_frame' },
  { url: target },
]) {
  test(`reports relevant network error: ${JSON.stringify(details)}`, async () => {
    const f = fixture(); await f.controller.start(); f.error(details); await flush();
    safeResult(f, /загрузить|запрос/);
    assert.deepEqual(f.calls.removed, [17]);
  });
}

test('ignores unrelated network errors', async () => {
  const f = fixture(); await f.controller.start();
  f.error({ tabId: 9 }); f.error({ url: 'https://open.spotify.com/icon.png', type: 'image' });
  await flush(); assert.equal(f.controller.getResult(), null);
});

test('manual closing reports interruption without trying to delete another tab', async () => {
  const f = fixture(); await f.controller.start();
  f.browser.tabs.onRemoved.emit(99); await flush(); assert.equal(f.controller.getResult(), null);
  f.browser.tabs.onRemoved.emit(17); await flush();
  safeResult(f, /закрыта/); assert.deepEqual(f.calls.removed, []);
});

test('timeout cannot interrupt claimed headers while clipboard is pending', async () => {
  const copying = deferred(); const f = fixture({ copy: () => copying.promise });
  await f.controller.start(); const timeout = [...f.scheduled.values()][0].fn;
  f.request(); timeout(); await flush();
  assert.equal(f.calls.clipboard.length, 1); assert.equal(f.calls.windows.length, 0);
  copying.resolve(); await flush();
  assert.equal(f.controller.getResult().ok, true); assert.equal(f.calls.windows.length, 1);
});

test('closing tab during copy does not generate a second completion', async () => {
  const copying = deferred(); const f = fixture({ copy: () => copying.promise });
  await f.controller.start(); f.request();
  f.browser.tabs.onRemoved.emit(17); copying.resolve(); await flush();
  assert.equal(f.controller.getResult().ok, true);
  assert.equal(f.calls.windows.length, 1); assert.deepEqual(f.calls.removed, []);
});

test('popup failure falls back to badge/title but still closes Spotify', async () => {
  const f = fixture({ window: () => { throw Error('PRIVATE_ERROR'); } });
  await f.controller.start(); f.request(); await flush();
  assert.deepEqual(f.calls.removed, [17]);
  assert.ok(f.calls.badges.includes('!'));
  assert.match(f.calls.titles.at(-1), /окно/);
  assert.doesNotMatch(f.calls.titles.at(-1), /PRIVATE/);
});

test('badge/title failure does not prevent popup or cleanup', async () => {
  const fail = () => { throw Error('PRIVATE_ERROR'); };
  const f = fixture({ badge: fail, title: fail });
  await f.controller.start(); f.request(); await flush();
  assert.equal(f.calls.windows.length, 1); assert.deepEqual(f.calls.removed, [17]);
});

test('can start again after completion while the old result window still exists', async () => {
  const f = fixture(); await f.controller.start(); f.request(); await flush();
  await f.controller.start(); assert.equal(f.controller.getResult(), null);
  f.request(); await flush();
  assert.equal(f.calls.created.length, 2); assert.equal(f.calls.windows.length, 2);
});

test('late tab creation after timeout is cleaned up without navigation', async () => {
  const creating = deferred(); const f = fixture({ create: () => creating.promise });
  const started = f.controller.start(); await flush();
  [...f.scheduled.values()][0].fn(); await flush();
  creating.resolve({ id: 17 }); await started; await flush();
  safeResult(f, /60 секунд/);
  assert.deepEqual(f.calls.updated, []); assert.deepEqual(f.calls.removed, [17]);
});

test('result stays pending until cleanup finishes, then exposes a late close error', async () => {
  const removal = deferred();
  const f = fixture({ remove: async () => { await removal.promise; throw Error('PRIVATE_ERROR'); } });
  await f.controller.start(); f.request(); await flush();
  assert.equal(f.controller.getResult().complete, false);
  removal.resolve(); await flush();
  assert.equal(f.controller.getResult().complete, true);
  safeResult(f, /закрыть вкладку/);
});

test('old popup retains its own late cleanup error across a new operation', async () => {
  const removal = deferred();
  const f = fixture({ remove: async () => { await removal.promise; throw Error('PRIVATE_ERROR'); } });
  await f.controller.start(); f.request(); await flush();
  assert.equal(f.controller.getResult('1').complete, false);
  removal.resolve(); await flush();
  await f.controller.start();
  assert.equal(f.controller.getResult(), null);
  assert.equal(f.controller.getResult('1')?.ok, false);
  assert.match(f.controller.getResult('1')?.message ?? '', /закрыть вкладку/);
  assert.equal(f.controller.getResult('1')?.complete, true);
  assert.equal(f.controller.getResult('999'), null);
  f.browser.windows.onRemoved.emit(23);
  assert.equal(f.controller.getResult('1'), null);
});
