import {test,expect,type Page} from "@playwright/test";
const KEY="eoul-d12-hang:v1";
const A="m-"+"a".repeat(32),B="m-"+"b".repeat(32);
async function open(page:Page,scope:string){
 await page.route("**/*",async route=>{
  const u=new URL(route.request().url());
  if(u.origin!=="http://127.0.0.1:8792")return route.abort();
  if(u.pathname.startsWith("/api/"))return route.fulfill({status:503,contentType:"application/json",body:'{"code":"not_configured"}'});
  if(route.request().resourceType()==="document"){
   const res=await route.fetch(),role=scope==="owner"?"owner":"member";
   return route.fulfill({response:res,body:(await res.text()).replace("<head>",'<head><meta name="hangit-role" content="'+role+'"><meta name="hangit-storage-scope" content="'+scope+'">')});
  }
  return route.continue();
 });
 await page.goto("/?photos=0#/closet");
 await page.waitForFunction(()=>!!(window as any).K?.M);
}
test("a member never reads the owner's legacy wardrobe and stale owner tabs cannot write",async({page,context})=>{
 await open(page,"owner");
 await page.evaluate(()=>{(window as any).K.M.addGarment({kind:"shirt",color:"white",label:"OWNER_QA_SHIRT"});});
 const raw=await page.evaluate(k=>localStorage.getItem(k),KEY);
 const member=await context.newPage();await open(member,B);
 expect(await member.evaluate(()=>(window as any).K.M.getState().mineCount)).toBe(0);
 await member.evaluate(()=>{(window as any).K.M.addGarment({kind:"pants",color:"black",label:"MEMBER_QA_PANTS"});});
 expect(await member.evaluate(k=>localStorage.getItem(k),KEY)).toBe(raw);
 await expect(page.locator("#hangit-account-lock")).toBeVisible();
 expect(await page.evaluate(()=>{try{(window as any).K.M.addGarment({kind:"knit",color:"navy"});return false;}catch{return true;}})).toBe(true);
 expect(await member.evaluate(()=>(window as any).K.M.getState().mineCount)).toBe(1);
 await page.reload();await page.waitForFunction(()=>!!(window as any).K?.M);
 expect(await page.evaluate(()=>(window as any).K.M.getState().closet.map((g:any)=>g.label))).toEqual(["OWNER_QA_SHIRT"]);
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(raw);
});
test("two members keep separate durable drafts and storage while the owner raw remains untouched",async({page,context})=>{
 await open(page,A);
 await page.evaluate(()=>{const w=window as any;w.K.M.addGarment({kind:"shirt",color:"white",label:"MEMBER_A"});w.EOUL_UI_STORAGE.setItem("eoul-qa:opaque","A draft");});
 const first=await page.evaluate(()=>(window as any).EOUL_UI_STORAGE.getItem("eoul-qa:opaque"));
 expect(first).toBe("A draft");
 const second=await context.newPage();await open(second,B);
 expect(await second.evaluate(()=>(window as any).K.M.getState().mineCount)).toBe(0);
 expect(await second.evaluate(()=>(window as any).EOUL_UI_STORAGE.getItem("eoul-qa:opaque"))).toBeNull();
 await second.evaluate(()=>{(window as any).EOUL_UI_STORAGE.setItem("eoul-qa:opaque","B draft");});
 await expect(page.locator("#hangit-account-lock")).toBeVisible();
 await page.reload();await page.waitForFunction(()=>!!(window as any).K?.M);
 expect(await page.evaluate(()=>(window as any).K.M.getState().closet[0].label)).toBe("MEMBER_A");
 expect(await page.evaluate(()=>(window as any).EOUL_UI_STORAGE.getItem("eoul-qa:opaque"))).toBe("A draft");
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBeNull();
});
