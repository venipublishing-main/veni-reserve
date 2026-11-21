import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { URL, URLSearchParams } from 'node:url';

const stack = process.argv[2];
assert.ok(readFileSync(join(stack,'supabase/config.toml'),'utf8').includes('project_id = "reserve_m32_local"'));
const status = JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',stack,'-o','json'],
  {encoding:'utf8',stdio:['ignore','pipe','ignore']}));
const origin = 'http://127.0.0.1:59421';
assert.equal(status.API_URL,origin);
const callback = 'http://127.0.0.1:59431/auth/veni/callback';

export function sql(input) {
  return execFileSync('docker',['exec','-i','supabase_db_reserve_m32_local','psql','-XAtq','-v','ON_ERROR_STOP=1','-U','postgres'],
    {input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
export function uuid(value) {
  assert.match(value,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  return value;
}
export function request(path, options = {}) {
  const url = new URL(path,origin);
  assert.equal(url.origin,origin);
  return globalThis.fetch(url,{...options,redirect:'manual',headers:{apikey:status.PUBLISHABLE_KEY,...options.headers}});
}
function post(path,body,headers = {}) {
  return request(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
}
export const rpc = (token,name,args) => post('/rest/v1/rpc/reserve_'+name,args,{Authorization:'Bearer '+token});
export async function ok(response) {
  const body = await response.json();
  assert.ok(response.ok,'HTTP '+response.status+' '+(body.message ?? body.error_description ?? body.error ?? ''));
  assert.ok(!body.error,body.error);
  return body;
}
export async function registerClient() {
  return ok(await post('/auth/v1/admin/oauth/clients',{name:'Synthetic Reserve '+randomUUID(),redirect_uris:[callback],
    client_type:'confidential',token_endpoint_auth_method:'client_secret_basic'},
    {apikey:status.SERVICE_ROLE_KEY,Authorization:'Bearer '+status.SERVICE_ROLE_KEY}));
}
export async function newUser() {
  const credentials = {email:randomUUID()+'@example.invalid',password:randomUUID()+'aB!'};
  const user = await ok(await post('/auth/v1/signup',credentials));
  return {id:uuid(user.user.id), token:user.access_token,credentials};
}
export async function signIn(user) {
  return (await ok(await post('/auth/v1/token?grant_type=password',user.credentials))).access_token;
}
export async function authorize(client, websiteToken) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomUUID();
  const query = new URLSearchParams({response_type:'code',redirect_uri:callback,scope:'email',state,
    client_id:client.client_id,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
  const start = await request('/auth/v1/oauth/authorize?'+query);
  assert.equal(start.status,302);
  const id = new URL(start.headers.get('location')).searchParams.get('authorization_id');
  const headers = {Authorization:'Bearer '+websiteToken};
  assert.ok(id);
  const path = '/auth/v1/oauth/authorizations/'+encodeURIComponent(id);
  const details = await ok(await request(path,{headers}));
  const decision = details.redirect_url ? details : await ok(await post(path+'/consent',{action:'approve'},headers));
  const redirect = new URL(decision.redirect_url);
  assert.equal(redirect.origin+redirect.pathname,callback);
  assert.equal(redirect.searchParams.get('state'),state);
  const result = await ok(await request('/auth/v1/oauth/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(client.client_id+':'+client.client_secret).toString('base64')},
    body:new URLSearchParams({grant_type:'authorization_code',redirect_uri:callback,code:redirect.searchParams.get('code'),code_verifier:verifier})}));
  return result.access_token;
}

export async function createPractitioner(token,target,name) {
  const person = await ok(await rpc(token,'save_tenant_staff',{target,staff:null,expected:0,attributes:{
    name,public_display_name:null,biography:null,status:'ACTIVE',public_visible:false,
    online_bookable:true,no_preference_eligible:true,sort_order:0}}));
  return uuid(person.staff_id);
}

export async function createBusiness(token,timezone='America/New_York') {
  const {tenant_id, membership_id} = await ok(await rpc(token,'bootstrap_setup_tenant',{request_key:randomUUID()}));
  const target = uuid(tenant_id);
  await ok(await rpc(token,'save_tenant_business_settings',{target,expected_revision:0,display_name:'Synthetic business',
    timezone,default_locale:'en-ZA',default_currency:'ZAR',staff_member_singular:null,staff_member_plural:null}));
  return {target,practitioner:await createPractitioner(token,target,'Synthetic practitioner'),member:uuid(membership_id)};
}
