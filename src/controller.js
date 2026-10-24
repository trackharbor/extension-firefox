import { formatHeaders, isTargetRequest } from './headers.js';

const SPOTIFY_URL = 'https://open.spotify.com/';
const TIMEOUT_MS = 60_000;

export function createController({ browser, writeClipboard, timers }) {
  let active = null;
  let result = null;
  let observersReady = true;

  // UI failures must never prevent closing the tab. Never expose raw errors.
  async function setAction(text, title) {
    await Promise.allSettled([
      Promise.resolve().then(() => browser.browserAction.setBadgeText({ text })),
      Promise.resolve().then(() => browser.browserAction.setTitle({ title })),
    ]);
  }

  async function finish(operation, outcome, text = null) {
    if (operation !== active || operation.finishing) return;
    operation.finishing = true;
    timers.clearTimeout(operation.timer);

    if (text !== null) {
      try {
        await writeClipboard(text);
      } catch {
        outcome = { ok: false, message: 'Не удалось скопировать заголовки в буфер обмена.' };
      } finally {
        text = null;
      }
    }
    result = outcome;
    await setAction(result.ok ? 'OK' : '!', result.message);
    try {
      await browser.windows.create({
        url: browser.runtime.getURL('result.html'),
        type: 'popup', width: 440, height: 280,
      });
    } catch {
      result = {
        ok: false,
        message: `${result.message} Не удалось открыть окно результата; сообщение доступно при наведении на иконку.`,
      };
      await setAction('!', result.message);
    }

    // A timeout may fire before tabs.create resolves. Keep owning the operation
    // until its late-created tab has been removed; never navigate it afterwards.
    try { await operation.created; } catch { /* Creation already has a safe result. */ }
    if (operation.tabId !== null && !operation.closed) {
      try {
        await browser.tabs.remove(operation.tabId);
      } catch {
        if (!operation.closed) {
          result = {
            ok: false,
            message: `${result.message} Не удалось закрыть вкладку Spotify. Закройте её вручную.`,
          };
          await setAction('!', result.message);
        }
      }
    }
    if (active === operation) active = null;
  }

  async function start() {
    if (active !== null) return;
    const operation = { tabId: null, closed: false, finishing: false, sawRequest: false };
    active = operation;
    result = null;
    void setAction('…', 'Ожидание заголовков Spotify (до 60 секунд)…');
    operation.timer = timers.setTimeout(() => {
      const message = operation.sawRequest
        ? 'За 60 секунд не получены корректные authorization и client-token из одного запроса. Войдите в Spotify и повторите.'
        : 'За 60 секунд нужный запрос Spotify не появился. Проверьте вход в аккаунт и подключение к сети.';
      void finish(operation, { ok: false, message });
    }, TIMEOUT_MS);

    if (!observersReady) {
      await finish(operation, { ok: false, message: 'Не удалось включить перехват запросов. Проверьте разрешения расширения.' });
      return;
    }

    operation.created = Promise.resolve().then(() => browser.tabs.create({
      url: 'about:blank', active: true,
    })).then(tab => { operation.tabId = tab.id; });
    try {
      await operation.created;
    } catch {
      await finish(operation, { ok: false, message: 'Не удалось открыть вкладку Spotify.' });
      return;
    }
    if (operation.finishing) return;
    try {
      await browser.tabs.update(operation.tabId, { url: SPOTIFY_URL });
    } catch {
      await finish(operation, { ok: false, message: 'Не удалось открыть Spotify в созданной вкладке.' });
    }
  }

  try {
    browser.webRequest.onBeforeSendHeaders.addListener(details => {
      const operation = active;
      if (!operation || operation.finishing || details.tabId !== operation.tabId || !isTargetRequest(details.url)) return;
      operation.sawRequest = true;
      const text = formatHeaders(details.requestHeaders);
      if (text !== null) {
        void finish(operation, {
          ok: true,
          message: 'всё ок — заголовки скопированы. Вставьте их в окно авторизации Spotify в TrackHarbor.',
        }, text);
      }
    }, { urls: ['https://api-partner.spotify.com/pathfinder/v2/query*'] }, ['requestHeaders']);

    browser.webRequest.onErrorOccurred.addListener(details => {
      const operation = active;
      if (!operation || operation.finishing || details.tabId !== operation.tabId) return;
      if (isTargetRequest(details.url)) {
        void finish(operation, { ok: false, message: 'Не удалось выполнить запрос Spotify. Проверьте подключение к сети.' });
      } else if (details.type === 'main_frame') {
        void finish(operation, { ok: false, message: 'Не удалось загрузить страницу Spotify. Проверьте подключение к сети.' });
      }
    }, { urls: ['https://open.spotify.com/*', 'https://api-partner.spotify.com/*'] });

    browser.tabs.onRemoved.addListener(tabId => {
      const operation = active;
      if (!operation || operation.tabId !== tabId) return;
      operation.closed = true;
      if (!operation.finishing) {
        void finish(operation, { ok: false, message: 'Вкладка Spotify закрыта до получения заголовков. Операция прервана.' });
      }
    });
  } catch {
    observersReady = false;
  }

  return { start, getResult: () => result === null ? null : { ...result, complete: active === null } };
}
