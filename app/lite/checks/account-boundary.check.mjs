import test from "node:test";
import assert from "node:assert/strict";
import {createWorker} from "../worker.js";
const ORIGIN="https://app.test";
const expected=async id=>"m-"+Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(id))).toString("hex").slice(0,32);
function setup(owner=false,id="qa-member"){
 const calls=[];
 const worker=createWorker({authorize:async()=>owner?{ok:true}:{ok:false,status:401},member:async()=>id,rank:async()=>{calls.push("rank");return Response.json({ok:true});}});
 const env={PRIVATE_AUTH_MODE:"session",MEMBER_APP_MODE:"invite",ASSETS:{fetch:async()=>new Response("<html><head></head><body>app</body></html>",{headers:{"content-type":"text/html"}})}};
 return {calls,worker,env};
}
for(const owner of [true,false])test((owner?"owner":"member")+" HTML carries a stable non-identifying storage scope",async()=>{
 const {worker,env}=setup(owner),html=await(await worker.fetch(new Request(ORIGIN+"/"),env)).text();
 const scope=owner?"owner":await expected("qa-member");
 assert.ok(html.includes('<meta name="hangit-storage-scope" content="'+scope+'">'));
 assert.ok(!html.includes("qa-member"));
});
test("stale or missing member scope is rejected before a paid or data-writing handler",async()=>{
 const {worker,env,calls}=setup();
 for(const scope of [undefined,"owner","m-"+"0".repeat(32)]){
  const headers={origin:ORIGIN,"content-type":"application/json",...(scope?{"x-hangit-scope":scope}:{})};
  const response=await worker.fetch(new Request(ORIGIN+"/api/rank",{method:"POST",headers,body:"{}"}),env);
  assert.equal(response.status,409);
 }
 assert.deepEqual(calls,[]);
 const response=await worker.fetch(new Request(ORIGIN+"/api/rank",{method:"POST",headers:{origin:ORIGIN,"content-type":"application/json","x-hangit-scope":await expected("qa-member")},body:"{}"}),env);
 assert.equal(response.status,200);assert.deepEqual(calls,["rank"]);
});
test("owner clients without the new header remain backwards compatible",async()=>{
 const {worker,env,calls}=setup(true);
 assert.equal((await worker.fetch(new Request(ORIGIN+"/api/rank",{method:"POST",body:"{}"}),env)).status,200);
 assert.deepEqual(calls,["rank"]);
});
