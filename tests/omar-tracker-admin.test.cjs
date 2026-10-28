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
test('schema restricts anonymous edits and preserves an audit trail', () => {
  const sql=fs.readFileSync(path.join(__dirname,'../db/omar-tracker-monthly-manual.sql'),'utf8');
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public.omar_tracker_monthly_manual/);
  assert.match(sql,/to anon using \(enabled = true\)/);
  assert.match(sql,/audit_omar_tracker_month/);
  assert.doesNotMatch(sql,/alter table ess\.daily_entries/i);
});
