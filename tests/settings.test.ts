import { afterEach, describe, expect, it, vi } from "vitest";
import { businessSettings, settingsInput } from "../app/lib/business-settings.server";
const id = "aaaaaaaa-1111-4444-8888-111111111111";
const env = {VENI_ENV:"dev",SUPABASE_URL:"http://127.0.0.1:54321",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test"};
const auth = "Bearer synthetic.test.sentinel";
const settings = {display_name:"Example Salon A",timezone:"America/Toronto",default_locale:"en-CA",default_currency:"CAD",terminology:{}};
const input = {expected_revision:0, settings};
function call(body?: string, media="application/json", method=body===undefined?"GET":"PUT", bearer=auth) {
  return businessSettings(new Request("https://worker.test", {method,body,headers:{"Content-Type":media,Authorization:bearer,"X-Other":"not-forwarded"}}),id,env);
}
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
describe("settings parsing before dispatch",()=>{
  it.each([
    '{"expected_revision":0,"expected_revision":1}',
    '{"settings":{"display_name":"a","display\\u005fname":"b"}}',
    '{"settings":{"terminology":{"staff_member":{},"staff_member":{}}}}',
    '{"settings":{"terminology":{"staff_member":{"plural":"x","plural":"y"}}}}',
    '{', '[] trailing',
  ])("rejects malformed/duplicate JSON %#",async body=>{
    const f=vi.fn();vi.stubGlobal("fetch",f);
    expect((await call(body)).status).toBe(400);expect(f).not.toHaveBeenCalled();
  });
  it("checks the streaming byte limit",async()=>{
    expect((await call(" ".repeat(8193))).status).toBe(413);
  });
  it("rejects invalid UTF-8",async()=>{
    const r=new Request("https://worker.test",{method:"PUT",headers:{Authorization:auth,"Content-Type":"application/json"},body:new Uint8Array([0xc0,0xaf])});
    expect((await businessSettings(r,id,env)).status).toBe(400);
  });
  it("checks media, method, selector and bearer",async()=>{
    expect((await call("{}","text/plain")).status).toBe(415);
    const r=await call(undefined,"application/json","DELETE");
    expect(r.status).toBe(405);expect(r.headers.get("Allow")).toBe("GET, PUT");
    expect((await businessSettings(new Request("https://worker.test"),"bad",env)).status).toBe(400);
    expect((await call(undefined,"application/json","GET","")).status).toBe(401);
  });
  it.each([{},[],null,{...input,actor:"x"},{...input,expected_revision:"0"},{...input,expected_revision:1.1},
    ...Object.entries({display_name:["","  ","x".repeat(121),"\ud800","x\u0080","\u00a0x","a\u202eb","{x}"],
      timezone:["US/Eastern","america/Toronto","+02:00","EST"],default_locale:["zz-ZZ","en_CA","en-Latn","und"],default_currency:["XXX","ZZZ","123"],
      terminology:[null,{other:"x"},{staff_member:{singular:"Stylist"}},{staff_member:{singular:"Stylist",plural:"S",code:"x"}}]})
      .flatMap(([field,values])=>values.map(value=>({...input,settings:{...settings,[field]:value}}))),
  ])("semantic error returns 422 %#",async value=>{
    expect((await call(JSON.stringify(value))).status).toBe(422);
  });
  it("normalizes code points, preserves internal spacing and accepts genuine X currencies",()=>{
    expect(settingsInput({...input,settings:{...settings,display_name:" Cafe\u0301  北 ",default_locale:"EN-ca",default_currency:"xof"}}))
      .toMatchObject({display_name:"Café  北",default_locale:"en-CA",default_currency:"XOF"});
  });
});
describe("caller transport",()=>{
  it.each([0,1])("saves at matching revision %i",async r=>{
    const f=vi.fn<typeof fetch>().mockResolvedValue(Response.json({state:"configured",revision:r+1,settings}));
    vi.stubGlobal("fetch",f);
    const response=await call(JSON.stringify({...input,expected_revision:r}));
    expect(response.status).toBe(r===0?201:200);expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({state:"configured",revision:r+1,settings});
    expect(f).toHaveBeenCalledTimes(1);
    const [url,init]=f.mock.calls[0];expect(String(url)).toBe(env.SUPABASE_URL+"/rest/v1/rpc/save_tenant_business_settings");
    expect(init?.headers).toEqual({"Content-Type":"application/json",apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth});
    expect(init?.redirect).toBe("manual");
  });
  it.each([["unauthorized",403],["tenant_unavailable",404],["revision_conflict",409],["invalid_input",422],["dependency_unavailable",503]] as const)("maps %s",async(code,status)=>{
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:code,detail:"private"})));
      const r=await call();expect(r.status).toBe(status);expect(await r.json()).toEqual({error:{code}});
    });
  it.each([302,500])("withholds HTTP %i details",async status=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("upstream private",{status})));
    const r=await call();expect(r.status).toBe(503);expect(await r.json()).toEqual({error:{code:"dependency_unavailable"}});
  });
  it("lost response does not repeat a write",async()=>{
    const f=vi.fn().mockRejectedValue(new Error(auth));vi.stubGlobal("fetch",f);
    const r=await call(JSON.stringify(input));expect(r.status).toBe(503);expect(await r.json()).toEqual({error:{code:"dependency_unavailable"}});
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("times out without exposing a provider error",async()=>{
    vi.useFakeTimers();const f=vi.fn<typeof fetch>().mockImplementation((_u,init)=>new Promise((_r,reject)=>init?.signal?.addEventListener("abort",()=>reject(new Error(auth)))));
    vi.stubGlobal("fetch",f);const pending=call();await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(503);expect(f).toHaveBeenCalledTimes(1);
  });
});
