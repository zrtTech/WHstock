const fs = require('fs');
const path = require('path');
const net = require('net');
const express = require('express');

const app = express();
app.use(express.json({ limit: '2mb' }));

const printersPath = path.join(__dirname, 'printers.json');
const templatesDir = path.join(__dirname, 'templates');

function loadPrinters() {
  try { return JSON.parse(fs.readFileSync(printersPath, 'utf8')); }
  catch { return []; }
}

function applyTemplate(template, data) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => String(data[key] ?? ''));
}

function sendToTcp(ip, port, zpl) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: Number(port || 9100) }, () => {
      socket.write(zpl, 'utf8', () => { socket.end(); resolve(); });
    });
    socket.on('error', reject);
  });
}

app.get('/printers', (_req, res) => {
  res.json({ printers: loadPrinters() });
});

app.post('/print-label', async (req, res) => {
  try {
    const labelType = req.body.labelType === 'warehouse' ? 'warehouse' : 'client';
    const templateFile = path.join(templatesDir, `${labelType}-label.zpl`);
    const tpl = fs.readFileSync(templateFile, 'utf8');
    const zpl = applyTemplate(tpl, {
      BRAND: req.body.brand,
      ARTICUL: req.body.articul,
      COMPOSITION: req.body.composition,
      WIDTH: req.body.width,
      DENSITY: req.body.density,
      PRICE: Number(req.body.priceRub || 0).toFixed(2),
      EAN13: req.body.ean13 || '',
      DATE: new Date().toLocaleDateString('ru-RU'),
      STOCK_LINES: Array.isArray(req.body.stockRows)
        ? req.body.stockRows.map(x => `${x.warehouse || ''} ${x.cell || ''} ${x.meters || ''}`).join(' | ')
        : ''
    });

    const printers = loadPrinters();
    const printer = printers.find(p => p.name === req.body.printerName) || printers.find(p => p.defaultFor === `${labelType}-label`);
    if (!printer) return res.status(400).json({ error: 'printer not found' });

    if (printer.type === 'tcp') {
      await sendToTcp(printer.ip, printer.port || 9100, zpl);
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'windows print not implemented in example' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/print-a4', async (req, res) => {
  return res.status(501).json({ error: 'Implement 1C PDF fetch and Windows queue print here', items: req.body.articuls || [] });
});

app.post('/print-hanger', async (req, res) => {
  return res.status(501).json({ error: 'Implement 1C hanger PDF fetch and Windows queue print here', articul: req.body.articul });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Print server example listening on ${PORT}`));
