// Local-only synthetic evidence; imports the QA static server, never production.
import '../e2e/server.mjs';
import { chromium } from '@playwright/test';
import { serveAccounts,ACCOUNT_ORIGIN,ADMIN_PASSWORD } from '../e2e/account-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const output=path.join(root,'docs/log/2026-10/evidence/account-entry');fs.mkdirSync(output,{recursive:true});
const manifest={source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),capturedAt:new Date().toISOString(),synthetic:true,realAccountsCreated:0,realPhotos:0,paidCalls:0,externalRequests:'blocked',baseline:'preserved invite-mode entry in the same code',captures:[]};
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
let failed=false;
try {
  for(const device of [{name:'mobile320',width:320,height:780,colorScheme:'light'},{name:'mobile390',width:390,height:844,colorScheme:'light'},{name:'mobile-dark',width:390,height:844,colorScheme:'dark'},{name:'desktop',width:1440,height:1000,colorScheme:'light'}]) {
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},colorScheme:device.colorScheme,locale:'ko-KR',serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage(), f=await serveAccounts(page);
    const shot=async state=>{
      await page.evaluate(()=>document.fonts.ready);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow '+device.name+'/'+state);
      const file=device.name+'-'+state+'.png', target=path.join(output,file);
      await page.screenshot({path:target,animations:'disabled'});const raw=fs.readFileSync(target);
      manifest.captures.push({file,state,viewport:{width:device.width,height:device.height},colorScheme:device.colorScheme,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
    };
    f.env.MEMBER_APP_MODE='invite';await page.goto(ACCOUNT_ORIGIN+'/');await page.getByRole('heading',{name:'본인 전용 접속',exact:true}).waitFor();await shot('before-shared-entry');
    f.env.MEMBER_APP_MODE='accounts';await page.goto(ACCOUNT_ORIGIN+'/');await page.getByRole('heading',{name:'로그인',exact:true}).waitFor();await shot('after-account-login');
    const old=await f.legacy();await page.goto(ACCOUNT_ORIGIN+'/_private/admin-setup');await page.getByRole('heading',{name:'관리자 계정 만들기',exact:true}).waitFor();await shot('after-admin-setup');
    const made=await f.call('/_private/admin-setup','POST',{email:'qa-admin@example.test',password:ADMIN_PASSWORD,confirm:ADMIN_PASSWORD},{cookie:old});
    if(made.status!==200)throw Error('Synthetic admin setup failed');
    await f.addCookie(made,'__Host-hangit-member');await context.clearCookies({name:'__Host-otjang-session'});
    await page.goto(ACCOUNT_ORIGIN+'/_member/account');await page.getByRole('heading',{name:'내 계정',exact:true}).waitFor();await shot('after-admin-account');
    await context.unrouteAll({behavior:'wait'});await context.close();
  }
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({captures:manifest.captures.length,output}));
} catch(error) {failed=true;console.error(error);}
finally {await browser.close();process.exit(failed?1:0);}
