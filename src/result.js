const statusElement = document.getElementById('status');
const messageElement = document.getElementById('message');
const operationId = window.location.hash.slice(1);
document.getElementById('close').addEventListener('click', () => window.close());

async function refresh() {
  try {
    const result = await browser.runtime.sendMessage({ type: 'get-result', operationId });
    if (!result) throw new Error('No result');
    statusElement.textContent = result.ok ? 'всё ок' : 'Ошибка';
    statusElement.dataset.ok = String(result.ok);
    messageElement.textContent = result.message;
    // A close error may arrive after this window was created. Once cleanup is
    // complete, freeze this window so another run cannot overwrite its result.
    if (!result.complete) setTimeout(refresh, 250);
  } catch {
    statusElement.textContent = 'Ошибка';
    statusElement.dataset.ok = 'false';
    messageElement.textContent = 'Не удалось получить результат операции. Повторите запуск через иконку расширения.';
  }
}

void refresh();
