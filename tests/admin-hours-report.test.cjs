'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reportModel,safeFilename,monthBounds,monthLabel}=require('../portal/staff-hours-report.js');

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
