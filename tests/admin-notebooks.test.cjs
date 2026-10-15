const {test}=require('node:test');
const assert=require('node:assert/strict');
const {monthBounds,shiftMonth,localDate,totals,resolveClients,validateEntry}=require('../portal/admin-notebooks.js');
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
