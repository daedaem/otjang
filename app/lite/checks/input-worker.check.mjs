import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('runtime input cache ignores a successful HTML login fallback and keeps real JS/CSS only', async () => {
  const handlers={}, stored=[], pending=[];
  let response=new Response('<form>login</form>',{status:200,headers:{'content-type':'text/html'}});
  const context=vm.createContext({ URL, Response, fetch:async()=>response, caches:{match:async()=>undefined,open:async()=>({put:async(request)=>stored.push(request.url)})}, self:{location:{origin:'https://app.example'},addEventListener:(name,handler)=>handlers[name]=handler} });
  const code=fs.readFileSync(new URL('../src/sw.js',import.meta.url),'utf8').replace('= __SHELL__;','= [];');
  vm.runInContext(code,context);
  const get=async(path)=>{let result;handlers.fetch({request:new Request('https://app.example'+path),respondWith:p=>result=p,waitUntil:p=>pending.push(p)});await result;await Promise.all(pending);};
  await get('/react/input-one.js'); assert.deepEqual(stored,[]);
  response=new Response('export {}',{status:200,headers:{'content-type':'text/javascript'}});
  await get('/react/input-one.js'); assert.deepEqual(stored,['https://app.example/react/input-one.js']);
  response=new Response('body{}',{status:200,headers:{'content-type':'text/css'}});
  await get('/react/input-one.css'); assert.equal(stored.length,2);
});
