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
        // The asynchronous duplicate suggestions appear above the choice grid.
        // Wait for that layout change before tapping the kind and color.
        await expect(page.locator('#rdup [data-dup-own]').first()).toBeVisible();
        await page.locator('#rf [data-k="shirt"]').click();
        await expect(page.locator('#rf [data-k="shirt"]')).toHaveAttribute('aria-pressed','true');
        await page.locator('#rf [data-c="white"]').click();
        await expect(page.locator('#rf [data-c="white"]')).toHaveAttribute('aria-pressed','true');
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
    // Inject a Storage-shaped adapter before core boot, rather than replacing
    // WebKit's native Storage prototype across document lifetimes.
    await page.addInitScript(() => {
      const disk = window.localStorage;
      const adapter = {
        get length() { return disk.length; },
        key(index: number) { return disk.key(index); },
        getItem(k: string) { return disk.getItem(k); },
        setItem(k: string, v: string) {
          if (window.__fail && k === 'eoul-d12-hang:v1') throw new DOMException('quota','QuotaExceededError');
          disk.setItem(k,v);
        },
        removeItem(k: string) { disk.removeItem(k); },
      };
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => adapter });
      window.__fail = false;
    });
    const d=driver(page,mode);
    await page.goto(`/?photos=0&input=${mode}`);
    await page.waitForFunction(() => !!window.K?.M);
    await page.evaluate(() => {
      window.K.M.addGarment({kind:'pants',color:'black'});
      window.K.M.decide('ms-728000','buy'); window.K.M.advance('ms-728000','ordered');
      // Prepare the existing wardrobe before navigating into a fresh form.
      window.K.go('reg', {});
    });
    await expect(mode === 'react' ? page.getByLabel('브랜드',{exact:true}) : page.locator('#rb')).toBeVisible();
    await page.evaluate(() => {
      window.__before=localStorage.getItem('eoul-d12-hang:v1');
      window.__fail=true;
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
test('interrupted restore shows a persistent recovery screen and explicit recovery restores original raw',async({page})=>{
  await page.goto('/?photos=0#/closet');await page.waitForFunction(()=>!!window.K?.M);
  const raw=await page.evaluate(()=>{
    window.K.M.addGarment({kind:'shirt',color:'white'});
    const before=localStorage.getItem('eoul-d12-hang:v1')!;
    window.K.M.addGarment({kind:'pants',color:'black'});
    localStorage.setItem('eoul-backup:transaction',JSON.stringify({v:1,operation:'restore',before:{'eoul-d12-hang:v1':before},stash:null}));
    return before;
  });
  await page.reload();await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await page.locator('#app').evaluate(el=>(el as HTMLElement).inert)).toBe(true);
  await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'복원 전 자료로 복구',exact:true}).click()]);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.locator('.shelf [data-g]')).toHaveCount(1);
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('eoul-d12-hang:v1')!));
  expect(recovered.garments).toEqual(JSON.parse(raw).garments); expect(recovered.journeys).toEqual(JSON.parse(raw).journeys);
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
  test('worker downloads React assets on first visit and keeps visited input available offline',async({page,context})=>{
    await page.goto('/?photos=0');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready; if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
    const cachedInput=()=>page.evaluate(async()=>{const paths=[];for(const key of await caches.keys()){if(!key.startsWith('lite-'))continue;const c=await caches.open(key);for(const r of await c.keys())if(new URL(r.url).pathname.startsWith('/react/'))paths.push(new URL(r.url).pathname);}return paths;});
    expect(await cachedInput()).toEqual([]);
    await page.getByRole('button',{name:/브랜드로 찾아 넣기/}).click();
  await page.locator('[data-reg-open]').click();
    await expect(page.getByRole('heading',{name:'어떤 옷을 가지고 있나요?'})).toBeVisible();
    await expect.poll(async()=>{const paths=await cachedInput();return paths.some(p=>p.endsWith('.js'))&&paths.some(p=>p.endsWith('.css'));}).toBe(true);
    // A new document must load the module from the worker cache, rather than an existing React root.
    await context.setOffline(true); const offline=await context.newPage();
    await offline.goto('/?photos=0#/reg');
    await expect(offline.getByRole('button',{name:'이어서 입력',exact:true})).toBeVisible();
    await offline.getByRole('button',{name:'이어서 입력',exact:true}).click();
    await expect(offline.getByRole('heading',{name:'어떤 옷을 가지고 있나요?'})).toBeVisible();
    await offline.close(); await context.setOffline(false);
  });
});
