import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function render(response) {
  const elements = Object.fromEntries(['status', 'message', 'close'].map(id => [id, {
    textContent: '', dataset: {}, addEventListener(event, fn) { this[event] = fn; },
  }]));
  const callbacks = [];
  let closed = false;
  const code = await readFile(new URL('../src/result.js', import.meta.url), 'utf8');
  vm.runInNewContext(code, {
    document: { getElementById: id => elements[id] },
    browser: { runtime: { sendMessage: async message => {
      if (response instanceof Error) throw response;
      if (typeof response === 'function') return response(message);
      return response;
    } } },
    window: { location: { hash: '#1' }, close() { closed = true; } },
    setTimeout: fn => callbacks.push(fn),
  });
  await new Promise(setImmediate);
  return { elements, callbacks, isClosed: () => closed };
}

test('shows success text, stops polling completed operations and closes on click', async () => {
  const ui = await render({ ok: true, message: 'всё ок — скопировано', complete: true });
  assert.equal(ui.elements.status.textContent, 'всё ок');
  assert.equal(ui.elements.message.textContent, 'всё ок — скопировано');
  assert.equal(ui.callbacks.length, 0);
  ui.elements.close.click(); assert.equal(ui.isClosed(), true);
});

test('polls while tab cleanup is pending to show a late close error', async () => {
  const ui = await render({ ok: true, message: 'скопировано', complete: false });
  assert.equal(ui.callbacks.length, 1);
});

test('displays errors as text, not HTML', async () => {
  const ui = await render({ ok: false, message: '<b>Ошибка</b>', complete: true });
  assert.equal(ui.elements.status.textContent, 'Ошибка');
  assert.equal(ui.elements.message.textContent, '<b>Ошибка</b>');
});

for (const response of [null, Error('sensitive internal details')]) {
  test(`handles missing background result safely: ${response === null ? 'null' : 'rejection'}`, async () => {
    const ui = await render(response);
    assert.equal(ui.elements.status.textContent, 'Ошибка');
    assert.match(ui.elements.message.textContent, /результат/);
    assert.doesNotMatch(ui.elements.message.textContent, /sensitive/);
    assert.equal(ui.callbacks.length, 0);
  });
}

test('polls its own operation when a newer run changes the global result', async () => {
  const old = { ok: true, message: 'первый результат', complete: false };
  let current = old;
  const ui = await render(message => message.operationId === '1' ? old : current);
  current = { ok: false, message: 'ошибка другой операции', complete: true };
  old.complete = true;
  await ui.callbacks[0]();
  assert.equal(ui.elements.status.textContent, 'всё ок');
  assert.equal(ui.elements.message.textContent, 'первый результат');
});
