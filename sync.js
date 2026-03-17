const { getPendingChanges, markSynced, markError, resetErrors, upsertProduct } = require('./db');

// Адрес 1С — публикация на IIS порт 80, путь /unf
const C1_BASE_URL = 'http://localhost/unf';
const C1_USER = 'Admin'; // логин 1С — замените на свой
const C1_PASS = 'Zakaz#38013759';              // пароль 1С — замените на свой

function authHeader() {
  return 'Basic ' + Buffer.from(`${C1_USER}:${C1_PASS}`).toString('base64');
}

async function fetch1C(path, options = {}) {
  const { default: fetch } = await import('node-fetch');
  const url = `${C1_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader(),
      ...(options.headers || {}),
    },
    timeout: 15000,
  });
  return res;
}

// Загрузить товар из 1С и положить в кэш
async function fetchAndCacheProduct(articul) {
  try {
    const res = await fetch1C(`/hs/sklad/product?id=${encodeURIComponent(articul)}`);
    if (res.ok) {
      const data = await res.json();
      upsertProduct(data);
      return data;
    }
  } catch (e) {
    console.error(`[sync] Не удалось загрузить товар ${articul}:`, e.message);
  }
  return null;
}

// Отправить одно изменение в 1С
async function sendChange(change) {
  const { type, payload } = change;

  if (type === 'update-product') {
    const res = await fetch1C('/hs/sklad/update-product', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`1С вернула ${res.status}: ${text}`);
    }
    return;
  }

  if (type === 'document') {
    const res = await fetch1C('/hs/sklad/post-document', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`1С вернула ${res.status}: ${text}`);
    }
    return;
  }

  throw new Error(`Неизвестный тип изменения: ${type}`);
}

// Основная функция синхронизации
async function runSync(log) {
  log = log || console.log;

  log('[sync] Запуск синхронизации с 1С...');
  resetErrors(); // повторяем ошибочные

  const changes = getPendingChanges();
  if (!changes.length) {
    log('[sync] Нет изменений для отправки');
    return { sent: 0, errors: 0 };
  }

  log(`[sync] Найдено изменений: ${changes.length}`);
  let sent = 0, errors = 0;

  for (const change of changes) {
    try {
      await sendChange(change);
      markSynced(change.id);
      sent++;
      log(`[sync] OK: #${change.id} (${change.type})`);
    } catch (e) {
      markError(change.id, e.message);
      errors++;
      log(`[sync] ОШИБКА: #${change.id} — ${e.message}`);
    }
  }

  log(`[sync] Готово. Отправлено: ${sent}, ошибок: ${errors}`);
  return { sent, errors };
}

module.exports = { runSync, fetchAndCacheProduct };
