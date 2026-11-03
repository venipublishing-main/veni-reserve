// Disposable GoTrue instances exercise provider-side expiry and foreign signatures.
// Only local public-key and bearer requests leave this process, over loopback.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

function docker(args: string[], env = process.env) {
  try {
    return execFileSync("docker", args, {env,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
  } catch { throw new Error("Disposable local issuer Docker operation failed"); }
}

export async function issueNegativeToken(kind:"expired"|"foreign") {
  const original=JSON.parse(docker(["inspect","supabase_auth_veni-reserve"]))[0];
  if(original.Config.Labels["com.supabase.cli.project"]!=="veni-reserve" ||
      !original.NetworkSettings.Networks["supabase_network_veni-reserve"] || !original.State.Running) {
    throw new Error("Refusing unexpected source Auth instance");
  }
  const env: Record<string,string>={};
  for(const line of original.Config.Env as string[]){
    const cut=line.indexOf("="), key=line.slice(0,cut);
    if(key.startsWith("GOTRUE_")||key==="API_EXTERNAL_URL")env[key]=line.slice(cut+1);
  }
  const db=new URL(env.GOTRUE_DB_DATABASE_URL);
  if(!["supabase_db_veni-reserve","db"].includes(db.hostname))throw new Error("Refusing non-local issuer database");
  env.GOTRUE_JWT_EXP=kind==="expired"?"2":"300";
  env.GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED="true";
  if(kind==="foreign"){
    env.API_EXTERNAL_URL="http://127.0.0.1/foreign-local-project";
    env.GOTRUE_JWT_ISSUER=env.API_EXTERNAL_URL+"/auth/v1";
    delete env.GOTRUE_JWT_KEYS;
    env.GOTRUE_JWT_SECRET=randomBytes(48).toString("base64");
    env.GOTRUE_JWT_VALID_METHODS="HS256";
    env.GOTRUE_JWT_VALIDMETHODS="HS256";
  }
  const name="veni-m21-issuer-"+randomUUID();
  const id=docker(["run","--rm","-d","--pull","never","--name",name,"--log-driver","none",
    "--label","com.supabase.cli.project=veni-reserve","--network","supabase_network_veni-reserve",
    "-p","127.0.0.1::"+env.GOTRUE_API_PORT,...Object.keys(env).flatMap(k=>["-e",k]),original.Image],{...process.env,...env});
  try {
    const port=docker(["port",id,env.GOTRUE_API_PORT+"/tcp"]);
    if(!/^127\.0\.0\.1:\d+$/.test(port))throw new Error("Unexpected local issuer port");
    const base="http://"+port;
    let ready=false;
    for(let i=0;i<60&&!ready;i++){
      try {ready=(await fetch(base+"/health",{redirect:"error",signal:AbortSignal.timeout(1000)})).ok;} catch { /* starting */ }
      if(!ready)await delay(250);
    }
    if(!ready)throw new Error("Disposable local issuer failed to start");
    const res=await fetch(base+"/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",redirect:"error"});
    if(!res.ok)throw new Error("Local issuer signup failed ("+res.status+")");
    const {access_token:token}=await res.json() as {access_token:string};
    const claims=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());
    if(!claims.is_anonymous||claims.iss!==env.GOTRUE_JWT_ISSUER||claims.exp-claims.iat!==Number(env.GOTRUE_JWT_EXP))
      throw new Error("Unexpected local issuer token class");
    return {token,expires:claims.exp as number};
  } finally {
    // --rm removes already-exited instances. Only stop the id returned above.
    if(docker(["ps","-q","--no-trunc","--filter","id="+id])===id)docker(["stop","-t","2",id]);
  }
}
