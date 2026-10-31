/* Standalone regression tests for the interactive v7 HTML mock.
   Run: node UI_PROTOTYPE_V7.test.cjs
   No npm dependencies. No 1C, hardware, or network access.
*/
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "UI_PROTOTYPE_V7.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script, "Inline script is present");

function boot(storage = {}) {
  let htmlOutput = "";
  const elements = {};
  const root = {
    set innerHTML(v) { htmlOutput = v; },
    get innerHTML() { return htmlOutput; },
    querySelectorAll() { return []; }
  };
  const document = {
    getElementById(id) {
      if (id === "app") return root;
      if (!htmlOutput.includes('id="'+id+'"')) return null;
      return elements[id] ||= {
        value: "", checked: true, selectionStart: 0,
        focus() {}, setSelectionRange() {}
      };
    },
    createElement() { return { click() {} }; }
  };
  const window = { confirm: () => true, print() { throw Error("Printing forbidden"); } };
  const localStorage = {
    getItem(k) { return storage[k] ?? null; },
    setItem(k, v) { storage[k] = v; }
  };
  const context = {
    window, document, localStorage, Blob: class {},
    URL: { createObjectURL: () => "", revokeObjectURL() {} },
    setTimeout: () => {}
  };
  vm.runInNewContext(script[1], context, { filename: "UI_PROTOTYPE_V7.html" });
  return {
    api: window.__v7Test, storage, elements,
    html: () => htmlOutput,
    set(id, value) { document.getElementById(id).value = value; },
    press(id, value) {
      const el = elements[id];
      assert.ok(el?.onkeydown, "Scan field wired: " + id);
      el.value = value;
      el.onkeydown({ key: "Enter", preventDefault() {} });
    }
  };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test("Initial frozen B inspection: 50 wrong and 8 missing", () => {
  const { api } = boot();
  assert.equal(api.allIssues("wrong").length, 50);
  assert.equal(api.allIssues("missing").length, 8);
});
test("Wrong sample: one-click physical return preserves accounting location and historical snapshot", () => {
  const { api } = boot(), x = api.db.samples[0], original = x.loc;
  api.act("rack-B-01-02"); api.act("issues-wrong");
  api.act("single-return-S-000001");
  assert.equal(api.allIssues("wrong").length, 49);
  assert.equal(x.loc, original);
  assert.equal(api.issues(api.db.inspections[0], "wrong", false).length, 50);
  assert.ok(api.db.audit.some(x => x.kind === "Физический возврат на место"));
});
test("A new inspection on A does not rewrite B results", () => {
  const t = boot(), a = t.api;
  a.act("rack-A-02-03"); a.act("inspection"); a.startInspection();
  t.press("inspection-scan", "S-000001");
  assert.equal(a.db.inspections.find(x => x.status === "active").observations.length, 1);
  a.finishInspection();
  assert.equal(a.allIssues("wrong").length, 50);
  assert.equal(a.db.inspections[0].observations.length, 62);
});
test("Old resolutions do not hide missing items in a new inspection", () => {
  const { api } = boot();
  api.act("rack-B-01-02"); api.act("issues-missing");
  api.act("select-all"); api.act("bulk-found"); api.commit(false);
  assert.equal(api.allIssues("missing").length, 0);
  api.act("inspection"); api.startInspection(); api.finishInspection();
  assert.equal(api.allIssues("missing").length, 20);
});
test("Bulk physical return resolves 50 wrong samples after explicit confirmation", () => {
  const { api } = boot();
  api.act("rack-B-01-02"); api.act("issues-wrong"); api.act("select-all");
  api.act("bulk-return"); assert.equal(api.S.page, "confirm");
  api.commit(false);
  assert.equal(api.allIssues("wrong").length, 0);
  assert.equal(api.db.audit.filter(x => x.kind === "Физический возврат на место").length, 50);
});
test("Found missing on another rack: explicit action and resolution", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("issues-missing");
  a.act("single-found-other-S-000051");
  t.set("issue-target", "A-02-03"); a.act("issue-target-submit");
  assert.equal(a.S.confirm.action, "foundOther");
  a.commit(false);
  assert.equal(a.allIssues("missing").length, 7);
  assert.equal(a.db.samples.find(x => x.id === "S-000051").loc, "B-01-02");
  assert.equal(a.db.manualObservations.at(-1).rack, "A-02-03");
});
test("Removal Back returns to removal; tombstone and EPC interval preserved", () => {
  const { api } = boot();
  api.act("rack-B-01-02"); api.act("remove");
  api.S.selected = ["S-000051"]; api.act("remove-review");
  api.act("back"); assert.equal(api.S.page, "remove");
  api.act("remove-review"); api.commit(false);
  const s = api.db.samples.find(x => x.id === "S-000051");
  assert.equal(s.active, false);
  assert.ok(s.removedAt);
  assert.ok(s.epcHistory[0].to);
  assert.ok(api.db.audit.some(x => x.kind === "Исключение"));
});
test("Repeated article and product barcode merge into one quantity", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("create");
  t.press("create-scan", "ART-0001");
  t.press("create-scan", "4600000000001");
  assert.equal(a.db.queue.length, 1);
  assert.equal(a.db.queue[0].qty, 2);
});
test("Create 100 unique samples, retry idempotently, then bind RFID without printing", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("create"); a.act("demo-create");
  a.act("create-review"); const request = a.S.confirm; a.commit(false);
  assert.equal(a.db.samples.length, 180);
  assert.equal(new Set(a.db.samples.map(x => x.id)).size, 180);
  assert.equal(a.db.samples.filter(x => !x.epc).length, 100);
  assert.equal(a.S.page, "rfid");
  assert.equal(a.apply(request).ok, true);
  assert.equal(a.db.samples.length, 180);
  a.rfidPick("S-000300"); a.rfidWrite();
  const epc = a.db.rfidPending.epc; a.rfidVerify(epc);
  assert.equal(a.db.samples.find(x => x.id === "S-000300").epc, epc);
  const restored = boot(t.storage);
  assert.equal(restored.api.db.samples.length, 180);
  restored.api.act("nav-rfid");
  assert.ok(restored.html().includes("S-000301"));
});
test("Offline C5: queue persists, finish blocked, sync exactly once", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("inspection"); a.startInspection();
  a.act("nav-service"); a.act("toggle-tech-panel"); a.act("toggle-c5");
  t.set("c5-code", "S-000001"); a.act("c5-scan");
  assert.equal(a.db.c5Queue.length, 1);
  a.finishInspection(); assert.ok(a.db.inspections.some(x => x.status === "active"));
  a.act("toggle-c5"); a.act("sync-c5");
  assert.equal(a.db.c5Queue.length, 0);
  assert.equal(a.db.inspections.find(x => x.status === "active").observations.length, 1);
  a.act("sync-c5");
  assert.equal(a.db.inspections.find(x => x.status === "active").observations.length, 1);
});
test("Direct move: scan unique ID, target rack, one explicit action", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("move");
  t.press("move-scan", "S-000001");
  t.set("target-rack", "D-03-01"); a.act("move-review");
  assert.equal(a.db.samples.find(x => x.id === "S-000001").loc, "D-03-01");
});
test("Explicit direct move closes the matching open wrong-rack discrepancy", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("move");
  t.press("move-scan", "S-000001");
  t.set("target-rack", "D-03-01"); a.act("move-review");
  assert.equal(a.allIssues("wrong").length, 49);
  assert.equal(a.issues(a.db.inspections[0], "wrong", false).length, 50);
});
test("Found after inspection creates a separate observation, not a historical rewrite", () => {
  const { api } = boot();
  api.act("rack-B-01-02"); api.act("issues-missing");
  api.act("single-found-S-000051"); api.commit(false);
  assert.equal(api.db.manualObservations.length, 1);
  assert.equal(api.db.manualObservations[0].sampleId, "S-000051");
  assert.equal(api.db.inspections[0].observations.length, 62);
});
test("Network uncertainty retains requestId; retry does not create new request", () => {
  const { api } = boot();
  api.act("rack-B-01-02"); api.act("remove");
  api.S.selected = ["S-000051"]; api.act("remove-review");
  const req = api.S.confirm.requestId;
  api.act("simulate-network"); api.commit(false);
  assert.equal(api.S.confirm.requestId, req);
  assert.equal(api.db.samples.find(x => x.id === "S-000051").active, true);
  api.commit(false);
  assert.equal(api.db.samples.find(x => x.id === "S-000051").active, false);
});
test("10k product stress demo keeps report page to 30 rows", () => {
  const t = boot(), a = t.api;
  a.act("stress-10k"); assert.equal(a.db.products.length, 10000);
  a.act("report-no");
  assert.ok((t.html().match(/<tr>/g) || []).length <= 31);
});
test("Unverified shelves KPI opens filtered shelf list", () => {
  const t = boot(), a = t.api;
  a.act("unchecked");
  assert.equal(a.S.onlyUnchecked, true);
  assert.ok(t.html().includes("Полки без проверки"));
  assert.ok(!t.html().includes("<b>B-01-02</b>"));
  a.act("show-all-racks"); assert.equal(a.S.onlyUnchecked, false);
});

