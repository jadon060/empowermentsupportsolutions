'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reportModel,safeFilename,monthBounds,invoiceBounds,invoicePeriodLabel,monthLabel}=require('../portal/staff-hours-report.js');

const CLIENT='521dd725-2fa6-4d78-9fcc-e5447dc727cb';
function entry(id,date,staff,hours,verified=false,extras={}){
  return {id:String(id),client_id:CLIENT,worked_on:date,staff_name:staff,hours,verified_exported:verified,verified_at:verified?'2026-10-28T18:00:00Z':null,deleted_at:null,...extras};
}

test('exports only matching client-month active entries, in date order',()=>{
  const rows=[
    entry(2,'2026-10-20','Ivan Estepa',6,true),
    entry(1,'2026-10-03','Ivan Estepa',2.5),
    entry(3,'2026-11-01','Ivan Estepa',8),
    entry(4,'2026-10-01','Ivan Estepa',1,true,{deleted_at:'2026-10-02'}),
    entry(5,'2026-10-01','Other staff',9,true,{client_id:'e083501e-86d5-41e8-b840-c3ba5b6dc9c9'})
  ];
  const model=reportModel(rows,CLIENT,'2026-10');
  assert.deepEqual(model.rows.map(x=>x.date),['2026-10-03','2026-10-20']);
  assert.equal(model.count,2);
  assert.equal(model.cents,850);
  assert.equal(model.verifiedCents,600);
  assert.equal(model.pendingCents,250);
  assert.equal(model.verifiedCount,1);
});

test('hours and verification are grouped by staff without premature rounding',()=>{
  const r=reportModel([
    entry(1,'2026-10-01','Ivan Estepa',.1,true),
    entry(2,'2026-10-02','Ivan Estepa',.2),
    entry(3,'2026-10-02','ESS Direct',6,true),
    entry(4,'2026-10-03','Ivan Estepa',5.55,true)
  ],CLIENT,'2026-10');
  assert.equal(r.cents,1185);assert.equal(r.verifiedCents,1165);assert.equal(r.pendingCents,20);
  assert.deepEqual(r.staff.map(s=>s.staff),['ESS Direct','Ivan Estepa']);
  assert.equal(r.staff.find(s=>s.staff==='Ivan Estepa').cents,585);
});

test('empty month yields explicit zero totals and no stale client data',()=>{
  const r=reportModel([entry(1,'2026-09-10','Ivan',7,true)],CLIENT,'2026-10');
  assert.equal(r.count,0);assert.equal(r.cents,0);assert.equal(r.verifiedCents,0);
  assert.equal(r.staff.length,0);
});

test('only valid date boundaries are accepted',()=>{
  assert.deepEqual(monthBounds('2026-12'),{start:'2026-12-01',end:'2027-01-01'});
  assert.equal(monthLabel('2026-10'),'October 2026');
  assert.throws(()=>monthBounds('2026-13'));
  assert.throws(()=>monthBounds('unknown'));
});

test('filing name is client/month/date labelled and strips unsafe characters',()=>{
  const name=safeFilename('Omar Vélasquez / test','2026-10','20261028_1159');
  assert.match(name,/^ESS_Staff_Hours_Omar_Velasquez_test_2026-10_202610281159$/);
  assert.doesNotMatch(name,/[\\/]/);
});

test('invalid out-of-policy hours abort report generation',()=>{
  assert.throws(()=>reportModel([entry(1,'2026-10-01','Ivan',-1)],CLIENT,'2026-10'));
  assert.throws(()=>reportModel([entry(1,'2026-10-01','Ivan',24.01)],CLIENT,'2026-10'));
});

test('PDF uses exactly 1–14 or 15–month end with no duplicated staff dates',()=>{
  const rows=[
    entry(1,'2026-11-01','Ivan',2,true),
    entry(2,'2026-11-14','Ivan',6,true),
    entry(3,'2026-11-15','Ivan',3,false),
    entry(4,'2026-11-30','Robert',4,true),
    entry(5,'2026-12-01','Robert',9,true),
    entry(6,'2026-11-15','Someone',11,true,{deleted_at:'2026-11-20'})
  ];
  const first=reportModel(rows,CLIENT,'2026-11','first');
  const second=reportModel(rows,CLIENT,'2026-11','second');
  const monthly=reportModel(rows,CLIENT,'2026-11');
  assert.deepEqual(first.rows.map(x=>x.date),['2026-11-01','2026-11-14']);
  assert.deepEqual(second.rows.map(x=>x.date),['2026-11-15','2026-11-30']);
  assert.equal(first.cents,800);
  assert.equal(second.cents,700);
  assert.equal(monthly.cents,first.cents+second.cents);
  assert.equal(first.verifiedCents,800);
  assert.equal(second.verifiedCents,400);
  assert.equal(first.count+second.count,monthly.count);
});
test('export dates, names and period labels honor leap years and reject invalid periods',()=>{
  assert.deepEqual(invoiceBounds('2028-02','second'),{start:'2028-02-15',end:'2028-03-01'});
  assert.equal(invoicePeriodLabel('2026-11','first'),'November 1–14, 2026');
  assert.equal(invoicePeriodLabel('2026-11','second'),'November 15–30, 2026');
  assert.equal(invoicePeriodLabel('2028-02','second'),'February 15–29, 2028');
  assert.match(safeFilename('Omar Velasquez','2026-11','20261105_1111','first'),/_2026-11_01-14_202611051111$/);
  assert.match(safeFilename('Omar Velasquez','2028-02','20280227_1200','second'),/_2028-02_15-29_202802271200$/);
  assert.throws(()=>invoiceBounds('2026-11','incorrect'));
  assert.throws(()=>reportModel([],CLIENT,'2026-11','incorrect'));
});
