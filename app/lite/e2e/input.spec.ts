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
        await page.locator('[data-k="shirt"]').click(); await page.locator('[data-c="white"]').click();
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
