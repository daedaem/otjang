import { test, expect, type Page } from '@playwright/test';
const key = 'eoul-d12-hang:v1';
const garmentName = '회귀검사용 여름 셔츠';
function driver(page: Page, mode: string) {
  return {
    async openManual() {
      await page.goto(`/?photos=0&input=${mode}#/reg`);
      await page.waitForFunction(() => !!window.K?.M);
      if (mode === 'react') await expect(page.getByRole('heading', {name:'어떤 옷을 가지고 있나요?'})).toBeVisible();
      else await expect(page.locator('#rb')).toBeVisible();
    },
    async fillManual() {
      if (mode === 'react') {
        await page.getByLabel('브랜드', {exact:true}).fill('합성 브랜드');
        await page.getByLabel('상품명', {exact:true}).fill(garmentName);
        await page.getByRole('button',{name:'다음',exact:true}).click();
        await page.getByRole('button',{name:'셔츠',exact:true}).click();
        await page.getByRole('button',{name:'화이트',exact:true}).click();
        await page.getByRole('button',{name:'다음',exact:true}).click();
      } else {
        await page.locator('#rb').fill('합성 브랜드'); await page.locator('#rn').fill(garmentName);
        // The duplicate rows are inserted above the choices asynchronously.
        // Wait for that actual layout change, then verify both taps registered.
        await expect(page.locator('#rdup .srow').first()).toBeVisible();
        await page.locator('#rf [data-k="shirt"]').click();
        await expect(page.locator('#rf [data-k="shirt"]')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#rf [data-c="white"]').click();
        await expect(page.locator('#rf [data-c="white"]')).toHaveAttribute('aria-pressed', 'true');
      }
    },
    async save() { await (mode === 'vanilla' ? page.locator('#rdone') : page.getByRole('button',{name:'옷장에 넣기',exact:true})).click(); },
  };
}
test.beforeEach(async ({page}) => {
  await page.route('**/*', async route => {
    const url=new URL(route.request().url());
    if(url.origin !== 'http://127.0.0.1:8792') return route.abort();
    if(url.pathname.startsWith('/api/')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],count:1,min:3})});
    return route.continue();
  });
});
for (const mode of ['vanilla','react']) {
  test(`${mode}: direct registration survives reload with metadata`, async ({page})=>{
    const d=driver(page,mode); await d.openManual(); await d.fillManual(); await d.save();
    await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
    await page.reload(); await page.waitForFunction(()=>!!window.K?.M);
    await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
    await page.locator('.shelf [data-g]').click();
    await expect(page.getByText('합성 브랜드',{exact:true}).first()).toBeVisible();
    expect(await page.evaluate(()=>window.K.M.getState().closet[0].label)).toBe(garmentName);
  });
  test(`${mode}: failed save preserves old purchase records and allows retry`, async ({page})=>{
    const d=driver(page,mode); await d.openManual();
    await page.evaluate(() => {
      window.K.M.addGarment({kind:'pants',color:'black'});
      window.K.M.decide('ms-728000','buy'); window.K.M.advance('ms-728000','ordered');
      window.__before=localStorage.getItem('eoul-d12-hang:v1');
      const original=Storage.prototype.setItem;
      window.__fail=true;
      Storage.prototype.setItem=function(k,v){ if(window.__fail && k==='eoul-d12-hang:v1') throw new DOMException('quota','QuotaExceededError'); return original.call(this,k,v); };
    });
    await d.fillManual(); await d.save();
    await expect(page.getByText(/저장하지 못했어요/).first()).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:v1')===window.__before)).toBe(true);
    await page.evaluate(()=>window.__fail=false); await d.save();
    await expect(page.locator('.shelf [data-g]')).toHaveCount(2);
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>window.K.M.getState().records[0].stage)).toBe('ordered');
  });
  test(`${mode}: catalog search registration and closet to judgment`, async ({page})=>{
    await page.goto(`/?photos=0&input=${mode}#/add`);
    await page.locator('#aq').fill('옥스퍼드');
    await page.locator('#af').evaluate((form:HTMLFormElement)=>form.requestSubmit());
    const own=page.locator('[data-own-add]').first(); await expect(own).toBeVisible();
    const id=await own.getAttribute('data-own-add'); await own.click();
    if(await page.locator('.sheet [data-c]').count()) await page.locator('.sheet [data-c="white"]').click();
    await page.getByRole('button',{name:'옷장 보기',exact:true}).click();
    await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
    await page.locator('.shelf [data-g]').click();
    const detail=page.locator(`.sheet [data-pid="${id}"]`).first();
    if(await detail.count()) await detail.click();
    else { await page.goto(`/?photos=0&input=${mode}#/p/${id}`); await page.reload(); }
    await expect(page.locator('.pdp')).toBeVisible();
    await expect.poll(()=>page.evaluate((id)=>window.K.M.judge(id).basis,id)).toBe('mine');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('vanilla text limits keep a boundary-length draft readable when resumed in React',async({page})=>{
  await driver(page,'vanilla').openManual();
  const brand='브'.repeat(80), name='옷'.repeat(80), url='https://example.test/'+ 'x'.repeat(1979);
  await page.locator('#rb').fill(brand+'x'); await expect(page.locator('#rb')).toHaveValue(brand);
  await page.locator('#rn').fill(name+'x'); await expect(page.locator('#rn')).toHaveValue(name);
  await page.locator('#ru').fill(url+'x'); await expect(page.locator('#ru')).toHaveValue(url);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!));
  expect(stored.values).toMatchObject({brand,name,url});
  await page.goto('/?photos=0&input=react#/reg');
  await page.getByRole('button',{name:'이어서 입력',exact:true}).click();
  await expect(page.getByLabel('브랜드',{exact:true})).toHaveValue(brand);
  await expect(page.getByLabel('상품명',{exact:true})).toHaveValue(name);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!).values.url)).toBe(url);
});

