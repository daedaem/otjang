import {test,expect,type Page} from '@playwright/test';
import {serveAccounts,ACCOUNT_ORIGIN,ADMIN_PASSWORD} from './account-fixture.mjs';
test.afterEach(async({context})=>{
  // Finish same-origin fonts/icons before removing the synthetic HTTPS transport.
  await Promise.all(context.pages().filter(p=>!p.isClosed()).map(p=>p.waitForLoadState('networkidle')));
  await context.unrouteAll({behavior:'wait'});
});
async function seedOwner(page:Page,f:any) {
  f.env.MEMBER_APP_MODE='invite';await f.legacy();
  await page.goto(ACCOUNT_ORIGIN+'/?photos=0#/closet');await page.waitForFunction(()=>!!(window as any).K?.M);
  const saved=await page.evaluate(async()=>{
    const w=window as any,g=w.K.M.addGarment({kind:'shirt',color:'white',label:'OWNER_KEEP'});
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d')!.fillRect(0,0,2,2);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
    const mod=await w.EOUL_PHOTO_LOAD();await mod.saveGarmentPhoto({namespace:w.EOUL_MOCK_KEY,core:w.K.M,garmentId:g.id,file:new File([blob],'qa.png',{type:'image/png'}),width:2,height:2});
    return {key:w.EOUL_MOCK_KEY,raw:localStorage.getItem(w.EOUL_MOCK_KEY),digest:(await(await mod.photoLibrary(w.EOUL_MOCK_KEY)).list())[0].digest,id:g.id};
  });
  f.env.MEMBER_APP_MODE='accounts';return saved;
}
test('the normal front door has one email login and never gives the first visitor administrator rights',async({page})=>{
  const f=await serveAccounts(page);
  await page.goto(ACCOUNT_ORIGIN+'/');await expect(page).toHaveURL(ACCOUNT_ORIGIN+'/_member/signin');
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await expect(page.getByLabel('이메일',{exact:true})).toBeVisible();
  await expect(page.getByLabel('비밀번호',{exact:true})).toBeVisible();
  await expect(page.getByLabel('앱 비밀번호',{exact:true})).toHaveCount(0);
  await page.getByLabel('이메일',{exact:true}).fill('unknown@example.test');await page.getByLabel('비밀번호',{exact:true}).fill('qa-not-a-member');
  await page.getByRole('button',{name:'들어가기',exact:true}).click();await expect(page.getByRole('status')).toContainText('이메일이나 비밀번호가 맞지 않아요');
  expect(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n).toBe(0);
});
test('only the first administrator setup uses the old owner proof, and proof alone does not claim the role',async({page})=>{
  const f=await serveAccounts(page);
  await page.goto(ACCOUNT_ORIGIN+'/_private/admin-setup');
  await expect(page.getByRole('heading',{name:'관리자 최초 설정 확인',exact:true})).toBeVisible();
  await page.getByLabel('기존 앱 비밀번호',{exact:true}).fill(f.env.PRIVATE_APP_ACCESS_KEY);
  await page.getByRole('button',{name:'들어가기',exact:true}).click();
  await expect(page).toHaveURL(ACCOUNT_ORIGIN+'/_private/admin-setup');
  await expect(page.getByRole('heading',{name:'관리자 계정 만들기',exact:true})).toBeVisible();
  expect(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n).toBe(0);
});
test('owner setup retains fields on failure, blocks duplicate submission and preserves the original wardrobe and photo',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const f=await serveAccounts(page,{failSetupOnce:true,setupGate:()=>gate});const saved=await seedOwner(page,f);
  await page.goto(ACCOUNT_ORIGIN+'/_private/admin-setup');await expect(page.getByRole('heading',{name:'관리자 계정 만들기'})).toBeVisible();
  const email=page.getByLabel('이메일',{exact:true}),password=page.getByLabel('비밀번호 (8자 이상)',{exact:true}),confirm=page.getByLabel('비밀번호 확인',{exact:true});
  await email.fill('admin@example.test');await password.fill(ADMIN_PASSWORD);await confirm.fill(ADMIN_PASSWORD);
  await page.getByRole('button',{name:'이 계정으로 관리자 연결'}).click();await expect(page.getByRole('status')).toContainText('QA 연결 실패');
  await expect(password).toHaveValue(ADMIN_PASSWORD);await expect(email).toHaveValue('admin@example.test');await expect(email).toBeEnabled();
  await page.getByRole('button',{name:'이 계정으로 관리자 연결'}).click();await expect(email).toBeDisabled();await expect(password).toBeDisabled();await expect(confirm).toBeDisabled();
  expect(f.setupPosts()).toBe(2);release();
  await page.waitForFunction(()=>!!(window as any).K?.M);
  expect(await page.locator('meta[name="hangit-storage-scope"]').getAttribute('content')).toBe('owner');
  expect(await page.evaluate(key=>localStorage.getItem(key),saved.key)).toBe(saved.raw);
  expect(await page.evaluate(async()=>{const w=window as any,m=await w.EOUL_PHOTO_LOAD();return (await(await m.photoLibrary(w.EOUL_MOCK_KEY)).list())[0].digest;})).toBe(saved.digest);
  await page.locator('#tabs [data-tab="closet"]').click();await expect(page.locator('[data-react-closet]')).toBeVisible();
  await page.getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByRole('link',{name:/^지인 초대/})).toBeVisible();
  await page.getByRole('link',{name:/^내 계정/}).click();await expect(page.getByText('관리자 계정으로 로그인했어요.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'계정 지우기',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await expect(page).toHaveURL(ACCOUNT_ORIGIN+'/_member/signin');
  await expect(page.getByRole('link',{name:'관리자 계정 처음 연결하기'})).toHaveCount(0);
  expect(await page.evaluate(key=>localStorage.getItem(key),saved.key)).toBe(saved.raw);
  await email.fill('admin@example.test');await page.getByLabel('비밀번호',{exact:true}).fill(ADMIN_PASSWORD);await page.getByRole('button',{name:'들어가기',exact:true}).click();
  await page.waitForFunction(()=>!!(window as any).K?.M);expect(await page.locator('meta[name="hangit-storage-scope"]').getAttribute('content')).toBe('owner');
});
test('normal member login locks an old owner tab and never inherits its local wardrobe',async({page,context})=>{
  const f=await serveAccounts(page),saved=await seedOwner(page,f);
  const ownerCookies=await context.cookies(ACCOUNT_ORIGIN);const old=ownerCookies.find(x=>x.name==='__Host-otjang-session')!;
  const made=await f.call('/_private/admin-setup','POST',{email:'admin@example.test',password:ADMIN_PASSWORD,confirm:ADMIN_PASSWORD},{cookie:old.name+'='+old.value});expect(made.status).toBe(200);
  const admin=made.headers.getSetCookie().find((s:string)=>s.startsWith('__Host-hangit-member='))!.split(';')[0];
  const invite=await f.call('/_member/invites','POST',{label:'QA friend'},{cookie:admin});const code=(await invite.json()).code;
  const joined=await f.call('/_member/password/signup','POST',{code,email:'friend@example.test',password:'qa-friend-browser',age14:true});expect(joined.status).toBe(200);
  const friend=await context.newPage();
  await friend.goto(ACCOUNT_ORIGIN+'/_member/signin');await friend.getByLabel('이메일',{exact:true}).fill('friend@example.test');await friend.getByLabel('비밀번호',{exact:true}).fill('qa-friend-browser');await friend.getByRole('button',{name:'들어가기',exact:true}).click();
  await friend.waitForFunction(()=>!!(window as any).K?.M);
  expect(await friend.locator('meta[name="hangit-storage-scope"]').getAttribute('content')).toMatch(/^m-[a-f0-9]{32}$/);
  expect(await friend.evaluate(()=>(window as any).K.M.getState().mineCount)).toBe(0);
  expect(await friend.evaluate(key=>localStorage.getItem(key),saved.key)).toBe(saved.raw);
  await expect(page.locator('#hangit-account-lock')).toBeVisible();
  expect(await page.evaluate(()=>{try{(window as any).K.M.addGarment({kind:'pants',color:'black'});return false;}catch{return true;}})).toBe(true);
  await friend.locator('#tabs [data-tab="closet"]').click();await friend.getByRole('button',{name:'더보기',exact:true}).click();
  await expect(friend.getByRole('link',{name:/^내 계정/})).toBeVisible();await expect(friend.getByRole('link',{name:/^지인 초대/})).toHaveCount(0);await expect(friend.getByRole('link',{name:/^운영 점검/})).toHaveCount(0);
});
