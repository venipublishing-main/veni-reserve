import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import { Buffer } from 'node:buffer';

// Obtain a second, genuine access token for direct PostgREST assertions without
// decrypting the Worker's HTTP-only session or using an administrative JWT.
export async function authorizeClient({ auth, ok, client, token, callback }) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomUUID();
  const params = new URLSearchParams({
    response_type: 'code', scope: 'email', client_id: client.client_id, redirect_uri: callback, state,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  const start = await auth('/auth/v1/oauth/authorize?' + params);
  assert.equal(start.status, 302);
  const id = new URL(start.headers.get('location')).searchParams.get('authorization_id');
  assert.ok(id);
  const path = '/auth/v1/oauth/authorizations/' + encodeURIComponent(id);
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const details = await ok(await auth(path, { headers }), 'consent details');
  if (!details.redirect_url) assert.equal(details.client.id, client.client_id);
  const decision = details.redirect_url ? details : await ok(await auth(path + '/consent',
    { method: 'POST', headers, body: JSON.stringify({ action: 'approve' }) }), 'consent');
  const redirect = new URL(decision.redirect_url);
  assert.equal(redirect.origin + redirect.pathname, callback);
  assert.equal(redirect.searchParams.get('state'), state);
  const issued = await ok(await auth('/auth/v1/oauth/token', { method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(client.client_id + ':' + client.client_secret).toString('base64') },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: redirect.searchParams.get('code'),
      redirect_uri: callback, code_verifier: verifier }) }), 'token exchange');
  const claims = JSON.parse(Buffer.from(issued.access_token.split('.')[1], 'base64url'));
  assert.equal(claims.client_id, client.client_id);
  return { access: issued.access_token, refresh: issued.refresh_token, claims };
}

export async function verifyClientBoundary({ auth, ok, client, sibling, owner, direct, tenant, key, attributes, sql, callback }) {
  const rpc = async (name, token, body) => {
    const response = await auth('/rest/v1/rpc/reserve_' + name, {method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
    return ok(response,name);
  };
  const target = {target:tenant};
  const review = await rpc('read_business_onboarding',direct.access,target);
  assert.ok(review.revision > 0);
  const calls = [
    ['read_business_onboarding',target],
    ['read_publish_entitlement',target],
    ['save_business_onboarding',{...target,expected:review.revision,details:review.details}],
    ['activate_business_onboarding',{...target,review_key:review.review_key}],
    ['create_catalogue_item',{...target,kind:'service',request_key:key,attributes}],
    ['create_catalogue_item',{...target,kind:'service',request_key:randomUUID(),attributes}],
  ];
  async function denied(token) {
    for (const [name,body] of calls) assert.deepEqual(await rpc(name,token,body),{error:'tenant_unavailable'},name);
    assert.deepEqual(await rpc('list_setup_tenants',token,{}),[]);
    assert.equal(await rpc('current_reserve_user',token,{}),null);
  }
  await denied(owner.token); // Website login without an OAuth client_id.
  const other = await authorizeClient({auth,ok,client:sibling,token:owner.token,callback});
  assert.equal(other.claims.role,'authenticated');
  await denied(other.access); // Same owner, same role, different registered OAuth client.
  const terminated = await authorizeClient({auth,ok,client,token:owner.token,callback});
  assert.match(terminated.claims.session_id,/^[0-9a-f-]{36}$/);
  assert.equal(await rpc('current_reserve_user',terminated.access,{}),owner.id);
  sql("delete from auth.sessions where id='"+terminated.claims.session_id+"'");
  await denied(terminated.access);
  // Exercise the consent predicate independently while the provider session still exists.
  sql("update auth.oauth_consents set revoked_at=now() where client_id='"+client.client_id+"' and user_id='"+owner.id+"'");
  assert.equal(sql("select count(*) from auth.sessions where id='"+direct.claims.session_id+"'"),'1');
  await denied(direct.access);
  sql("update auth.oauth_consents set revoked_at=null where client_id='"+client.client_id+"' and user_id='"+owner.id+"'");
  const revoke = await auth('/auth/v1/user/oauth/grants?client_id=' + client.client_id,
    {method:'DELETE',headers:{Authorization:'Bearer '+owner.token}});
  assert.equal(revoke.status,204);
  await denied(direct.access);
  assert.equal((await auth('/auth/v1/user',{headers:{Authorization:'Bearer '+owner.token}})).status,200);
}