test('React stages: browser back retains values, subscription updates, 200% text fits',async({page})=>{
  const d=driver(page,'react'); await d.openManual();
  await page.getByLabel('브랜드',{exact:true}).fill('브랜드'); await page.getByLabel('상품명',{exact:true}).fill(garmentName);
  await page.getByRole('button',{name:'다음',exact:true}).click(); await page.goBack();
  await expect(page.getByLabel('상품명',{exact:true})).toHaveValue(garmentName);
  await page.evaluate(()=>window.K.M.addGarment({kind:'shirt'}));
  await expect(page.getByText('옷장 1벌',{exact:true})).toBeVisible();
  await page.addStyleTag({content:'.ri {font-size:32px} .ri input {font-size:32px}'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('React draft: reload restores the selected stage and draftId; successful save removes it', async ({page}) => {
  const d=driver(page,'react'); await d.openManual(); await d.fillManual();
  await expect(page.getByRole('heading',{name:'이대로 옷장에 넣을까요?'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!).step)).toBe(2);
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!));
  expect(before.step).toBe(2);
  await page.reload(); await page.getByRole('button',{name:'이어서 입력',exact:true}).click();
  await expect(page.getByRole('heading',{name:'이대로 옷장에 넣을까요?'})).toBeVisible();
  await expect(page.getByText(garmentName,{exact:true})).toBeVisible();
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!));
  expect(after.values.draftId).toBe(before.values.draftId);
  await d.save(); await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:input-draft:v1'))).toBe(null);
});
test('React draft: future schema is preserved until explicit discard',async({page})=>{
  await page.goto('/?photos=0');
  const raw=JSON.stringify({v:99,privateUnknown:'synthetic'});
  await page.evaluate(raw=>localStorage.setItem('eoul-d12-hang:input-draft:v1',raw),raw);
  await page.goto('/?photos=0#/reg'); await page.reload();
  await expect(page.getByText(/초안을 읽지 못했어요/)).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:input-draft:v1'))).toBe(raw);
  await page.getByRole('button',{name:'초안 지우고 새로 입력',exact:true}).click();
  await expect(page.getByLabel('브랜드',{exact:true})).toHaveValue('');
});
test('React draft: failed draft write is visible, wardrobe save can still succeed',async({page})=>{
  await page.addInitScript(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='eoul-d12-hang:input-draft:v1')throw new DOMException('quota','QuotaExceededError');return original.call(this,k,v);};
  });
  const d=driver(page,'react'); await d.openManual(); await d.fillManual();
  await expect(page.getByText(/초안을 이 기기에 보관하지 못했어요/)).toBeVisible();
  await d.save(); await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
});
test('React draft: cleanup failure does not duplicate an already committed registration',async({page})=>{
  await page.addInitScript(()=>{
    const original=Storage.prototype.removeItem;
    Storage.prototype.removeItem=function(k){if(k==='eoul-d12-hang:input-draft:v1')throw new DOMException('denied','SecurityError');return original.call(this,k);};
  });
  const d=driver(page,'react'); await d.openManual(); await d.fillManual(); await d.save();
  await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
  await expect(page.getByText(/옷은 저장했지만 초안을 정리하지 못했어요/)).toBeVisible();
  await page.goto('/?photos=0&input=react#/reg'); await page.reload();
  await page.getByRole('button',{name:'이어서 입력',exact:true}).click(); await d.save();
  await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
});

