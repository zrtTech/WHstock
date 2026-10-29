/* Standalone regression tests for the interactive v6 HTML mock.
   Run: node UI_PROTOTYPE_V6.test.cjs
   No npm dependencies. No 1C, hardware, or network access.
*/
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "UI_PROTOTYPE_V6.html"), "utf8");
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
      return elements[id] ||= {
        value: "", checked: true, selectionStart: 0,
        focus() {}, setSelectionRange() {}
      };
    },
    createElement() { return { click() {} }; }
  };
  const window = { confirm: () => true, print() {} };
  const localStorage = {
    getItem(k) { return storage[k] ?? null; },
    setItem(k, v) { storage[k] = v; }
  };
  const context = {
    window, document, localStorage, Blob: class {},
    URL: { createObjectURL: () => "", revokeObjectURL() {} },
    setTimeout: () => {}
  };
  vm.runInNewContext(script[1], context, { filename: "UI_PROTOTYPE_V6.html" });
  return {
    api: window.__v6Test, storage, elements,
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
test("Single wrong sample: one click, audit, historical snapshot unchanged", () => {
  const { api } = boot();
  api.act("rack-B-01-02"); api.act("issues-wrong");
  api.act("single-here-S-000001");
  assert.equal(api.allIssues("wrong").length, 49);
  assert.equal(api.issues(api.db.inspections[0], "wrong", false).length, 50);
  assert.ok(api.db.audit.some(x => x.kind === "Исправление места"));
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
test("Bulk wrong move: 50 resolved, 50 audit records, correct Back", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("issues-wrong"); a.act("select-all");
  a.act("bulk-other"); t.set("issue-target", "D-03-01");
  a.act("issue-target-submit"); assert.equal(a.S.page, "confirm");
  a.commit(false);
  assert.equal(a.allIssues("wrong").length, 0);
  assert.equal(a.db.audit.filter(x => x.kind === "Перемещение").length, 50);
  a.back(); assert.equal(a.S.page, "work");
});
test("Found missing on another rack: explicit action and resolution", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("issues-missing");
  a.act("single-found-other-S-000051");
  t.set("issue-target", "A-02-03"); a.act("issue-target-submit");
  assert.equal(a.S.confirm.action, "foundOther");
  a.commit(false);
  assert.equal(a.allIssues("missing").length, 7);
  assert.equal(a.db.samples.find(x => x.id === "S-000051").loc, "A-02-03");
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
test("Create 100 unique instances, retry requestId does not duplicate", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("create"); a.act("demo-create");
  a.act("create-review"); const request = a.S.confirm;
  a.commit(false);
  assert.equal(a.db.samples.length, 180);
  assert.equal(new Set(a.db.samples.map(x => x.id)).size, 180);
  assert.equal(a.db.samples.filter(x => !x.labeled).length, 100);
  assert.equal(a.apply(request).ok, true);
  assert.equal(a.db.samples.length, 180);
  t.press("label-scan", "S-000300");
  assert.equal(a.db.samples.find(x => x.id === "S-000300").labeled, true);
  const restored = boot(t.storage);
  assert.equal(restored.api.db.samples.length, 180);
  restored.api.act("nav-work"); restored.api.act("labels");
  assert.ok(restored.html().includes("S-000301"));
});
test("Offline C5: queue persists, finish blocked, sync exactly once", () => {
  const t = boot(), a = t.api;
  a.act("rack-B-01-02"); a.act("inspection"); a.startInspection();
  a.act("nav-service"); a.act("toggle-c5");
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

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log("PASS", name); }
  catch (e) { console.error("FAIL", name, e.stack || e); }
}
console.log("Result:", passed + "/" + tests.length);
if (passed !== tests.length) process.exitCode = 1;
