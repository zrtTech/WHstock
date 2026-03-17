const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'products.db'));

// Создаём таблицы при первом запуске
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    articul TEXT PRIMARY KEY,
    name TEXT,
    priceRub REAL,
    width TEXT,
    composition TEXT,
    brand TEXT,
    density TEXT,
    qty REAL,
    stock_json TEXT,
    images_json TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS pending_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT,
    error TEXT
  );
`);

// --- Товары ---

function getProduct(articul) {
  const row = db.prepare('SELECT * FROM products WHERE articul = ?').get(articul);
  if (!row) return null;
  return {
    articul: row.articul,
    name: row.name,
    priceRub: row.priceRub,
    width: row.width,
    composition: row.composition,
    brand: row.brand,
    density: row.density,
    qty: row.qty,
    stockRows: row.stock_json ? JSON.parse(row.stock_json) : [],
    images: row.images_json ? JSON.parse(row.images_json) : [],
  };
}

function upsertProduct(p) {
  db.prepare(`
    INSERT INTO products (articul, name, priceRub, width, composition, brand, density, qty, stock_json, images_json, updated_at)
    VALUES (@articul, @name, @priceRub, @width, @composition, @brand, @density, @qty, @stock_json, @images_json, datetime('now'))
    ON CONFLICT(articul) DO UPDATE SET
      name=excluded.name, priceRub=excluded.priceRub, width=excluded.width,
      composition=excluded.composition, brand=excluded.brand, density=excluded.density,
      qty=excluded.qty, stock_json=excluded.stock_json, images_json=excluded.images_json,
      updated_at=excluded.updated_at
  `).run({
    articul: p.articul,
    name: p.name || '',
    priceRub: p.priceRub || 0,
    width: p.width || '',
    composition: p.composition || '',
    brand: p.brand || '',
    density: p.density || '',
    qty: p.qty || 0,
    stock_json: JSON.stringify(p.stockRows || []),
    images_json: JSON.stringify(p.images || []),
  });
}

function updateProductCache(p) {
  // Обновляем только поля которые пришли из приложения
  const existing = getProduct(p.articul);
  if (existing) {
    const merged = { ...existing, ...p };
    if (p.warehouse !== undefined) {
      merged.stockRows = existing.stockRows.length
        ? [{ ...existing.stockRows[0], warehouse: p.warehouse, cell: p.cell, meters: p.meters, qty: p.qty }, ...existing.stockRows.slice(1)]
        : [{ warehouse: p.warehouse, cell: p.cell || '-', meters: p.meters || 0, qty: p.qty || 0 }];
    }
    upsertProduct(merged);
  }
}

// --- Очередь изменений ---

function addPendingChange(type, payload) {
  db.prepare(`
    INSERT INTO pending_changes (type, payload_json, status)
    VALUES (?, ?, 'new')
  `).run(type, JSON.stringify(payload));
}

function getPendingChanges() {
  return db.prepare(`SELECT * FROM pending_changes WHERE status = 'new' ORDER BY id`).all()
    .map(r => ({ ...r, payload: JSON.parse(r.payload_json) }));
}

function markSynced(id) {
  db.prepare(`UPDATE pending_changes SET status='synced', synced_at=datetime('now') WHERE id=?`).run(id);
}

function markError(id, error) {
  db.prepare(`UPDATE pending_changes SET status='error', error=? WHERE id=?`).run(String(error), id);
}

function resetErrors() {
  // Сбрасываем ошибочные записи в 'new' для повторной попытки
  db.prepare(`UPDATE pending_changes SET status='new', error=NULL WHERE status='error'`).run();
}

function getStats() {
  const total = db.prepare(`SELECT COUNT(*) as c FROM pending_changes`).get().c;
  const pending = db.prepare(`SELECT COUNT(*) as c FROM pending_changes WHERE status='new'`).get().c;
  const synced = db.prepare(`SELECT COUNT(*) as c FROM pending_changes WHERE status='synced'`).get().c;
  const errors = db.prepare(`SELECT COUNT(*) as c FROM pending_changes WHERE status='error'`).get().c;
  const products = db.prepare(`SELECT COUNT(*) as c FROM products`).get().c;
  return { total, pending, synced, errors, products };
}

module.exports = { getProduct, upsertProduct, updateProductCache, addPendingChange, getPendingChanges, markSynced, markError, resetErrors, getStats };
