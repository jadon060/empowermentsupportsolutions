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
  assert.match(dashboard, /admin-notebooks\.js\?v=20261016-client-rpc-fix/);
});