test("Six main tabs stay identical on every screen", () => {
  const t = boot(), a = t.api;
  function nav() {
    const fragment = t.html().match(/<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(fragment, "Fixed navigation exists");
    return [...fragment[1].matchAll(/data-act="(nav-[^"]+)"/g)].map(x => x[1]).join(",");
  }
  const expected = "nav-warehouse,nav-work,nav-rfid,nav-find,nav-reports,nav-history";
  assert.equal(nav(), expected);
  a.act("check-A-02-03"); assert.equal(nav(), expected);
  a.startInspection(); assert.equal(nav(), expected);
  a.act("toggle-c5-panel"); assert.equal(nav(), expected);
  a.act("nav-service"); assert.equal(nav(), expected);
  a.act("nav-reports"); assert.equal(nav(), expected);
  a.act("nav-work"); assert.equal(nav(), expected);
});
test("Inspection has explicit steps and inline C5 without leaving screen", () => {
  const t = boot(), a = t.api;
  a.act("check-A-02-03");
  assert.equal(a.S.page, "inspection");
  assert.ok(t.html().includes("Шаг 1. Подготовка"));
  a.startInspection();
  assert.ok(t.html().includes("Шаг 2. Сканируйте"));
  a.act("toggle-c5-panel");
  assert.equal(a.S.page, "inspection");
  assert.ok(t.html().includes("Состояние C5 — внутри текущей проверки"));
  t.set("c5-code", "S-000001");
  a.act("toggle-c5");
  a.act("c5-scan");
  assert.equal(a.db.c5Queue.length, 1);
  assert.equal(a.S.page, "inspection");
  a.act("toggle-c5");
  a.act("sync-c5");
  assert.equal(a.db.c5Queue.length, 0);
  assert.equal(a.db.inspections.find(x => x.status === "active").observations.length, 1);
  assert.equal(a.S.page, "inspection");
  a.act("toggle-c5-panel");
  assert.ok(!t.html().includes("Состояние C5 — внутри текущей проверки"));
});
test("Permanent context bar shows current shelf and resume action across sections", () => {
  const t = boot(), a = t.api;
  a.act("check-A-02-03"); a.startInspection();
  a.act("nav-warehouse");
  assert.ok(t.html().includes("Идёт проверка A-02-03"));
  assert.ok(t.html().includes('data-act="resume-inspection"'));
  assert.ok(t.html().includes('data-act="shelf"'));
  assert.ok(t.html().includes('data-act="back"'));
  a.act("nav-service");
  assert.ok(t.html().includes("Этот раздел не нужен для обычной проверки"));
  a.act("resume-inspection");
  assert.equal(a.S.page, "inspection");
  assert.equal(a.S.rack, "A-02-03");
});
test("Resume inspection does not create a Back navigation loop", () => {
  const { api } = boot();
  api.act("check-A-02-03"); api.startInspection();
  api.act("nav-work");
  api.act("resume-inspection");
  assert.equal(api.S.page, "inspection");
  api.act("back"); assert.equal(api.S.page, "work");
  api.act("back"); assert.equal(api.S.page, "warehouse");
});
test("Finish opens a clear summary, then issues, with reliable return", () => {
  const t = boot(), a = t.api;
  a.act("check-A-02-03"); a.startInspection(); a.finishInspection();
  assert.equal(a.S.page, "result");
  assert.ok(t.html().includes("Шаг 3. Итог проверки"));
  assert.ok(t.html().includes("Разобрать не найденные"));
  a.act("issues-missing");
  assert.equal(a.S.page, "issues");
  assert.ok(t.html().includes("Шаг 4."));
  a.act("back");
  assert.equal(a.S.page, "result");
  a.act("nav-work");
  a.act("open-result");
  assert.equal(a.S.page, "result");
});
test("Settings hides technical C5 tests until explicitly expanded", () => {
  const t = boot(), a = t.api;
  a.act("nav-service");
  assert.ok(t.html().includes("Технические тесты C5"));
  assert.ok(!t.html().includes('id="c5-code"'));
  a.act("toggle-tech-panel");
  assert.ok(t.html().includes('id="c5-code"'));
  a.act("toggle-c5");
  assert.ok(t.html().includes('id="c5-code"'));
  a.act("toggle-tech-panel");
  assert.ok(!t.html().includes('id="c5-code"'));
});
test("Settings opened from inspection can be closed using Back", () => {
  const { api } = boot();
  api.act("check-A-02-03"); api.startInspection();
  api.act("nav-service");
  assert.equal(api.S.page, "service");
  api.act("back");
  assert.equal(api.S.page, "inspection");
  assert.ok(api.db.inspections.some(x => x.status === "active"));
});
test("User threshold: less than 0.5 m and persistent across reload", () => {
  const t = boot(), a = t.api;
  a.act("remove"); t.set("stock-limit", "0.5"); a.act("apply-stock-limit");
  assert.equal(a.stockLimit(), 0.5);
  assert.ok(a.lowStockSamples().every(x => a.db.products.find(p => p.id === x.productId).stock < 0.5));
  assert.equal(boot(t.storage).api.stockLimit(), 0.5);
});
test("Invalid threshold is rejected and never triggers exclusion", () => {
  const t = boot(), a = t.api;
  a.act("remove"); t.set("stock-limit", "-5"); a.act("apply-stock-limit");
  assert.equal(a.stockLimit(), 1);
  assert.equal(a.db.samples.filter(x => !x.active).length, 0);
});
test("Manual candidate selection never excludes without confirmation", () => {
  const a = boot().api;
  a.act("remove"); a.act("select-visible-remove");
  assert.ok(a.S.selected.length > 0);
  assert.equal(a.db.samples.filter(x => !x.active).length, 0);
  a.act("remove-review"); assert.equal(a.S.page, "confirm");
  assert.equal(a.db.samples.filter(x => !x.active).length, 0);
  a.commit(false);
  assert.ok(a.db.samples.some(x => !x.active));
});
test("Removal candidate pagination supports more than 50 samples", () => {
  const t = boot(), a = t.api;
  a.act("remove"); t.set("stock-limit", "100"); a.act("apply-stock-limit");
  a.act("remove-next"); assert.equal(a.S.removePage, 1);
  a.act("select-visible-remove");
  assert.ok(a.S.selected.length > 0 && a.S.selected.length <= 50);
  assert.equal(a.db.samples.filter(x => !x.active).length, 0);
});
test("RFID product barcode with multiple instances requires physical instance choice", () => {
  const a = boot().api;
  a.act("create"); a.act("demo-create"); a.act("create-review"); a.commit(false);
  a.rfidScan("4600000000001");
  assert.equal(a.S.rfidProductId, 1);
  assert.equal(a.S.rfidSampleId, null);
});
test("RFID write alone does not bind, mismatched readback blocks", () => {
  const a = boot().api;
  a.rfidPick("S-000001"); a.rfidWrite();
  const epc = a.db.rfidPending.epc;
  assert.notEqual(a.db.samples[0].epc, epc);
  a.rfidVerify("WRONG");
  assert.ok(a.db.rfidPending);
  assert.notEqual(a.db.samples[0].epc, epc);
});
test("RFID verified rewrite closes EPC interval and writes audit", () => {
  const a = boot().api, x = a.db.samples[0], old = x.epc;
  a.rfidPick(x.id); a.rfidWrite();
  const epc = a.db.rfidPending.epc; a.rfidVerify(epc);
  assert.equal(x.epc, epc);
  assert.equal(x.epcHistory.length, 2);
  assert.ok(x.epcHistory[0].to);
  assert.equal(x.epcHistory[0].epc, old);
  assert.equal(x.epcHistory[1].to, null);
  assert.ok(a.db.audit.some(x => x.kind === "Запись и привязка RFID"));
});
test("RFID duplicate active EPC and version conflict both block binding", () => {
  const a = boot().api;
  a.rfidPick("S-000001"); a.rfidWrite();
  const epc = a.db.rfidPending.epc;
  a.db.samples[1].epc = epc;
  a.rfidVerify(epc); assert.ok(a.db.rfidPending);
  a.db.samples[1].epc = "E200DEMO00000002";
  a.db.samples[0].version++;
  a.rfidVerify(epc); assert.ok(a.db.rfidPending);
});
test("RFID pending survives reload, and can be explicitly aborted with audit", () => {
  const t = boot(), a = t.api;
  a.rfidPick("S-000001"); a.rfidWrite();
  const epc = a.db.rfidPending.epc;
  const b = boot(t.storage).api;
  assert.equal(b.db.rfidPending.epc, epc);
  b.act("rfid-abort");
  assert.equal(b.db.rfidPending, null);
  assert.ok(b.db.audit.some(x => x.kind === "Отмена незавершённой записи RFID"));
});
test("No printing, manual EPC text entry, or separate admin role in UI", () => {
  assert.ok(!html.includes("window.print"));
  assert.ok(!html.includes("print-labels"));
  assert.ok(!html.includes("epc-input"));
  assert.ok(html.includes("rfid-read-scan"));
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log("PASS", name); }
  catch (e) { console.error("FAIL", name, e.stack || e); }
}
console.log("Result:", passed + "/" + tests.length);
if (passed !== tests.length) process.exitCode = 1;