test('backup UI previews, restores exact records, and undo restores the prior snapshot after reload',async({page})=>{
  await page.goto('/?photos=0#/closet');await page.waitForFunction(()=>!!window.K?.M);
  const saved=await page.evaluate(()=>{
    window.K.M.addGarment({kind:'shirt',color:'white'});
    window.K.M.decide('ms-728000','buy');window.K.M.advance('ms-728000','ordered');
    return localStorage.getItem('eoul-d12-hang:v1')!;
  });
  await page.evaluate(()=>window.K.M.addGarment({kind:'pants',color:'black'}));
  const before=await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:v1'));
  const open=async()=>{
    await page.getByRole('button',{name:'더보기',exact:true}).click();await page.locator('[data-backup]').click();
    await expect(page.getByRole('heading',{name:'백업 · 복원',exact:true})).toBeVisible();
  };
  await open();
  await page.locator('#bkfile').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'eoul-lite',format:1,data:{'eoul-d12-hang:v1':saved}}))});
  await expect(page.locator('[data-bk-go]')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:v1'))).toBe(before);
  await Promise.all([page.waitForEvent('load'),page.locator('[data-bk-go]').click()]);
  await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:v1')!));
  expect(restored.garments).toEqual(JSON.parse(saved).garments); expect(restored.journeys).toEqual(JSON.parse(saved).journeys);
  expect(await page.evaluate(()=>window.K.M.getState().records[0].stage)).toBe('ordered');
  await open();await Promise.all([page.waitForEvent('load'),page.locator('[data-bk-undo]').click()]);
  await expect(page.locator('.shelf [data-g]')).toHaveCount(2);
  const undone=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:v1')!));
  expect(undone.garments).toEqual(JSON.parse(before!).garments); expect(undone.journeys).toEqual(JSON.parse(before!).journeys);
});

