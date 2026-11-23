'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../portal/omar-tracker-admin.js'), 'utf8');
const sandbox = {module:{exports:{}},document:undefined};
vm.runInNewContext(source, sandbox, {filename:'omar-tracker-admin.js'});
const {validMonth,categoryOf,hoursOf,summarizeSigned,validate} = sandbox.module.exports;

test('months are restricted to valid month keys', () => {
  assert.equal(validMonth('2026-10'),true);
  assert.equal(validMonth('2026-13'),false);
  assert.equal(validMonth('2030-00'),false);
});
test('category mapping uses codes and legacy activity labels', () => {
  assert.equal(categoryOf({service_category:'335-a'}),'335-A');
  assert.equal(categoryOf({activities:['Training with category 335-B']}),'335-B');
  assert.equal(categoryOf({activities:'Skills work for service 334'}),'334');
  assert.equal(categoryOf({activities:'Unknown'}),null);
});
test('signed record totals preserve uncategorized hours', () => {
  const data=summarizeSigned([
    {service_category:'334', total_minutes:360},
    {service_category:'335-A', total_minutes:450},
    {service_category:'335-B',total_minutes:300},
    {activities:'Uncategorized',total_minutes:120}
  ]);
  assert.equal(data['334'],6);
  assert.equal(data['335-A'],7.5);
  assert.equal(data['335-B'],5);
  assert.equal(data.uncategorized,2);
  assert.equal(data.total,20.5);
});
test('end time fallback correctly handles midnight', () => {
  assert.equal(hoursOf({total_minutes:null,start_time:'22:00:00',end_time:'01:30:00'}),3.5);
});
test('accepts decimal manual values but rejects negatives and excessive totals', () => {
  assert.equal(JSON.stringify(validate([30,48.5,38])),JSON.stringify([30,48.5,38]));
  assert.throws(()=>validate([-1,4,5]));
  assert.throws(()=>validate([300,300,200]));
  assert.throws(()=>validate([10.123,2,3]));
});
test('tracker distinguishes display adjustment from official session warnings', () => {
  const publicScript=fs.readFileSync(path.join(__dirname,'../omar-service-hours.js'),'utf8');
  assert.match(publicScript,/ADMIN-ADJUSTED DISPLAY/);
  assert.match(publicScript,/aggregate = official/);
  assert.match(publicScript,/readManual/);
  assert.match(publicScript,/warnSession/);
});
test('admin baseline covers a signed chart missing start and end times without editing it', () => {
  const source = fs.readFileSync(path.join(__dirname,'../omar-service-hours.js'),'utf8');
  const extract = source.slice(source.indexOf('  function reconcileLogistics('),source.indexOf('  function applyLaterSignedToManual('));
  const reconcile = new Function('hoursFor','categoryFor',extract+';return reconcileLogistics;')(
    row => Number(row.total_minutes || 0) / 60,
    row => row.service_category
  );
  const rows = [
    {service_date:'2026-11-06',service_category:'335-B',total_minutes:null,signed_at:'2026-11-06T23:07:25Z'},
    {service_date:'2026-11-17',service_category:'335-A',total_minutes:360,signed_at:'2026-11-17T22:06:00Z'},
    {service_date:'2026-11-18',service_category:'335-A',total_minutes:360,signed_at:'2026-11-19T02:38:26Z'}
  ];
  const original = {month:'2026-11',rows,categories:{'334':22,'335-A':26,'335-B':38},total:86,uncategorized:0};
  const baseline = {manual_override:true,manual_updated_at:'2026-11-17T04:50:34Z',robert_hours:72,ess_direct_hours:0};
  const result = reconcile(original,baseline);
  assert.equal(result.data.total,84); // Base 72 plus two new six-hour charts
  assert.equal(result.adjustment.kind,'conflict'); // Synthetic official data inconsistent with baseline
  // The production reconciliation assigns only positive, uniquely matched gaps.
  const correct = {...original,categories:{'334':22,'335-A':38,'335-B':38},total:98};
  const later = [...rows,
    {service_date:'2026-11-19',service_category:'335-A',total_minutes:360,signed_at:'2026-11-20T01:53:37Z'},
    {service_date:'2026-11-20',service_category:'334',total_minutes:480,signed_at:'2026-11-21T08:03:09Z'},
    {service_date:'2026-11-21',service_category:'335-A',total_minutes:360,signed_at:'2026-11-22T05:52:27Z'}
  ];
  const matched = reconcile({...correct,rows:later},baseline);
  assert.equal(matched.data.total,104);
  assert.equal(matched.data.categories['335-B'],44);
  assert.equal(matched.adjustment.date,'2026-11-06');
  assert.equal(original.categories['335-B'],38); // Official records are unchanged.
});

test('schema restricts anonymous edits and preserves an audit trail', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../db/omar-tracker-monthly-manual.sql'),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public.omar_tracker_monthly_manual/);
  assert.match(sql,/to anon using \(enabled = true\)/);
  assert.match(sql,/audit_omar_tracker_month/);
  assert.doesNotMatch(sql,/alter table ess\.daily_entries/i);
});
