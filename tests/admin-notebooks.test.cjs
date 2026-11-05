const {test}=require('node:test');
const assert=require('node:assert/strict');
const {monthBounds,invoiceBounds,invoiceRows,shiftMonth,localDate,totals,resolveClients,validateEntry}=require('../portal/admin-notebooks.js');
test('month boundaries and year rollover use dates rather than submission timestamps',()=>{
  assert.deepEqual(monthBounds('2026-12'),{start:'2026-12-01',end:'2027-01-01'});
  assert.deepEqual(monthBounds('2028-02'),{start:'2028-02-01',end:'2028-03-01'});
  assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(shiftMonth('2026-12',1),'2027-01');
  assert.throws(()=>monthBounds('2026-13'));assert.throws(()=>monthBounds('bad'));
});
test('monthly totals exclude other clients, months and deleted entries and use exact hundredths',()=>{
  const rows=[{client_id:'a',worked_on:'2026-10-01',hours:.1,verified_exported:true},{client_id:'a',worked_on:'2026-10-31',hours:.2},{client_id:'b',worked_on:'2026-10-01',hours:8},{client_id:'a',worked_on:'2026-11-01',hours:8},{client_id:'a',worked_on:'2026-10-01',hours:8,deleted_at:'2026-10-02'}];
  assert.deepEqual(totals(rows,'a','2026-10'),{hours:.3,verified:.1,count:2});
  assert.deepEqual(totals(rows,'b','2026-10'),{hours:8,verified:0,count:1});
  assert.deepEqual(totals(rows,'a','2026-09'),{hours:0,verified:0,count:0});
});
test('new clients are data-driven and known clients keep their full names',()=>{
  const result=resolveClients([{id:'new-client',full_name:'Future Client'},{id:'521dd725-2fa6-4d78-9fcc-e5447dc727cb',full_name:'Omar V.'}]);
  assert.equal(result.length,2);assert.equal(result[0].name,'Omar Velasquez');assert.equal(result[1].name,'Future Client');
});
test('valid hours and real calendar dates are required',()=>{
  assert.deepEqual(validateEntry(' Ivan ','2026-10-01','6.5'),{staff_name:'Ivan',worked_on:'2026-10-01',hours:6.5});
  for(const args of [['','2026-10-01',2],['Ivan','2026-02-30',2],['Ivan','2026-10-01',0],['Ivan','2026-10-01',24.01],['Ivan','2026-10-01',1.001]])assert.throws(()=>validateEntry(...args));
  assert.equal(validateEntry('Staff','2028-02-29',24).hours,24);
  assert.equal(localDate(new Date(2026,9,14,23,30)),'2026-10-14');
});

test('invoice billing periods have no overlap and preserve the full-month notebook',()=>{
  const rows=[
    {id:1,client_id:'a',worked_on:'2026-11-01',hours:2,verified_exported:true},
    {id:2,client_id:'a',worked_on:'2026-11-14',hours:6,verified_exported:true},
    {id:3,client_id:'a',worked_on:'2026-11-15',hours:3,verified_exported:false},
    {id:4,client_id:'a',worked_on:'2026-11-30',hours:7,verified_exported:true},
    {id:5,client_id:'a',worked_on:'2026-12-01',hours:6,verified_exported:true},
    {id:6,client_id:'b',worked_on:'2026-11-15',hours:10,verified_exported:true},
    {id:7,client_id:'a',worked_on:'2026-11-14',hours:11,deleted_at:'2026-11-20'}
  ];
  assert.deepEqual(invoiceBounds('2026-11','first'),{start:'2026-11-01',end:'2026-11-15'});
  assert.deepEqual(invoiceBounds('2026-11','second'),{start:'2026-11-15',end:'2026-12-01'});
  assert.deepEqual(invoiceRows(rows,'a','2026-11','first').map(r=>r.id),[1,2]);
  assert.deepEqual(invoiceRows(rows,'a','2026-11','second').map(r=>r.id),[3,4]);
  assert.deepEqual(totals(rows,'a','2026-11','first'),{hours:8,verified:8,count:2});
  assert.deepEqual(totals(rows,'a','2026-11','second'),{hours:10,verified:7,count:2});
  assert.deepEqual(totals(rows,'a','2026-11'),{hours:18,verified:15,count:4});
  assert.throws(()=>invoiceBounds('2026-11','bad'));
});
test('invoice periods include February 28/29 and year-end without leaking next month',()=>{
  assert.deepEqual(invoiceBounds('2028-02','second'),{start:'2028-02-15',end:'2028-03-01'});
  assert.deepEqual(invoiceBounds('2026-02','second'),{start:'2026-02-15',end:'2026-03-01'});
  assert.deepEqual(invoiceBounds('2026-12','second'),{start:'2026-12-15',end:'2027-01-01'});
  const rows=[{client_id:'a',worked_on:'2028-02-29',hours:5},{client_id:'a',worked_on:'2028-03-01',hours:9}];
  assert.equal(totals(rows,'a','2028-02','second').hours,5);
});
