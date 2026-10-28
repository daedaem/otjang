// Synthetic HTTPS transport for the real Worker/account/session code. No outside requests.
import { DatabaseSync } from 'node:sqlite';
import { createWorker } from '../worker.js';
import { handlePrivateSession } from '../functions/lib/private-session.js';
export const ACCOUNT_ORIGIN='https://account.test';
export const ADMIN_PASSWORD='qa-admin-browser-password';
const LOCAL='http://127.0.0.1:8792';
function database() {
  const raw=new DatabaseSync(':memory:');
  return {raw,prepare(sql){let args=[];const st={bind(...a){args=a;return st;},async first(){return raw.prepare(sql).get(...args)??null;},async all(){return {results:raw.prepare(sql).all(...args)};},execute(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};},async run(){return st.execute();}};return st;},async batch(st){raw.exec('BEGIN');try{const result=st.map(s=>s.execute());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
export async function serveAccounts(page,options={}) {
  const privateDb=database(), db=database();
  const env={PRIVATE_AUTH_MODE:'session',PRIVATE_APP_ACCESS_KEY:'qa-old-browser-owner',MEMBER_APP_MODE:'accounts',COMMUNITY_MODE:'private',RANK_DB:privateDb,CROWD_DB:privateDb,COMMUNITY_DB:db};
  const blocked=async()=>Response.json({code:'qa_provider_blocked'},{status:503});
  const worker=createWorker({rank:blocked,garmentPhoto:blocked,weather:blocked,rakuten:blocked,adpick:blocked,openProducts:blocked,catalog:blocked});
  const request=(path,method='GET',body,headers={})=>new Request(ACCOUNT_ORIGIN+path,{method,headers:{origin:ACCOUNT_ORIGIN,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const call=(path,method='GET',body,headers={})=>worker.fetch(request(path,method,body,headers),env);
  let setupPosts=0;
  await page.context().route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(url.origin!==ACCOUNT_ORIGIN) return route.abort();
    if(url.pathname==='/_private/admin-setup' && r.method()==='POST') {
      setupPosts++;
      if(options.failSetupOnce && setupPosts===1) return route.fulfill({status:503,contentType:'application/json',body:'{"message":"QA 연결 실패: 입력을 보존해 주세요"}'});
      if(options.setupGate) await options.setupGate();
    }
    const runtime={...env,ASSETS:{fetch:async assetRequest=>{
      const u=new URL(assetRequest.url);
      const asset=await route.fetch({url:LOCAL+u.pathname+u.search,method:'GET'});
      return new Response(await asset.body(),{status:asset.status(),headers:asset.headers()});
    }}};
    const body=r.postDataBuffer();
    const requestHeaders=await r.allHeaders();
    // The intercepted HTTPS host has no network server. Use the browser's own
    // eligible cookie jar when WebKit omits Cookie from interception metadata.
    if(!requestHeaders.cookie) {
      const jar=await page.context().cookies(r.url());
      if(jar.length) requestHeaders.cookie=jar.map(c=>c.name+'='+c.value).join('; ');
    }
    const result=await worker.fetch(new Request(r.url(),{method:r.method(),headers:requestHeaders,...(body&&r.method()!=='GET'?{body}: {})}),runtime);
    const headers=Object.fromEntries(result.headers);const cookies=result.headers.getSetCookie();
    if(cookies.length) headers['set-cookie']=cookies.join('\n');
    // WebKit route.fulfill cannot return a redirect. Node checks assert the real
    // 303; this same-origin HTML bridge exercises the subsequent browser page.
    if([301,302,303,307,308].includes(result.status) && headers.location) {
      const next=new URL(headers.location,ACCOUNT_ORIGIN);
      if(next.origin!==ACCOUNT_ORIGIN) throw Error('External QA redirect is blocked');
      delete headers.location;headers['content-type']='text/html; charset=utf-8';
      return route.fulfill({status:200,headers,body:'<!doctype html><script>location.replace('+JSON.stringify(next.href)+')</script>'});
    }
    await route.fulfill({status:result.status,headers,body:Buffer.from(await result.arrayBuffer())});
  });
  const addCookie=async(response,name)=>{
    const header=response.headers.getSetCookie().find(x=>x.startsWith(name+'='));
    if(!header) throw Error('Expected real QA session cookie');
    await page.context().addCookies([{name,value:header.split(';')[0].slice(name.length+1),url:ACCOUNT_ORIGIN,secure:true,httpOnly:true,sameSite:'Lax'}]);
  };
  const legacy=async()=>{
    const response=await handlePrivateSession(request('/_private/session','POST',{password:env.PRIVATE_APP_ACCESS_KEY}),env);
    await addCookie(response,'__Host-otjang-session');return response.headers.getSetCookie().find(x=>x.startsWith('__Host-otjang-session='))?.split(';')[0];
  };
  return {env,db,call,legacy,addCookie,setupPosts:()=>setupPosts};
}
