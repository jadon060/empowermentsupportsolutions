const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('shared ESS PIN form has original one-field experience', () => {
  const html = read('login.html');
  assert.match(html, /id="pw" type="password"/);
  assert.match(html, /id="go"/);
  assert.match(html, /scope: 'shared', pin/);
  assert.doesNotMatch(html, /\b(?:ADMIN|OMAR|JEREMY|HAYDEN|FAMILY|STAFF)_PW\b/);
});

test('ESS login requests secure gateway without email or recovery workflow', () => {
  const html = read('login.html');
  assert.match(html, /ess-portal-auth/);
  assert.doesNotMatch(html, /signInWithOtp|resetPasswordForEmail|recovery=1|updateUser\(/);
});

test('shared PIN destinations for existing portals remain explicitly permitted', () => {
  const html = read('login.html');
  for (const destination of [
    '/portal/admin.html', '/omar-v.html', '/jeremy-n.html',
    '/Hayden_H.html', '/families.html', '/staff.html'
  ]) assert.ok(html.includes(destination), 'Missing portal destination: ' + destination);
  assert.match(html, /ESS_EXPORT_OMAR/);
  assert.match(html, /ESS_EXPORT_JEREMY/);
});

test('admin token is saved and RLS permission checked before redirect', () => {
  const html = read('login.html');
  assert.match(html, /auth\.setSession/);
  assert.match(html, /staff_hours_admin_access/);
  assert.ok(html.indexOf('auth.setSession') < html.indexOf('location.replace(result.destination)'));
});

test('notebook only uses existing admin session, never sends email links', () => {
  const js = read('portal/admin-notebooks.js');
  assert.doesNotMatch(js, /signInWithOtp|Email sign-in link|Secure sign-in link needed/);
  assert.match(js, /location\.replace\('\/login\.html\?admin=1'\)/);
  assert.match(js, /\$\('add-entry'\)\.addEventListener\('click',\(\)=>openEntry\(\)\)/);
});

test('client notebooks use scoped admin-only roster RPC instead of direct table SELECT', () => {
  const js = read('portal/admin-notebooks.js');
  assert.match(js, /sb\.rpc\('admin_notebook_clients'\)/);
  assert.doesNotMatch(js, /sb\.schema\('ess'\)\.from\('clients'\)/);
  const dashboard = read('portal/admin.html');
  assert.match(dashboard, /admin-notebooks\.js\?v=20261028-hours-pdf-v1/);
});

test('admin session is isolated from shared public charting clients', () => {
  const adminConfig = read('portal/admin-session.js');
  assert.match(adminConfig, /storageKey:'ess-admin-pin-session-v2'/);
  assert.match(adminConfig, /persistSession:true/);
  const login = read('login.html');
  assert.match(login, /sb-bqanjupmcgydvmfgvutx-auth-token/);
  assert.match(login, /admin-session\.js\?v=20261016-isolated-v2/);
  const dashboard = read('portal/admin.html');
  assert.match(dashboard, /admin-session\.js\?v=20261016-isolated-v2/);
});

test('official charting and green status indicators never inherit administrator JWT', () => {
  for (const filename of [
    'omar-service-hours.js',
    'client-portal-hayden-format.js',
    'Eric_L_chart.html',
    'eric-logistics.html',
    'Hayden_H.html',
    'client-logistics.html',
    'admin-export.html'
  ]) {
    const contents = read(filename);
    assert.match(contents, /persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/,
      filename + ' should use the original public charting role');
  }
  const shared = read('client-portal-hayden-format.js');
  assert.match(shared, /markDotsFromServer/);
  assert.match(shared, /daily_entries/);
  assert.match(shared, /daily_drafts/);
  const eric = read('Eric_L_chart.html');
  assert.match(eric, /markDotsFromServer/);
  assert.match(eric, /daily_entries/);
  assert.match(eric, /daily_drafts/);
});

test('iPhone cache-busting loads restored charting assets', () => {
  assert.match(read('omar-v.html'), /omar-service-hours\.js\?v=20261028-manual-v1/);
  assert.match(read('omar-v.html'), /client-portal-hayden-format\.js\?v=20261016-anon-restored/);
  assert.match(read('jeremy-n.html'), /client-portal-hayden-format\.js\?v=20261016-anon-restored/);
  assert.match(read('Eric_L.html'), /Eric_L_chart\.html\?v=20261016-anon-restored/);
  assert.match(read('Eric_L.html'), /eric-logistics\.html\?v=20261016-anon-restored/);
});

test('manual client-hours editor remains available for all existing client notebooks', () => {
  const dashboard=read('portal/admin.html');
  const notebooks=read('portal/admin-notebooks.js');
  const editor=read('portal/client-hours-admin.html');
  assert.match(dashboard,/id="manual-hours-link"/);
  assert.match(notebooks,/Manual client hours ↗/);
  assert.match(notebooks,/client-hours-admin\.html\?client=/);
  for(const name of ['omar','jeremy','hayden','eric'])assert.match(editor,new RegExp(name+':\\{id:'));
  assert.match(editor,/Save Manual Override/);
  assert.match(editor,/Return to Automatic Sync/);
  assert.match(editor,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
});

test('My Notes and simple pinned to-dos use one Admin Auth session with no second sign-in', () => {
  const dashboard=read('portal/admin.html');
  const organizer=read('portal/admin-organizer.js');
  const notebooks=read('portal/admin-notebooks.js');
  assert.match(dashboard,/id="todoText"/);
  assert.match(dashboard,/id="pinTodo"/);
  assert.match(dashboard,/id="todoList"/);
  assert.match(dashboard,/Cloud synced/);
  assert.match(dashboard,/admin-organizer\.js\?v=/);
  assert.match(organizer,/window\.ESSAdminSession/);
  assert.match(organizer,/staff_hours_admin_access/);
  assert.match(organizer,/admin_private_notes/);
  assert.match(organizer,/admin_todo_items/);
  assert.match(organizer,/note_text/);
  assert.match(organizer,/done:check\.checked/);
  assert.match(organizer,/deleted_at:new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(organizer,/signInWithOtp|resetPasswordForEmail/);
  assert.doesNotMatch(notebooks,/function saveNotes\(/);
});

test('legacy device notes are merged without overwriting records or deleting local backup',()=>{
  const organizer=read('portal/admin-organizer.js');
  assert.match(organizer,/ESS_Admin_PrivateNotes_v1/);
  assert.match(organizer,/ESS_Admin_PrivateNotes_CloudMigrated_v1/);
  assert.match(organizer,/ignoreDuplicates:true/);
  assert.match(organizer,/migrateLocal/);
  assert.doesNotMatch(organizer,/localStorage\.removeItem\(LEGACY_KEY\)/);
  assert.doesNotMatch(organizer,/localStorage\.setItem\(LEGACY_KEY/);
});

test('Omar client card includes the monthly service hours editor without changing existing links', () => {
  const notebooks=read('portal/admin-notebooks.js');
  const dashboard=read('portal/admin.html');
  const styles=read('portal/admin-dashboard.css');
  assert.match(notebooks, /c\.id==='521dd725-2fa6-4d78-9fcc-e5447dc727cb'/);
  assert.match(notebooks, /Edit service hours/);
  assert.match(notebooks, /'\/portal\/omar-tracker-admin\.html'/);
  assert.match(notebooks, /card\.append\(edit\)/);
  assert.match(notebooks, /Open portal ↗/);
  assert.match(notebooks, /Hours log →/);
  assert.match(notebooks, /Manual client hours ↗/);
  assert.match(styles, /\.client-card \.omar-service-hours-edit/);
  assert.match(dashboard, /admin-dashboard\.css\?v=20261028-hours-pdf-v1/);
});

test('staff notebooks expose authenticated PDF export for the selected month', () => {
  const page=read('portal/admin.html');
  const js=read('portal/admin-notebooks.js');
  const report=read('portal/staff-hours-report.html');
  const reportJs=read('portal/staff-hours-report.js');
  assert.match(page, /id="export-hours-pdf"/);
  assert.match(page, /admin-dashboard\.css\?v=20261028-hours-pdf-v1/);
  assert.match(js, /\['add-entry','refresh','export-hours-pdf'\]/);
  assert.match(js, /\$\('export-hours-pdf'\)\.addEventListener/);
  assert.match(js, /encodeURIComponent\(state\.client\.id\)/);
  assert.match(js, /encodeURIComponent\(state\.month\)/);
  assert.match(report, /id="print-report"/);
  assert.match(report, /id="staff-totals"/);
  assert.match(report, /id="report-entries"/);
  assert.match(report, /Save as PDF/);
  assert.match(reportJs, /staff_hours_admin_access/);
  assert.match(reportJs, /admin_notebook_clients/);
  assert.match(reportJs, /\.from\('admin_staff_hours'\)/);
  assert.match(reportJs, /\.is\('deleted_at',null\)/);
  assert.match(reportJs, /window\.print\(\)/);
  assert.doesNotMatch(reportJs, /\.insert\(|\.update\(|\.upsert\(/);
});
