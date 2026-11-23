'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../client-portal-hayden-format.js'), 'utf8');
const sandbox = { module: { exports: {} }, document: { addEventListener() {} } };
vm.runInNewContext(source, sandbox, { filename: 'client-portal-hayden-format.js' });
const { reconcileManualLogistics } = sandbox.module.exports;

const base = {
  manual_override: true,
  manual_updated_at: '2026-11-17T04:50:34.147Z',
  monthly_approved_hours: 122,
  robert_hours: 72,
  ess_direct_hours: 0,
  completed_hours: 72,
  remaining_hours: 50
};
const signedRows = [
  { signed_at: '2026-11-17T03:17:50Z', service_date: '2026-11-16', staff_id: 'ivan', total_minutes: 360 },
  { signed_at: '2026-11-17T22:06:00Z', service_date: '2026-11-17', staff_id: 'ivan', total_minutes: 360 },
  { signed_at: '2026-11-19T02:38:26Z', service_date: '2026-11-18', staff_id: 'ivan', total_minutes: 360 },
  { signed_at: null, service_date: '2026-11-18', staff_id: 'ivan', total_minutes: 360 }
];
const hours = row => (Number(row.total_minutes) || 0) / 60;
const isDirect = name => name === 'ESS Direct';

test('Nov 16 admin baseline 72 plus two later 6-hour charts becomes 84', () => {
  const result = reconcileManualLogistics(base, signedRows, new Map([['ivan', 'Ivan']]), hours, isDirect);
  assert.equal(result.row.completed_hours, 84);
  assert.equal(result.row.remaining_hours, 38);
  assert.equal(result.row.robert_hours, 84);
  assert.equal(result.addedHours, 12);
  assert.equal(result.addedCharts, 2);
});

test('repeated refreshes do not increment saved baseline or count a chart twice', () => {
  const first = reconcileManualLogistics(base, signedRows, new Map(), hours, isDirect);
  const refreshed = reconcileManualLogistics(base, signedRows, new Map(), hours, isDirect);
  assert.equal(first.row.completed_hours, 84);
  assert.equal(refreshed.row.completed_hours, 84);
  assert.equal(base.completed_hours, 72);
});

test('later-signed backdated charts count, unsigned charts and older charts do not', () => {
  const rows = [
    { signed_at: '2026-11-18T10:00:00Z', service_date: '2026-11-01', total_minutes: 120, staff_id: 'ivan' },
    { signed_at: '2026-11-16T10:00:00Z', service_date: '2026-11-16', total_minutes: 300, staff_id: 'ivan' },
    { signed_at: null, service_date: '2026-11-18', total_minutes: 600, staff_id: 'ivan' }
  ];
  assert.equal(reconcileManualLogistics(base, rows, new Map(), hours, isDirect).row.completed_hours, 74);
});

test('manual corrections to staff and ESS direct hours preserve correct buckets', () => {
  const adjusted = {...base, robert_hours: 30, ess_direct_hours: 20, completed_hours: 50};
  const entries = [
    { signed_at: '2026-11-18T10:00:00Z', total_minutes: 60, staff_id: 'ivan' },
    { signed_at: '2026-11-18T11:00:00Z', total_minutes: 120, staff_id: 'ess' }
  ];
  const result = reconcileManualLogistics(adjusted, entries, new Map([['ivan', 'Ivan'], ['ess', 'ESS Direct']]), hours, isDirect);
  assert.equal(result.row.robert_hours, 31);
  assert.equal(result.row.ess_direct_hours, 22);
  assert.equal(result.row.completed_hours, 53);
});

test('new manual save resets the cutoff and preserves the new baseline', () => {
  const revised = {...base, manual_updated_at: '2026-11-19T05:00:00Z', robert_hours: 84, completed_hours: 84};
  const result = reconcileManualLogistics(revised, signedRows, new Map(), hours, isDirect);
  assert.equal(result.row.completed_hours, 84);
  assert.equal(result.addedHours, 0);
});

test('a missing baseline timestamp does not silently add unknown historical sessions', () => {
  const result = reconcileManualLogistics({...base, manual_updated_at: null}, signedRows, new Map(), hours, isDirect);
  assert.equal(result.missingBaseline, true);
  assert.equal(result.row.completed_hours, 72);
});

test('portal loads this fix and retrieves only signed records', () => {
  const html = fs.readFileSync(path.join(__dirname, '../omar-v.html'), 'utf8');
  assert.match(html, /client-portal-hayden-format\.js\?v=20261123-omar-time-validation/);
  assert.match(source, /\.not\('signed_at','is',null\)/);
  assert.match(source, /if\(row.manual_override\)loadLogistics\(\)/);
});
