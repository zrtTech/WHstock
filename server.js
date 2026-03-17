const fs   = require('fs');
const path = require('path');
const net  = require('net');
const express = require('express');
const cron    = require('node-cron');
const { getProduct, updateProductCache, addPendingChange, upsertProduct, getStats } = require('./db');
const { runSync, fetchAndCacheProduct } = require('./sync');

const app  = express();
const PORT = 3000;

// ── Настройки ──────────────────────────────────────────────────
const API_KEY      = 'zX9#mK4$pL7@nQ2&wR8!vT3^hY6*jB5'; // ЗАМЕНИТЕ НА СВОЙ
const PRINTERS_PATH = path.join(__dirname, 'printers.json');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// 1С — адрес берём из sync.js (там же прописан)
const C1_BASE_URL = 'http://localhost/unf';
const C1_USER     = 'Admin';       // логин 1С
const C1_PASS     = 'Zakaz#38013759'; // пароль 1С

// ── Middleware ─────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// CORS — разрешаем планшетам в сети обращаться к серверу
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Логирование запросов
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// Проверка API-ключа (кроме /health)
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Неверный API-ключ' });
  }
  next();
});

// ══════════════════════════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ══════════════════════════════════════════════════════════════

// Загрузить список принтеров из printers.json
function loadPrinters() {
  try { return JSON.parse(fs.readFileSync(PRINTERS_PATH, 'utf8')); }
  catch { return []; }
}

// Подставить переменные {{KEY}} в ZPL-шаблон
function applyTemplate(template, data) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => String(data[key] ?? ''));
}

// Отправить ZPL на TCP-принтер (Zebra)
function sendToTcp(ip, port, zpl) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: Number(port || 9100) }, () => {
      socket.write(zpl, 'utf8', () => { socket.end(); resolve(); });
    });
    socket.setTimeout(5000);
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`Таймаут подключения к ${ip}:${port}`)); });
    socket.on('error', reject);
  });
}

