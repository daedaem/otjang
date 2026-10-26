import { test, expect, type Page } from '@playwright/test';
const KEY = 'eoul-d12-hang:v1';
async function load(page: Page, query = '', photos = false) {
  await page.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== 'http://127.0.0.1:8792') return route.abort();
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status:200, contentType:'application/json', body:'{"items":[]}' });
    return route.continue();
  });
  await page.goto('/?photos='+(photos?'1':'0')+query+'#/closet');
  await expect(page.locator('[data-react-closet]')).toBeVisible();
}
async function own(page: Page) {
  return page.evaluate(() => {
    const m = (window as any).K.M;
    const shirt = m.registerGarment({draftId:'rail-shirt', brand:'합성 브랜드', name:'합성 셔츠', kind:'shirt', color:'white', url:''});
    m.updateGarmentProfile(shirt.id,{v:1,measures:{length:{cm:70,source:'measured'}}});
    const jacket = m.addGarment({kind:'jacket',color:'navy',label:'합성 재킷'});
    m.updateGarmentProfile(jacket.id,{v:1,measures:{length:{cm:60,source:'measured'}}});
    const pants = m.addGarment({kind:'pants',color:'black',label:'합성 바지'});
    return {shirt:shirt.id,jacket:jacket.id,pants:pants.id};
  });
}

test('empty React rails start without a wardrobe and trial clothes never become owned photos',async({page})=>{
  await load(page);
  await expect(page.getByRole('heading',{name:'내 옷장',exact:true})).toBeVisible();
  await expect(page.locator('[data-rail]')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'체험용 옷장',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'체험용 옷장',exact:true}).click();
  await expect(page.getByText('체험용 옷 · 가진 옷이 아니에요',{exact:true})).toBeVisible();
  await expect(page.locator('[data-photo-input]')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).K.M.getState().mineCount)).toBe(0);
});

test('rails use measured lengths, keep unknown lengths explicit, and assemble own layers without changing saved bytes',async({page})=>{
  await load(page);const ids=await own(page);
  const raw=await page.evaluate(k=>localStorage.getItem(k),KEY);
  await expect(page.locator(`[data-rail-item="${ids.pants}"]`)).toContainText('실측 없음');
  const height=async(id:string)=>Number(await page.locator(`[data-rail-item="${id}"] [data-garment-height]`).getAttribute('data-garment-height'));
  expect((await height(ids.shirt))/(await height(ids.jacket))).toBeCloseTo(70/60,1);
  await page.locator(`[data-rail-item="${ids.shirt}"] [data-pick]`).click();
  await page.locator(`[data-rail-item="${ids.jacket}"] [data-pick]`).click();
  await expect(page.locator('[data-assembly-layer]')).toHaveCount(2);
  const z=await page.locator('[data-assembly-layer]').evaluateAll(els=>Object.fromEntries(els.map(e=>[e.getAttribute('data-assembly-layer'),getComputedStyle(e).zIndex])));
  expect(Number(z.outer)).toBeGreaterThan(Number(z.top));
  await page.getByLabel('옷 정렬').selectOption('brand');
  expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(raw);
  await page.locator(`[data-rail-item="${ids.shirt}"] [data-g]`).click();
  await expect(page.locator('.sheet').getByText('합성 셔츠',{exact:true})).toBeVisible();
});

test('own PNG is attached locally, thumbnails are lazy, reload preserves bytes and corrupt replacement preserves reference',async({page})=>{
  await load(page,'',true);const ids=await own(page);const posts:string[]=[];
  page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
  const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=16;c.height=24;c.getContext('2d')!.fillRect(0,0,16,24);const b=await new Promise<Blob>(r=>c.toBlob(b=>r(b!),'image/png'));return Array.from(new Uint8Array(await b.arrayBuffer()));});
  const input=page.locator(`[data-rail-item="${ids.shirt}"] [data-photo-input]`);
  await input.setInputFiles({name:'my-own-cutout.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
  await expect(page.getByRole('status').filter({hasText:'내 사진을 연결했어요'})).toBeVisible();
  const photoId=await page.evaluate(id=>(window as any).K.M.getState().closet.find((g:any)=>g.id===id).photoId,ids.shirt);
  await expect(page.locator(`[data-rail-item="${ids.shirt}"] img`)).toHaveAttribute('src',/^blob:/);
  await page.reload();await expect(page.locator('[data-react-closet]')).toBeVisible();
  await expect(page.locator(`[data-rail-item="${ids.shirt}"] img`)).toHaveAttribute('src',/^blob:/);
  const stored=await page.evaluate(async id=>{const mod=await(window as any).EOUL_PHOTO_LOAD();const repo=await mod.photoLibrary();const r=await repo.get(id);return Array.from(new Uint8Array(await r.blob.arrayBuffer()));},photoId);
  expect(stored).toEqual(bytes);
  await page.locator(`[data-rail-item="${ids.shirt}"] [data-photo-input]`).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not a photo')});
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(id=>(window as any).K.M.getState().closet.find((g:any)=>g.id===id).photoId,ids.shirt)).toBe(photoId);
  expect(posts).toEqual([]);
});

test('large rail mounts only visible garment cards and scrolling exposes the actual last item',async({page})=>{
  await load(page);await own(page);
  await page.evaluate(k=>{const snapshot=JSON.parse(localStorage.getItem(k)!);const base=snapshot.garments[0];snapshot.garments=Array.from({length:300},(_,i)=>({...base,id:'rail-'+i,label:'합성 옷 '+i}));snapshot.registrations={v:2,receipts:[]};snapshot.seq=1000;localStorage.setItem(k,JSON.stringify(snapshot));(window as any).K.M.reloadSaved();},KEY);
  await expect(page.locator('[data-rail-item]')).not.toHaveCount(0);
  expect(await page.locator('[data-rail-item]').count()).toBeLessThan(20);
  const rail=page.locator('[data-rail="top"] [data-rail-scroll]');
  await rail.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
  await expect(page.locator('[data-rail-item="rail-0"]')).toBeVisible();
  expect(await page.locator('[data-rail-item]').count()).toBeLessThan(20);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
