"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const html=fs.readFileSync(path.join(__dirname,"UI_PROTOTYPE_V12.html"),"utf8");
const script=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(script,"Inline JavaScript");
let rendered="",printed=0,store={},elements={},confirmAllowed=true,confirmLog=[];
const root={set innerHTML(v){rendered=v},get innerHTML(){return rendered}};
const document={getElementById(k){if(k==="app")return root;if(!rendered.includes('id="'+k+'"'))return null;return elements[k]||=( {value:"",checked:false,focus(){},setSelectionRange(){}} )},querySelectorAll(){return[]},createElement(){return{click(){}}}};
const ask=(message)=>{confirmLog.push(message);return confirmAllowed};
const window={print(){printed++},confirm:ask},localStorage={getItem(k){return store[k]||null},setItem(k,v){store[k]=v}};
const ctx={window,document,localStorage,confirm:ask,Blob:class{},URL:{createObjectURL(){return""},revokeObjectURL(){}},setTimeout(){}};
vm.runInNewContext(script[1],ctx,{filename:"UI_PROTOTYPE_V12.html"});
const api=window.__v12Test;assert.ok(api,"Test API");
let passed=0;function test(name,fn){fn();passed++;console.log("OK "+name)}
test("64 адреса: 8 стеллажей × L/R × 4 ряда сверху вниз",()=>{
  assert.equal(api.db.schema,12);assert.equal(api.R.length,64);assert.equal(new Set(api.R.map(x=>x.id)).size,64);
  assert.deepEqual(Array.from(api.R.slice(0,8),x=>x.id),["1L1","1L2","1L3","1L4","1R1","1R2","1R3","1R4"]);
  assert.equal(api.R.at(-1).id,"8R4");
});
test("Отдельный ключ v12: старые данные v11 не перезаписываются",()=>{
  assert.ok(store["fabric-prototype-v12"]);assert.equal(store["fabric-prototype-v11"],undefined);
});
test("Визуальный выбор стеллажа, стороны и ряда",()=>{
  api.action("shelf");api.action("pickrack:8");api.action("pickside:R");
  assert.ok(rendered.includes("Ряд 4 · 8R4"));api.action("setrack:8R4");assert.equal(api.db.rack,"8R4");
  api.action("rack:1L1");assert.equal(api.db.rack,"1L1");
});
test("QR — адрес стационарного ряда, не ID образца",()=>{
  api.action("qr");assert.ok(rendered.includes("RACK:1L1"));assert.ok(rendered.includes("стационарный ряд"));
  const matrix=api.qrMatrix("RACK:8R4");assert.equal(matrix.length,21);assert.ok(matrix.every(x=>x.length===21));
  api.action("qr-print");assert.equal(printed,1);
});
test("В Windows отсутствует ручная запись и привязка EPC",()=>{
  assert.ok(!html.includes("function doBindEpc"));assert.ok(!html.includes('id="epcinput"'));
  api.action("rfid");assert.ok(rendered.includes("Запись и привязка EPC выполняются только"));
});
test("C5: только подтверждённая уникальная привязка экземпляра",()=>{
  const sample=api.db.samples.find(x=>!x.epc),p=api.db.products.find(x=>x.id===sample.pid),epc="E200"+"9".repeat(20);
  const ev={eventId:"c5-bind-001",sampleId:sample.id,barcode:p.barcode,epc,readBackEpc:epc,confirmed:true,expectedVersion:sample.version};
  assert.equal(api.receiveC5Binding(ev).ok,true);assert.equal(sample.epc,epc);
  assert.equal(api.receiveC5Binding(ev).duplicate,true);
  assert.equal(api.receiveC5Binding({...ev,epc:"E200"+"8".repeat(20)}).ok,false);
  const other=api.db.samples.find(x=>x.active&&!x.epc),otherP=api.db.products.find(x=>x.id===other.pid);
  assert.equal(api.receiveC5Binding({eventId:"c5-bind-002",sampleId:other.id,barcode:otherP.barcode,epc,readBackEpc:epc,confirmed:true,expectedVersion:other.version}).ok,false);
  assert.equal(other.epc,null);
});
test("C5: неверное контрольное чтение и конфликт версии отклоняются",()=>{
  const sample=api.db.samples.find(x=>x.active&&!x.epc),p=api.db.products.find(x=>x.id===sample.pid),epc="E200"+"7".repeat(20);
  assert.equal(api.receiveC5Binding({eventId:"c5-bind-003",sampleId:sample.id,barcode:p.barcode,epc,readBackEpc:"WRONG",confirmed:true,expectedVersion:sample.version}).ok,false);
  assert.equal(api.receiveC5Binding({eventId:"c5-bind-004",sampleId:sample.id,barcode:p.barcode,epc,readBackEpc:epc,confirmed:true,expectedVersion:999}).ok,false);
  assert.equal(sample.epc,null);
});
api.action("rack:1L1");api.action("startinspection");
const session=api.db.sessions.find(x=>x.status==="active"),neighbor=api.db.samples.find(x=>x.loc==="1L2"&&x.epc),spill=api.db.samples.find(x=>x.loc==="1L3"&&x.epc),returned=api.db.samples.find(x=>x.loc==="1L4"&&x.epc);
test("RFID-проверка: снимок только экземпляров с EPC",()=>{
  assert.ok(session);assert.ok(session.expected.every(sid=>!!api.db.samples.find(x=>x.id===sid).epc));
  assert.equal(session.rack,"1L1");assert.equal(session.seen.length,0);
});
test("C5: соседние ряды видны, но их учётный адрес не меняется",()=>{
  const reads=[{epc:neighbor.epc,readCount:8,rssi:-42},{epc:spill.epc,readCount:3,rssi:-67},{epc:returned.epc,readCount:2,rssi:-79}];
  const event={eventId:"c5-inventory-001",sessionId:session.id,rack:"1L1",reads};
  assert.equal(api.receiveC5Inventory(event).ok,true);
  assert.equal(api.receiveC5Inventory(event).duplicate,true);
  assert.equal(api.receiveC5Inventory({...event,reads:[reads[0]]}).ok,false);
  assert.equal(session.observations[neighbor.id].count,8);
  assert.equal(session.observations[neighbor.id].rssiLast,-42);
  assert.equal(neighbor.loc,"1L2");assert.equal(spill.loc,"1L3");assert.equal(returned.loc,"1L4");
});
test("Невалидный пакет C5 и неверная сессия не меняют наблюдения",()=>{
  const n=session.seen.length;
  assert.equal(api.receiveC5Inventory({eventId:"bad-1",sessionId:"wrong",rack:"1L1",reads:[{epc:neighbor.epc}]}).ok,false);
  assert.equal(api.receiveC5Inventory({eventId:"bad-2",sessionId:session.id,rack:"1L1",reads:[null]}).ok,false);
  assert.equal(api.receiveC5Inventory({eventId:"bad-3",sessionId:session.id,rack:"1L1",reads:[{epc:neighbor.epc,rssi:22}]}).ok,false);
  assert.equal(session.seen.length,n);
});
test("Повторный EPC увеличивает счётчик, но не число уникальных меток",()=>{
  const n=session.seen.length;
  api.doScanInspect(neighbor.epc);assert.equal(session.seen.length,n);assert.equal(session.observations[neighbor.id].count,9);
});
test("Товарный ШК не выдаётся за RFID-метку",()=>{
  const n=session.seen.length,p=api.db.products.find(x=>x.id===neighbor.pid);
  api.doScanInspect(p.barcode);assert.equal(session.seen.length,n);
});
test("Завершение не перемещает образцы и не удаляет отсутствующие",()=>{
  const n=api.db.samples.filter(x=>x.active).length;
  api.action("finishinspection");assert.equal(neighbor.loc,"1L2");
  assert.equal(api.db.samples.filter(x=>x.active).length,n);
  assert.ok(api.issues("1L1","wrong").includes(neighbor.id));
  assert.ok(api.issues("1L1","missing").length>=1);
});
test("Без физического подтверждения «Закрепить здесь» не срабатывает",()=>{
  api.action("issue:wrong");api.ui.selected=[neighbor.id];api.action("fixhere");assert.equal(neighbor.loc,"1L2");
});
test("Подтверждённое нахождение позволяет осознанно исправить адрес",()=>{
  api.ui.selected=[neighbor.id];api.action("confirmhere");assert.equal(neighbor.loc,"1L2");
  api.ui.selected=[neighbor.id];api.action("fixhere");assert.equal(neighbor.loc,"1L1");
  assert.ok(api.db.events.some(e=>e.action==="Подтверждённое перемещение"));
});
test("Соседний сигнал можно отклонить без перемещения",()=>{
  api.action("issue:wrong");api.ui.selected=[spill.id];api.action("dismissspill");
  assert.equal(spill.loc,"1L3");assert.ok(!api.issues("1L1","wrong").includes(spill.id));
});
test("Физический возврат на учётный адрес не меняет его",()=>{
  api.action("issue:wrong");api.ui.selected=[returned.id];api.action("returnhome");
  assert.equal(returned.loc,"1L4");assert.ok(!api.issues("1L1","wrong").includes(returned.id));
});
test("«Не считан» — не удаление; физическое обнаружение снимает вопрос",()=>{
  const sid=api.issues("1L1","missing")[0];assert.ok(sid);
  api.action("issue:missing");api.ui.selected=[sid];api.action("markfound");
  assert.ok(!api.issues("1L1","missing").includes(sid));assert.equal(api.db.samples.find(x=>x.id===sid).active,true);
});
test("Перемещение в другой ряд требует ввода адреса и отдельного подтверждения",()=>{
  const sid=api.issues("1L1","missing")[0];assert.ok(sid);const x=api.db.samples.find(x=>x.id===sid);
  api.action("issue:missing");api.ui.selected=[sid];api.action("choosemove");
  elements.movetarget={value:"8R4"};elements.movetargetproof={value:"RACK:8R4"};elements.movephysical={checked:false};
  api.action("confirmmove");assert.equal(x.loc,"1L1");
  elements.movephysical.checked=true;elements.movetargetproof.value="RACK:7L2";
  api.action("confirmmove");assert.equal(x.loc,"1L1");
  elements.movetargetproof.value="RACK:8R4";api.action("confirmmove");assert.equal(x.loc,"8R4");
});
test("Порог остатков 0,5 / 1 м — только ручное решение",()=>{
  api.action("report:low");assert.ok(rendered.includes("0,5 м"));
  elements.lowthreshold.value="1";elements.lowthreshold.onchange();
  assert.equal(api.db.lowStockThreshold,1);assert.ok(rendered.includes("Автоматического удаления нет"));
});
test("Массовое создание 100 экземпляров не требует печати и EPC",()=>{
  const n=api.db.samples.length;api.action("rack:1L1");api.action("create");api.action("demo100");api.action("commitcreate");
  assert.equal(api.db.samples.length,n+100);assert.equal(api.db.lastCreated.length,100);
  assert.ok(api.db.lastCreated.every(sid=>{const x=api.db.samples.find(s=>s.id===sid);return x.loc==="1L1"&&x.epc===null}));
});
test("Аудит и JSON-экспорт доступны, старые экземпляры не удалены",()=>{
  assert.ok(api.db.events.length>=5);assert.ok(api.db.samples.filter(x=>x.active).length>=180);
  api.action("nav:history");assert.ok(rendered.includes("Журнал событий"));
});
console.log("PASS "+passed+" tests");
