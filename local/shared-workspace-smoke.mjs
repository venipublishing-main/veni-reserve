// Run against a disposable Website + Reserve stack after all nine migrations.
// All test credentials are generated here and stay on the local machine.
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const provider = 'http://127.0.0.1:56321';
const app = 'http://127.0.0.1:5193';
const callback = app + '/auth/veni/callback';
const stack = process.argv[2];
assert.ok(stack && readFileSync(resolve(stack, 'supabase/config.toml'), 'utf8')
  .includes('project_id = "veni_consolidation_1117"'), 'Use the isolated consolidation stack');
const cli = resolve('node_modules/supabase/dist/supabase.js');
const state = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--workdir', resolve(stack), '-o', 'json'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
assert.equal(state.API_URL, provider);
const clientPath = '/auth/v1/admin/oauth/clients';
const json = { 'Content-Type': 'application/json' };
async function auth(path, init = {}) {
  const url = new URL(path, provider);
  assert.equal(url.origin, provider);
  return globalThis.fetch(url, { ...init, redirect: 'manual', signal: globalThis.AbortSignal.timeout(10000),
    headers: { apikey: state.PUBLISHABLE_KEY, ...init.headers } });
}
const admin = { ...json, apikey: state.SERVICE_ROLE_KEY, Authorization: 'Bearer ' + state.SERVICE_ROLE_KEY };
const local = (path, init = {}) => {
  const url = new URL(path, app);
  assert.equal(url.origin, app);
  return globalThis.fetch(url, { ...init, redirect: 'manual', signal: globalThis.AbortSignal.timeout(20000) });
};
const cookie = (r, name) => {
  const value = r.headers.getSetCookie().find(v => v.startsWith(name + '='));
  assert.ok(value, name + ' cookie missing');
  return value.split(';')[0];
};
const ok = async (r, label) => {
  if (!r.ok) {
    const code = (await r.json().catch(() => ({}))).error;
    throw new Error(label + ' returned HTTP ' + r.status + (typeof code === 'string' ? ' (' + code + ')' : ''));
  }
  return r.json();
};
let server, client, ownsVars = false;
try {
  client = await ok(await auth(clientPath, { method: 'POST', headers: admin,
    body: JSON.stringify({ name: 'Disposable Reserve ' + randomUUID(), redirect_uris: [callback],
      client_type: 'confidential', token_endpoint_auth_method: 'client_secret_basic' }) }), 'register');
  const vars = { SUPABASE_URL: provider, SUPABASE_PUBLISHABLE_KEY: state.PUBLISHABLE_KEY,
    VENI_ACCOUNT_MODE: 'shared', VENI_OAUTH_CLIENT_ID: client.client_id,
    VENI_OAUTH_CLIENT_SECRET: client.client_secret, VENI_OAUTH_COOKIE_KEY: randomBytes(32).toString('base64url') };
  writeFileSync('.dev.vars', Object.entries(vars).map(([k, v]) => k + '=' + JSON.stringify(v)).join('\n'),
    { flag: 'wx', mode: 0o600 });
  ownsVars = true;
  server = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
    '--port', '5193', '--strictPort'], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 90; i++) {
    assert.equal(server.exitCode, null, 'local Worker exited');
    try { if ((await local('/health')).ok) break; } catch { /* Server is starting. */ }
    await delay(1000);
  }
  async function signIn() {
    const user = await ok(await auth('/auth/v1/signup', { method: 'POST', headers: json,
      body: JSON.stringify({ email: randomUUID() + '@example.invalid', password: randomUUID() + 'aB!' }) }), 'sign up');
    const login = await local('/login');
    assert.equal(login.status, 302);
    const start = await local(login.headers.get('location'));
    const transaction = cookie(start, 'vr_transaction');
    const authorize = await auth(start.headers.get('location'));
    const consent = new URL(authorize.headers.get('location'));
    const id = consent.searchParams.get('authorization_id');
    assert.ok(id);
    const endpoint = '/auth/v1/oauth/authorizations/' + encodeURIComponent(id);
    const headers = { ...json, Authorization: 'Bearer ' + user.access_token };
    const details = await ok(await auth(endpoint, { headers }), 'consent details');
    assert.equal(details.client.id, client.client_id);
    assert.equal(details.redirect_uri, callback);
    const decision = await ok(await auth(endpoint + '/consent', { method: 'POST', headers,
      body: JSON.stringify({ action: 'approve' }) }), 'consent');
    const finish = await local(decision.redirect_url, { headers: { Cookie: transaction } });
    assert.equal(finish.status, 303, 'verified callback');
    assert.equal(finish.headers.get('location'), '/app');
    const session = cookie(finish, 'vr_session');
    assert.equal((await local('/app', { headers: { Cookie: session } })).status, 200);
    const r = await local('/api/workspace/session', { headers: { Cookie: session } });
    const info = await ok(r, 'workspace identity');
    assert.deepEqual(info.user, { id: user.user.id });
    assert.deepEqual(info.tenants, []);
    return { cookies: session + '; ' + cookie(r, 'vr_setup_request'), key: info.request_key };
  }
  const a = await signIn(), b = await signIn();
  const call = (actor, path, method = 'GET', body) => local('/api/workspace/' + path, {
    method, headers: { ...json, Cookie: actor.cookies, Origin: app },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const create = () => call(a, 'bootstrap', 'POST', { request_key: a.key });
  const tenant = await ok(await create(), 'create');
  assert.ok(tenant.tenant_id);
  assert.equal((await ok(await create(), 'retry')).tenant_id, tenant.tenant_id);
  const prefix = 'tenants/' + tenant.tenant_id + '/';
  const settings = { expected_revision: 0, settings: { display_name: 'Shared test business',
    timezone: 'Africa/Johannesburg', default_locale: 'en-ZA', default_currency: 'ZAR', terminology: {} } };
  assert.equal((await ok(await call(a, prefix + 'settings', 'PUT', settings), 'save settings')).revision, 1);
  for (const name of ['settings', 'themes', 'locations', 'services', 'staff', 'eligibility']) {
    assert.equal((await call(a, prefix + name)).status, 200, name);
    assert.equal((await call(b, prefix + name)).status, 404, name + ' tenant boundary');
  }
  assert.equal((await call(a, 'logout', 'POST')).status, 303);
  assert.equal((await call(a, 'session')).status, 401);
  globalThis.console.log('PASS shared Worker OAuth, verified sessions, tenant bootstrap/retry, settings and all private catalogues');
} finally {
  server?.kill();
  if (ownsVars) unlinkSync('.dev.vars');
  if (client?.client_id) await auth(clientPath + '/' + client.client_id, { method: 'DELETE', headers: admin });
}
