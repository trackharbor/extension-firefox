import test from 'node:test';
import assert from 'node:assert/strict';

test('background serves operation results only to its packaged result page', async () => {
  let receive;
  const event = { addListener() {} };
  const resultURL = 'moz-extension://test/result.html';
  globalThis.browser = {
    runtime: {
      id: 'test', getURL: () => resultURL,
      onMessage: { addListener(fn) { receive = fn; } },
    },
    browserAction: { onClicked: event },
    webRequest: { onBeforeSendHeaders: event, onErrorOccurred: event },
    tabs: { onRemoved: event }, windows: { onRemoved: event },
  };
  try {
    await import('../src/background.js');
    const message = { type: 'get-result', operationId: '1' };
    const sender = { id: 'test', url: `${resultURL}#1` };
    assert.equal(await receive(message, sender), null);
    assert.equal(receive(message, { ...sender, id: 'other' }), undefined);
    assert.equal(receive(message, { ...sender, url: 'https://evil.test/' }), undefined);
    assert.equal(receive(message, { ...sender, url: `${resultURL}.evil#1` }), undefined);
    assert.equal(receive({ type: 'other' }, sender), undefined);
  } finally {
    delete globalThis.browser;
  }
});