test('backup exports damaged raw, previews format2 quarantine without writes, and preserves existing active bytes on restore',async({page})=>{
  await page.goto('/?photos=0#/closet');await page.waitForFunction(()=>!!window.K?.M);
  const badDraft='{"v":99,"unknown":"원문 보존"}';
  const saved=await page.evaluate((raw)=>{
    window.K.M.registerGarment({draftId:'draft-backup-test',brand:'합성 브랜드',name:'합성 셔츠',kind:'shirt',color:'white',url:''});
    window.K.M.ask('출근용 셔츠 10만원 이하'); // existing screen boot search; make raw stable across reload
    localStorage.setItem('eoul-d12-hang:input-draft:v1',raw);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__bkCopied=text;}}});
    return localStorage.getItem('eoul-d12-hang:v1')!;
  },badDraft);
  await page.getByRole('button',{name:'더보기',exact:true}).click();await page.locator('[data-backup]').click();
  await expect(page.locator('.bk .sub').first()).toContainText('직접 등록 1건');
  await expect(page.locator('[data-bk-report]').first()).toContainText('원문 보관 1개(활성화 안 됨)');
  await page.locator('[data-bk-copy]').click();await expect(page.locator('.bk-msg')).toContainText('복사했어요');
  const exported=await page.evaluate(()=>JSON.parse((window as any).__bkCopied));expect(exported.format).toBe(2);
  expect(exported.data['eoul-d12-hang:input-draft:v1']).toBeUndefined();
  expect(Object.entries(exported.data).some(([k,v])=>k.startsWith('eoul-d12-hang:input-draft:v1:unreadable:')&&v===badDraft)).toBe(true);
  const goodDraft=JSON.stringify({v:1,step:1,updatedAt:'2026-10-25T00:00:00Z',values:{draftId:'draft-existing-valid',brand:'기존 브랜드',name:'기존 바지',kind:'pants',color:'black',url:''}});
  const goodChat='{"threads":[{"id":"existing-thread","turns":[{"role":"user","text":"기존 상담"}]}],"cur":"existing-thread"}';
  const before=await page.evaluate(({draft,chat})=>{
    localStorage.setItem('eoul-d12-hang:input-draft:v1',draft);localStorage.setItem('eoul-d12-hang:consult',chat);
    const originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;(window as any).__bkWrites=0;
    Storage.prototype.setItem=function(k,v){(window as any).__bkWrites++;return originalSet.call(this,k,v);};
    Storage.prototype.removeItem=function(k){(window as any).__bkWrites++;return originalRemove.call(this,k);};
    return JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort()));
  },{draft:goodDraft,chat:goodChat});
  const unsafeChat=JSON.stringify({threads:[{id:'x" onclick="bad',turns:[]}]});
  exported.data['eoul-d12-hang:consult']=unsafeChat;
  await page.locator('#bkfile').setInputFiles({name:'synthetic-lossless-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await expect(page.locator('.bk-preview [data-bk-report]')).toContainText('기존 활성 자료 유지 2개');
  expect(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())))).toBe(before);
  expect(await page.evaluate(()=>(window as any).__bkWrites)).toBe(0);expect(await page.locator('.bk-preview [onclick]').count()).toBe(0);
  await Promise.all([page.waitForEvent('load'),page.locator('[data-bk-go]').click()]);
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:v1'))).toBe(saved);
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:input-draft:v1'))).toBe(goodDraft);
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:consult'))).toBe(goodChat);
  const archived=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.includes(':unreadable:')));
  expect(archived.some(([,v])=>v===badDraft)).toBe(true);expect(archived.some(([,v])=>v===unsafeChat)).toBe(true);
  await page.getByRole('button',{name:'더보기',exact:true}).click();await page.locator('[data-backup]').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__bkCopied=text;}}}));
  await page.locator('[data-bk-copy]').click();
  const again=await page.evaluate(()=>JSON.parse((window as any).__bkCopied));
  expect(again.data['eoul-d12-hang:input-draft:v1']).toBe(goodDraft);expect(again.data['eoul-d12-hang:consult']).toBe(goodChat);
  expect(Object.entries(again.data).some(([k,v])=>k.includes(':unreadable:')&&v===badDraft)).toBe(true);
});

