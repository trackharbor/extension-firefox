import { createController } from './controller.js';

const controller = createController({
  browser,
  writeClipboard: text => navigator.clipboard.writeText(text),
  timers: {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
  },
});

browser.browserAction.onClicked.addListener(() => {
  void controller.start();
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'get-result' || sender.id !== browser.runtime.id ||
      sender.url !== browser.runtime.getURL('result.html')) return undefined;
  return Promise.resolve(controller.getResult());
});
