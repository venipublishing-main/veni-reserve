// Acceptance against the Account team's already-configured, disposable Performance role fixture.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { URL, URLSearchParams } from 'node:url';
import { authorizeClient } from './onboarding-oauth.mjs';

const stack = resolve(process.argv[2]);
assert.match(readFileSync(resolve(stack,'supabase/config.toml'),'utf8'), /^project_id = "reserve_account_role_review"$/m);
const cli = resolve('node_modules/supabase/dist/supabase.js');
const state = JSON.parse(execFileSync(process.execPath,[cli,'status','--workdir',stack,'-o','json'],
  {encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const origin = 'http://127.0.0.1:58421';
assert.equal(state.API_URL,origin);
const sql = input => execFileSync('docker',['exec','-i','supabase_db_reserve_account_role_review','psql',
  '-XAtq','-v','ON_ERROR_STOP=1','-U','postgres'],{input,encoding:'utf8'}).trim();
const callback = 'http://127.0.0.1:58431/auth/veni/callback';
const json = {'Content-Type':'application/json'};
const auth = (path,init={}) => {
  const url = new URL(path,origin);
  assert.equal(url.origin,origin);
  return globalThis.fetch(url,{...init,redirect:'manual',signal:globalThis.AbortSignal.timeout(10000),
    headers:{apikey:state.PUBLISHABLE_KEY,...init.headers}});
};
async function ok(response,label) { assert.ok(response.ok,label+' HTTP '+response.status); return response.json(); }
const post = (path,body,headers) => auth(path,{method:'POST',headers:{...json,...headers},body:JSON.stringify(body)});
const bearer = token => ({Authorization:'Bearer '+token});
const rpc = (name,token,body={}) => post('/rest/v1/rpc/'+name,body,bearer(token));
const admin = {...bearer(state.SERVICE_ROLE_KEY),apikey:state.SERVICE_ROLE_KEY};
async function client(name,role) {
  const c = await ok(await post('/auth/v1/admin/oauth/clients',{name,redirect_uris:[callback],
    client_type:'confidential',token_endpoint_auth_method:'client_secret_basic'},admin),'register');
  assert.match(c.client_id,/^[0-9a-f-]{36}$/);
  // Only synthetic client classifications. Hook definition and configuration are untouched.
  sql(`insert into veni_account_routing.oauth_clients values ('${c.client_id}','${role}')`);
  return c;
}
const website = await ok(await post('/auth/v1/signup',{email:randomUUID()+'@example.invalid',password:randomUUID()+'aA!'}),'Website signup');
assert.match(website.user.id,/^[0-9a-f-]{36}$/);
const reserve = await client('Reserve fixture','authenticated');
const performance = await client('Performance fixture','performance_api');
sql(`insert into reserve_internal.oauth_clients values ('${reserve.client_id}');
    insert into performance_internal.oauth_clients values ('${performance.client_id}');
    insert into public.entitlements(user_id,product_id) select '${website.user.id}',id from public.products where slug='veni-performance'`);
const issue = client => authorizeClient({auth,ok,client,token:website.access_token,callback});
const r = await issue(reserve), p = await issue(performance);
assert.equal(r.claims.role,'authenticated'); assert.equal(p.claims.role,'performance_api');
const tenant = await ok(await rpc('reserve_bootstrap_setup_tenant',r.access,{request_key:randomUUID()}),'Reserve bootstrap');
const target = {target:tenant.tenant_id};
assert.ok((await ok(await rpc('reserve_read_business_onboarding',r.access,target),'Reserve draft')).checks);
for (const [name,body] of [
  ['read_business_onboarding',target],['read_publish_entitlement',target],
  ['save_business_onboarding',{...target,expected:0,details:{}}],
  ['activate_business_onboarding',{...target,review_key:'unused'}],
  ['create_catalogue_item',{...target,kind:'service',request_key:randomUUID(),attributes:{}}],
]) {
  const denied = await rpc('reserve_'+name,p.access,body);
  assert.equal(denied.status,403,name);
  assert.equal((await denied.json()).code,'42501',name);
}
const org = await ok(await rpc('performance_create_organization',p.access,{p_name:'Synthetic club',p_kind:'Club'}),'Performance setup');
assert.ok((await ok(await rpc('performance_workspace',p.access),'Performance workspace')).roles.some(row=>row.organization_id===org && row.role==='owner'));
assert.equal((await rpc('performance_workspace',r.access)).status,403);
for (const [c,token,role] of [[performance,p,'performance_api'],[reserve,r,'authenticated']]) {
  const refreshed = await ok(await auth('/auth/v1/oauth/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(c.client_id+':'+c.client_secret).toString('base64')},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:token.refresh})}),'OAuth refresh');
  const claims = JSON.parse(Buffer.from(refreshed.access_token.split('.')[1],'base64url'));
  assert.equal(claims.role,role);
  assert.equal(claims.client_id,c.client_id);
  assert.equal((await rpc(role==='performance_api'?'performance_workspace':'reserve_list_setup_tenants',refreshed.access_token)).status,200);
}
assert.equal((await auth('/auth/v1/user/oauth/grants?client_id='+performance.client_id,
  {method:'DELETE',headers:bearer(website.access_token)})).status,204);
assert.equal((await rpc('reserve_read_business_onboarding',r.access,target)).status,200);
const rotated = await ok(await post('/auth/v1/token?grant_type=refresh_token',{refresh_token:website.refresh_token}),'Website refresh');
assert.equal(rotated.user.id,website.user.id);
assert.equal((await auth('/rest/v1/profiles?select=id',{headers:bearer(rotated.access_token)})).status,200);
globalThis.console.log('PASS dedicated Performance denial on all five Reserve RPCs, product-specific access, Website and both OAuth refreshes');