test('backup promotion failure remains visibly incomplete and undo recovers before another restore',async({page})=>{
  await page.goto('/?photos=0#/closet');await page.waitForFunction(()=>!!window.K?.M);
  const before=await page.evaluate(()=>{
    window.K.M.registerGarment({draftId:'draft-promotion-test',brand:'합성 브랜드',name:'합성 바지',kind:'pants',color:'black',url:''});
    window.K.M.ask('출근용 셔츠 10만원 이하');
    const set=Storage.prototype.setItem;(window as any).__bkSet=set;
    Storage.prototype.setItem=function(k,v){if(k==='eoul-backup:stash')throw new Error('synthetic quota');return set.call(this,k,v);};
    return localStorage.getItem('eoul-d12-hang:v1');
  });
  await page.getByRole('button',{name:'더보기',exact:true}).click();await page.locator('[data-backup]').click();
  await page.locator('#bkfile').setInputFiles({name:'synthetic-quarantine.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'eoul-lite',format:1,data:{'eoul-d12-hang:reg':'bad raw'}}))});
  await page.locator('[data-bk-go]').click();await expect(page.locator('.bk-msg')).toContainText('복구 지점 정리가 끝나지 않았어요');
  expect(await page.evaluate(()=>localStorage.getItem('eoul-backup:stash-next'))).not.toBeNull();
  await page.evaluate(()=>{Storage.prototype.setItem=(window as any).__bkSet;});
  await Promise.all([page.waitForEvent('load'),page.locator('[data-bk-undo]').click()]);
  expect(await page.evaluate(()=>localStorage.getItem('eoul-d12-hang:v1'))).toBe(before);
  expect(await page.evaluate(()=>localStorage.getItem('eoul-backup:stash-next'))).toBeNull();
  expect(await page.evaluate(()=>Object.entries(localStorage).some(([k,v])=>k.startsWith('eoul-d12-hang:reg:unreadable:')&&v==='bad raw'))).toBe(true);
});


test('unreadable boot recovery opens whole backup above its persistent notice without discarding raw',async({page})=>{
  const raw={engine:'{"v":99,"unknown":"옷장 원문"}',reg:'broken registration raw'};
  await page.addInitScript(({engine,reg})=>{
    localStorage.setItem('eoul-d12-hang:v1',engine);localStorage.setItem('eoul-d12-hang:reg',reg);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__bkCopied=text;}}});
  },raw);
  await page.goto('/?photos=0#/closet');await expect(page.locator('#eo-storage-issue')).toBeVisible();
  const before=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));
  await page.getByRole('button',{name:'전체 백업 열기',exact:true}).click();
  await expect(page.locator('[data-bk-report]').first()).toContainText('원문 보관 2개');
  await page.locator('[data-bk-copy]').click();await expect(page.locator('.bk-msg')).toContainText('복사했어요');
  const copied=await page.evaluate(()=>JSON.parse((window as any).__bkCopied));expect(copied.format).toBe(2);
  expect(copied.data['eoul-d12-hang:v1']).toBeUndefined();expect(copied.data['eoul-d12-hang:reg']).toBeUndefined();
  expect(Object.entries(copied.data).some(([k,v])=>k.startsWith('eoul-d12-hang:v1:unreadable:')&&v===raw.engine)).toBe(true);
  expect(Object.entries(copied.data).some(([k,v])=>k.startsWith('eoul-d12-hang:reg:unreadable:')&&v===raw.reg)).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())))).toBe(before);
  await page.keyboard.press('Escape');await expect(page.locator('.bk')).toHaveCount(0);await expect(page.locator('#eo-storage-issue')).toBeVisible();
});

