// The persisted lite draft reader is shared by the real host and its backup
// boundary. Reading never writes/migrates stored bytes; returned v2 is in memory.
import { validateProfile } from './garment-profile.js';
export const LITE_DRAFT_VERSION = 2;
export function readLiteInputDraft(raw) {
  const x=JSON.parse(raw),v=x?.values;
  const object=y=>y!==null&&typeof y==='object'&&!Array.isArray(y);
  if(!object(x)||![1,LITE_DRAFT_VERSION].includes(x.v)||!Number.isInteger(x.step)||x.step<0||x.step>2||!object(v)||
    typeof v.draftId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(v.draftId)||
    !['brand','name','kind','color','url'].every(k=>typeof v[k]==='string'&&v[k].length<=(k==='url'?2000:80))||
    (v.source&&(v.source.provider!=='opf'||typeof v.source.code!=='string'||!/^\d{6,24}$/.test(v.source.code)))||
    typeof x.updatedAt!=='string'||!Number.isFinite(Date.parse(x.updatedAt)))throw new Error('입력 초안 형식을 읽지 못했어요.');
  const values={draftId:v.draftId,brand:v.brand,name:v.name,kind:v.kind,color:v.color,url:v.url,...(v.source?{source:{provider:'opf',code:v.source.code}}:{})};
  if(v.profile!==undefined){validateProfile(v.profile,{kind:v.kind});values.profile=structuredClone(v.profile);}
  return {v:LITE_DRAFT_VERSION,values,step:x.step,updatedAt:x.updatedAt};
}