// Отправить файл на Windows-принтер через команду print
function sendToWindowsPrinter(windowsPrinterName, filePath) {
  return new Promise((resolve, reject) => {
    const { exec } = require('child_process');
    // Печатаем PDF через Adobe Reader или SumatraPDF если установлен
    const cmd = `print /D:"${windowsPrinterName}" "${filePath}"`;
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Запрос к 1С
async function fetch1C(urlPath, options = {}) {
  const { default: fetch } = await import('node-fetch');
  const auth = 'Basic ' + Buffer.from(`${C1_USER}:${C1_PASS}`).toString('base64');
  const res = await fetch(`${C1_BASE_URL}${urlPath}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      ...(options.headers || {}),
    },
  });
  return res;
}

// ══════════════════════════════════════════════════════════════
//  ЭНДПОИНТЫ — ОСНОВНЫЕ
// ══════════════════════════════════════════════════════════════

// GET /health — проверка что сервер живой
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET /product?id=АРТИКУЛ — поиск товара
app.get('/product', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Нужен параметр id' });

  let product = getProduct(id);
  if (!product) {
    product = await fetchAndCacheProduct(id);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
  }
  res.json(product);
});

// POST /update-product — менеджер изменил данные товара
app.post('/update-product', (req, res) => {
  const p = req.body;
  if (!p || !p.articul) return res.status(400).json({ error: 'Нужен articul' });
  updateProductCache(p);
  addPendingChange('update-product', p);
  console.log(`[queue] update-product: артикул ${p.articul}`);
  res.json({ ok: true, message: 'Сохранено. Будет отправлено в 1С при синхронизации.' });
});

// POST /post-document — документ (приёмка/перемещение/списание/цены)
app.post('/post-document', (req, res) => {
  const doc = req.body;
  if (!doc || !doc.type) return res.status(400).json({ error: 'Нужен type документа' });
  addPendingChange('document', doc);
  console.log(`[queue] document: тип ${doc.type}, id ${doc.data?.id}`);
  res.json({ ok: true, message: 'Документ поставлен в очередь.' });
});

// POST /trigger-sync — ручной запуск синхронизации
app.post('/trigger-sync', async (req, res) => {
  const logs = [];
  try {
    const result = await runSync(msg => { logs.push(msg); console.log(msg); });
    res.json({ ok: true, ...result, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, logs });
  }
});

// GET /stats — статистика
app.get('/stats', (req, res) => {
  res.json(getStats());
});

// POST /cache-product — принудительно обновить один товар из 1С
app.post('/cache-product', async (req, res) => {
  const { articul } = req.body;
  if (!articul) return res.status(400).json({ error: 'Нужен articul' });
  const product = await fetchAndCacheProduct(articul);
  if (!product) return res.status(404).json({ error: 'Не удалось загрузить из 1С' });
  res.json({ ok: true, product });
});

// ══════════════════════════════════════════════════════════════
//  ЭНДПОИНТЫ — СКЛАДЫ И ЯЧЕЙКИ
// ══════════════════════════════════════════════════════════════

// GET /warehouses — список складов из 1С
app.get('/warehouses', async (req, res) => {
  try {
    const r = await fetch1C('/hs/sklad/warehouses');
    if (r.ok) {
      const data = await r.json();
      return res.json(data);
    }
    // Если 1С не ответила — возвращаем дефолт
    res.json(['Магазин', 'Склад', 'Розница']);
  } catch (e) {
    console.error('[warehouses] Ошибка:', e.message);
    res.json(['Магазин', 'Склад', 'Розница']);
  }
});

// GET /cells — список ячеек из 1С
app.get('/cells', async (req, res) => {
  try {
    const r = await fetch1C('/hs/sklad/cells');
    if (r.ok) {
      const data = await r.json();
      return res.json(data);
    }
    res.json([]);
  } catch (e) {
    console.error('[cells] Ошибка:', e.message);
    res.json([]);
  }
});

// ══════════════════════════════════════════════════════════════
//  ЭНДПОИНТЫ — ПЕЧАТЬ
// ══════════════════════════════════════════════════════════════

// GET /printers — список принтеров
app.get('/printers', (req, res) => {
  res.json({ printers: loadPrinters() });
});

// POST /print-label — печать клиентской или складской этикетки (ZPL → Zebra TCP)
app.post('/print-label', async (req, res) => {
  try {
    const labelType    = req.body.labelType === 'warehouse' ? 'warehouse' : 'client';
    const templateFile = path.join(TEMPLATES_DIR, `${labelType}-label.zpl`);

    if (!fs.existsSync(templateFile)) {
      return res.status(500).json({ error: `Шаблон не найден: ${labelType}-label.zpl` });
    }

    const tpl = fs.readFileSync(templateFile, 'utf8');
    const zpl = applyTemplate(tpl, {
      BRAND:       req.body.brand        || '',
      ARTICUL:     req.body.articul      || '',
      COMPOSITION: req.body.composition  || '',
      WIDTH:       req.body.width        || '',
      DENSITY:     req.body.density      || '',
      PRICE:       Number(req.body.priceRub || 0).toFixed(2),
      EAN13:       req.body.ean13        || req.body.articul || '',
      CHAR_NAME:   req.body.charName     || '',
      DATE:        new Date().toLocaleDateString('ru-RU'),
      STOCK_LINES: Array.isArray(req.body.stockRows)
        ? req.body.stockRows.map(x => `${x.warehouse || ''} ${x.cell || ''} ${x.meters || ''}м`).join(' | ')
        : '',
      TOTAL_METERS: Array.isArray(req.body.stockRows)
        ? req.body.stockRows.reduce((s, x) => s + parseFloat(x.meters || 0), 0).toFixed(2) + ' м'
        : '',
      STOCK_LINE_1: Array.isArray(req.body.stockRows) && req.body.stockRows[0]
        ? `${req.body.stockRows[0].warehouse || ''} ${req.body.stockRows[0].cell || ''} ${req.body.stockRows[0].meters || ''}м`
        : '',
      STOCK_LINE_2: Array.isArray(req.body.stockRows) && req.body.stockRows[1]
        ? `${req.body.stockRows[1].warehouse || ''} ${req.body.stockRows[1].cell || ''} ${req.body.stockRows[1].meters || ''}м`
        : '',
      STOCK_LINE_3: Array.isArray(req.body.stockRows) && req.body.stockRows[2]
        ? `${req.body.stockRows[2].warehouse || ''} ${req.body.stockRows[2].cell || ''} ${req.body.stockRows[2].meters || ''}м`
        : '',
    });

    const printers = loadPrinters();
    const printer  = printers.find(p => p.name === req.body.printerName)
                  || printers.find(p => p.defaultFor === `${labelType}-label`);

    if (!printer) {
      return res.status(400).json({ error: `Принтер не найден: ${req.body.printerName || labelType}` });
    }

    if (printer.type === 'tcp') {
      await sendToTcp(printer.ip, printer.port || 9100, zpl);
      console.log(`[print] ${labelType} → ${printer.ip}:${printer.port || 9100} ОК`);
      return res.json({ ok: true, printer: printer.name, labelType });
    }

    return res.status(400).json({ error: 'Принтер типа windows не поддерживается для ZPL-этикеток' });

  } catch (e) {
    console.error('[print-label] Ошибка:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// POST /print-hanger — хангер: 1С генерирует PDF, мы печатаем на Windows-принтер
app.post('/print-hanger', async (req, res) => {
  const { articul, uid, printerName } = req.body;
  if (!articul) return res.status(400).json({ error: 'Нужен articul' });

  try {
    // Запрашиваем PDF хангера у 1С
    const r = await fetch1C(
      `/hs/sklad/hanger-pdf?articul=${encodeURIComponent(articul)}${uid ? '&uid=' + encodeURIComponent(uid) : ''}`,
      { headers: { 'Accept': 'application/pdf' } }
    );

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `1С вернула ${r.status}: ${txt}` });
    }

    // Сохраняем PDF во временный файл
    const buf      = await r.buffer();
    const tmpFile  = path.join(require('os').tmpdir(), `hanger_${articul}_${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, buf);

    // Находим принтер хангера
    const printers = loadPrinters();
    const printer  = printers.find(p => p.name === printerName)
                  || printers.find(p => p.defaultFor === 'hanger');

    if (!printer) {
      fs.unlinkSync(tmpFile);
      return res.status(400).json({ error: 'Принтер хангера не настроен' });
    }

    // Печатаем на Windows-принтер
    if (printer.type === 'windows') {
      await sendToWindowsPrinter(printer.windowsName, tmpFile);
      console.log(`[print] hanger ${articul} → ${printer.windowsName} ОК`);
    }

    // Удаляем временный файл
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 5000);

    res.json({ ok: true, printer: printer.name, articul });

  } catch (e) {
    console.error('[print-hanger] Ошибка:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /print-a4 — печать листа А4 с 10 товарами (PDF из 1С → Windows-принтер)
app.post('/print-a4', async (req, res) => {
  const { articuls, printerName } = req.body;
  if (!Array.isArray(articuls) || !articuls.length) {
    return res.status(400).json({ error: 'Нужен массив articuls' });
  }

  try {
    // Запрашиваем PDF у 1С
    const r = await fetch1C('/hs/sklad/a4-pdf', {
      method: 'POST',
      body: JSON.stringify({ articuls: articuls.slice(0, 10) }),
      headers: { 'Accept': 'application/pdf' },
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).json({ error: `1С вернула ${r.status}: ${txt}` });
    }

    const buf     = await r.buffer();
    const tmpFile = path.join(require('os').tmpdir(), `a4_${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, buf);

    const printers = loadPrinters();
    const printer  = printers.find(p => p.name === printerName)
                  || printers.find(p => p.defaultFor === 'a4');

    if (!printer) {
      fs.unlinkSync(tmpFile);
      return res.status(400).json({ error: 'Принтер A4 не настроен' });
    }

    if (printer.type === 'tcp') {
      // TCP A4-принтер — отправляем как есть
      await sendToTcp(printer.ip, printer.port || 9100, buf.toString('binary'));
    } else if (printer.type === 'windows') {
      await sendToWindowsPrinter(printer.windowsName, tmpFile);
    }

    console.log(`[print] a4 (${articuls.length} поз.) → ${printer.name} ОК`);
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 5000);

    res.json({ ok: true, printer: printer.name, count: articuls.length });

  } catch (e) {
    console.error('[print-a4] Ошибка:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  АВТОСИНХРОНИЗАЦИЯ
// ══════════════════════════════════════════════════════════════

// Каждый день в 23:00
cron.schedule('0 23 * * *', async () => {
  console.log('[cron] Запуск ночной синхронизации...');
  await runSync();
}, { timezone: 'Europe/Moscow' });

// ── Запуск ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
┌──────────────────────────────────────┐
│   Буферный сервер запущен            │
│   http://localhost:${PORT}              │
│   Синхронизация с 1С: каждый день    │
│   в 23:00                            │
└──────────────────────────────────────┘
`);
});