for (const [from,to] of [['vanilla','react'],['react','vanilla']]) {
  test(`shared draft: ${from} input resumes in ${to} with the same identity`,async({page})=>{
    const d=driver(page,from); await d.openManual(); await d.fillManual();
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!).values.color)).toBe('white');
    const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!).values.draftId);
    await page.goto(`/?photos=0&input=${to}#/reg`);
    await page.getByRole('button',{name:'이어서 입력',exact:true}).click();
    if(to==='vanilla') await expect(page.locator('#rn')).toHaveValue(garmentName);
    else await expect(page.getByLabel('상품명',{exact:true})).toHaveValue(garmentName);
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!).values.draftId)).toBe(id);
    expect(await page.evaluate(()=>window.K.M.getState().closetCount)).toBe(0);
  });
}
test('input assets load only on entering the React input screen',async({page})=>{
  const assets:string[]=[]; page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/react/'))assets.push(r.url());});
  await page.goto('/?photos=0'); await page.waitForFunction(()=>!!window.K?.M);
  expect(assets).toEqual([]);
  await page.getByRole('button',{name:/브랜드로 찾아 넣기/}).click();
  await page.locator('[data-reg-open]').click();
  await expect(page.getByRole('heading',{name:'어떤 옷을 가지고 있나요?'})).toBeVisible();
  expect(assets.some(url=>url.endsWith('.js'))).toBe(true);
  expect(assets.some(url=>url.endsWith('.css'))).toBe(true);
});
test.describe('input runtime caching',()=>{
  test.use({serviceWorkers:'allow'});
  test.afterEach(async({request})=>{const response=await request.post('http://127.0.0.1:8793/start');expect(response.ok()).toBe(true);});
  test('worker downloads React assets on first visit and keeps visited input available offline',async({page,request})=>{
    await page.goto('/?photos=0');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
    const cachedInput=()=>page.evaluate(async()=>{const paths=[];for(const key of await caches.keys()){if(!key.startsWith('lite-'))continue;const c=await caches.open(key);for(const r of await c.keys())if(new URL(r.url).pathname.startsWith('/react/'))paths.push(new URL(r.url).pathname);}return paths;});
    expect(await cachedInput()).toEqual([]);
    await page.getByRole('button',{name:/브랜드로 찾아 넣기/}).click();
  await page.locator('[data-reg-open]').click();
    await expect(page.getByRole('heading',{name:'어떤 옷을 가지고 있나요?'})).toBeVisible();
    await expect.poll(async()=>{const paths=await cachedInput();return paths.some(p=>p.endsWith('.js'))&&paths.some(p=>p.endsWith('.css'));}).toBe(true);
    // Stop the actual origin, leaving the browser's SW networking enabled.
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    // Exercise the native SW path, without Playwright's catch-all page routing.
    // All app assets are local/cached and this isolated case makes no AI calls.
    await page.unrouteAll({behavior:'wait'});
    const reopenUrl=page.url();
    await page.evaluate(()=>document.documentElement.dataset.e2eOldDocument='true');
    const stopped=await request.post('http://127.0.0.1:8793/stop');
    expect(stopped.ok()).toBe(true);expect(await stopped.json()).toEqual({online:false});
    expect(await page.evaluate(()=>fetch('/__uncached_network_probe').then(()=>true,()=>false))).toBe(false);
    // Reopen a fresh document and require a real service-worker response.
    await page.goto('about:blank');
    const response=await page.goto(reopenUrl);
    expect(response?.fromServiceWorker()).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.dataset.e2eOldDocument)).toBeUndefined();
    expect(await page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    expect(await page.evaluate(()=>fetch('/__uncached_network_probe').then(()=>true,()=>false))).toBe(false);
    await expect(page.getByRole('button',{name:'이어서 입력',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'이어서 입력',exact:true}).click();
    await expect(page.getByRole('heading',{name:'어떤 옷을 가지고 있나요?'})).toBeVisible();
  });
});

for (const retryMode of ['vanilla', 'react']) {
  test(`vanilla durable draft: cleanup failure then ${retryMode} retry keeps one garment`, async ({page}) => {
    await page.addInitScript(() => {
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function(k) {
        if (k === 'eoul-d12-hang:input-draft:v1') throw new DOMException('denied', 'SecurityError');
        return remove.call(this, k);
      };
    });
    const first = driver(page, 'vanilla'); await first.openManual(); await first.fillManual(); await first.save();
    await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
    await expect(page.getByText(/옷은 저장했지만 초안을 정리하지 못했어요/)).toBeVisible();
    const draftId = await page.evaluate(() => JSON.parse(localStorage.getItem('eoul-d12-hang:input-draft:v1')!).values.draftId);
    await page.goto(`/?photos=0&input=${retryMode}#/reg`); await page.reload();
    await page.getByRole('button', {name:'이어서 입력', exact:true}).click();
    const retry = driver(page, retryMode); await retry.fillManual(); await retry.save();
    await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('eoul-d12-hang:v1')!));
    expect(data.registrations.receipts.filter((r: {input: {draftId: string}}) => r.input.draftId === draftId)).toHaveLength(1);
  });
}
