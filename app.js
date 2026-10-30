"use strict";
/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clone=o=>JSON.parse(JSON.stringify(o));
const pad2=n=>String(n).padStart(2,'0');
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())};
const fmtDate=iso=>{if(!iso)return'';const[y,m,d]=iso.split('-');return d+'/'+m+'/'+y};
const fmtDT=ts=>{const d=new Date(ts);return pad2(d.getDate())+'/'+pad2(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad2(d.getHours())+':'+pad2(d.getMinutes())};
const IC={
 back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
 cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
 img:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 16l5-5 4 4 3-3 5 5"/><circle cx="15.5" cy="9" r="1.5"/></svg>',
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
 down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

/* ---------- storage (IndexedDB, memory fallback) ---------- */
const DB_NAME='qc-field-book';let DB=null; const MEM={reports:new Map(),photos:new Map(),kv:new Map()};
function openDB(){return new Promise(res=>{try{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{const d=r.result;['reports','photos','kv'].forEach(n=>{if(!d.objectStoreNames.contains(n))d.createObjectStore(n)})};r.onsuccess=()=>{DB=r.result;res(true)};r.onerror=()=>res(false);r.onblocked=()=>res(false)}catch(e){res(false)}})}
function tx(store,mode,fn){return new Promise((res,rej)=>{try{const t=DB.transaction(store,mode);const req=fn(t.objectStore(store));t.oncomplete=()=>res(req?req.result:undefined);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)}catch(e){rej(e)}})}
// iPad/iOS Safari can lose Blobs kept in IndexedDB (they turn into broken images), so photo bytes are stored as plain ArrayBuffers
const PH_BIN=['blob','thumb','flat'];
async function packPhoto(v){if(!v||typeof v!=='object')return v;const o={...v};for(const k of PH_BIN){const b=o[k];if(b instanceof Blob){try{o[k]={__ab:await b.arrayBuffer(),type:b.type||'image/jpeg'}}catch(e){console.warn('photo bytes unreadable',k);delete o[k];o.broken=true}}}return o}
function unpackPhoto(v){if(!v||typeof v!=='object')return v;const o={...v};for(const k of PH_BIN){const b=o[k];if(b&&b.__ab)o[k]=new Blob([b.__ab],{type:b.type||'image/jpeg'})}return o}
const PHD=new Set();let phdT;const savePHD=()=>{clearTimeout(phdT);phdT=setTimeout(()=>S.put('kv','phdirty',[...PHD]).catch(()=>{}),300);if(typeof syUI==='function')syUI()};
// Every photo write is read straight back and its byte sizes compared, so a broken write is caught at once
async function putPhoto(k,v){
 const fromSync=!!(v&&v.__fromSync);if(fromSync){v={...v};delete v.__fromSync}
 const v2=await packPhoto(v);
 if(!DB)MEM.photos.set(k,v2);
 else for(let attempt=0;;attempt++){
  await tx('photos','readwrite',o=>o.put(v2,k));
  const back=await tx('photos','readonly',o=>o.get(k));
  const good=!!back&&PH_BIN.every(f=>!(v2[f]&&v2[f].__ab)||(back[f]&&back[f].__ab&&back[f].__ab.byteLength===v2[f].__ab.byteLength&&back[f].__ab.byteLength>0));
  if(good)break;
  if(attempt>=1)throw new Error('Photo could not be stored on this device');
 }
 if(!fromSync){PHD.add(k);savePHD()}
}
const S={
 get:(s,k)=>(DB?tx(s,'readonly',o=>o.get(k)):Promise.resolve(MEM[s].get(k))).then(v=>s==='photos'?unpackPhoto(v):v),
 has:(s,k)=>DB?tx(s,'readonly',o=>o.getKey(k)).then(x=>x!==undefined):Promise.resolve(MEM[s].has(k)),
 put:(s,k,v)=>s==='photos'?putPhoto(k,v):(DB?tx(s,'readwrite',o=>o.put(v,k)):Promise.resolve(void MEM[s].set(k,v))),
 del:(s,k)=>{if(s==='photos'&&PHD.delete(k))savePHD();return DB?tx(s,'readwrite',o=>o.delete(k)):Promise.resolve(void MEM[s].delete(k))},
 all:s=>(DB?tx(s,'readonly',o=>o.getAll()):Promise.resolve([...MEM[s].values()])).then(a=>s==='photos'?(a||[]).map(unpackPhoto):a),
};

/* ---------- AQL · ISO 2859-1 single sampling, normal inspection ---------- */
const LETTERS='ABCDEFGHJKLMNPQR'.split('');
const NS=[2,3,5,8,13,20,32,50,80,125,200,315,500,800,1250,2000];
const LOT_MAX=[8,15,25,50,90,150,280,500,1200,3200,10000,35000,150000,500000,Infinity];
const LEVEL_IDX={I:[0,0,1,2,2,3,4,5,6,7,8,9,10,11,12],II:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14],III:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]};
const ANCHOR={6.5:1,4:2,2.5:3,1.5:4,1:5,0.65:6,0.4:7,0.25:8,0.15:9,0.1:10,0.065:11};
const SEQ=[0,'up',1,2,3,5,7,10,14,21];
const AQL_OPTS=[0,0.065,0.1,0.15,0.25,0.4,0.65,1,1.5,2.5,4,6.5];
const SEV=[['critical','Critical','CR'],['major','Major','MA'],['minor','Minor','MI']];
const SEVL=Object.fromEntries(SEV.map(s=>[s[0],s]));
function codeLetter(lot,level){if(!(lot>=2))return null;const i=LOT_MAX.findIndex(m=>lot<=m);return LEVEL_IDX[level||'II'][i]}
function planFor(li,aql){
 if(aql===0)return{li,ac:0};
 const a=ANCHOR[aql];let d=li-a;
 if(d<0)return{li:a,ac:0};
 if(d>=SEQ.length){d=SEQ.length-1;li=a+d}
 if(SEQ[d]==='up')return{li:li-1,ac:0};
 return{li,ac:SEQ[d]};
}
function calcAQL(r){
 const lot=+r.info.lotQty||0, li=codeLetter(lot,r.level);
 const out={valid:li!=null,lot,letter:li!=null?LETTERS[li]:'–',n:li!=null?Math.min(NS[li],lot):0,rows:[],fail:false};
 for(const[k,vn,en]of SEV){
  const found=r.defects.filter(d=>d.sev===k).reduce((s,d)=>s+(+d.qty||0),0);
  const aql=r.aql[k];
  let row={k,vn,en,aql,found,n:'–',ac:'–',re:'–',res:null};
  if(li!=null){const p=planFor(li,aql);const n=Math.min(NS[p.li],lot);row.n=n;row.ac=p.ac;row.re=p.ac+1;row.full=NS[p.li]>=lot;row.res=found<=p.ac?'pass':'fail';if(row.res==='fail')out.fail=true}
  out.rows.push(row);
 }
 return out;
}
const STATUS={pass:['PASS','Accepted'],fail:['FAIL','Rejected'],pending:['PENDING','In progress'],hold:['ON HOLD','Awaiting approval']};
const hasAql=r=>r.useAql!==false,hasDef=r=>r.useDefects!==false,hasQty=r=>r.useQty!==false;
function evaluate(r){
 const aq=calcAQL(r),on=hasAql(r);
 const anyFail=r.checkpoints.some(c=>c.result==='fail');
 const done=r.checkpoints.filter(c=>c.result).length;
 let auto=((on&&aq.fail)||anyFail)?'fail':(done<r.checkpoints.length||(on&&!aq.valid))?'pending':'pass';
 return{aq,auto,final:r.conclusion.override||auto,done};
}
function measureOK(row){
 const a=parseFloat(String(row.actual).replace(',','.'));if(isNaN(a))return null;
 const spec=String(row.spec||'').trim().replace(',','.');
 const m=spec.match(/^(≤|<=|<|≥|>=|>)\s*(-?\d+(\.\d+)?)/);
 if(m){const v=+m[2];return{'≤':a<=v,'<=':a<=v,'<':a<v,'≥':a>=v,'>=':a>=v,'>':a>v}[m[1]]}
 const s=parseFloat(spec);if(isNaN(s))return null;
 const t=parseFloat(String(row.tol||'0').replace(',','.').replace('±',''))||0;
 return Math.abs(a-s)<=t+1e-9;
}

/* ---------- defaults ---------- */
const INSPECTION_TYPES=['Sample review','PPM','PVR','Pre-production (PPI)','Inline (DUPRO)','Final (FRI)','Container loading','Sample check'];
const SAMPLE_REVIEW_CPS=[['Overall','Front, back, side and perspective views; overall look vs. CAD / concept'],['Details','Joinery, hardware, finish, stitching and other design details'],['Comparison','Side by side with the approved sample, CAD or previous round'],['Change','What changed since the last review / what the vendor must change']];
const isReview=r=>/^sample review$/i.test(r.type||'');
const typeShort=r=>isReview(r)?('Review'+(r.info&&r.info.round?' '+r.info.round:'')):String(r.type||'').replace(/\s*\(.*\)\s*/,'').trim();
const dmy=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:''};
// Report name: Customer - Report type - Project ID - Product - Date
function reportName(r){const cu=custOf(r);return[(cu&&cu.name)||r.info.client,typeShort(r),r.info.project,r.info.product,dmy(r.date)].map(x=>String(x||'').trim()).filter(Boolean).join(' - ')||r.no}
const projectKey=r=>(String(r.info.project||'').trim().toLowerCase()+'|'+String(r.info.product||'').trim().toLowerCase());
const projectLabel=r=>[r.info.project,r.info.product].map(x=>String(x||'').trim()).filter(Boolean).join(' - ')||'No project ID';
function defaultTemplate(){return{
 id:uid(),name:'Furniture · Final Inspection',reportTitle:'INSPECTION REPORT',level:'II',aql:{critical:0,major:2.5,minor:4},
 checkpoints:[
  {id:uid(),name:'Quantity & packing',req:'Count cartons and sets; check against packing list and PO',kind:'check'},
  {id:uid(),name:'Cartons & shipping marks',req:'5-ply cartons, no dents or moisture; marks match approved artwork',kind:'check'},
  {id:uid(),name:'Workmanship & surface finish',req:'Even finish; no runs, dust, scratches, cracks or open joints',kind:'check'},
  {id:uid(),name:'Color & material vs. approved sample',req:'Compare with golden sample / signed color panel',kind:'check'},
  {id:uid(),name:'Product dimensions',req:'Measure at least 3 units against the drawing',kind:'measure',rows:[{name:'Width (W) mm',spec:'1600',tol:'3'},{name:'Depth (D) mm',spec:'900',tol:'3'},{name:'Height (H) mm',spec:'760',tol:'2'}]},
  {id:uid(),name:'Wood moisture content',req:'Moisture meter, 3 points per unit',kind:'measure',rows:[{name:'Tabletop %',spec:'≤12',tol:''},{name:'Legs %',spec:'≤12',tol:''}]},
  {id:uid(),name:'Construction & assembly',req:'Trial assembly per instructions; all fittings present, screws fit',kind:'check'},
  {id:uid(),name:'Function test',req:'Stability, wobble, load test, smooth drawer slides',kind:'check'},
  {id:uid(),name:'Labels & barcodes',req:'Product label, country of origin, barcode scans correctly',kind:'check'},
 ],
 defectLib:['Surface scratch','Paint run','Dust / paint particles','Color off vs. sample','Wood crack','Open joint / gap','Dead knot','Warping','Chipped edge','Glue residue on surface','Missing / wrong screws','Dented carton','Missing / wrong label','Dimension out of tolerance','Wobbles in use'],
}}
function defaultSettings(){return{company:'',inspector:'',accent:'#141414',watermark:true,autoAnnotate:true,reviewShot:true}}
function newReport(t,seq){
 const d=new Date();const no='QC-'+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'-'+pad2(seq);
 return{id:uid(),no,templateId:t.id,templateName:t.name,reportTitle:t.reportTitle,type:t.type||'Final (FRI)',date:todayISO(),
  info:{client:'',supplier:'',location:'',po:'',item:'',product:'',color:'',lotQty:'',cartons:'',inspector:SET.inspector||''},
  level:t.level,aql:clone(t.aql),useAql:t.useAql!==false,useDefects:t.useDefects!==false,useQty:t.useQty!==false,
  checkpoints:t.checkpoints.map(c=>({id:uid(),name:c.name,req:c.req,kind:c.kind,result:'',note:'',photos:[],rows:(c.rows||[]).map(r=>({...r,actual:''}))})),
  defects:[],conclusion:{override:'',remark:''},created:Date.now(),updated:Date.now()};
}

/* ---------- state ---------- */
let SET=defaultSettings(),TEMPLATES=[],REPORTS=[],CUSTOMERS=[];
let view={name:'home',tab:'reports'};
const urlCache=new Map();
async function photoURL(pid){if(urlCache.has(pid))return urlCache.get(pid);let p=await S.get('photos',pid);if(!p&&SY.REM.p.has(pid)){await syEnsurePhoto(pid);p=await S.get('photos',pid)}if(!p)return'';const u=URL.createObjectURL(p.flat instanceof Blob?p.flat:p.blob);urlCache.set(pid,u);return u}
const thumbCache=new Map();
function thumbURL(pid){if(thumbCache.has(pid))return thumbCache.get(pid);const pr=S.get('photos',pid).then(p=>{if(p&&(p.thumb instanceof Blob||p.blob instanceof Blob))return URL.createObjectURL(p.thumb instanceof Blob?p.thumb:p.blob);phqAdd(pid,true);thumbCache.delete(pid);return remURL(pid)});thumbCache.set(pid,pr);return pr}
const saveTimers={};
function saveReport(r,now){r.updated=Date.now();SY.lastEdit=r.updated;scheduleSync();clearTimeout(saveTimers[r.id]);const f=()=>S.put('reports',r.id,r).then(()=>S.get('reports',r.id)).then(b=>{if(!b||(b.updated||0)<r.updated)throw new Error('verify')}).catch(()=>S.put('reports',r.id,r).catch(()=>toast('Could not save. Browser storage may be full.')));if(now)return f();saveTimers[r.id]=setTimeout(f,350)}
let tplTimer;function saveTemplates(){SY.lastEdit=Date.now();if(view.name==='tpl'){const t=TEMPLATES.find(x=>x.id===view.id);if(t)t.updated=Date.now()}TEMPLATES.forEach(t=>{if(!t.updated&&!t.untouched)t.updated=Date.now()});scheduleSync();clearTimeout(tplTimer);tplTimer=setTimeout(()=>S.put('kv','templates',TEMPLATES),350)}
function saveSettings(){SET.updated=Date.now();SY.lastEdit=SET.updated;scheduleSync();S.put('kv','settings',SET)}
let toastT;function toast(msg){$('#layer').querySelector('.toast')?.remove();const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');t.textContent=msg;$('#layer').appendChild(t);clearTimeout(toastT);toastT=setTimeout(()=>t.remove(),2800)}
function busy(on,msg){$('#layer').querySelector('.busy')?.remove();if(on){const b=document.createElement('div');b.className='busy';b.textContent=msg||'Working…';$('#layer').appendChild(b)}}
const cur=()=>REPORTS.find(r=>r.id===view.id);
const curT=()=>TEMPLATES.find(t=>t.id===view.id);
const curC=()=>CUSTOMERS.find(c=>c.id===view.id);
const custOf=r=>r&&r.customerId?CUSTOMERS.find(c=>c.id===r.customerId):null;
let custTimer;function saveCustomers(){SY.lastEdit=Date.now();if(view.name==='cust'){const c=curC();if(c)c.updated=Date.now()}CUSTOMERS.forEach(c=>{if(!c.updated)c.updated=Date.now()});scheduleSync();clearTimeout(custTimer);custTimer=setTimeout(()=>S.put('kv','customers',CUSTOMERS),350)}
function newCustomer(){return{id:uid(),name:'New customer',code:'',contact:'',email:'',market:'',templateId:'',level:'',aql:{critical:'',major:'',minor:''},rules:'',notes:'',updated:Date.now()}}
const custHash=t=>{let h=5381;for(const ch of t)h=((h*33)^ch.charCodeAt(0))>>>0;return h.toString(36)};

/* ---------- photos ---------- */
function pickFiles(camera){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='image/*';if(camera)i.setAttribute('capture','environment');else i.multiple=true;i.style.display='none';document.body.appendChild(i);i.onchange=()=>{res([...i.files]);i.remove()};i.addEventListener('cancel',()=>{res([]);i.remove()});i.click()})}
function stampWM(g,w,h,ts,label){const fs=Math.max(14,Math.round(Math.min(w,h)*0.032));g.font=`600 ${fs}px "Mulish",system-ui,sans-serif`;const txt=fmtDT(ts)+'  ·  '+label;const tw=g.measureText(txt).width;g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,h-fs*1.9,Math.min(w,tw+fs*1.4),fs*1.9);g.fillStyle='#fff';g.fillText(txt,fs*.7,h-fs*.62)}
async function loadBitmap(file){
 try{return await createImageBitmap(file,{imageOrientation:'from-image'})}catch(e){}
 return await new Promise((res,rej)=>{const u=URL.createObjectURL(file);const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=u});
}
async function processPhoto(file,label){
 const bmp=await loadBitmap(file);const W0=bmp.width,H0=bmp.height,max=1600,sc=Math.min(1,max/Math.max(W0,H0));
 const w=Math.round(W0*sc),h=Math.round(H0*sc);const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.drawImage(bmp,0,0,w,h);
 const ts=Date.now();
 if(SET.watermark)stampWM(g,w,h,ts,label);
 bmp.close&&bmp.close();
 const ts2=320/Math.max(w,h),tc=document.createElement('canvas');tc.width=Math.round(w*ts2);tc.height=Math.round(h*ts2);tc.getContext('2d').drawImage(c,0,0,tc.width,tc.height);
 const enc=await jpegTarget(c),blob=enc.blob,thumb=await new Promise(r=>tc.toBlob(r,'image/jpeg',.7));
 c.width=c.height=0;tc.width=tc.height=0;const id=uid();
 await S.put('photos',id,{id,blob,thumb,w:enc.w,h:enc.h,caption:'',ts,u:ts});
 // read it straight back: if the device could not store the photo, stop here so the inspector can retake it now
 {const chk=await S.get('photos',id);let ok=!!(chk&&chk.blob instanceof Blob&&!chk.broken);if(ok){try{ok=(await chk.blob.arrayBuffer()).byteLength>1000}catch(e){ok=false}}if(!ok){await S.del('photos',id);throw new Error('photo could not be saved on this device')}}
 thumbCache.set(id,Promise.resolve(URL.createObjectURL(thumb)));
 return id;
}
/* background queue: tiles appear instantly, processing runs one by one while the inspector keeps shooting */
const JOBS=[];let working=false;
function addPhotos(files,target,label,auto){
 if(!files.length)return;const r=cur();
 for(const f of files){const tmp='tmp-'+uid();target.push(tmp);JOBS.push({f,target,label,tmp,r,auto,preview:URL.createObjectURL(f)})}
 render();runJobs();
}
async function runJobs(){
 if(working)return;working=true;let n=0,last='';
 while(JOBS.length){const j=JOBS.shift();
  const rv=j.auto&&SET.reviewShot!==false&&!AE&&view.name==='report'&&view.id===j.r.id;if(rv)busy(true,'Opening photo…');
  try{const id=await processPhoto(j.f,j.label);const k=j.target.indexOf(j.tmp);if(k>=0)j.target[k]=id;else j.target.push(id);saveReport(j.r);last=j.label;swapTile(j.tmp,id);if(rv&&!AE&&view.name==='report'){busy(false);await openAnnotator(id,{target:j.target,label:j.label})}else n++;busy(false)}
  catch(e){busy(false);const k=j.target.indexOf(j.tmp);if(k>=0)j.target.splice(k,1);document.querySelector(`[data-tmp="${j.tmp}"]`)?.remove();toast('Could not read a photo. Try taking it again.')}
  URL.revokeObjectURL(j.preview);
 }
 working=false;if(n)toast('Saved '+n+' photo'+(n>1?'s':'')+' to “'+last+'”');
}
async function swapTile(tmp,id){const el=document.querySelector(`[data-tmp="${tmp}"]`);if(!el)return;const u=await thumbURL(id);el.outerHTML=`<button class="thumb" data-act="viewphoto" data-pid="${id}" aria-label="View photo"><img data-pid="${id}" src="${u}" alt="" decoding="async"></button>`}
const tmpPreview=tmp=>JOBS.find(j=>j.tmp===tmp)?.preview||'';

/* ---------- rendering ---------- */
function setBar(html){$('#bar').innerHTML=html}
const SV=p=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
const TAB_IC={
 reports:SV('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>'),
 templates:SV('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
 settings:SV('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
 customers:SV('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18 14.4c1.8.8 3 2.7 3 5.6"/>'),
 creports:SV('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>'),
 cprofile:SV('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="2.6"/><path d="M7.5 17c.8-2 2.4-3 4.5-3s3.7 1 4.5 3"/>'),
 info:SV('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
 check:SV('<path d="M4 6l2 2 3-3"/><path d="M4 13l2 2 3-3"/><path d="M12 7h8M12 14h8M4 20h16"/>'),
 defects:SV('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>'),
 export:SV('<path d="M9 3h6v5l2 3H7l2-3z"/><path d="M5 14h14v3H5zM4 21h16"/>'),
};
function setTabs(list,active){const t=$('#tabs');t.hidden=!list.length;t.innerHTML='<div class="in">'+list.map(([k,l,n])=>`<button role="tab" data-tab="${k}" aria-selected="${k===active}"><span class="ico">${TAB_IC[k]||''}</span><span class="tl">${l}</span>${n!=null&&n!==''?`<span class="n">${n}</span>`:''}</button>`).join('')+'</div>'}
function setHero(h){const el=$('#hero');el.innerHTML=h?`<div class="wrap">${h}</div>`:'';el.hidden=!h}
const stamp=(st,big)=>`<div class="stamp ${st}${big?' big':''}">${STATUS[st][0]}<small>${STATUS[st][1]}</small></div>`;
function progressHTML(r,e){const T=r.checkpoints.length||1,c=k=>r.checkpoints.filter(x=>x.result===k).length;return`<div class="progress"><div class="track"><i class="p" style="width:${c('pass')/T*100}%"></i><i class="f" style="width:${c('fail')/T*100}%"></i><i class="n" style="width:${c('na')/T*100}%"></i></div><span class="lbl2">${e.done}/${r.checkpoints.length} checked</span></div>`}
const photoCount=r=>r.checkpoints.reduce((s,c)=>s+c.photos.length,0)+r.defects.reduce((s,d)=>s+d.photos.length,0);
const AI_TRASH=SV('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>');
const BRAND='<div class="brand"><span class="brand-mark">'+SV('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 13l2 2 4-4"/>')+'</span><div style="min-width:0"><span class="sub">Inspection · Sample check</span><h1>QC Field Book</h1></div></div>';
function chip(st){const s=STATUS[st]||STATUS.pending;return`<span class="chip ${st}">${s[0]}</span>`}
let fabEl=null;
function setFab(on){if(fabEl){fabEl.remove();fabEl=null}if(on){fabEl=document.createElement('button');fabEl.className='fab';fabEl.dataset.act='quickcap';fabEl.innerHTML=IC.cam+'Quick shot';document.body.appendChild(fabEl)}}

function render(keepScroll=true){
 const y=window.scrollY;
 if(view.name==='home')renderHome();else if(view.name==='report')renderReport();else if(view.name==='tpl')renderTpl();else if(view.name==='cust')renderCust();
 if(keepScroll)window.scrollTo(0,y);else window.scrollTo(0,0);
 hydrateThumbs();
}
const REPAIRING=new Map();
// Rebuild a photo whose stored bytes went bad: re-read them, or download the cloud copy again
function repairPhoto(pid){
 if(REPAIRING.has(pid))return REPAIRING.get(pid);
 const pr=(async()=>{
  const p=await S.get('photos',pid);if(!p)return false;
  const fetchB=async id=>{if(!id)return null;return await sbDownload(id)};
  const okB=async b=>{if(!(b instanceof Blob))return false;try{await b.arrayBuffer();return true}catch(e){return false}};
  if(!(await okB(p.blob))){const b=await fetchB(p.assetId);if(!b)return false;p.blob=b}
  if(p.ann&&p.ann.length&&!(await okB(p.flat))){const f=await fetchB(p.flatAssetId);if(f)p.flat=f;else delete p.flat}
  try{const bmp=await loadBitmap(p.flat instanceof Blob?p.flat:p.blob),c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);if(bmp.close)bmp.close();p.thumb=await makeThumbBlob(c);c.width=c.height=0}catch(e){return false}
  delete p.broken;await S.put('photos',pid,p);
  const fresh=await S.get('photos',pid);
  const o=urlCache.get(pid);if(o)URL.revokeObjectURL(o);urlCache.delete(pid);
  const u=URL.createObjectURL(fresh.thumb);thumbCache.set(pid,Promise.resolve(u));
  document.querySelectorAll(`img[data-pid="${pid}"]`).forEach(im=>{im.src=u});
  return true;
 })().catch(e=>{console.error('repair',e);return false});
 REPAIRING.set(pid,pr);return pr;
}
document.addEventListener('error',ev=>{const im=ev.target;if(im&&im.tagName==='IMG'&&im.dataset&&im.dataset.pid&&!im.dataset.rep){im.dataset.rep='1';thumbCache.delete(im.dataset.pid);repairPhoto(im.dataset.pid)}},true);
function hydrateThumbs(){document.querySelectorAll('img[data-pid]').forEach(im=>{if(!im.getAttribute('src'))thumbURL(im.dataset.pid).then(u=>{if(u)im.src=u})})}

function reportCards(list,msg){return list.length?list.map(r=>{const e=evaluate(r);const pc=r.checkpoints.reduce((s,c)=>s+c.photos.length,0)+r.defects.reduce((s,d)=>s+d.photos.length,0);const T=r.checkpoints.length||1,cc=k=>r.checkpoints.filter(x=>x.result===k).length,ph=allPhotos(r),dq=r.defects.reduce((s,d)=>s+(+d.qty||0),0);
  return`<div class="rwrap"><button class="rcard st-${e.final}" data-act="open" data-id="${r.id}">
   <div class="rc-top"><span class="rc-no">${esc(r.no)}${r.example?' · EXAMPLE':''}</span>${chip(e.final)}</div>
   <div class="rc-t">${esc(r.info.product||'(No product name)')}</div>
   <div class="rc-s">${esc(reportName(r))}</div>
   ${ph.length?`<div class="rc-thumbs">${ph.slice(0,ph.length>5?4:5).map(p=>`<img data-pid="${p}" alt="" loading="lazy" decoding="async">`).join('')}${ph.length>5?`<span class="more">+${ph.length-4}</span>`:''}</div>`:''}
   <div class="rc-foot"><span class="bar2"><i class="p" style="width:${cc('pass')/T*100}%"></i><i class="f" style="width:${cc('fail')/T*100}%"></i><i class="n" style="width:${cc('na')/T*100}%"></i></span><span>${e.done}/${r.checkpoints.length}</span><span>${pc} ph</span><span class="${dq?'df':''}">${dq} def</span></div>
  </button><button class="rc-del" data-act="delreport" data-id="${r.id}" aria-label="Delete report ${esc(r.no)}">${AI_TRASH}</button></div>`}).join(''):'<div class="empty">'+msg+'</div>'}
function chipsHTML(){if(!CUSTOMERS.length)return'';const cf=view.cf||'';const ch=(id,l)=>`<button class="cchip" aria-pressed="${cf===id}" data-act="cfilter" data-id="${esc(id)}">${esc(l)}</button>`;return`<div class="cchips" role="group" aria-label="Filter by customer">${ch('','All')}${CUSTOMERS.map(c=>ch(c.id,c.name)).join('')}${REPORTS.some(r=>!custOf(r)&&!r.example)?ch('_none','No customer'):''}</div>`}
function custStats(c){const rs=REPORTS.filter(r=>r.customerId===c.id&&!r.example),ev=rs.map(evaluate),n=k=>ev.filter(x=>x.final===k).length;const last=rs.reduce((m,r)=>Math.max(m,r.updated||0),0);return{n:rs.length,pass:n('pass'),fail:n('fail'),open:n('pending')+n('hold'),last}}
function renderCustTab(m){
 m.innerHTML=`<p class="muted small" style="margin:0">Each customer keeps its own reports, default template, AQL level and special requirements. Pick the customer when you start a report and everything fills in.</p><button class="btn primary block" data-act="newcust">${IC.plus}New customer</button>
 ${CUSTOMERS.length?[...CUSTOMERS].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>{const t=custStats(c);return`<button class="rcard ccard" data-act="opencust" data-id="${c.id}"><div class="rc-top"><span class="rc-no">${esc((c.code||'—').toUpperCase())}${c.market?' · '+esc(c.market):''}</span><span class="rc-no">${t.last?fmtDate(new Date(t.last).toISOString().slice(0,10)):''}</span></div><div class="rc-t">${esc(c.name)}</div><div class="rc-s">${esc([c.contact,c.email].filter(Boolean).join(' · ')||'No contact yet')}</div><div class="rc-foot"><span>${t.n} report${t.n===1?'':'s'}</span><span style="color:var(--pass)">${t.pass} pass</span><span class="${t.fail?'df':''}">${t.fail} fail</span><span>${t.open} open</span></div></button>`}).join(''):'<div class="empty">No customers yet. Add your first one, then start reports from inside it.</div>'}`;
}
function renderCust(){
 const c=curC();if(!c){view={name:'home',tab:'customers'};return renderHome()}
 const t=custStats(c);if(!c.theme)c.theme={on:false};
 setBar(`<button class="icon-btn" data-act="homecust" aria-label="Back to customers">${IC.back}</button><div style="flex:1;min-width:0"><span class="sub">Customer${c.code?' · '+esc(c.code):''}</span><h1>${esc(c.name)}</h1></div>`);
 setHero(`<div><div class="hero-k">${esc([c.market,c.contact].filter(Boolean).join(' · ')||'Customer folder')}</div><h2 class="hero-t" id="hero-title">${esc(c.name)}</h2></div><div class="stats"><div class="stat"><b>${t.n}</b><span>Reports</span></div><div class="stat pass"><b>${t.pass}</b><span>Pass</span></div><div class="stat fail"><b>${t.fail}</b><span>Fail</span></div><div class="stat pending"><b>${t.open}</b><span>Open</span></div></div>`);
 view.tab=view.tab||'creports';
 setTabs([['creports','Reports',t.n||''],['cprofile','Profile']],view.tab);setFab(false);
 const m=$('#main');
 if(view.tab==='creports'){
  const list=REPORTS.filter(r=>r.customerId===c.id);const groups=new Map();
  for(const r of list){const k=projectKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  const gl=[...groups.values()].map(g=>g.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.updated-a.updated)).sort((a,b)=>Math.max(...b.map(x=>x.updated))-Math.max(...a.map(x=>x.updated)));
  m.innerHTML=`<button class="btn primary block" data-act="newreport" data-cid="${c.id}">${IC.plus}New project / report for ${esc(c.name)}</button>
  ${gl.length?gl.map(g=>`<div class="proj"><div class="proj-h"><div style="min-width:0;flex:1"><div class="proj-t">${esc(projectLabel(g[0]))}</div><div class="proj-s">${g.length} report${g.length>1?'s':''} · ${esc([...new Set(g.map(typeShort))].join(', '))}</div></div><button class="btn" data-act="newinproject" data-id="${g[0].id}">${IC.plus}Next report</button></div>${reportCards(g,'')}</div>`).join(''):'<div class="empty">No reports for this customer yet.</div>'}`;
 }else{
  const f=(k,l,ph,type='text')=>`<div class="field"><label for="c-${k}">${l}</label><input id="c-${k}" type="${type}" data-cpath="${k}" value="${esc(c[k])}" placeholder="${esc(ph||'')}"></div>`;
  const aq=k=>`<div class="field"><label for="c-aql-${k}">AQL ${k}</label><select id="c-aql-${k}" data-cpath="aql.${k}" data-cnum="1"><option value="">Template</option>${AQL_OPTS.map(v=>`<option value="${v}" ${String(v)===String(c.aql[k])?'selected':''}>${v}</option>`).join('')}</select></div>`;
  m.innerHTML=`<div class="card"><div class="grid2">${f('name','Customer / buyer name','')}${f('code','Short code (used in report no.)','e.g. NRD')}${f('contact','Contact person','')}${f('email','Email','','email')}${f('market','Destination market','e.g. EU / US')}</div></div>
  <div class="section-title">Slide style (PowerPoint / Google Slides)</div>
  <div class="card"><label class="row" style="cursor:pointer;flex-wrap:nowrap"><input type="checkbox" data-cpath="theme.on" ${c.theme.on?'checked':''} style="width:22px;height:22px;flex:none"> <span>Use this customer’s own slide style (cover, logo, colors, font, header)</span></label>
   <button class="btn" data-act="articlestyle">Use Article style (Montserrat · #FF6559 · “Article PD:” · Wrike Link)</button>
   ${c.theme.on?`<div class="row" style="align-items:center">${c.theme.logo?`<img src="${c.theme.logo}" alt="Logo" style="width:56px;height:56px;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#fff">`:''}<label class="btn pick">${c.theme.logo?'Change logo':'Upload logo'}<input type="file" accept="image/*" data-clogo="1" class="clogo" aria-label="Upload logo"></label>${c.theme.logo?'<button class="btn ghost" data-act="clogodel">Remove</button>':''}</div>
   <div class="grid2"><div class="field"><label for="c-tac">Main color</label><input id="c-tac" type="color" data-cpath="theme.accent" value="${esc(c.theme.accent||'#ff6559')}" style="width:72px;height:44px;border:1px solid var(--line);border-radius:8px;background:none"></div>
    <div class="field"><label for="c-tfont">Font</label><select id="c-tfont" data-cpath="theme.font">${['Montserrat','Arial','Roboto','Open Sans','Lato','Poppins','Inter'].map(fn=>`<option ${fn===(c.theme.font||'Montserrat')?'selected':''}>${fn}</option>`).join('')}</select></div>
    <div class="field"><label for="c-tpre">Header prefix</label><input id="c-tpre" type="text" data-cpath="theme.prefix" value="${esc(c.theme.prefix||'')}" placeholder="e.g. PD:"></div>
    <div class="field"><label for="c-tlink">Link label on cover</label><input id="c-tlink" type="text" data-cpath="theme.linkLabel" value="${esc(c.theme.linkLabel||'')}" placeholder="e.g. Project link"></div></div>
   <div class="field"><label for="c-tfoot">Footer on cover (e.g. confidentiality note)</label><textarea id="c-tfoot" rows="2" data-cpath="theme.footer">${esc(c.theme.footer||'')}</textarea></div>`:''}</div>
  <div class="section-title">Defaults for new reports</div>
  <div class="card"><div class="field"><label for="c-tpl">Suggested template (shown first, marked Default)</label><select id="c-tpl" data-cpath="templateId"><option value="">None</option>${TEMPLATES.map(t=>`<option value="${t.id}" ${t.id===c.templateId?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
   <div class="field"><label for="c-level">Inspection level</label><select id="c-level" data-cpath="level"><option value="">Template</option>${['I','II','III'].map(l=>`<option value="${l}" ${l===c.level?'selected':''}>General level ${l}</option>`).join('')}</select></div>
   <div class="grid3">${aq('critical')}${aq('major')}${aq('minor')}</div></div>
  <div class="section-title">Requirements</div>
  <div class="card"><div class="field"><label for="c-rules">Customer requirements (shown on every report)</label><textarea id="c-rules" rows="5" data-cpath="rules" placeholder="e.g. Carton mark per spec v3 · 6-side drop test · moisture ≤ 12% · photos of every carton label">${esc(c.rules)}</textarea></div>
   <div class="field"><label for="c-notes">Private notes</label><textarea id="c-notes" rows="3" data-cpath="notes" placeholder="Payment terms, past issues, preferred factories…">${esc(c.notes)}</textarea></div></div>
  <div class="card"><button class="btn danger" data-act="delcust">Delete customer</button><p class="small muted" style="margin:8px 0 0">Reports are kept; they just lose the customer link.</p></div>`;
 }
}
function openNewReport(cid){
 if(cid===undefined&&CUSTOMERS.length){
  const s=sheet(`<h2>Which customer?</h2>${[...CUSTOMERS].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<button class="list-item" data-c="${c.id}"><div class="meta"><div class="t">${esc(c.name)}</div><div class="s">${esc([c.code,c.market].filter(Boolean).join(' · ')||'Customer')}</div></div></button>`).join('')}<button class="list-item" data-c=""><div class="meta"><div class="t">No customer</div><div class="s">Type the client name yourself</div></div></button><button class="btn ghost" data-x="no">Cancel</button>`);
  s.querySelector('[data-x=no]').onclick=()=>s.remove();
  s.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{s.remove();openNewReport(b.dataset.c)});return;
 }
 const c=cid?CUSTOMERS.find(x=>x.id===cid):null;
 openTemplatePicker(c);
}
function openProjectNext(src){
 const s=sheet(`<h2>Next report for ${esc(projectLabel(src))}</h2><p class="small muted" style="margin:-6px 0 0">Customer, project ID, product, item, supplier and link are copied. Pick the template for this step.</p>${TEMPLATES.map(t=>`<button class="list-item" data-tp="${t.id}"><div class="meta"><div class="t">${esc(t.name)}</div><div class="s">${esc(t.type||'')}${t.type?' · ':''}${t.checkpoints.length} checkpoints</div></div></button>`).join('')}<button class="btn ghost" data-x="no">Cancel</button>`);
 s.querySelector('[data-x=no]').onclick=()=>s.remove();
 s.querySelectorAll('[data-tp]').forEach(b=>b.onclick=async()=>{s.remove();const t=TEMPLATES.find(x=>x.id===b.dataset.tp);
  const sameProj=REPORTS.filter(x=>x.customerId===src.customerId&&projectKey(x)===projectKey(src));
  const preset={};for(const k of['project','product','item','po','color','supplier','location','link','client'])if(src.info[k])preset[k]=src.info[k];
  const rounds=sameProj.filter(x=>/^sample review$/i.test(x.type||'')).map(x=>+x.info.round||0);
  if(/^sample review$/i.test(t.type||''))preset.round=(rounds.length?Math.max(...rounds):0)+1;
  await createReport(t,custOf(src),preset)});
}
async function createReport(t,c,preset){
 const r=newReport(t,1);r.no=nextNo(c&&c.code);
 if(c){r.customerId=c.id;r.info.client=c.name;applyCustDefaults(r,c)}
 if(preset)Object.assign(r.info,preset);
 if(isReview(r)&&!r.info.round)r.info.round=1;
 REPORTS.push(r);await saveReport(r,true);view={name:'report',id:r.id,tab:'info'};render(false);
}
function applyCustDefaults(r,c){if(r.useAql===false)return;if(c.level)r.level=c.level;for(const k of['critical','major','minor'])if(c.aql&&c.aql[k]!==''&&c.aql[k]!=null)r.aql[k]=+c.aql[k]}

function renderHome(){
 setBar(BRAND+syBtn());
 setTabs([['reports','Reports'],['customers','Customers'],['templates','Templates'],['settings','Settings']],view.tab);setFab(false);
 const today=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
 if(view.tab==='reports'){const ev=REPORTS.map(evaluate),cnt=k=>ev.filter(x=>x.final===k).length;
  setHero(`<div><div class="hero-k">${today}</div><h2 class="hero-t">Reports</h2><div class="hero-s">${REPORTS.length} report${REPORTS.length===1?'':'s'} on this phone</div></div>
  <div class="stats"><div class="stat"><b>${REPORTS.length}</b><span>Total</span></div><div class="stat pass"><b>${cnt('pass')}</b><span>Pass</span></div><div class="stat fail"><b>${cnt('fail')}</b><span>Fail</span></div><div class="stat pending"><b>${cnt('pending')+cnt('hold')}</b><span>Open</span></div></div>`)}
 else if(view.tab==='customers')setHero(`<div><div class="hero-k">${CUSTOMERS.length} customer${CUSTOMERS.length===1?'':'s'}</div><h2 class="hero-t">Customers</h2><div class="hero-s">One folder of reports, defaults and requirements per client</div></div>`);
 else if(view.tab==='templates')setHero(`<div><div class="hero-k">${TEMPLATES.length} template${TEMPLATES.length===1?'':'s'}</div><h2 class="hero-t">Templates</h2><div class="hero-s">Your checklists, AQL levels and defect lists</div></div>`);
 else setHero(`<div><div class="hero-k">This phone</div><h2 class="hero-t">Settings</h2><div class="hero-s">Report branding, photo stamp and backups</div></div>`);
 const m=$('#main');
 if(view.tab==='reports'){
  const cf=view.cf||'';const list=[...REPORTS].filter(r=>!cf||(cf==='_none'?!custOf(r):r.customerId===cf)).sort((a,b)=>b.updated-a.updated);
  m.innerHTML=`<button class="btn primary block" data-act="newreport">${IC.plus}New report</button>
  ${chipsHTML()}
  ${reportCards(list,'No reports yet. Tap “New report”, pick a customer and a template, then take photos for each checkpoint.')}`;
 }else if(view.tab==='customers'){renderCustTab(m);
 }else if(view.tab==='templates'){
  m.innerHTML=`<p class="muted small" style="margin:0">A template sets the checklist, default AQL levels and the common defect list. New reports copy the template, so editing a template does not change existing reports.</p>
  <button class="btn primary block" data-act="newtpl">${IC.plus}New template</button>
  <button class="btn block" data-act="newtpl2">${IC.plus}New sample-review template (no AQL)</button>
  ${TEMPLATES.map(t=>`<div class="tpl-item"><div class="meta"><div class="t">${esc(t.name)}</div><div class="s">${t.checkpoints.length} checkpoints · ${t.useAql===false?'No AQL':'AQL '+t.aql.critical+'/'+t.aql.major+'/'+t.aql.minor+' · Level '+t.level}</div></div><button class="btn" data-act="edittpl" data-id="${t.id}">Edit</button><button class="btn ghost" data-act="duptpl" data-id="${t.id}">Duplicate</button></div>`).join('')}`;
 }else{
  m.innerHTML=`<div class="card">
   <div class="field"><label for="s-company">Company name (shown in report header)</label><input id="s-company" type="text" data-set="company" value="${esc(SET.company)}" placeholder="e.g. ABC Trading Co., Ltd."></div>
   <div class="field"><label for="s-insp">Default inspector name</label><input id="s-insp" type="text" data-set="inspector" value="${esc(SET.inspector)}" placeholder="Full name"></div>
   <div class="row"><div class="field grow"><label for="s-accent">Report accent color</label><input id="s-accent" type="color" data-set="accent" value="${esc(SET.accent)}" style="width:72px;height:44px;border:1px solid var(--line);border-radius:8px;background:none"></div></div>
   <label class="row" style="cursor:pointer;flex-wrap:nowrap;align-items:flex-start"><input id="s-wm" type="checkbox" data-set="watermark" ${SET.watermark?'checked':''} style="width:22px;height:22px;flex:none"> <span>Stamp date, time and checkpoint name on photos</span></label>
   <label class="row" style="cursor:pointer;flex-wrap:nowrap;align-items:flex-start"><input id="s-aa" type="checkbox" data-set="reviewShot" ${SET.reviewShot!==false?'checked':''} style="width:22px;height:22px;flex:none"> <span>After each camera shot, show the review screen (retake, note, draw on the photo)</span></label>
   <label class="row" style="cursor:pointer;flex-wrap:nowrap;align-items:flex-start"><input id="s-ppl" type="checkbox" data-set="pptLayers" ${SET.pptLayers!==false?'checked':''} style="width:22px;height:22px;flex:none"> <span>PowerPoint / Google Slides: keep arrows, boxes and notes as separate shapes you can edit or delete</span></label>
   <label class="row" style="cursor:pointer;flex-wrap:nowrap;align-items:flex-start"><input id="s-cam" type="checkbox" data-set="inAppCam" ${SET.inAppCam!==false?'checked':''} style="width:22px;height:22px;flex:none"> <span>Use the in-app camera (shot goes straight to the review screen: Retake / note / draw / Next / Done)</span></label>
  </div>
  <div class="section-title">Account &amp; cloud sync</div>
  <div class="card"><p class="small muted" style="margin:0">${SY.email?'Signed in as <b>'+esc(SY.email)+'</b>. ':''}Everything is saved on this device first, then uploaded to your own Supabase project whenever there is internet. Photos are stored compressed (about 250 KB) with a small thumbnail.</p>
   <p class="small" style="margin:0" id="sy-status">${esc(syText())}</p>
   <div class="row"><button class="btn primary" data-act="syncnow">Sync now</button>${SB?(SY.uid?'<button class="btn" data-act="chpass">Change password</button><button class="btn" data-act="signout">Sign out</button>':'<button class="btn" data-act="signin">Sign in</button>'):''}</div>
   ${SB&&SY.uid?'<button class="btn ghost danger" data-act="signouterase" style="align-self:flex-start">Sign out and erase this device</button>':''}</div>
  <div class="section-title">Install</div>
  <div class="card">${installHTML()}</div>
  <div class="section-title">Backup &amp; import</div>
  <div class="card"><p class="small muted" style="margin:0">Import the backup file (.json) downloaded from the old QC Field Book on claude.ai (Settings → Download backup). Photos are recompressed and uploaded to Supabase. Large files import best on a computer.</p>
   <label class="btn primary pick">Import backup (.json)<input type="file" accept=".json,application/json" class="fi" data-kind="restore" aria-label="Import backup file"></label>
   <button class="btn" data-act="backup">Download backup of this device (.json)</button>
   <p class="small muted" style="margin:0" id="storage-info"></p></div>`;
  storageInfo();
 }
}
async function storageInfo(){try{const e=await navigator.storage.estimate();const el=$('#storage-info');if(el)el.textContent='Using '+(e.usage/1048576).toFixed(1)+' MB'+(e.quota?' of '+(e.quota/1073741824).toFixed(1)+' GB available':'')+'.'}catch(e){}}

function photoGrid(ids,addAttrs){
 return`<div class="photos">${ids.map(p=>p.startsWith('tmp-')?`<div class="thumb loading" data-tmp="${p}"><img src="${tmpPreview(p)}" alt="" decoding="async"><span class="spin"></span></div>`:`<button class="thumb${ANN.has(p)?' has-ann':''}" data-act="viewphoto" data-pid="${p}" aria-label="View photo"><img data-pid="${p}" alt="" decoding="async" loading="lazy"></button>`).join('')}
 <label class="add-photo">${IC.cam}Camera<input type="file" accept="image/*" capture="environment" class="fi" aria-label="Take photo" ${addAttrs}></label><label class="add-photo">${IC.img}Gallery<input type="file" accept="image/*" multiple class="fi" aria-label="Choose photos from gallery" ${addAttrs}></label></div>`;
}
function renderReport(){
 const r=cur();if(!r){view={name:'home',tab:'reports'};return renderHome()}
 const e=evaluate(r);
 setBar(`<button class="icon-btn" data-act="home" aria-label="Back to reports">${IC.back}</button><div style="flex:1;min-width:0"><span class="sub">Report</span><h1 class="mono" style="font-size:17px">${esc(r.no)}</h1></div>${chip(e.final)}<button class="icon-btn" data-act="delreport" data-id="${r.id}" aria-label="Delete this report">${AI_TRASH}</button>`);
 {const sv=k=>r.defects.filter(d=>d.sev===k).reduce((s,d)=>s+(+d.qty||0),0),row=k=>e.aq.rows.find(x=>x.k===k);
  setHero(`<div class="hero-row"><div><div class="hero-k">${esc([r.type,fmtDate(r.date)].filter(Boolean).join(' · '))}</div><h2 class="hero-t" id="hero-title">${esc(r.info.product||'New report')}</h2><div class="hero-s">${esc([r.info.supplier,r.info.client].filter(Boolean).join(' → ')||'Add supplier and client on the Details tab')}</div></div>${stamp(e.final)}</div>
  ${progressHTML(r,e)}
  ${hasAql(r)?`<div class="stats"><div class="stat"><b>${e.aq.letter}</b><span>${e.aq.valid?'n = '+e.aq.n:'AQL code'}</span></div><div class="stat"><b>${photoCount(r)}</b><span>Photos</span></div><div class="stat ${row('major').res==='fail'||row('critical').res==='fail'?'fail':''}"><b>${sv('major')+sv('critical')}</b><span>${sv('critical')?'Crit+Maj':'Major'}</span></div><div class="stat ${row('minor').res==='fail'?'fail':''}"><b>${sv('minor')}</b><span>Minor</span></div></div>`:`<div class="stats"><div class="stat"><b>${e.done}/${r.checkpoints.length}</b><span>Checked</span></div><div class="stat"><b>${photoCount(r)}</b><span>Photos</span></div><div class="stat ${r.checkpoints.some(c=>c.result==='fail')?'fail':''}"><b>${r.checkpoints.filter(c=>c.result==='fail').length}</b><span>Failed</span></div><div class="stat"><b>${hasDef(r)?r.defects.reduce((q,d)=>q+(+d.qty||0),0):r.checkpoints.filter(c=>c.result==='pass').length}</b><span>${hasDef(r)?'Defects':'Passed'}</span></div></div>`}`)}
 if(view.tab==='defects'&&!hasDef(r))view.tab='check';
 setTabs([['info','Details'],['check','Checklist',`${e.done}/${r.checkpoints.length}`],...(hasDef(r)?[['defects','Defects',r.defects.reduce((s,d)=>s+(+d.qty||0),0)||'']]:[]),['export','Result']],view.tab);
 setFab(view.tab==='check'||view.tab==='defects');
 const m=$('#main');
 if(view.tab==='info'){
  const f=(k,l,ph,type='text')=>`<div class="field"><label for="i-${k}">${l}</label><input id="i-${k}" type="${type}" ${type==='number'?'inputmode="numeric" min="0"':''} data-path="info.${k}" value="${esc(r.info[k])}" placeholder="${esc(ph||'')}"></div>`;
  const cu=custOf(r);
  m.innerHTML=`${cu&&cu.rules?`<div class="note" style="white-space:pre-wrap"><b>${esc(cu.name)} requirements</b>\n${esc(cu.rules)}</div>`:''}${r.example?'<div class="note">This is an example report so you can see how the app works and try the PDF/PPTX export. Delete it from the Result tab when you no longer need it.</div>':''}
  <div class="card"><div class="grid2">
   <div class="field"><label for="i-no">Report no.</label><input id="i-no" type="text" data-path="no" value="${esc(r.no)}"></div>
   <div class="field"><label for="i-type">Inspection type</label><select id="i-type" data-path="type" data-re="1">${[...INSPECTION_TYPES,...(INSPECTION_TYPES.includes(r.type)?[]:[r.type])].map(t=>`<option ${t===r.type?'selected':''}>${esc(t)}</option>`).join('')}</select></div>
   <div class="field"><label for="i-date">Inspection date</label><input id="i-date" type="date" data-path="date" value="${esc(r.date)}"></div>
   ${f('project','Project ID','e.g. SCR2-0412')}${f('product','Product / description','e.g. Oak dining table 160 cm')}${f('item','Item / style no.','')}
   ${f('po','PO number','')}${f('color','Color / material','')}
   ${CUSTOMERS.length?`<div class="field"><label for="i-cust">Customer</label><select id="i-cust" data-path="customerId" data-cust="1"><option value="">— None —</option>${CUSTOMERS.map(c=>`<option value="${c.id}" ${c.id===r.customerId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>`:''}
   ${f('client','Client / buyer','')}${f('supplier','Supplier / factory','')}
   ${f('location','Inspection location','')}${f('inspector','Inspector','')}
   ${f('round','Review # (sample round)','e.g. 1','number')}${f('link',esc((custOf(r)&&custOf(r).theme&&custOf(r).theme.linkLabel)||'Wrike Link'),'https://…','url')}
  </div></div>
  ${(hasQty(r)||hasAql(r))?`<div class="section-title">${hasAql(r)?(hasQty(r)?'Quantity & AQL':'AQL'):'Quantity'}</div>
  <div class="card">${hasQty(r)?`<div class="grid2">${f('lotQty','Lot size (pcs)','e.g. 960','number')}${f('cartons','Cartons','','number')}</div>`:''}
   ${hasAql(r)?`<div class="grid2"><div class="field"><label for="i-level">Inspection level</label><select id="i-level" data-path="level" data-re="1">${['I','II','III'].map(l=>`<option value="${l}" ${l===r.level?'selected':''}>General level ${l}</option>`).join('')}</select></div>
   <div class="field"><span class="lbl">Sample size</span><div style="min-height:44px;display:flex;align-items:center"><span class="mono" style="font-size:18px;font-weight:700">${e.aq.valid?`Code ${e.aq.letter} · n = ${e.aq.n}`:'Enter lot size'}</span></div></div></div>
   <div class="grid3">${SEV.map(([k,vn])=>`<div class="field"><label for="i-aql-${k}">AQL ${vn}</label><select id="i-aql-${k}" data-path="aql.${k}" data-num="1" data-re="1">${AQL_OPTS.map(v=>`<option value="${v}" ${v===r.aql[k]?'selected':''}>${v===0?'0 (zero tolerance)':v}</option>`).join('')}</select></div>`).join('')}</div>`:''}
  </div>`:''}
  </div>`;
 }else if(view.tab==='check'){
  m.innerHTML=r.checkpoints.map((c,i)=>{
   const meas=c.kind==='measure'?`<div class="scroll-x"><table class="m"><thead><tr><th>Measurement</th><th>Spec</th><th>±</th><th style="width:96px">Actual</th><th></th></tr></thead><tbody>${c.rows.map((row,j)=>{const ok=measureOK(row);return`<tr><td>${esc(row.name)}</td><td class="mono">${esc(row.spec)}</td><td class="mono">${esc(row.tol)}</td><td><input type="text" inputmode="decimal" aria-label="Actual ${esc(row.name)}" data-path="checkpoints.${i}.rows.${j}.actual" data-re="soft" value="${esc(row.actual)}"></td><td class="${ok==null?'':ok?'ok':'ng'}" data-okcell="${i}-${j}">${ok==null?'':ok?'✓':'✗'}</td></tr>`}).join('')}</tbody></table></div>`:'';
   return`<section class="card cp ${c.result?'is-'+c.result:''}" id="cp-${c.id}">
    <div class="cp-head"><div class="cp-num mono">${pad2(i+1)}</div><div style="flex:1;min-width:0"><div class="cp-name">${esc(c.name)}</div>${c.req?`<div class="cp-req">${esc(c.req)}</div>`:''}</div></div>
    <div class="seg" role="group" aria-label="Result">${[['pass','Pass'],['fail','Fail'],['na','N/A']].map(([k,l])=>`<button class="${k}" aria-pressed="${c.result===k}" data-act="result" data-i="${i}" data-v="${k}">${l}</button>`).join('')}</div>
    ${meas}
    <textarea aria-label="Notes ${esc(c.name)}" data-path="checkpoints.${i}.note" placeholder="Notes / findings">${esc(c.note)}</textarea>
    ${photoGrid(c.photos,`data-kind="cp" data-i="${i}"`)}
   </section>`}).join('');
 }else if(view.tab==='defects'){
  const aq=e.aq;
  m.innerHTML=`${hasAql(r)?`<div class="card"><div class="aql-letter"><span class="big mono">${aq.letter}</span><span>${aq.valid?`Lot ${aq.lot} pcs · Level ${r.level} · general sample size <b class="mono">${aq.n}</b>`:'Enter the lot size on the Details tab to calculate AQL'}</span></div>
   <div class="scroll-x"><table class="m"><thead><tr><th>Class</th><th>AQL</th><th>n</th><th>Ac/Re</th><th>Found</th><th>Result</th></tr></thead><tbody>${aq.rows.map(x=>`<tr><td>${x.vn}</td><td class="mono">${x.aql}</td><td class="mono">${x.n}${x.full?'*':''}</td><td class="mono">${x.ac}/${x.re}</td><td class="mono"><b>${x.found}</b></td><td>${x.res?`<span class="${x.res==='pass'?'ok':'ng'}">${x.res==='pass'?'Pass':'Fail'}</span>`:'–'}</td></tr>`).join('')}</tbody></table></div>
   ${aq.rows.some(x=>x.full)?'<p class="small muted" style="margin:0">* Table sample size is equal to or larger than the lot: inspect 100%.</p>':''}</div>`:''}
  <div class="section-title">Log a defect</div>
  <div class="card">
   <div class="field"><label for="d-desc">Defect description</label><input id="d-desc" type="text" list="deflib" placeholder="Pick or type a defect"><datalist id="deflib">${(TEMPLATES.find(t=>t.id===r.templateId)||TEMPLATES[0]||{defectLib:[]}).defectLib.map(d=>`<option value="${esc(d)}">`).join('')}</datalist></div>
   <div class="seg" role="group" aria-label="Severity" id="d-sev">${SEV.map(([k,vn])=>`<button class="${k}" aria-pressed="${(view.sev||'major')===k}" data-act="pick-sev" data-v="${k}">${vn}</button>`).join('')}</div>
   <div class="row"><div class="stepper"><button data-act="dqty" data-d="-1" aria-label="Decrease">−</button><input id="d-qty" type="number" inputmode="numeric" min="1" value="1" aria-label="Defect quantity"><button data-act="dqty" data-d="1" aria-label="Increase">+</button></div>
   <label class="btn primary grow pick">${IC.cam}Add defect + photo<input type="file" accept="image/*" capture="environment" class="fi" data-kind="newdef" aria-label="Add defect and take photo"></label><button class="btn" data-act="adddefect">Add only</button></div>
  </div>
  ${r.defects.length?r.defects.map((d,i)=>`<section class="card" style="border-left:4px solid var(--${d.sev==='critical'?'fail':d.sev==='major'?'warn':'accent'})">
   <div class="row"><span class="chip ${d.sev==='critical'?'fail':d.sev==='major'?'pending':'hold'}">${SEVL[d.sev][1]}</span><input type="text" class="grow" aria-label="Defect description" data-path="defects.${i}.desc" value="${esc(d.desc)}" style="flex:1 1 160px"></div>
   <div class="row"><div class="stepper"><button data-act="qty" data-i="${i}" data-d="-1" aria-label="Decrease">−</button><input type="number" inputmode="numeric" min="0" aria-label="Quantity" data-path="defects.${i}.qty" data-num="1" data-re="1" value="${esc(d.qty)}"><button data-act="qty" data-i="${i}" data-d="1" aria-label="Increase">+</button></div>
    <select aria-label="Change severity" data-path="defects.${i}.sev" data-re="1" style="width:auto;flex:1">${SEV.map(([k,vn,en])=>`<option value="${k}" ${k===d.sev?'selected':''}>${vn} (${en})</option>`).join('')}</select>
    <button class="icon-btn" data-act="deldefect" data-i="${i}" aria-label="Delete defect">${IC.x}</button></div>
   ${photoGrid(d.photos,`data-kind="df" data-i="${i}"`)}
  </section>`).join(''):'<div class="empty">No defects logged.</div>'}`;
 }else{
  const st=e.final;
  m.innerHTML=`<div class="result-tag">${stamp(st,true)}<div class="why">${r.conclusion.override?'Set by inspector':hasAql(r)?'Automatic from checklist + AQL':'Automatic from checklist'}</div></div>
  <div class="card">
   <div class="field"><label for="c-ov">Final result</label><select id="c-ov" data-path="conclusion.override" data-re="1"><option value="">Automatic (${STATUS[e.auto][0]})</option>${['pass','fail','hold'].map(k=>`<option value="${k}" ${r.conclusion.override===k?'selected':''}>${STATUS[k][0]} · ${STATUS[k][1]}</option>`).join('')}</select></div>
   <div class="field"><label for="c-rm">Remarks / recommendations</label><textarea id="c-rm" data-path="conclusion.remark" rows="4" placeholder="e.g. Factory to rework 12 scratched tops before shipment">${esc(r.conclusion.remark)}</textarea></div>
   <dl class="kv"><dt>Checklist</dt><dd>${e.done}/${r.checkpoints.length} checked · ${r.checkpoints.filter(c=>c.result==='fail').length} failed</dd>${hasAql(r)?`<dt>AQL</dt><dd>${e.aq.valid?e.aq.rows.map(x=>x.vn+' '+x.found+'/'+x.ac).join(' · '):'no lot size yet'}</dd>`:''}${(r.sent||[]).length?`<dt>Emailed</dt><dd>${esc(r.sent.at(-1).to.join(', '))} · ${esc(fmtDT(r.sent.at(-1).at))}</dd>`:''}<dt>Photos</dt><dd>${r.checkpoints.reduce((s,c)=>s+c.photos.length,0)+r.defects.reduce((s,d)=>s+d.photos.length,0)}</dd></dl>
  </div>
  <div class="section-title">Export report</div>
  <div class="card">
   <button class="btn primary block" data-act="pdf">${SV('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14l3 3 3-3"/>')}Export PDF</button>
   <button class="btn block" data-act="emailpdf">${SV('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>')}Email report (PDF)</button>
   <button class="btn dark block" data-act="pptx">${SV('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>')}Export PowerPoint / Google Slides (.pptx)</button>
   <p class="small muted" style="margin:0">Google Slides: upload the .pptx to Google Drive → Open with Google Slides. Arrows, boxes and notes stay separate shapes you can edit.</p>
  </div>

  <div class="section-title">More</div>
  <div class="card"><div class="row"><button class="btn" data-act="dupreport">Duplicate report (without photos)</button><button class="btn danger" data-act="delreport">Delete report</button></div></div>`;
 }
}

function renderTpl(){
 const t=curT();if(!t){view={name:'home',tab:'templates'};return renderHome()}
 setBar(`<button class="icon-btn" data-act="hometpl" aria-label="Back to templates">${IC.back}</button><div style="flex:1;min-width:0"><span class="sub">Template</span><h1>${esc(t.name)}</h1></div>`);
 setTabs([],'');setFab(false);setHero('');
 $('#main').innerHTML=`<div class="card"><div class="grid2">
  <div class="field"><label for="t-name">Template name</label><input id="t-name" type="text" data-tpath="name" value="${esc(t.name)}"></div>
  <div class="field"><label for="t-title">Report title</label><input id="t-title" type="text" data-tpath="reportTitle" value="${esc(t.reportTitle)}"></div>
  <div class="field"><label for="t-type">Report type</label><select id="t-type" data-tpath="type">${INSPECTION_TYPES.map(x=>`<option ${x===(t.type||'Final (FRI)')?'selected':''}>${esc(x)}</option>`).join('')}</select></div></div>
  <div class="section-title" style="margin:4px 0 -4px">Report sections</div>
  ${[['useQty','Lot size & cartons','Quantity fields on the Details tab'],['useAql','AQL sampling','Sample size, Ac/Re and automatic AQL pass/fail'],['useDefects','Defect log','Defects tab with severity and quantity']].map(([k,l,h])=>`<label class="row" style="cursor:pointer;align-items:flex-start;flex-wrap:nowrap"><input type="checkbox" data-tflag="${k}" ${t[k]!==false?'checked':''} style="width:22px;height:22px;margin-top:2px;flex:none"><span style="flex:1;min-width:0"><b>${l}</b><br><span class="small muted">${h}</span></span></label>`).join('')}
  ${t.useAql!==false?`<div class="grid2"><div class="field"><label for="t-level">Default inspection level</label><select id="t-level" data-tpath="level">${['I','II','III'].map(l=>`<option value="${l}" ${l===t.level?'selected':''}>General level ${l}</option>`).join('')}</select></div></div>
  <div class="grid3">${SEV.map(([k,vn])=>`<div class="field"><label for="t-aql-${k}">AQL ${vn}</label><select id="t-aql-${k}" data-tpath="aql.${k}" data-num="1">${AQL_OPTS.map(v=>`<option value="${v}" ${v===t.aql[k]?'selected':''}>${v}</option>`).join('')}</select></div>`).join('')}</div>`:''}
 </div>
 <div class="section-title">Checkpoints (${t.checkpoints.length})</div>
 ${t.checkpoints.map((c,i)=>`<section class="card">
  <div class="row"><span class="cp-num mono">${pad2(i+1)}</span><input type="text" class="grow" aria-label="Checkpoint name" data-tpath="checkpoints.${i}.name" value="${esc(c.name)}" style="flex:1 1 150px">
   <button class="icon-btn" data-act="tmove" data-i="${i}" data-d="-1" aria-label="Move up">${IC.up}</button><button class="icon-btn" data-act="tmove" data-i="${i}" data-d="1" aria-label="Move down">${IC.down}</button><button class="icon-btn" data-act="tdel" data-i="${i}" aria-label="Delete checkpoint">${IC.x}</button></div>
  <input type="text" aria-label="Requirement" data-tpath="checkpoints.${i}.req" value="${esc(c.req)}" placeholder="Requirement / how to check">
  <div class="seg" role="group" aria-label="Checkpoint type">${[['check','Pass / fail'],['measure','With measurements']].map(([k,l])=>`<button aria-pressed="${c.kind===k}" class="${c.kind===k?'pass':''}" data-act="tkind" data-i="${i}" data-v="${k}">${l}</button>`).join('')}</div>
  ${c.kind==='measure'?`<div class="scroll-x"><table class="m"><thead><tr><th>Measurement</th><th>Spec</th><th>Tolerance ±</th><th></th></tr></thead><tbody>${(c.rows||[]).map((r,j)=>`<tr><td><input type="text" aria-label="Measurement" data-tpath="checkpoints.${i}.rows.${j}.name" value="${esc(r.name)}"></td><td><input type="text" aria-label="Spec" data-tpath="checkpoints.${i}.rows.${j}.spec" value="${esc(r.spec)}" placeholder="1600 or ≤12"></td><td><input type="text" aria-label="Tolerance" data-tpath="checkpoints.${i}.rows.${j}.tol" value="${esc(r.tol)}"></td><td><button class="icon-btn" data-act="trowdel" data-i="${i}" data-j="${j}" aria-label="Delete row">${IC.x}</button></td></tr>`).join('')}</tbody></table></div><button class="btn ghost" data-act="trowadd" data-i="${i}">${IC.plus}Add measurement</button>`:''}
 </section>`).join('')}
 <button class="btn block" data-act="tadd">${IC.plus}Add checkpoint</button>
 <div class="section-title">Common defect library</div>
 <div class="card"><label class="lbl" for="t-lib">One defect per line; suggested when you type a defect</label><textarea id="t-lib" rows="8" data-tlib="1">${esc(t.defectLib.join('\n'))}</textarea></div>
 <div class="card"><button class="btn danger" data-act="tpldel">Delete template</button></div>`;
}

/* ---------- path setter ---------- */
function setPath(obj,path,val){const ks=path.split('.');let o=obj;for(let i=0;i<ks.length-1;i++)o=o[ks[i]];o[ks.at(-1)]=val}

document.addEventListener('input',ev=>{
 const el=ev.target;
 if(el.dataset.path){const r=cur();let v=el.value;if(el.dataset.num)v=v===''?'':+v;setPath(r,el.dataset.path,v);saveReport(r);
  if(el.dataset.re==='soft'){const[, i,, j]=el.dataset.path.split('.');const ok=measureOK(r.checkpoints[i].rows[j]);const cell=document.querySelector(`[data-okcell="${i}-${j}"]`);if(cell){cell.className=ok==null?'':ok?'ok':'ng';cell.textContent=ok==null?'':ok?'✓':'✗'}}
  if(el.dataset.path==='no'){const h=$('#bar h1');if(h)h.textContent=v||'Report'}
  if(el.dataset.path==='info.product'){const h2=$('#hero-title');if(h2)h2.textContent=v||'New report'}
  if(el.dataset.path==='info.lotQty'){clearTimeout(window._lt);window._lt=setTimeout(()=>{const span=el.closest('.card').querySelector('.mono[style*="18px"]');const e=evaluate(r);if(span)span.textContent=e.aq.valid?`Code ${e.aq.letter} · n = ${e.aq.n}`:'Enter lot size'},150)}
 }
 else if(el.dataset.tpath){const t=curT();let v=el.value;if(el.dataset.num)v=+v;setPath(t,el.dataset.tpath,v);saveTemplates();if(el.dataset.tpath==='name'){const h=$('#bar h1');if(h)h.textContent=v}}
 else if(el.dataset.cpath){const c=curC();if(!c)return;let v=el.type==='checkbox'?el.checked:el.value;if(el.dataset.cpath.startsWith('theme.')&&!c.theme)c.theme={on:false};if(el.dataset.cnum)v=v===''?'':+v;setPath(c,el.dataset.cpath,v);saveCustomers();if(el.dataset.cpath==='name'){const h=$('#bar h1'),h2=$('#hero-title');if(h)h.textContent=v||'Customer';if(h2)h2.textContent=v||'Customer'}}
 else if(el.dataset.tlib){curT().defectLib=el.value.split('\n').map(s=>s.trim()).filter(Boolean);saveTemplates()}
 else if(el.dataset.set&&el.type!=='checkbox'){SET[el.dataset.set]=el.value;saveSettings()}
});
document.addEventListener('click',ev=>{
 const el=ev.target;
 if(el.classList&&el.classList.contains('fi')&&el.dataset.kind==='newdef'){const d=$('#d-desc');if(!d||!d.value.trim()){ev.preventDefault();toast('Enter a defect description first');d&&d.focus()}}
},true);
document.addEventListener('change',async ev=>{
 const el=ev.target;
 if(el.dataset&&el.dataset.cpath==='theme.on'){render();return}
 if(el.dataset&&el.dataset.clogo){const f=el.files&&el.files[0];el.value='';if(!f)return;const c=curC();if(!c)return;try{const bmp=await loadBitmap(f),k=Math.min(1,320/Math.max(bmp.width,bmp.height)),cv=document.createElement('canvas');cv.width=Math.round(bmp.width*k);cv.height=Math.round(bmp.height*k);cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);if(bmp.close)bmp.close();c.theme=c.theme||{on:true};c.theme.logo=cv.toDataURL('image/png');saveCustomers();render()}catch(e){toast('Could not read this image')}return}
 if(el.classList&&el.classList.contains('fi')){
  const files=[...(el.files||[])];const kind=el.dataset.kind,i=+el.dataset.i;const cam=el.hasAttribute('capture');el.value='';
  if(!files.length)return;
  if(kind==='restore'){doRestore(files[0]);return}
  const r=cur();if(!r)return;
  if(el.dataset.quick)el.closest('.sheet-bg')?.remove();
  if(kind==='newdef'){const desc=$('#d-desc').value.trim()||'Defect';const d={id:uid(),desc,sev:view.sev||'major',qty:Math.max(1,+$('#d-qty').value||1),photos:[]};r.defects.unshift(d);await addPhotos(files,d.photos,'Defect: '+desc,cam);return}
  const target=kind==='cp'?r.checkpoints[i].photos:r.defects[i].photos;
  const label=kind==='cp'?r.checkpoints[i].name:('Defect: '+r.defects[i].desc);
  await addPhotos(files,target,label,cam);
  if(el.dataset.quick&&kind==='cp'&&view.tab==='check')document.getElementById('cp-'+r.checkpoints[i].id)?.scrollIntoView({block:'center'});
  return;
 }
 if(el.dataset.set&&el.type==='checkbox'){SET[el.dataset.set]=el.checked;saveSettings()}
 if(el.dataset.tflag){const t=curT();if(!t)return;t[el.dataset.tflag]=el.checked;if(el.dataset.tflag==='useAql'&&el.checked)t.useQty=true;if(el.dataset.tflag==='useQty'&&!el.checked)t.useAql=false;saveTemplates();render();return}
 if(el.dataset.cust){const r=cur();const c=CUSTOMERS.find(x=>x.id===el.value);r.customerId=el.value;if(c){r.info.client=c.name;applyCustDefaults(r,c)}saveReport(r,true);render();return}
 if(el.dataset.path&&el.dataset.re==='1'){const r=cur();let v=el.value;if(el.dataset.num)v=v===''?'':+v;setPath(r,el.dataset.path,v);saveReport(r);render()}
 if(el.dataset.path==='info.lotQty')render();
});

/* ---------- actions ---------- */
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-act],[data-tab]');if(!b)return;
 if(b.dataset.tab){view.tab=b.dataset.tab;render(false);return}
 const a=b.dataset.act,r=view.name==='report'?cur():null;
 const i=+b.dataset.i;
 switch(a){
 case'home':view={name:'home',tab:'reports'};render(false);break;
 case'hometpl':view={name:'home',tab:'templates'};render(false);break;
 case'open':view={name:'report',id:b.dataset.id,tab:'check'};render(false);break;
 case'newreport':openNewReport(b.dataset.cid);break;
 case'cfilter':view.cf=b.dataset.id;render();break;
 case'newcust':{const c=newCustomer();CUSTOMERS.push(c);saveCustomers();view={name:'cust',id:c.id,tab:'cprofile'};render(false);break}
 case'opencust':view={name:'cust',id:b.dataset.id,tab:'creports'};render(false);break;
 case'homecust':view={name:'home',tab:'customers'};render(false);break;
 case'delcust':{const c=curC();confirmSheet('Delete customer “'+c.name+'”?','Its reports are kept but will no longer be linked to this customer.','Delete customer',()=>{CUSTOMERS=CUSTOMERS.filter(x=>x.id!==c.id);REPORTS.forEach(r=>{if(r.customerId===c.id){r.customerId='';saveReport(r)}});syTomb({kind:'customer',id:c.id,at:Date.now()});saveCustomers();view={name:'home',tab:'customers'};render(false)});break}
 case'result':{const c=r.checkpoints[i];c.result=c.result===b.dataset.v?'':b.dataset.v;saveReport(r);render();break}
 case'cap':case'gal':{
  const files=pickFiles(a==='cap');const kind=b.dataset.kind;
  const target=kind==='cp'?r.checkpoints[i].photos:r.defects[i].photos;
  const label=kind==='cp'?r.checkpoints[i].name:('Defect: '+r.defects[i].desc);
  addPhotos(await files,target,label);break}
 case'quickcap':openQuickCap();break;
 case'viewphoto':openViewer(b.dataset.pid);break;
 case'pick-sev':view.sev=b.dataset.v;document.querySelectorAll('#d-sev button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.v===view.sev));break;
 case'dqty':{const q=$('#d-qty');q.value=Math.max(1,(+q.value||1)+(+b.dataset.d));break}
 case'adddefect':{
  const desc=$('#d-desc').value.trim();if(!desc){toast('Enter a defect description first');$('#d-desc').focus();return}
  const d={id:uid(),desc,sev:view.sev||'major',qty:Math.max(1,+$('#d-qty').value||1),photos:[]};
  const files=b.dataset.cam?pickFiles(true):null;
  r.defects.unshift(d);saveReport(r,true);
  if(files){const f=await files;if(f.length)await addPhotos(f,d.photos,'Defect: '+desc);else render()}else render();
  toast('Logged “'+desc+'”');break}
 case'qty':{const d=r.defects[i];d.qty=Math.max(0,(+d.qty||0)+(+b.dataset.d));saveReport(r);render();break}
 case'deldefect':confirmSheet('Delete defect “'+r.defects[i].desc+'”?','Its photos will be deleted too.','Delete defect',async()=>{for(const p of r.defects[i].photos)await S.del('photos',p);r.defects.splice(i,1);saveReport(r,true);render()});break;
 case'pdf':exportPDF(r);break;
 case'emailpdf':exportPDF(r,'email');break;
 case'pptx':exportPPTX(r);break;
 case'delreport':{const rr=b.dataset.id?REPORTS.find(x=>x.id===b.dataset.id):r;if(!rr)break;confirmSheet('Delete report '+rr.no+(rr.info.product?' · '+rr.info.product:'')+'?','All photos and data in this report will be removed from this device and from your synced devices.','Delete report',async()=>{if(rr.example){SET.exampleGone=true;saveSettings()}if(!rr.example){const ph=[];for(const p of allPhotos(rr))ph.push(await syPhotoRef(p));syTomb({kind:'report',id:rr.id,at:Date.now(),photos:ph})}for(const p of allPhotos(rr)){await S.del('photos',p);ANN.delete(p)}saveANN();await S.del('reports',rr.id);REPORTS=REPORTS.filter(x=>x.id!==rr.id);view={name:'home',tab:'reports'};render(false);toast('Report deleted')});break}
 case'dupreport':{const n=clone(r);n.id=uid();n.no=nextNo();n.example=false;n.checkpoints.forEach(c=>{c.photos=[];c.result='';c.note='';(c.rows||[]).forEach(x=>x.actual='')});n.defects=[];n.conclusion={override:'',remark:''};n.date=todayISO();n.created=n.updated=Date.now();REPORTS.push(n);await saveReport(n,true);view={name:'report',id:n.id,tab:'info'};render(false);toast('Created '+n.no);break}
 case'newinproject':{const src=REPORTS.find(x=>x.id===b.dataset.id);if(src)openProjectNext(src);break}
 case'newtpl2':{const t=defaultTemplate();t.name='Sample review';t.type='Sample review';t.reportTitle='SAMPLE REVIEW REPORT';t.useAql=false;t.useQty=false;t.checkpoints=SAMPLE_REVIEW_CPS.map(x=>[...x]).map(([name,req])=>({id:uid(),name,req,kind:'check'}));TEMPLATES.push(t);saveTemplates();view={name:'tpl',id:t.id};render(false);break}
 case'newtpl':{const t=defaultTemplate();t.name='New template';t.checkpoints=[{id:uid(),name:'Checkpoint 1',req:'',kind:'check'}];TEMPLATES.push(t);saveTemplates();view={name:'tpl',id:t.id};render(false);break}
 case'edittpl':view={name:'tpl',id:b.dataset.id};render(false);break;
 case'duptpl':{const t=clone(TEMPLATES.find(x=>x.id===b.dataset.id));t.id=uid();t.name+=' (copy)';t.checkpoints.forEach(c=>c.id=uid());TEMPLATES.push(t);saveTemplates();render();toast('Template duplicated');break}
 case'tmove':{const t=curT(),j=i+(+b.dataset.d);if(j<0||j>=t.checkpoints.length)return;[t.checkpoints[i],t.checkpoints[j]]=[t.checkpoints[j],t.checkpoints[i]];saveTemplates();render();break}
 case'tdel':{const t=curT();t.checkpoints.splice(i,1);saveTemplates();render();break}
 case'tadd':{const t=curT();t.checkpoints.push({id:uid(),name:'Checkpoint '+(t.checkpoints.length+1),req:'',kind:'check'});saveTemplates();render();break}
 case'tkind':{const c=curT().checkpoints[i];c.kind=b.dataset.v;if(c.kind==='measure'&&!(c.rows&&c.rows.length))c.rows=[{name:'',spec:'',tol:''}];saveTemplates();render();break}
 case'trowadd':{const c=curT().checkpoints[i];(c.rows=c.rows||[]).push({name:'',spec:'',tol:''});saveTemplates();render();break}
 case'trowdel':{curT().checkpoints[i].rows.splice(+b.dataset.j,1);saveTemplates();render();break}
 case'tpldel':{if(TEMPLATES.length<2){toast('Keep at least one template');return}const t=curT();confirmSheet('Delete template “'+t.name+'”?','Reports created from this template are not affected.','Delete template',()=>{TEMPLATES=TEMPLATES.filter(x=>x.id!==t.id);syTomb({kind:'template',id:t.id,at:Date.now()});saveTemplates();view={name:'home',tab:'templates'};render(false)});break}
 case'backup':doBackup();break;
 case'syncnow':syncNow(true);break;
 case'signout':signOut(false);break;
 case'signouterase':signOut(true);break;
 case'signin':showLogin();break;
 case'chpass':changePassword();break;
 case'install':if(BIP){BIP.prompt();BIP.userChoice.finally(()=>{BIP=null;render()})}break;
 case'articlestyle':{const c=curC();if(!c)break;c.theme=Object.assign({},c.theme||{},{on:true,accent:'#ff6559',font:'Montserrat',prefix:'Article PD:',linkLabel:'Wrike Link'});saveCustomers();render();toast('Article slide style applied. Upload the logo below.');break}
 case'clogodel':{const c=curC();if(c&&c.theme){delete c.theme.logo;saveCustomers();render()}break}
 }
});
function allPhotos(r){return[...r.checkpoints.flatMap(c=>c.photos),...r.defects.flatMap(d=>d.photos)]}
function nextNo(code){const d=new Date();const cc=String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const p='QC-'+(cc?cc+'-':'')+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+'-';const n=REPORTS.filter(r=>r.no.startsWith(p)).length+1;return p+pad2(n)}

/* ---------- sheets ---------- */
function sheet(html,onMount){const bg=document.createElement('div');bg.className='sheet-bg';bg.innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});$('#layer').appendChild(bg);onMount&&onMount(bg);return bg}
function confirmSheet(title,body,label,fn){const s=sheet(`<h2>${esc(title)}</h2><p class="muted" style="margin:0">${esc(body)}</p><div class="row"><button class="btn grow" data-x="no">Cancel</button><button class="btn danger armed grow" data-x="yes">${esc(label)}</button></div>`);s.querySelector('[data-x=no]').onclick=()=>s.remove();s.querySelector('[data-x=yes]').onclick=async()=>{s.remove();await fn()}}
function openTemplatePicker(c){
 const def=c&&c.templateId,list=[...TEMPLATES].sort((a,b)=>(b.id===def)-(a.id===def));
 const s=sheet(`<h2>Choose a template${c?' for '+esc(c.name):''}</h2>${list.map(t=>`<button class="list-item" data-tp="${t.id}"><div class="meta"><div class="t">${esc(t.name)}${t.id===def?' <span class="chip pass" style="margin-left:6px">Default</span>':''}</div><div class="s">${t.type?esc(t.type)+' · ':''}${t.checkpoints.length} checkpoints · ${t.useAql===false?'No AQL':'AQL '+t.aql.major+'/'+t.aql.minor}</div></div></button>`).join('')}<button class="btn ghost" data-x="no">Cancel</button>`);
 s.querySelector('[data-x=no]').onclick=()=>s.remove();
 s.querySelectorAll('[data-tp]').forEach(btn=>btn.onclick=async()=>{const t=TEMPLATES.find(x=>x.id===btn.dataset.tp);s.remove();await createReport(t,c)});
}
function openQuickCap(){
 const r=cur();const items=[...r.checkpoints.map((c,i)=>({k:'cp',i,l:pad2(i+1)+' · '+c.name,n:c.photos.length})),...r.defects.map((d,i)=>({k:'df',i,l:'Defect: '+d.desc,n:d.photos.length}))];
 const s=sheet(`<h2>Which checkpoint?</h2><p class="small muted" style="margin:-6px 0 0">The photo goes straight into that section of the report.</p>${items.map(x=>`<label class="list-item pick"><div class="meta"><div class="t">${esc(x.l)}</div><div class="s">${x.n} photo${x.n===1?'':'s'}</div></div>${IC.cam.replace('<svg','<svg width="22" height="22"')}<input type="file" accept="image/*" capture="environment" class="fi" data-kind="${x.k}" data-i="${x.i}" data-quick="1" aria-label="Take photo for ${esc(x.l)}"></label>`).join('')}<button class="btn ghost" data-x="no">Cancel</button>`);
 s.querySelector('[data-x=no]').onclick=()=>s.remove();
}
async function openViewer(pid){
 const r=cur();let p=await S.get('photos',pid);if(!p&&SY.REM.p.has(pid)){busy(true,'Loading photo…');try{await syEnsurePhoto(pid)}finally{busy(false)}p=await S.get('photos',pid)}if(!p){toast('This photo is not available yet');return}const u=await photoURL(pid);
 const owner=r.checkpoints.find(c=>c.photos.includes(pid))||r.defects.find(d=>d.photos.includes(pid));
 const dests=[...r.checkpoints.map((c,i)=>['cp:'+i,pad2(i+1)+' · '+c.name,c]),...r.defects.map((d,i)=>['df:'+i,'Defect: '+d.desc,d])];
 const s=sheet(`<div class="viewer"><img src="${u}" alt="Inspection photo"></div>
  <button class="btn primary block" data-x="ann">${AI.pen}Annotate photo</button>
  <div class="small muted">${fmtDT(p.ts)}</div>
  <div class="field"><label for="v-cap">Caption (printed under the photo)</label><input id="v-cap" type="text" value="${esc(p.caption)}" placeholder="e.g. 3 cm scratch, top left corner"></div>
  <div class="field"><label for="v-move">Section</label><select id="v-move">${dests.map(([k,l,o])=>`<option value="${k}" ${o===owner?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
  <div class="row"><button class="btn danger" data-x="del">Delete photo</button><span class="grow"></span><button class="btn primary" data-x="ok">Done</button></div>`);
 let armed=false;
 s.querySelector('[data-x=ann]').onclick=async()=>{const nc=s.querySelector('#v-cap').value.trim();if(nc!==p.caption){p.caption=nc;p.u=Date.now()}await S.put('photos',pid,p);s.remove();openAnnotator(pid)};
 s.querySelector('[data-x=del]').onclick=async e=>{if(!armed){armed=true;e.target.classList.add('armed');e.target.textContent='Tap again to delete';return}const arr=owner.photos;arr.splice(arr.indexOf(pid),1);syTomb({kind:'photo',photo:await syPhotoRef(pid)});await S.del('photos',pid);if(ANN.delete(pid))saveANN();saveReport(r,true);s.remove();render();toast('Photo deleted')};
 s.querySelector('[data-x=ok]').onclick=async()=>{const nc=s.querySelector('#v-cap').value.trim();if(nc!==p.caption){p.caption=nc;p.u=Date.now();scheduleSync()}await S.put('photos',pid,p);const[k,ix]=s.querySelector('#v-move').value.split(':');const dest=(k==='cp'?r.checkpoints:r.defects)[+ix];if(dest!==owner){owner.photos.splice(owner.photos.indexOf(pid),1);dest.photos.push(pid);saveReport(r,true);toast('Photo moved')}s.remove();render()};
}

/* ---------- photo annotation ---------- */
const AN_COLORS=['#ff3b30','#ffcc00','#34c759','#0a84ff','#ffffff','#111111'];
const AN_LW=[.0032,.005,.008],AN_FS=[.03,.042,.058],AN_R=[.024,.032,.042];
let ANN=new Set(),AE=null;
const saveANN=()=>S.put('kv','annotated',[...ANN]);
const inkOn=c=>c==='#ffcc00'||c==='#ffffff'?'#111111':'#ffffff';
const clamp01=v=>Math.max(.01,Math.min(.99,v));
const AI={
 select:SV('<path d="M6 3l12 9-5.5 1.2L10 19z"/>'),
 arrow:SV('<path d="M5 19L19 5M10 5h9v9"/>'),
 line:SV('<path d="M5 19L19 5"/>'),
 rect:SV('<rect x="4" y="6" width="16" height="12" rx="1.5"/>'),
 ell:SV('<ellipse cx="12" cy="12" rx="9" ry="6.5"/>'),
 pen:SV('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
 text:SV('<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>'),
 num:SV('<circle cx="12" cy="12" r="8.5"/><path d="M10.5 9.8L12.6 8.2V16"/>'),
 crop:SV('<path d="M6 2v14a2 2 0 002 2h14"/><path d="M18 22V8a2 2 0 00-2-2H2"/>'),
 undo:SV('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
 trash:SV('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
 copy:SV('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
};
const AE_TOOLS=[['select','Select'],['crop','Crop'],['arrow','Arrow'],['line','Line'],['rect','Box'],['ell','Circle'],['pen','Pen'],['text','Text'],['num','Number']];
const AE_HINT={crop:'Drag the corners or edges to crop, then tap Apply.',select:'Tap a mark to select it and drag to move. Drag a corner dot to resize.',arrow:'Drag to draw an arrow, or just tap to drop one.',line:'Drag to draw a line, or just tap to drop one.',rect:'Drag to draw a box, or just tap to drop one.',ell:'Drag to draw a circle, or just tap to drop one.',pen:'Draw freehand with your finger.',text:'Tap where the note should go.',num:'Tap to drop numbered markers 1, 2, 3…'};
const MC=document.createElement('canvas').getContext('2d');

function annLayoutText(g,s,w){
 const fs=AN_FS[s.s]*w,pad=fs*.5;g.font=`700 ${fs}px "Be Vietnam Pro",system-ui,sans-serif`;
 const maxW=w*.62,words=String(s.text||' ').split(/\s+/),lines=[];let cur='';
 for(const wd of words){const t=cur?cur+' '+wd:wd;if(cur&&g.measureText(t).width>maxW){lines.push(cur);cur=wd}else cur=t}
 lines.push(cur);
 const tw=Math.max(...lines.map(l=>g.measureText(l).width));
 return{fs,pad,lines,bw:tw+pad*2,bh:lines.length*fs*1.22+pad*1.1};
}
function annBox(s,w,h){
 if(s.t==='pen'){let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const[x,y]of s.pts){a=Math.min(a,x);b=Math.min(b,y);c=Math.max(c,x);d=Math.max(d,y)}return{x:a*w,y:b*h,w:(c-a)*w,h:(d-b)*h}}
 if(s.t==='num'){const r=AN_R[s.s]*w;return{x:s.x*w-r,y:s.y*h-r,w:2*r,h:2*r}}
 if(s.t==='text'){const L=annLayoutText(MC,s,w);return{x:s.x*w,y:s.y*h,w:L.bw,h:L.bh}}
 const x1=Math.min(s.x,s.x2)*w,x2=Math.max(s.x,s.x2)*w,y1=Math.min(s.y,s.y2)*h,y2=Math.max(s.y,s.y2)*h;
 return{x:x1,y:y1,w:x2-x1,h:y2-y1};
}
function annShape(g,w,h,s){
 const lw=AN_LW[s.s]*w;g.save();g.lineWidth=lw;g.lineCap='round';g.lineJoin='round';g.strokeStyle=s.c;g.fillStyle=s.c;
 g.shadowColor='rgba(0,0,0,.38)';g.shadowBlur=lw*.9;g.shadowOffsetY=lw*.25;
 if(s.t==='arrow'||s.t==='line'){
  const x1=s.x*w,y1=s.y*h,x2=s.x2*w,y2=s.y2*h;
  if(s.t==='line'){g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke()}
  else{const a=Math.atan2(y2-y1,x2-x1),hl=lw*3.6+w*.014;
   g.beginPath();g.moveTo(x1,y1);g.lineTo(x2-Math.cos(a)*hl*.55,y2-Math.sin(a)*hl*.55);g.stroke();
   g.beginPath();g.moveTo(x2,y2);g.lineTo(x2-hl*Math.cos(a-.45),y2-hl*Math.sin(a-.45));g.lineTo(x2-hl*Math.cos(a+.45),y2-hl*Math.sin(a+.45));g.closePath();g.fill()}
 }else if(s.t==='rect'||s.t==='ell'){
  const b=annBox(s,w,h);
  if(s.t==='rect'){if(s.fill){g.save();g.globalAlpha=.22;g.shadowColor='transparent';g.fillRect(b.x,b.y,b.w,b.h);g.restore()}g.strokeRect(b.x,b.y,b.w,b.h)}
  else{g.beginPath();g.ellipse(b.x+b.w/2,b.y+b.h/2,Math.max(b.w/2,.5),Math.max(b.h/2,.5),0,0,Math.PI*2);
   if(s.fill){g.save();g.globalAlpha=.22;g.shadowColor='transparent';g.fill();g.restore()}g.stroke()}
 }else if(s.t==='pen'){
  g.beginPath();s.pts.forEach(([x,y],i)=>i?g.lineTo(x*w,y*h):g.moveTo(x*w,y*h));g.stroke();
 }else if(s.t==='num'){
  const r=AN_R[s.s]*w;g.beginPath();g.arc(s.x*w,s.y*h,r,0,Math.PI*2);g.fill();
  g.shadowColor='transparent';g.lineWidth=Math.max(2,r*.12);g.strokeStyle=inkOn(s.c)==='#111111'?'rgba(17,17,17,.55)':'rgba(255,255,255,.9)';g.stroke();
  g.fillStyle=inkOn(s.c);g.font=`800 ${r*1.15}px "Be Vietnam Pro",system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(String(s.n),s.x*w,s.y*h+r*.05);
 }else if(s.t==='text'){
  const L=annLayoutText(g,s,w),x=s.x*w,y=s.y*h;
  g.beginPath();if(g.roundRect)g.roundRect(x,y,L.bw,L.bh,L.fs*.35);else g.rect(x,y,L.bw,L.bh);g.fill();
  g.shadowColor='transparent';g.fillStyle=inkOn(s.c);g.textBaseline='top';g.textAlign='left';
  L.lines.forEach((l,i)=>g.fillText(l,x+L.pad,y+L.pad*.62+i*L.fs*1.22));
 }
 g.restore();
}
function dSeg(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;let t=l?((px-x1)*dx+(py-y1)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))}
function annHit(s,w,h,px,py,tol,inner){
 const T=tol+AN_LW[s.s]*w/2;
 if(s.t==='arrow'||s.t==='line')return dSeg(px,py,s.x*w,s.y*h,s.x2*w,s.y2*h)<=T;
 if(s.t==='pen'){for(let i=1;i<s.pts.length;i++){const a=s.pts[i-1],b=s.pts[i];if(dSeg(px,py,a[0]*w,a[1]*h,b[0]*w,b[1]*h)<=T)return true}return false}
 const b=annBox(s,w,h);
 if(s.t==='text'||s.t==='num')return px>=b.x-tol/2&&px<=b.x+b.w+tol/2&&py>=b.y-tol/2&&py<=b.y+b.h+tol/2;
 if(s.t==='rect'){const inO=px>=b.x-T&&px<=b.x+b.w+T&&py>=b.y-T&&py<=b.y+b.h+T,inI=px>b.x+T&&px<b.x+b.w-T&&py>b.y+T&&py<b.y+b.h-T;return inner?inO:inO&&!inI}
 if(s.t==='ell'){const rx=b.w/2+.01,ry=b.h/2+.01,d=Math.hypot((px-b.x-b.w/2)/rx,(py-b.y-b.h/2)/ry),m=Math.min(rx,ry);return inner?d<=1+T/m:Math.abs(d-1)*m<=T}
 return false;
}
function aeHandles(s,w,h){
 if(s.t==='arrow'||s.t==='line')return[['p1',s.x*w,s.y*h],['p2',s.x2*w,s.y2*h]];
 if(s.t==='rect'||s.t==='ell')return[['a',s.x*w,s.y*h],['b',s.x2*w,s.y*h],['c',s.x2*w,s.y2*h],['d',s.x*w,s.y2*h]];
 return[];
}
function aeSetHandle(s,k,nx,ny){
 nx=Math.max(0,Math.min(1,nx));ny=Math.max(0,Math.min(1,ny));
 if(k==='p1'||k==='a'){s.x=nx;s.y=ny}else if(k==='p2'||k==='c'){s.x2=nx;s.y2=ny}else if(k==='b'){s.x2=nx;s.y=ny}else if(k==='d'){s.x=nx;s.y2=ny}
}
function aeShift(s,dx,dy){
 if(s.pts)s.pts=s.pts.map(([a,b])=>[a+dx,b+dy]);else{s.x+=dx;s.y+=dy;if('x2' in s){s.x2+=dx;s.y2+=dy}}
}
function aeDefault(s,x,y,W,H){
 const nx=x/W,ny=y/H;
 if(s.t==='rect'||s.t==='ell'){const hw=.15,hh=.1*W/H;s.x=clamp01(nx-hw);s.x2=clamp01(nx+hw);s.y=clamp01(ny-hh);s.y2=clamp01(ny+hh)}
 else{const dx=.2,dy=.14*W/H;let tx=nx-dx,ty=ny-dy;if(tx<.03)tx=nx+dx;if(ty<.03)ty=ny+dy;s.x=clamp01(tx);s.y=clamp01(ty);s.x2=nx;s.y2=ny}
}

/* ---- editor state helpers ---- */
const aeSel=()=>AE.shapes.find(s=>s.id===AE.sel)||null;
const aeNew=t=>({id:uid(),t,c:AE.color,s:AE.size});
const aeDirty=()=>!!AE.newBlob||JSON.stringify(AE.shapes)!==AE.base;
function aeBegin(){AE.pending=JSON.stringify(AE.shapes)}
function aeEnd(){if(AE.pending!==null){if(JSON.stringify(AE.shapes)!==AE.pending)AE.hist.push(AE.pending);AE.pending=null}aeSync()}
function aeMutate(fn){const a=document.activeElement;if(a&&a.blur)a.blur();aeBegin();fn();aeEnd();aeDraw()}
function aeToolUI(){document.querySelectorAll('[data-aet]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.aet===AE.tool));}
function aeOptUI(){
 document.querySelectorAll('[data-aec]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.aec===AE.color));
 document.querySelectorAll('[data-aes]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.aes===AE.size));
}
function aeSync(){
 const s=aeSel(),key=s?s.id+s.t+(s.fill?1:0):'n:'+AE.tool;
 if(s){AE.color=s.c;AE.size=s.s}
 if(key!==AE.ctxKey)aeCtx();
 const u=$('#ae-undo');if(u)u.disabled=!AE.hist.length;
 aeToolUI();aeOptUI();
}
function aeCtx(){
 const el=$('#ae-ctx'),s=aeSel();AE.ctxKey=s?s.id+s.t+(s.fill?1:0):'n:'+AE.tool;
 if(AE.tool==='crop'){el.innerHTML=`<span class="ae-hint">${AE_HINT.crop}</span><button class="ae-btn" data-ae="cropno">Cancel</button><button class="ae-btn pri" data-ae="cropok">Apply</button>`;return}
 if(!s){el.innerHTML=`<span class="ae-hint">${AE_HINT[AE.tool]}</span>`;return}
 let h='';
 if(s.t==='text')h+=`<input id="ae-text" type="text" aria-label="Note text" placeholder="Type your note" value="${esc(s.text)}" enterkeyhint="done" autocomplete="off">`;
 else h+=`<span class="ae-hint">Selected. Drag to move${aeHandles(s,1,1).length?', drag the dots to resize':''}.</span>`;
 if(s.t==='rect'||s.t==='ell')h+=`<button class="ae-btn${s.fill?' on':''}" data-ae="fill" aria-pressed="${!!s.fill}">Fill</button>`;
 h+=`<button class="ae-ic" data-ae="dup" aria-label="Duplicate">${AI.copy}</button><button class="ae-ic danger" data-ae="del" aria-label="Delete">${AI.trash}</button>`;
 el.innerHTML=h;
 const t=$('#ae-text');
 if(t){
  t.oninput=()=>{const q=aeSel();if(q){q.text=t.value;aeDraw()}};
  t.onfocus=()=>{aeBegin();t.select()};
  t.onblur=()=>{const q=aeSel();if(q&&!q.text.trim())q.text='Note';aeEnd();aeDraw()};
  t.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();t.blur()}};
 }
}
function aeDraw(){if(!AE||AE.loading||AE.raf)return;AE.raf=requestAnimationFrame(()=>{AE.raf=0;aePaint()})}
function aePaint(){
 const fg=$('#ae-fg');if(!fg||!AE)return;const g=fg.getContext('2d'),W=AE.fw,H=AE.fh;
 g.setTransform(AE.dpr,0,0,AE.dpr,0,0);g.clearRect(0,0,W,H);
 for(const s of AE.shapes)annShape(g,W,H,s);
 if(AE.tool==='crop'&&AE.crop){const c=AE.crop,x=c.x*W,y=c.y*H,w=c.w*W,h=c.h*H;g.save();g.fillStyle='rgba(0,0,0,.55)';g.beginPath();g.rect(0,0,W,H);g.rect(x,y,w,h);g.fill('evenodd');g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(x,y,w,h);g.globalAlpha=.45;g.lineWidth=1;g.beginPath();for(const k of[1,2]){g.moveTo(x+w*k/3,y);g.lineTo(x+w*k/3,y+h);g.moveTo(x,y+h*k/3);g.lineTo(x+w,y+h*k/3)}g.stroke();g.globalAlpha=1;g.lineWidth=5;g.lineCap='round';const L=Math.min(22,w/3,h/3);for(const[px,py,dx,dy]of[[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){g.beginPath();g.moveTo(px+dx*L,py);g.lineTo(px,py);g.lineTo(px,py+dy*L);g.stroke()}g.restore();return}
 const s=aeSel();
 if(s){
  const b=annBox(s,W,H);
  if(s.t!=='arrow'&&s.t!=='line'){g.save();g.setLineDash([6,5]);g.lineWidth=1.5;g.strokeStyle='#ffffff';g.shadowColor='rgba(0,0,0,.75)';g.shadowBlur=3;g.strokeRect(b.x-5,b.y-5,b.w+10,b.h+10);g.restore()}
  for(const[,x,y]of aeHandles(s,W,H)){g.save();g.beginPath();g.arc(x,y,9,0,Math.PI*2);g.fillStyle='#ffffff';g.fill();g.lineWidth=3;g.strokeStyle='#ff6458';g.stroke();g.restore()}
 }
}
function aeLayout(){
 const ae=$('#ae'),st=$('#ae-stage');if(!ae||!st||!AE)return;
 const vv=window.visualViewport;
 if(vv&&vv.height<window.innerHeight-80){ae.style.top=vv.offsetTop+'px';ae.style.height=vv.height+'px'}else{ae.style.top='0';ae.style.height='100%'}
 const r=st.getBoundingClientRect(),pad=10,aw=Math.max(60,r.width-pad*2),ah=Math.max(60,r.height-pad*2),sc=Math.min(aw/AE.w,ah/AE.h);
 AE.fw=Math.floor(AE.w*sc);AE.fh=Math.floor(AE.h*sc);AE.dpr=Math.min(window.devicePixelRatio||1,2.5);
 const fr=$('#ae-frame'),bg=$('#ae-bg'),fg=$('#ae-fg');fr.style.width=AE.fw+'px';fr.style.height=AE.fh+'px';
 for(const c of[bg,fg]){c.width=Math.round(AE.fw*AE.dpr);c.height=Math.round(AE.fh*AE.dpr)}
 bg.getContext('2d').drawImage(AE.img,0,0,bg.width,bg.height);
 aePaint();
}
function aePick(x,y){
 const W=AE.fw,H=AE.fh;
 for(let i=AE.shapes.length-1;i>=0;i--)if(annHit(AE.shapes[i],W,H,x,y,16,false))return AE.shapes[i];
 for(let i=AE.shapes.length-1;i>=0;i--)if(annHit(AE.shapes[i],W,H,x,y,16,true))return AE.shapes[i];
 return null;
}

/* ---- open / close / save ---- */
async function openAnnotator(pid,review){
 if(AE)return;AE={loading:true};
 try{
  const p=await S.get('photos',pid);if(!p){AE=null;return}
  try{await document.fonts.load('700 24px "Be Vietnam Pro"')}catch(e){}
  const img=await loadBitmap(p.blob),shapes=clone(p.ann||[]);
  AE={pid,p,img,shapes,base:JSON.stringify(shapes),sel:null,tool:'select',color:AN_COLORS[0],size:1,hist:[],pending:null,w:p.w||img.width,h:p.h||img.height,drag:null,fw:0,fh:0,dpr:1,raf:0,saving:false,discard:false,ctxKey:'',review:review||null,cap0:p.caption||''};
  aeBuild();
 }catch(e){console.error(e);AE=null;toast('Could not open the photo editor')}
}
function aeBuild(){
 const ae=document.createElement('div');ae.className='ae';ae.id='ae';ae.setAttribute('role','dialog');ae.setAttribute('aria-modal','true');ae.setAttribute('aria-label','Annotate photo');
 const RV=AE.review;
 ae.innerHTML=`<div class="ae-top">${RV?`<label class="ae-btn" id="ae-retake">${IC.cam.replace('<svg','<svg width="18" height="18"')}Retake<input type="file" accept="image/*" capture="environment" class="ae-fi" aria-label="Retake photo"></label>`:'<button class="ae-btn" id="ae-cancel">Cancel</button>'}<button class="ae-ic" id="ae-undo" aria-label="Undo" disabled>${AI.undo}</button><span class="sp">${RV?'Review':'Annotate'}</span><button class="ae-btn pri" id="ae-done">Done</button></div>
 ${RV?`<div class="ae-capbar"><input id="ae-cap" type="text" value="${esc(AE.cap0)}" placeholder="Note / caption for this photo" aria-label="Photo note" enterkeyhint="done"><label class="ae-btn" id="ae-next" title="Save and take the next photo">${IC.cam.replace('<svg','<svg width="18" height="18"')}Next<input type="file" accept="image/*" capture="environment" class="ae-fi" aria-label="Save and take next photo"></label></div>`:''}
 <div class="ae-ctx" id="ae-ctx"></div>
 <div class="ae-stage" id="ae-stage"><div class="ae-frame" id="ae-frame"><canvas id="ae-bg"></canvas><canvas id="ae-fg"></canvas></div></div>
 <div class="ae-bot"><div class="ae-tools" role="toolbar" aria-label="Tools">${AE_TOOLS.map(([k,l])=>`<button data-aet="${k}" aria-pressed="${k==='select'}">${AI[k]}<span>${l}</span></button>`).join('')}</div>
  <div class="ae-opts"><div class="ae-sw" role="group" aria-label="Color">${AN_COLORS.map(c=>`<button data-aec="${c}" aria-label="Color ${c}" aria-pressed="${c===AE.color}" style="background:${c}"></button>`).join('')}</div>
  <div class="ae-sz" role="group" aria-label="Size">${['S','M','L'].map((l,i)=>`<button data-aes="${i}" aria-pressed="${i===AE.size}">${l}</button>`).join('')}</div></div></div>`;
 document.body.appendChild(ae);
 const fg=$('#ae-fg');
 const pt=e=>{const r=fg.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top))}};

 ae.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!AE||!b||AE.saving)return;
  if(b.dataset.aet){AE.tool=b.dataset.aet;if(AE.tool!=='select')AE.sel=null;if(AE.tool==='crop')AE.crop={x:.04,y:.04,w:.92,h:.92};aeSync();aeDraw();return}
  if(b.dataset.ae==='cropok'){aeApplyCrop();return}
  if(b.dataset.ae==='cropno'){AE.tool='select';AE.crop=null;aeSync();aeDraw();return}
  if(b.dataset.ae==='cropall'){AE.crop={x:0,y:0,w:1,h:1};aeDraw();return}
  if(b.dataset.aec){const c=b.dataset.aec;AE.color=c;const s=aeSel();if(s)aeMutate(()=>{s.c=c});else aeSync();aeDraw();return}
  if(b.dataset.aes!=null){const z=+b.dataset.aes;AE.size=z;const s=aeSel();if(s)aeMutate(()=>{s.s=z});else aeSync();aeDraw();return}
  const a=b.dataset.ae,s=aeSel();
  if(a==='fill'&&s)aeMutate(()=>{s.fill=!s.fill});
  else if(a==='del'&&s)aeMutate(()=>{AE.shapes=AE.shapes.filter(q=>q.id!==s.id);AE.sel=null});
  else if(a==='dup'&&s)aeMutate(()=>{const c=clone(s);c.id=uid();aeShift(c,.03,.03);if(c.t==='num')c.n=Math.max(0,...AE.shapes.filter(q=>q.t==='num').map(q=>q.n))+1;AE.shapes.push(c);AE.sel=c.id});
 });
 $('#ae-undo').onclick=()=>{
  if(!AE.hist.length||AE.saving)return;const a=document.activeElement;if(a&&a.blur)a.blur();
  AE.shapes=JSON.parse(AE.hist.pop());if(!aeSel())AE.sel=null;AE.ctxKey='';aeSync();aeDraw();
 };
 if(RV){
  const capEl=$('#ae-cap');capEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();capEl.blur()}});
  $('#ae-retake input').addEventListener('change',async e=>{const f=[...e.target.files];if(!f.length||!AE||AE.saving)return;const pid=AE.pid,{target,label}=AE.review,r=cur();aeClose();const k=target.indexOf(pid);if(k>=0)target.splice(k,1);await S.del('photos',pid);if(ANN.delete(pid))saveANN();if(r)saveReport(r,true);addPhotos(f,target,label,true)});
  $('#ae-next input').addEventListener('change',async e=>{const f=[...e.target.files];if(!f.length||!AE)return;const{target,label}=AE.review;await aeDone(true);addPhotos(f,target,label,true)});
 }
 if($('#ae-cancel'))$('#ae-cancel').onclick=e=>{
  if(AE.saving)return;
  if(aeDirty()&&!AE.discard){AE.discard=true;e.target.textContent='Discard?';e.target.classList.add('warn');setTimeout(()=>{if(AE&&$('#ae-cancel')){AE.discard=false;$('#ae-cancel').textContent='Cancel';$('#ae-cancel').classList.remove('warn')}},3000);return}
  aeClose();
 };
 $('#ae-done').onclick=()=>aeDone();

 fg.addEventListener('pointerdown',e=>{
  if(AE.drag||AE.saving||e.button>0)return;e.preventDefault();
  const a=document.activeElement;if(a&&a.blur)a.blur();
  try{fg.setPointerCapture(e.pointerId)}catch(_){}
  const{x,y}=pt(e),W=AE.fw,H=AE.fh,pid=e.pointerId,tool=AE.tool;
  if(tool==='crop'){const c=AE.crop,X=c.x*W,Y=c.y*H,X2=X+c.w*W,Y2=Y+c.h*H,R=28;const near=(a,b)=>Math.abs(a-b)<=R;
   const ed=(near(x,X)?'l':near(x,X2)?'r':'')+(near(y,Y)?'t':near(y,Y2)?'b':'');const inX=x>X-R&&x<X2+R,inY=y>Y-R&&y<Y2+R;
   if(ed&&inX&&inY)AE.drag={mode:'crop',ed,pid,lx:x,ly:y};else if(x>X&&x<X2&&y>Y&&y<Y2)AE.drag={mode:'cropmove',pid,lx:x,ly:y};return}
  if(tool==='select'){
   const cs=aeSel();
   if(cs){for(const[k,hx,hy]of aeHandles(cs,W,H))if(Math.hypot(x-hx,y-hy)<=26){aeBegin();AE.drag={mode:'handle',key:k,id:cs.id,pid};return}}
   const hit=cs&&annHit(cs,W,H,x,y,18,true)?cs:aePick(x,y);
   if(hit){AE.sel=hit.id;aeBegin();AE.drag={mode:'move',id:hit.id,lx:x,ly:y,pid};aeSync();aeDraw()}
   else{AE.sel=null;aeSync();aeDraw()}
   return;
  }
  aeBegin();
  if(tool==='text'){
   const s=aeNew('text');s.text='Note';const L=annLayoutText(MC,s,W);
   s.x=Math.max(.02,Math.min(x/W-L.bw/W/2,.98-L.bw/W));s.y=clamp01(y/H-L.bh/H/2);
   AE.shapes.push(s);AE.sel=s.id;AE.tool='select';aeEnd();aeDraw();
   // iPad/iOS only opens the keyboard when focus happens inside the touch itself, so focus now and again on finger-up
   {const t=$('#ae-text');if(t){try{t.focus({preventScroll:true})}catch(_){t.focus()}}}
   AE.drag={mode:'textfocus',pid};return;
  }
  if(tool==='num'){
   const s=aeNew('num');s.x=x/W;s.y=y/H;s.n=Math.max(0,...AE.shapes.filter(q=>q.t==='num').map(q=>q.n))+1;
   AE.shapes.push(s);AE.sel=s.id;aeEnd();aeDraw();return;
  }
  if(tool==='pen'){
   const s=aeNew('pen');s.pts=[[x/W,y/H]];AE.shapes.push(s);AE.sel=null;AE.drag={mode:'pen',id:s.id,pid};aeSync();aeDraw();return;
  }
  const s=aeNew(tool);s.x=s.x2=x/W;s.y=s.y2=y/H;AE.shapes.push(s);AE.sel=null;
  AE.drag={mode:'create',id:s.id,sx:x,sy:y,moved:false,pid};aeSync();aeDraw();
 });
 fg.addEventListener('pointermove',e=>{
  const d=AE.drag;if(!d||e.pointerId!==d.pid)return;
  if(d.mode==='crop'||d.mode==='cropmove'){const{x,y}=pt(e),W=AE.fw,H=AE.fh,c=AE.crop,dx=(x-d.lx)/W,dy=(y-d.ly)/H;d.lx=x;d.ly=y;const MIN=.08;
   if(d.mode==='cropmove'){c.x=Math.max(0,Math.min(1-c.w,c.x+dx));c.y=Math.max(0,Math.min(1-c.h,c.y+dy))}
   else{let x1=c.x,y1=c.y,x2=c.x+c.w,y2=c.y+c.h;if(d.ed.includes('l'))x1=Math.max(0,Math.min(x2-MIN,x1+dx));if(d.ed.includes('r'))x2=Math.min(1,Math.max(x1+MIN,x2+dx));if(d.ed.includes('t'))y1=Math.max(0,Math.min(y2-MIN,y1+dy));if(d.ed.includes('b'))y2=Math.min(1,Math.max(y1+MIN,y2+dy));Object.assign(c,{x:x1,y:y1,w:x2-x1,h:y2-y1})}
   aeDraw();return}
  const{x,y}=pt(e),W=AE.fw,H=AE.fh,s=AE.shapes.find(q=>q.id===d.id);if(!s)return;
  if(d.mode==='create'){s.x2=x/W;s.y2=y/H;if(Math.hypot(x-d.sx,y-d.sy)>8)d.moved=true}
  else if(d.mode==='pen'){const l=s.pts[s.pts.length-1];if(Math.hypot((x/W-l[0])*W,(y/H-l[1])*H)>2)s.pts.push([x/W,y/H])}
  else if(d.mode==='handle')aeSetHandle(s,d.key,x/W,y/H);
  else if(d.mode==='move'){const dx=(x-d.lx)/W,dy=(y-d.ly)/H;d.lx=x;d.ly=y;aeShift(s,dx,dy)}
  aeDraw();
 });
 const up=e=>{
  const d=AE&&AE.drag;if(!d||e.pointerId!==d.pid)return;AE.drag=null;
  if(d.mode==='crop'||d.mode==='cropmove'){aeDraw();return}
  if(d.mode==='textfocus'){const t=$('#ae-text');if(t&&document.activeElement!==t){try{t.focus({preventScroll:true})}catch(_){t.focus()}}if(t)t.select();return}
  const s=AE.shapes.find(q=>q.id===d.id);
  if(s&&d.mode==='create'){if(!d.moved)aeDefault(s,d.sx,d.sy,AE.fw,AE.fh);AE.sel=s.id;AE.tool='select'}
  else if(s&&d.mode==='pen'&&s.pts.length<2)s.pts.push([s.pts[0][0]+.0006,s.pts[0][1]]);
  aeEnd();aeDraw();
 };
 fg.addEventListener('pointerup',up);fg.addEventListener('pointercancel',up);

 AE.onResize=()=>{clearTimeout(AE.rt);AE.rt=setTimeout(aeLayout,60)};
 window.addEventListener('resize',AE.onResize);if(window.visualViewport)window.visualViewport.addEventListener('resize',AE.onResize);
 aeCtx();aeLayout();aeSync();
}
async function aeApplyCrop(){
 const c=AE&&AE.crop;if(!c||AE.saving)return;
 if(c.w>.995&&c.h>.995){AE.tool='select';AE.crop=null;aeSync();aeDraw();return}
 AE.saving=true;
 try{
  const W0=AE.w,H0=AE.h,sx=Math.round(c.x*W0),sy=Math.round(c.y*H0),cw=Math.max(16,Math.round(c.w*W0)),ch=Math.max(16,Math.round(c.h*H0));
  const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;const g=cv.getContext('2d');g.drawImage(AE.img,sx,sy,cw,ch,0,0,cw,ch);
  // keep the date/time stamp: if the crop cut it off, stamp the photo again
  const sh=Math.max(14,Math.round(Math.min(W0,H0)*0.032))*1.9/H0,keptStamp=c.y+c.h>=1-sh*.5&&c.x<=.01;
  if(SET.watermark!==false&&AE.p.ts&&!keptStamp){const r=cur();let label='';if(r){const cp=r.checkpoints.find(q=>q.photos.includes(AE.pid));const df=r.defects.find(q=>q.photos.includes(AE.pid));label=cp?cp.name:df?'Defect: '+df.desc:''}if(label)stampWM(g,cw,ch,AE.p.ts,label)}
  const blob=(await jpegTarget(cv)).blob;if(!blob)throw new Error('crop failed');
  const bmp=await loadBitmap(blob);cv.width=cv.height=0;
  const tx=v=>(v-c.x)/c.w,ty=v=>(v-c.y)/c.h;
  AE.shapes=AE.shapes.map(q=>{q=clone(q);if(q.pts)q.pts=q.pts.map(([a,b])=>[tx(a),ty(b)]);if(q.x!=null)q.x=tx(q.x);if(q.y!=null)q.y=ty(q.y);if(q.x2!=null)q.x2=tx(q.x2);if(q.y2!=null)q.y2=ty(q.y2);return q});
  if(AE.img.close)AE.img.close();AE.img=bmp;AE.w=bmp.width;AE.h=bmp.height;AE.newBlob=blob;AE.hist=[];AE.base='__cropped__';
  AE.tool='select';AE.crop=null;AE.sel=null;aeLayout();aeSync();
 }catch(e){console.error(e);toast('Could not crop this photo')}
 AE.saving=false;
}
function aeClose(){
 if(!AE)return;window.removeEventListener('resize',AE.onResize);if(window.visualViewport)window.visualViewport.removeEventListener('resize',AE.onResize);
 cancelAnimationFrame(AE.raf);const el=$('#ae');if(el)el.remove();if(AE.img&&AE.img.close)AE.img.close();AE=null;
}
async function aeDone(quiet){
 if(!AE||AE.saving)return;const a=document.activeElement;if(a&&a.blur)a.blur();
 const capEl=$('#ae-cap'),cap=capEl?capEl.value.trim():null,capCh=cap!==null&&cap!==AE.cap0;
 if(!aeDirty()&&!capCh){aeClose();if(AE===null&&capEl&&!quiet)toast('Photo saved');return}
 AE.saving=true;const b=$('#ae-done');b.textContent='Saving…';b.disabled=true;
 try{if(capCh){AE.p.caption=cap;AE.p.u=Date.now()}
  if(AE.newBlob){if(AE.p.assetId){(AE.p.stale=AE.p.stale||[]).push(AE.p.assetId);AE.p.assetId=null}AE.p.blob=AE.newBlob;AE.p.w=AE.w;AE.p.h=AE.h;AE.p.u=Date.now()}
  if(aeDirty())await annSave(AE.pid,AE.p,AE.shapes);else{await S.put('photos',AE.pid,AE.p);scheduleSync()}}
 catch(err){console.error(err);AE.saving=false;b.textContent='Done';b.disabled=false;toast('Could not save');return}
 const rv=!!AE.review;aeClose();render();if(!quiet)toast(rv?'Photo saved':'Annotations saved');
}
function makeThumbBlob(c){const k=320/Math.max(c.width,c.height),t=document.createElement('canvas');t.width=Math.round(c.width*k);t.height=Math.round(c.height*k);t.getContext('2d').drawImage(c,0,0,t.width,t.height);return new Promise(r=>t.toBlob(r,'image/jpeg',.7))}
async function annSave(pid,p,shapes){
 const img=await loadBitmap(p.blob),c=document.createElement('canvas');c.width=p.w;c.height=p.h;const g=c.getContext('2d');
 g.drawImage(img,0,0,p.w,p.h);for(const s of shapes)annShape(g,p.w,p.h,s);
 p.thumb=await makeThumbBlob(c);if(p.thumbAssetId){(p.stale=p.stale||[]).push(p.thumbAssetId);p.thumbAssetId=null}
 if(p.flatAssetId){(p.stale=p.stale||[]).push(p.flatAssetId);p.flatAssetId=null}p.u=Date.now();
 if(shapes.length){p.flat=(await jpegTarget(c)).blob;p.ann=clone(shapes);ANN.add(pid)}
 else{delete p.flat;p.ann=[];ANN.delete(pid)}
 if(img.close)img.close();c.width=c.height=0;
 await S.put('photos',pid,p);saveANN();scheduleSync();
 const old=urlCache.get(pid);if(old)URL.revokeObjectURL(old);urlCache.delete(pid);
 thumbCache.set(pid,Promise.resolve(URL.createObjectURL(p.thumb)));
}

/* ---------- downloads ---------- */
function exportProblem(title,detail,filename,data){
 const blob=data instanceof Blob?data:null,url=blob?URL.createObjectURL(blob):'';
 const canShare=!!(blob&&navigator.canShare&&(()=>{try{return navigator.canShare({files:[new File([blob],filename,{type:blob.type||'application/octet-stream'})]})}catch(e){return false}})());
 const s=sheet(`<h2>${esc(title)}</h2><p class="muted" style="margin:0">${esc(detail)}</p>
  ${blob?`${canShare?'<button class="btn primary block" data-x="share">Share / save file…</button>':''}<a class="btn ${canShare?'':'primary '}block" href="${url}" download="${esc(filename)}" target="_blank" rel="noopener">Open the file</a>`:''}
  <p class="small muted" style="margin:0">Device: ${esc(navigator.userAgent.replace(/^Mozilla\/5\.0 /,'').slice(0,140))}</p>
  <button class="btn ghost" data-x="no">Close</button>`);
 s.querySelector('[data-x=no]').onclick=()=>{s.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url),60000)};
 const sh=s.querySelector('[data-x=share]');if(sh)sh.onclick=async()=>{try{await navigator.share({files:[new File([blob],filename,{type:blob.type||'application/octet-stream'})],title:filename})}catch(e){if(e&&e.name!=='AbortError')toast('Sharing failed: '+(e.name||e))}};
}
/* ---------- JPEG compression (target ≈ 250 KB per photo) ---------- */
const PHOTO_TARGET=250*1024;
async function jpegTarget(c,target=PHOTO_TARGET){
 let src=c;
 for(let pass=0;;pass++){
  let q=.86,b=null;
  for(;;){b=await new Promise(r=>src.toBlob(r,'image/jpeg',q));if(!b)throw new Error('JPEG encode failed');if(b.size<=target||q<=.56)break;q=Math.max(.56,q-.07)}
  if(b.size<=target*1.12||pass>=3){const out={blob:b,w:src.width,h:src.height};if(src!==c)src.width=src.height=0;return out}
  const k=Math.max(.6,Math.sqrt(target/b.size)*.97),t=document.createElement('canvas');t.width=Math.round(src.width*k);t.height=Math.round(src.height*k);t.getContext('2d').drawImage(src,0,0,t.width,t.height);if(src!==c)src.width=src.height=0;src=t;
 }
}
async function recompress(blob,maxSide=1600){
 const bmp=await loadBitmap(blob),k=Math.min(1,maxSide/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();
 const out=await jpegTarget(c);c.width=c.height=0;return out;
}
async function thumbFrom(blob){const bmp=await loadBitmap(blob),c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);if(bmp.close)bmp.close();const t=await makeThumbBlob(c);c.width=c.height=0;return t}

/* ---------- downloads: save file / share sheet ---------- */
const MIME={pdf:'application/pdf',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',json:'application/json'};
function fileReadySheet(filename,blob){
 const url=URL.createObjectURL(blob),file=new File([blob],filename,{type:blob.type||'application/octet-stream'});
 const canShare=!!(navigator.canShare&&(()=>{try{return navigator.canShare({files:[file]})}catch(e){return false}})());
 const s=sheet(`<h2>File ready</h2><p class="muted" style="margin:0;overflow-wrap:anywhere">${esc(filename)} · ${(blob.size/1048576).toFixed(1)} MB</p>
  ${canShare?'<button class="btn primary block" data-x="share">Share / Save to Files…</button>':''}
  <a class="btn ${canShare?'':'primary '}block" href="${url}" download="${esc(filename)}" target="_blank" rel="noopener">Download / open</a>
  <button class="btn ghost" data-x="no">Close</button>`);
 s.querySelector('[data-x=no]').onclick=()=>{s.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)};
 const sh=s.querySelector('[data-x=share]');if(sh)sh.onclick=async()=>{try{await navigator.share({files:[file],title:filename})}catch(e){if(e&&e.name!=='AbortError')toast('Sharing failed: '+(e.name||e))}};
}
async function offer(filename,data){
 const ext=filename.split('.').pop().toLowerCase();
 let blob=data instanceof Blob?data:new Blob([data],{type:MIME[ext]||'application/octet-stream'});
 if(!blob.type&&MIME[ext])blob=new Blob([blob],{type:MIME[ext]});
 // iPad / iPhone (especially the home-screen app) handle files best through the share sheet
 if(isIOS()||(navigator.maxTouchPoints>0&&navigator.canShare)){fileReadySheet(filename,blob);return true}
 try{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Saved '+filename);return true}
 catch(e){fileReadySheet(filename,blob);return true}
}

/* ---------- import a backup (.json) from the old claude.ai app or from this app ---------- */
async function doRestore(f){
 if(!f)return;busy(true,'Reading backup…');
 let d;try{d=JSON.parse(await f.text())}catch(e){busy(false);toast('Could not read this file. If it is very large, import it on a computer.');return}
 if(!d||(d.app!=='so-kiem-hang'&&d.app!=='qc-field-book')){busy(false);toast('This file is not a QC Field Book backup');return}
 let nP=0,miss=0,nR=0;
 try{
  const dec=async u=>{if(typeof u!=='string'||!u.startsWith('data:'))return undefined;const m=u.match(/^data:([^;,]*)(;base64)?,(.*)$/s);if(!m)return undefined;if(m[2]){const bin=atob(m[3]),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:m[1]||'image/jpeg'})}return new Blob([decodeURIComponent(m[3])],{type:m[1]})};
  const ents=Object.entries(d.photos||{});
  for(let i=0;i<ents.length;i++){const[id,p]=ents[i];
   if(i%3===0)busy(true,`Importing photos ${i+1}/${ents.length}…`);
   try{
    let blob=await dec(p.blob),flat=await dec(p.flat),thumb=await dec(p.thumb),ann=Array.isArray(p.ann)?p.ann:[];
    if(!blob&&flat){blob=flat;flat=undefined;ann=[]}
    if(!blob){miss++;continue}
    let w=p.w,h=p.h;
    if(blob.size>320*1024||!w||!h){const r2=await recompress(blob);blob=r2.blob;w=r2.w;h=r2.h}
    if(flat&&flat.size>320*1024)flat=(await recompress(flat)).blob;
    if(!thumb)thumb=await thumbFrom(flat||blob);
    const np={id,blob,thumb,w,h,caption:p.caption||'',ts:p.ts||Date.now(),u:p.u||p.ts||Date.now(),ann};
    if(flat&&ann.length)np.flat=flat;
    await S.put('photos',id,np);if(np.ann.length)ANN.add(id);else ANN.delete(id);nP++;
   }catch(e){miss++;console.warn('import photo',id,e)}
  }
  busy(true,'Importing reports…');
  for(const r0 of d.reports||[]){
   if(!r0||r0.example)continue;const r=clone(r0);delete r.driveId;delete r.drvFiles;
   r.info=Object.assign({client:'',supplier:'',location:'',po:'',item:'',product:'',color:'',lotQty:'',cartons:'',inspector:''},r.info||{});
   r.checkpoints=(r.checkpoints||[]).map(c=>({...c,photos:(c.photos||[]).filter(x=>!String(x).startsWith('tmp-')),rows:c.rows||[]}));
   r.defects=(r.defects||[]).map(x=>({...x,photos:(x.photos||[]).filter(y=>!String(y).startsWith('tmp-'))}));
   r.conclusion=r.conclusion||{override:'',remark:''};r.aql=r.aql||{critical:0,major:2.5,minor:4};r.updated=r.updated||Date.now();
   const k=REPORTS.findIndex(x=>x.id===r.id);if(k>=0){if((REPORTS[k].updated||0)>r.updated)continue;REPORTS[k]=r}else REPORTS.push(r);
   delete GONE['report:'+r.id];await S.put('reports',r.id,r);nR++;
  }
  for(const t of d.templates||[]){if(!t||TEMPLATES.find(x=>x.id===t.id))continue;const n=clone(t);delete n.untouched;n.updated=Date.now();TEMPLATES.push(n);delete GONE['template:'+n.id]}
  for(const c of d.customers||[]){if(!c)continue;const n=clone(c);delete n.driveId;n.updated=Date.now();const k=CUSTOMERS.findIndex(x=>x.id===n.id);if(k>=0)CUSTOMERS[k]=n;else CUSTOMERS.push(n);delete GONE['customer:'+n.id]}
  if(d.settings){const def=defaultSettings();let ch=false;for(const k of['company','inspector','accent','watermark','reviewShot','pptLayers','inAppCam','autoAnnotate']){if(d.settings[k]!=null&&(SET[k]==null||SET[k]===''||SET[k]===def[k])){SET[k]=d.settings[k];ch=true}}if(ch)saveSettings()}
  S.put('kv','gone',GONE);saveTemplates();saveCustomers();await saveANN();
  SY.lastEdit=Date.now();scheduleSync();
  busy(false);toast(`Imported ${nR} report${nR===1?'':'s'} and ${nP} photo${nP===1?'':'s'}`+(miss?` · ${miss} photo${miss>1?'s were':' was'} not in the file`:''));
  view={name:'home',tab:'reports'};render(false);
 }catch(e){busy(false);console.error(e);toast('Import stopped: '+(e&&e.message||e))}
}

const blobToDataURL=b=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=()=>rej(new Error('Could not read file data ('+((f.error&&f.error.name)||'read error')+')'));f.readAsDataURL(b)});
async function doBackup(){
 busy(true,'Packing backup…');
 try{const photos={};for(const r of REPORTS)for(const pid of allPhotos(r)){if(!(await S.has('photos',pid)))await syEnsurePhoto(pid);const p=await S.get('photos',pid);if(p){const enc=async b=>b instanceof Blob?await blobToDataURL(b):undefined;photos[pid]={...p,blob:await enc(p.blob),thumb:await enc(p.thumb),flat:await enc(p.flat)}}}
  const json=JSON.stringify({app:'so-kiem-hang',v:1,at:Date.now(),settings:SET,templates:TEMPLATES,customers:CUSTOMERS,reports:REPORTS,photos});busy(false);await offer('qc-field-book-'+todayISO()+'.json',json)}
 catch(e){busy(false);toast('Could not create the backup')}
}
/* ---------- PDF ---------- */
let FONTS=null;
function ab2b64(buf){let s='';const b=new Uint8Array(buf);for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)}
async function loadFonts(){if(FONTS!==null)return FONTS;try{const[a,b]=await Promise.all(['fonts/BeVietnamPro-Regular.ttf','fonts/BeVietnamPro-Bold.ttf'].map(u=>fetch(u).then(x=>{if(!x.ok)throw 0;return x.arrayBuffer()})));FONTS={r:ab2b64(a),b:ab2b64(b)}}catch(e){FONTS=false}return FONTS}
const hex2rgb=h=>{h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]};
const ST_RGB={pass:[27,118,71],fail:[191,51,40],pending:[168,109,18],hold:[36,71,122]};
let EXPORT_LITE=null;
let EXPORT_SKIPPED=0;
async function imgURLToDataURL(u){const im=new Image();im.decoding='async';await new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(new Error('image load failed'));im.src=u});const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);const d=c.toDataURL('image/jpeg',.9);c.width=c.height=0;return d}
// Safari/iPad sometimes cannot read photo Blobs back from IndexedDB with FileReader; try several ways, then the cloud copy
async function safeDataURL(b,ids){
 if(b instanceof Blob){
  try{return await blobToDataURL(b)}catch(e){}
  try{return 'data:image/jpeg;base64,'+ab2b64(await b.arrayBuffer())}catch(e){}
  try{const u=URL.createObjectURL(b);try{return await imgURLToDataURL(u)}finally{URL.revokeObjectURL(u)}}catch(e){}
 }
 for(const id of ids.filter(Boolean)){try{const cb=await sbDownload(id);if(cb){try{return await blobToDataURL(cb)}catch(e){return 'data:image/jpeg;base64,'+ab2b64(await cb.arrayBuffer())}}}catch(e){}}
 return null;
}
async function photoData(pid,useBase){let p0=await S.get('photos',pid);if(!p0&&SY.REM.p.has(pid)){await syEnsurePhoto(pid);p0=await S.get('photos',pid)}if(!p0)return null;const layered=!!(useBase&&p0.ann&&p0.ann.length&&p0.blob instanceof Blob);const p=layered?{...p0,flat:undefined,flatAssetId:null,layered:true}:p0;let src=p.flat instanceof Blob?p.flat:p.blob;
 if(!EXPORT_LITE){let d=await safeDataURL(src,p.flat instanceof Blob?[p.flatAssetId]:[p.assetId]);if(!d&&p.flat instanceof Blob)d=await safeDataURL(p.blob,[p.assetId]);if(!d){EXPORT_SKIPPED++;return null}return{...p,data:d}}
 if(EXPORT_LITE){try{const bmp=await loadBitmap(src),k=Math.min(1,EXPORT_LITE.max/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();const d=c.toDataURL('image/jpeg',EXPORT_LITE.q);c.width=c.height=0;return{...p,data:d}}catch(e){}}
 const d=await safeDataURL(src,[p.flatAssetId,p.assetId]);if(!d){EXPORT_SKIPPED++;return null}return{...p,data:d}}

// Rebuild photo annotations as separate, editable PowerPoint shapes on top of the original photo
function pptAnn(P,s,x,bx,by,w,h){
 const k=w/x.w,hx=c=>String(c||'#ff3b30').replace('#','').toUpperCase(),pt=v=>Math.max(.75,v*72);
 for(const a of x.ann){
  const col=hx(a.c),lw=pt(AN_LW[a.s||0]*w);
  if(a.t==='arrow'||a.t==='line'){
   const x1=bx+a.x*w,y1=by+a.y*h,x2=bx+a.x2*w,y2=by+a.y2*h;
   s.addShape(P.ShapeType.line,{x:Math.min(x1,x2),y:Math.min(y1,y2),w:Math.max(.01,Math.abs(x2-x1)),h:Math.max(.01,Math.abs(y2-y1)),flipH:x2<x1,flipV:y2<y1,line:{color:col,width:lw,endArrowType:a.t==='arrow'?'triangle':undefined}});
  }else if(a.t==='rect'||a.t==='ell'){
   const b=annBox(a,w,h);
   s.addShape(a.t==='rect'?P.ShapeType.rect:P.ShapeType.ellipse,{x:bx+b.x,y:by+b.y,w:Math.max(.02,b.w),h:Math.max(.02,b.h),fill:{color:col,transparency:a.fill?78:100},line:{color:col,width:lw}});
  }else if(a.t==='pen'&&a.pts&&a.pts.length>1){
   const b=annBox(a,w,h),ox=bx+b.x,oy=by+b.y,bw=Math.max(.02,b.w),bh=Math.max(.02,b.h);
   const step=Math.max(1,Math.floor(a.pts.length/160));const pts=a.pts.filter((_,i)=>i%step===0||i===a.pts.length-1).map(([px,py],i)=>({x:bx+px*w-ox,y:by+py*h-oy,...(i===0?{moveTo:true}:{})}));
   s.addShape(P.ShapeType.custGeom,{x:ox,y:oy,w:bw,h:bh,points:pts,line:{color:col,width:lw},fill:{color:col,transparency:100}});
  }else if(a.t==='num'){
   const r=AN_R[a.s||0]*w;
   s.addText(String(a.n),{shape:P.ShapeType.ellipse,x:bx+a.x*w-r,y:by+a.y*h-r,w:2*r,h:2*r,fill:{color:col},line:{color:hx(inkOn(a.c))==='111111'?'555555':'FFFFFF',width:1},color:hx(inkOn(a.c)),bold:true,fontFace:'Arial',fontSize:Math.max(6,r*1.15*72*.92),align:'center',valign:'middle',margin:0});
  }else if(a.t==='text'){
   const L=annLayoutText(MC,a,x.w);
   s.addText(String(a.text||''),{shape:P.ShapeType.roundRect,rectRadius:Math.min(.2,L.fs*.35*k),x:bx+a.x*w,y:by+a.y*h,w:L.bw*k*1.08,h:L.bh*k,fill:{color:col},color:hx(inkOn(a.c)),bold:true,fontFace:'Arial',fontSize:Math.max(6,L.fs*k*72*.92),valign:'middle',margin:[L.pad*k*72*.6,L.pad*k*72,L.pad*k*72*.6,L.pad*k*72].map(v=>Math.max(1,v)),lineSpacingMultiple:1.05});
  }
 }
}
const reviewDate=r=>{const d=new Date((r.date||todayISO())+'T12:00:00');return isNaN(d)?String(r.date||''):d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}).replace(',','')};
function fit(w,h,bw,bh){const s=Math.min(bw/w,bh/h);return[w*s,h*s]}

async function exportPDF(r,mode){
 if(!window.jspdf){exportProblem('PDF tool did not load','The PDF library could not be downloaded. Check the internet connection, reload the page and try again.');return}
 busy(true,'Creating PDF…');EXPORT_SKIPPED=0;
 try{
 const{jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
 const fonts=await loadFonts();let F='helvetica';
 if(fonts){doc.addFileToVFS('BVP-R.ttf',fonts.r);doc.addFont('BVP-R.ttf','BVP','normal');doc.addFileToVFS('BVP-B.ttf',fonts.b);doc.addFont('BVP-B.ttf','BVP','bold');F='BVP'}
 doc.setLineHeightFactor(1.3);
 const W=210,H=297,M=14,CW=W-2*M,TOP=22,BOT=H-14;const AC=hex2rgb(SET.accent||'#24477a');
 const e=evaluate(r);let y=TOP;
 const ink=()=>doc.setTextColor(21,33,49),mute=()=>doc.setTextColor(90,106,125);
 const font=(st,sz)=>{doc.setFont(F,st);doc.setFontSize(sz)};
 const newPage=()=>{doc.addPage();y=TOP};
 const ensure=h=>{if(y+h>BOT)newPage()};
 const heading=(t,sub)=>{ensure(16);font('bold',11.5);doc.setTextColor(...AC);doc.text(t.toUpperCase(),M,y+4);if(sub){font('normal',8.5);mute();doc.text(sub,W-M,y+4,{align:'right'})}doc.setDrawColor(...AC);doc.setLineWidth(.5);doc.line(M,y+6.2,W-M,y+6.2);y+=10};
 const table=(cols,rows)=>{
  const fs=8.8,lh=fs*.3528*1.3,pd=1.8;
  const head=()=>{font('bold',7.6);doc.setFillColor(232,236,242);doc.rect(M,y,CW,6.4,'F');mute();let x=M;cols.forEach(c=>{const tx=c.a==='center'?x+c.w/2:c.a==='right'?x+c.w-pd:x+pd;doc.text(c.t.toUpperCase(),tx,y+4.3,{align:c.a||'left'});x+=c.w});y+=6.4};
  ensure(14);head();
  rows.forEach((row,ri)=>{font('normal',fs);
   const cells=row.map((c,k)=>{const o=typeof c==='object'&&c!==null?c:{v:c};font(o.b?'bold':'normal',fs);return{...o,lines:doc.splitTextToSize(String(o.v??''),cols[k].w-pd*2)}});
   const h=Math.max(...cells.map(c=>c.lines.length))*lh+pd*2;
   if(y+h>BOT){newPage();head()}
   if(ri%2)doc.setFillColor(247,249,251),doc.rect(M,y,CW,h,'F');
   let x=M;cells.forEach((c,k)=>{font(c.b?'bold':'normal',fs);c.color?doc.setTextColor(...c.color):ink();const a=cols[k].a||'left';const tx=a==='center'?x+cols[k].w/2:a==='right'?x+cols[k].w-pd:x+pd;doc.text(c.lines,tx,y+pd+fs*.3528*.85,{align:a});x+=cols[k].w});
   doc.setDrawColor(211,218,228);doc.setLineWidth(.2);doc.line(M,y+h,W-M,y+h);y+=h});
  y+=4;
 };
 const para=(t,sz=9.5)=>{font('normal',sz);ink();const ls=doc.splitTextToSize(t,CW);const lh=sz*.3528*1.3;ls.forEach(l=>{ensure(lh);doc.text(l,M,y+lh*.8);y+=lh});y+=2};
 const resCol=k=>({pass:ST_RGB.pass,fail:ST_RGB.fail,na:[90,106,125]})[k];
 const resTxt=k=>({pass:'Pass',fail:'Fail',na:'N/A'})[k]||'Not checked';

 // title block
 font('bold',19);ink();doc.text(r.reportTitle||'INSPECTION REPORT',M,y+6);
 font('normal',9.5);mute();doc.text([r.type,fmtDate(r.date),r.info.location].filter(Boolean).join('  ·  '),M,y+12.5);
 const st=e.final,sc=ST_RGB[st];doc.setDrawColor(...sc);doc.setLineWidth(.9);doc.setFillColor(255,255,255);doc.roundedRect(W-M-46,y-1,46,17,2,2,'S');
 doc.setFillColor(...sc);doc.circle(W-M-40,y+7.5,1.8,'F');font('bold',13);doc.setTextColor(...sc);doc.text(STATUS[st][0],W-M-35,y+7,{maxWidth:33});font('normal',7.5);doc.text(STATUS[st][1],W-M-35,y+12);
 y+=21;
 // info grid
 const info=[['Product',r.info.product],['Item / style no.',r.info.item],['PO number',r.info.po],['Color / material',r.info.color],['Client',r.info.client],['Supplier',r.info.supplier],...(hasQty(r)?[['Lot size',r.info.lotQty?r.info.lotQty+' pcs':''],['Cartons',r.info.cartons]]:[]),['Inspector',r.info.inspector],...(hasAql(r)?[['Level / sample size',e.aq.valid?`Level ${r.level} · code ${e.aq.letter} · n=${e.aq.n}`:'']]:[])];
 const cw2=CW/2;for(let k=0;k<info.length;k+=2){ensure(10);[info[k],info[k+1]].forEach((it,j)=>{if(!it)return;const x=M+j*cw2;font('normal',7.2);mute();doc.text(it[0].toUpperCase(),x,y+3);font('bold',9.6);ink();doc.text(doc.splitTextToSize(String(it[1]||'—'),cw2-4)[0],x,y+8)});y+=11}
 y+=2;
 if(hasAql(r)){heading('AQL result',e.aq.valid?`ISO 2859-1 · Level ${r.level} · lot ${e.aq.lot}`:'');
 table([{t:'Class',w:46},{t:'AQL',w:22,a:'center'},{t:'Sample size',w:26,a:'center'},{t:'Ac / Re',w:26,a:'center'},{t:'Found',w:28,a:'center'},{t:'Result',w:34,a:'center'}],
  e.aq.rows.map(x=>[x.vn+' ('+x.en+')',x.aql,x.n+(x.full?' (100%)':''),x.ac+' / '+x.re,{v:x.found,b:true},x.res?{v:x.res==='pass'?'Pass':'Fail',b:true,color:ST_RGB[x.res]}:'—']))}
 heading('Checklist summary',`${e.done}/${r.checkpoints.length} checked`);
 table([{t:'#',w:10,a:'center'},{t:'Checkpoint',w:64},{t:'Result',w:26,a:'center'},{t:'Notes',w:68},{t:'Photos',w:14,a:'center'}],
  r.checkpoints.map((c,i)=>[pad2(i+1),c.name,{v:resTxt(c.result),b:true,color:resCol(c.result)||[168,109,18]},c.note||'',c.photos.length]));
 if(r.defects.length){heading('Defect list',`${r.defects.reduce((s,d)=>s+(+d.qty||0),0)} defects`);
  table([{t:'#',w:10,a:'center'},{t:'Defect',w:96},{t:'Severity',w:34,a:'center'},{t:'Qty',w:20,a:'center'},{t:'Photos',w:22,a:'center'}],
   r.defects.map((d,i)=>[i+1,d.desc,{v:SEVL[d.sev][1],color:d.sev==='critical'?ST_RGB.fail:d.sev==='major'?ST_RGB.pending:AC},{v:d.qty,b:true},d.photos.length]))}
 heading('Conclusion');
 ensure(12);font('bold',11);doc.setTextColor(...sc);doc.text(STATUS[st][0]+' · '+STATUS[st][1],M,y+4);y+=8;
 if(r.conclusion.remark)para(r.conclusion.remark);
 ensure(22);y+=6;font('normal',8);mute();doc.text('INSPECTOR',M,y);doc.text('SUPPLIER ACKNOWLEDGEMENT',M+cw2,y);doc.setDrawColor(150,160,172);doc.line(M,y+12,M+cw2-10,y+12);doc.line(M+cw2,y+12,W-M,y+12);font('bold',9.5);ink();doc.text(r.info.inspector||'',M,y+17);y+=22;

 // photo pages
 const PW=(CW-4)/2,PH=PW*0.75,CAP=7,CH=(BOT-TOP-26-2*CAP-6)/2;
 const photoBlock=async(pids)=>{
  const ph=(await Promise.all(pids.map(id=>photoData(id)))).filter(Boolean);
  for(let k=0;k<ph.length;k+=2){
   const row=ph.slice(k,k+2),capH=CAP;
   const sizes=row.map(x=>fit(x.w,x.h,PW,CH));const rh=Math.max(...sizes.map(z=>z[1]));
   ensure(CH+capH+2);
   row.forEach((x,j)=>{const[w,h]=sizes[j];const cx=j===0?M+PW-w:M+PW+4;doc.addImage(x.data,'JPEG',cx,y+(rh-h)/2,w,h,undefined,'FAST');
    if(x.caption){font('normal',8);ink();doc.text(doc.splitTextToSize(x.caption,Math.max(w,40)).slice(0,1),cx,y+rh+4)}});
   y+=CH+capH+2;
  }
 };
 const withPhotos=r.checkpoints.filter(c=>c.photos.length||(c.kind==='measure'&&c.rows.some(x=>x.actual!=='')));
 if(withPhotos.length||r.defects.some(d=>d.photos.length)){newPage();
  for(const c of withPhotos){const i=r.checkpoints.indexOf(c);
   ensure(c.photos.length&&!c.note&&c.kind!=='measure'?CH+CAP+14:PH+20);heading(pad2(i+1)+'. '+c.name,resTxt(c.result));
   if(c.note)para(c.note,9);
   if(c.kind==='measure'&&c.rows.length)table([{t:'Measurement',w:70},{t:'Spec',w:36,a:'center'},{t:'Tolerance ±',w:28,a:'center'},{t:'Actual',w:28,a:'center'},{t:'',w:20,a:'center'}],c.rows.map(x=>{const ok=measureOK(x);return[x.name,x.spec,x.tol,{v:x.actual,b:true},ok==null?'':{v:ok?'OK':'NG',b:true,color:ok?ST_RGB.pass:ST_RGB.fail}]}));
   await photoBlock(c.photos);y+=3}
  for(const d of r.defects.filter(d=>d.photos.length)){ensure(CH+CAP+14);heading('Defect: '+d.desc,SEVL[d.sev][1]+' · Qty '+d.qty);await photoBlock(d.photos);y+=3}
 }
 // header/footer every page
 const N=doc.getNumberOfPages();
 for(let p=1;p<=N;p++){doc.setPage(p);doc.setFillColor(...AC);doc.rect(0,0,W,12,'F');font('bold',9);doc.setTextColor(255,255,255);doc.text((SET.company||'Inspection report').toUpperCase(),M,7.6);font('normal',9);doc.text(r.no,W-M,7.6,{align:'right'});
  font('normal',7.5);mute();doc.text([r.info.product,r.info.po&&('PO '+r.info.po)].filter(Boolean).join(' · '),M,H-7);doc.text('Page '+p+' of '+N,W-M,H-7,{align:'right'})}
 const blob=doc.output('blob');busy(false);
 if(EXPORT_SKIPPED)toast(EXPORT_SKIPPED+' photo'+(EXPORT_SKIPPED>1?'s':'')+' could not be read on this device and were left out');
 if(!fonts)toast('Could not load the report font; accented characters may not display');
 if(mode==='blob')return blob;
 if(mode==='email')await emailReport(r,blob);else await offer(fileBase(r)+'.pdf',blob);
 }catch(err){busy(false);console.error(err);exportProblem('PDF export failed',String(err&&err.message||err))}
}

async function emailReport(r,blob){
 const e=evaluate(r),cu=custOf(r),name=fileBase(r)+'.pdf';
 const subject=reportName(r);
 const lines=['Hello'+(cu&&cu.contact?' '+cu.contact:'')+',','','Please find attached the inspection report '+r.no+'.',''];
 [['Product',r.info.product],['PO',r.info.po],['Supplier',r.info.supplier],['Date',fmtDate(r.date)],['Result',STATUS[e.final][0]+' ('+STATUS[e.final][1]+')']].forEach(([k,v])=>{if(v)lines.push(k+': '+v)});
 if(r.conclusion.remark)lines.push('','Remarks: '+r.conclusion.remark);
 lines.push('','Best regards,',SET.inspector||r.info.inspector||'',SET.company||'');
 const body=lines.join('\n').replace(/\n+$/,'');
 const file=new File([blob],name,{type:'application/pdf'});
 try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:subject,text:body});return}}
 catch(err){if(err&&err.name==='AbortError')return}
 const saved=await offer(name,blob);
 const to=(cu&&cu.email)||'';
 const s2=sheet(`<h2>Send by email</h2><p class="muted" style="margin:0">${saved?'The PDF is saved. ':''}Your device cannot attach files from here, so open your email app and attach <b>${esc(name)}</b> to the message.</p>
  <div class="field"><label for="em-to">To</label><input id="em-to" type="email" value="${esc(to)}" placeholder="name@company.com"></div>
  <a class="btn primary block" id="em-go" href="#" target="_blank" rel="noopener">Open email app</a><button class="btn ghost" data-x="no">Close</button>`);
 const go=s2.querySelector('#em-go'),upd=()=>{go.href='mailto:'+encodeURIComponent(s2.querySelector('#em-to').value.trim()).replace(/%40/g,'@').replace(/%2C/g,',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body)};
 upd();s2.querySelector('#em-to').addEventListener('input',upd);s2.querySelector('[data-x=no]').onclick=()=>s2.remove();
}
function fileBase(r){return reportName(r).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,150)}

/* ---------- PPTX ---------- */
async function exportPPTX(r,mode){
 if(!window.PptxGenJS){exportProblem('PowerPoint tool did not load','The PowerPoint library could not be downloaded. Check the internet connection, reload the page and try again.');return}
 busy(true,'Creating PowerPoint…');EXPORT_SKIPPED=0;
 try{
 const p=new PptxGenJS();p.layout='LAYOUT_WIDE';p.title=r.no;p.company=SET.company||'';
 const TH=(()=>{const c=custOf(r);return c&&c.theme&&c.theme.on?c.theme:null})();
 let AC=(SET.accent||'#24477a').replace('#','').toUpperCase(),INK='152131',MU='5A6A7D',LN='D3DAE4',FF='Arial',FL='Arial';
 if(TH){AC=(TH.accent||'#ff6559').replace('#','').toUpperCase();INK='222222';MU='888888';LN='DDDDDD';FF=TH.font||'Montserrat';FL=FF==='Montserrat'?'Montserrat Light':FF}
 const e=evaluate(r),st=e.final,SC=ST_RGB[st].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
 const SW=13.333,SH=7.5,MX=.5;
 const RD=reviewDate(r),RV=isReview(r)?(r.info.round?'Review # '+r.info.round:'Review'):typeShort(r);
 const tbase=(title,sub)=>{const s=p.addSlide();s.background={color:'FFFFFF'};
  if(TH.logo)s.addImage({data:TH.logo.replace(/^data:/,''),x:.38,y:.27,w:.58,h:.58,sizing:{type:'contain',w:.58,h:.58}});
  const sec=String(title||'').replace(/^\d+\.\s*/,'');
  s.addText([{text:[TH.prefix,(r.info.product||'PRODUCT').toUpperCase()].filter(Boolean).join(' ')+' - ',options:{color:MU,fontFace:FL}},...(RV?[{text:RV+(sec?' - ':''),options:{color:AC,bold:true,fontFace:FF}}]:[]),...(sec?[{text:sec,options:{color:AC,bold:true,fontFace:FF}}]:[]),...(sub&&typeof sub==='string'?[{text:'  ·  '+sub,options:{color:MU,fontFace:FL}}]:[])],{x:1.1,y:.27,w:SW-1.1-3.2,h:.58,fontSize:15,valign:'middle',margin:0,fit:'shrink'});
  s.addText([{text:'Date of Review',options:{breakLine:true}},{text:RD}],{x:SW-MX-2.6,y:.18,w:2.6,h:.5,fontFace:FL,fontSize:11,color:MU,align:'right',valign:'top',margin:0});
  return s};
 const base=(title,sub)=>{if(TH)return tbase(title,sub);const s=p.addSlide();s.background={color:'FFFFFF'};s.addShape(p.ShapeType.rect,{x:0,y:0,w:SW,h:.42,fill:{color:AC},line:{color:AC}});
  s.addText((SET.company||'Inspection report').toUpperCase(),{x:MX,y:0,w:7,h:.42,fontFace:FF,fontSize:11,bold:true,color:'FFFFFF',valign:'middle',margin:0});
  s.addText(r.no,{x:SW-MX-4,y:0,w:4,h:.42,fontFace:FF,fontSize:11,color:'FFFFFF',align:'right',valign:'middle',margin:0});
  if(title)s.addText(title,{x:MX,y:.6,w:SW-2*MX-2.6,h:.6,fontFace:FF,fontSize:24,bold:true,color:INK,margin:0,valign:'middle'});
  if(sub)s.addText(sub,{x:SW-MX-2.6,y:.6,w:2.6,h:.6,fontFace:FF,fontSize:13,bold:true,color:sub.c||MU,align:'right',valign:'middle',margin:0});
  return s};
 const cell=(t,o={})=>({text:String(t??''),options:{fontFace:FF,fontSize:o.fs||12,bold:!!o.b,color:o.c||INK,align:o.a||'left',valign:'middle',fill:o.fill?{color:o.fill}:undefined}});
 const hcell=(t,a)=>cell(t,{b:true,c:MU,fs:10.5,fill:TH?'F4F4F4':'E8ECF2',a});
 const tblOpts=(colW,y=1.45)=>({x:MX,y,w:SW-2*MX,colW,border:{type:'solid',pt:.5,color:LN},rowH:.38,autoPage:true,autoPageRepeatHeader:true,newSlideStartY:.7,margin:.06});
 const hexOf=a=>a.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
 // cover
 if(TH){const s=p.addSlide();s.background={color:AC};
  s.addText([r.info.item,r.info.product].filter(Boolean).join(' - ')||'Product Code - Product Name',{x:.6,y:1.7,w:SW-1.2,h:1.1,fontFace:FF,fontSize:40,color:'FFFFFF',align:'center',valign:'middle',margin:0,fit:'shrink'});
  const rows=[['Vendor',r.info.supplier],['Date of Review',RD],...(r.info.round?[['Review #',r.info.round]]:[]),[TH.linkLabel||'Link',r.info.link]];
  s.addText(rows.map(([k,v],i)=>({text:k+': '+(v||''),options:{breakLine:i<rows.length-1,...(k===(TH.linkLabel||'Link')&&/^https?:/.test(v||'')?{hyperlink:{url:v}}:{})}})),{x:.95,y:3.05,w:8.5,h:1.5,fontFace:FL,fontSize:18,color:'FFFFFF',valign:'top',margin:0,lineSpacingMultiple:1.1});
  s.addShape(p.ShapeType.roundRect,{x:SW-3.4,y:3.15,w:2.6,h:.95,fill:{color:'FFFFFF'},line:{color:'FFFFFF'},rectRadius:.12});
  s.addText([{text:STATUS[st][0],options:{fontSize:22,bold:true,breakLine:true}},{text:STATUS[st][1],options:{fontSize:11}}],{x:SW-3.4,y:3.15,w:2.6,h:.95,fontFace:FF,color:SC,align:'center',valign:'middle',margin:0});
  if(TH.footer)s.addText(TH.footer,{x:.5,y:SH-.85,w:SW-1,h:.5,fontFace:FF,fontSize:9,italic:true,bold:true,color:'FFFFFF',align:'center',valign:'middle',margin:0,fit:'shrink'});
 }else{const s=p.addSlide();s.background={color:'FFFFFF'};s.addShape(p.ShapeType.rect,{x:0,y:0,w:.35,h:SH,fill:{color:AC},line:{color:AC}});
  s.addText(SET.company||'',{x:1,y:.7,w:10,h:.5,fontFace:FF,fontSize:16,bold:true,color:AC,margin:0});
  s.addText(r.reportTitle||'INSPECTION REPORT',{x:1,y:1.5,w:11,h:.9,fontFace:FF,fontSize:40,bold:true,color:INK,margin:0});
  s.addText(r.info.product||'',{x:1,y:2.45,w:11,h:.7,fontFace:FF,fontSize:24,color:INK,margin:0});
  s.addText([r.type,fmtDate(r.date),r.info.location].filter(Boolean).join('   ·   '),{x:1,y:3.15,w:11,h:.5,fontFace:FF,fontSize:15,color:MU,margin:0});
  const kv=[['Report no.',r.no],['PO',r.info.po],['Item / style no.',r.info.item],['Client',r.info.client],['Supplier',r.info.supplier],['Inspector',r.info.inspector]];
  kv.forEach(([k,v],i)=>{const x=1+(i%3)*3.6,y=4.3+Math.floor(i/3)*.95;s.addText(k.toUpperCase(),{x,y,w:3.4,h:.3,fontFace:FF,fontSize:10,color:MU,margin:0,charSpacing:1});s.addText(v||'—',{x,y:y+.3,w:3.4,h:.45,fontFace:FF,fontSize:15,bold:true,color:INK,margin:0})});
  s.addShape(p.ShapeType.roundRect,{x:SW-3.6,y:1.55,w:3,h:1.25,fill:{color:'FFFFFF'},line:{color:SC,width:2.5},rectRadius:.12});
  s.addText([{text:STATUS[st][0],options:{fontSize:24,bold:true,breakLine:true}},{text:STATUS[st][1],options:{fontSize:12}}],{x:SW-3.6,y:1.55,w:3,h:1.25,fontFace:FF,color:SC,align:'center',valign:'middle'})}
 // summary
 {const AQ=hasAql(r),s=base(AQ?'AQL result':'Result summary');if(AQ){s.addText(e.aq.valid?`ISO 2859-1 · General level ${r.level} · Lot ${e.aq.lot} pcs · Code letter ${e.aq.letter} · Sample size ${e.aq.n}`:'Lot size not entered',{x:MX,y:1.25,w:12,h:.4,fontFace:FF,fontSize:13,color:MU,margin:0});
  s.addTable([[hcell('Class'),hcell('AQL','center'),hcell('Sample size','center'),hcell('Ac / Re','center'),hcell('Found','center'),hcell('Result','center')],...e.aq.rows.map(x=>[cell(x.vn+' ('+x.en+')'),cell(x.aql,{a:'center'}),cell(x.n+(x.full?' (100%)':''),{a:'center'}),cell(x.ac+' / '+x.re,{a:'center'}),cell(x.found,{a:'center',b:true}),cell(x.res?(x.res==='pass'?'Pass':'Fail'):'—',{a:'center',b:true,c:x.res?hexOf(ST_RGB[x.res]):MU})])],{...tblOpts([3.5,1.4,1.8,1.6,1.6,2.43],1.8),rowH:.5})}
  s.addText([{text:'Conclusion: ',options:{color:MU}},{text:STATUS[st][0]+' · '+STATUS[st][1],options:{bold:true,color:SC}}],{x:MX,y:AQ?4.2:1.5,w:12,h:.5,fontFace:FF,fontSize:18,margin:0});
  if(r.conclusion.remark)s.addText(r.conclusion.remark,{x:MX,y:AQ?4.8:2.2,w:12.3,h:2.2,fontFace:FF,fontSize:14,color:INK,valign:'top',margin:0,fit:'shrink'})}
 // checklist
 {const s=base('Checklist');const rc=k=>({pass:hexOf(ST_RGB.pass),fail:hexOf(ST_RGB.fail),na:MU})[k]||hexOf(ST_RGB.pending);const rt=k=>({pass:'Pass',fail:'Fail',na:'N/A'})[k]||'Not checked';
  s.addTable([[hcell('#','center'),hcell('Checkpoint'),hcell('Result','center'),hcell('Notes'),hcell('Photos','center')],...r.checkpoints.map((c,i)=>[cell(pad2(i+1),{a:'center',c:MU}),cell(c.name,{b:true}),cell(rt(c.result),{a:'center',b:true,c:rc(c.result)}),cell(c.note,{fs:11}),cell(c.photos.length,{a:'center'})])],tblOpts([.6,4.2,1.6,5.13,.8]))}
 if(r.defects.length){const s=base('Defect list');s.addTable([[hcell('#','center'),hcell('Defect'),hcell('Severity','center'),hcell('Qty','center'),hcell('Photos','center')],...r.defects.map((d,i)=>[cell(i+1,{a:'center',c:MU}),cell(d.desc),cell(SEVL[d.sev][1]+' ('+SEVL[d.sev][2]+')',{a:'center',b:true,c:d.sev==='critical'?hexOf(ST_RGB.fail):d.sev==='major'?hexOf(ST_RGB.pending):AC}),cell(d.qty,{a:'center',b:true}),cell(d.photos.length,{a:'center'})])],tblOpts([.6,6.8,2.4,1.5,1.03]))}
 // photo slides
 const GY=1.3,AW=SW-2*MX,AH=SH-GY-.25,GAP=.25;
 const photoSlides=async(title,sub,pids,extra,note)=>{
  const ph=(await Promise.all(pids.map(id=>photoData(id,SET.pptLayers!==false)))).filter(Boolean),por=x=>x&&x.h>x.w*1.05,groups=[];
  for(let k=0;k<ph.length;){const g=ph[k+1]?[ph[k],ph[k+1]]:[ph[k]];groups.push(g);k+=g.length}
  groups.forEach((g,pg)=>{const s=base(title+(groups.length>1?` (${pg+1}/${groups.length})`:''),sub);
   if(extra&&pg===0)extra(s);
   const NH=note&&pg===0?.62:0;if(NH)s.addText(note,{x:MX,y:SH-.2-NH,w:AW,h:NH,fontFace:FL,fontSize:13,color:INK,margin:0,valign:'top',fit:'shrink'});
   const GAP2=g.length===2?.15:0,cw=g.length===2?(AW-GAP2)/2:AW,capH=g.some(x=>x.caption)?.38:0;
   g.forEach((x,j)=>{const[w,h]=fit(x.w,x.h,cw,AH-capH-NH);const bx=g.length===2?(j===0?MX+cw-w:MX+cw+GAP2):MX+(cw-w)/2,by=GY+(AH-capH-NH-h)/2;
    s.addImage({data:x.data.replace(/^data:/,''),x:bx,y:by,w,h});
    if(x.layered)try{pptAnn(p,s,x,bx,by,w,h)}catch(e){console.error('ppt marks',e)}
    if(x.caption)s.addText(x.caption,{x:bx,y:by+h+.04,w:Math.max(w,3),h:capH-.04,fontFace:FF,fontSize:12,color:INK,margin:0,valign:'top',fit:'shrink'})});
  });
 };
 const rt=k=>({pass:'Pass',fail:'Fail',na:'N/A'})[k]||'Not checked';
 for(const[i,c]of r.checkpoints.entries()){
  const hasMeas=c.kind==='measure'&&c.rows.some(x=>x.actual!=='');if(!c.photos.length&&!hasMeas&&!c.note)continue;
  const sub={c:c.result==='pass'?hexOf(ST_RGB.pass):c.result==='fail'?hexOf(ST_RGB.fail):MU};const subT=rt(c.result);
  if(!c.photos.length||hasMeas){const s=base(pad2(i+1)+'. '+c.name);s.addText(subT,{x:SW-MX-2.6,y:.6,w:2.6,h:.6,fontFace:FF,fontSize:14,bold:true,color:sub.c,align:'right',valign:'middle',margin:0});
   let yy=1.35;if(c.note){s.addText(c.note,{x:MX,y:yy,w:12.3,h:.6,fontFace:FF,fontSize:14,color:INK,margin:0,valign:'top',fit:'shrink'});yy+=.75}
   if(hasMeas)s.addTable([[hcell('Measurement'),hcell('Spec','center'),hcell('Tolerance ±','center'),hcell('Actual','center'),hcell('','center')],...c.rows.map(x=>{const ok=measureOK(x);return[cell(x.name),cell(x.spec,{a:'center'}),cell(x.tol,{a:'center'}),cell(x.actual,{a:'center',b:true}),cell(ok==null?'':ok?'OK':'NG',{a:'center',b:true,c:ok?hexOf(ST_RGB.pass):hexOf(ST_RGB.fail)})]})],tblOpts([5,2.2,2,2,1.13],yy))}
  if(c.photos.length){await photoSlides(pad2(i+1)+'. '+c.name,null,c.photos,s=>s.addText(subT,{x:SW-MX-2.6,y:.6,w:2.6,h:.6,fontFace:FF,fontSize:14,bold:true,color:sub.c,align:'right',valign:'middle',margin:0}),hasMeas?'':c.note)}
 }
 for(const d of r.defects.filter(d=>d.photos.length)){const col=d.sev==='critical'?hexOf(ST_RGB.fail):d.sev==='major'?hexOf(ST_RGB.pending):AC;
  await photoSlides('Defect: '+d.desc,null,d.photos,s=>s.addText(SEVL[d.sev][1]+' · Qty '+d.qty,{x:SW-MX-2.6,y:.6,w:2.6,h:.6,fontFace:FF,fontSize:14,bold:true,color:col,align:'right',valign:'middle',margin:0}))}
 // comments & next steps (one place the vendor can act on)
 {const items=[];r.checkpoints.forEach((c,i)=>{if(c.result==='fail'||(c.note&&c.result!=='pass'))items.push([c.name,c.note||'Not OK',c.result==='fail'])});
  r.defects.forEach(d=>items.push([d.desc,SEVL[d.sev][1]+(d.qty?' · Qty '+d.qty:''),d.sev!=='minor']));
  if(items.length||r.conclusion.remark){const s=base('Comments & next steps');let y=1.25;
   if(items.length){s.addText(items.map(([t,n,bad],i)=>({text:t+': ',options:{bold:true,color:bad?hexOf(ST_RGB.fail):INK,bullet:{type:'number'},breakLine:false}})).flatMap((o,i)=>[o,{text:items[i][1],options:{color:INK,breakLine:true}}]),{x:MX,y,w:SW-2*MX,h:Math.min(4.2,.42*items.length+.3),fontFace:FL,fontSize:15,valign:'top',margin:0,fit:'shrink',paraSpaceAfter:4});y+=Math.min(4.2,.42*items.length+.3)+.25}
   if(r.conclusion.remark)s.addText([{text:'Next step: ',options:{bold:true,color:AC,fontFace:FF}},{text:r.conclusion.remark,options:{color:INK}}],{x:MX,y,w:SW-2*MX,h:Math.max(.8,SH-y-.4),fontFace:FL,fontSize:16,valign:'top',margin:0,fit:'shrink'})}}
 const blob=await p.write({outputType:'blob'});busy(false);
 if(EXPORT_SKIPPED)toast(EXPORT_SKIPPED+' photo'+(EXPORT_SKIPPED>1?'s':'')+' could not be read on this device and were left out');
 if(mode==='blob')return blob;
 await offer(fileBase(r)+'.pptx',blob);
 }catch(err){busy(false);console.error(err);exportProblem('PowerPoint export failed',String(err&&err.message||err))}
}

/* ---------- cloud sync (Supabase tables + Storage) ---------- */
/* Offline-first: everything is saved in IndexedDB first. When online and signed in, changes are pushed
   (per-document last-write-wins on `updated`) and remote changes are pulled by server time (`modified_at`).
   Deletions are tombstones so other devices remove them too. Photos: original + annotated copy + thumbnail in Storage. */
const CFG=window.QC_CONFIG||{};
const SB=(()=>{try{if(!window.supabase||!CFG.SUPABASE_URL||!CFG.SUPABASE_ANON_KEY||/YOUR-PROJECT|YOUR-ANON/i.test(CFG.SUPABASE_URL+CFG.SUPABASE_ANON_KEY))return null;
 return window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'qcfb-auth'}})}catch(e){console.error('supabase init',e);return null}})();
const BUCKET='photos',TBL={t:'templates',c:'customers',r:'reports',p:'photos',s:'settings'};
const SY={state:'init',msg:'',busy:false,again:false,last:0,timer:0,poll:0,uid:null,remUid:null,email:'',cur:{},REM:{t:new Map(),c:new Map(),r:new Map(),p:new Map(),s:null},IN:{t:new Map(),c:new Map(),r:new Map()},lastEdit:0,done:new Map(),signed:new Map()};
let PDEL=[],GONE={};
const savePDEL=()=>S.put('kv','pdel',PDEL);
let remT;function saveREM(){clearTimeout(remT);remT=setTimeout(()=>S.put('kv','syrem',{uid:SY.remUid,cur:SY.cur,t:[...SY.REM.t],c:[...SY.REM.c],r:[...SY.REM.r],p:[...SY.REM.p],s:SY.REM.s}).catch(()=>{}),400)}
async function loadREM(){try{const d=await S.get('kv','syrem');if(!d)return;SY.remUid=d.uid||null;SY.cur=d.cur||{};for(const k of['t','c','r','p'])SY.REM[k]=new Map(d[k]||[]);SY.REM.s=d.s||null}catch(e){}}
function resetREM(){SY.cur={};for(const k of['t','c','r','p'])SY.REM[k]=new Map();SY.REM.s=null;SY.done.clear();SY.signed.clear()}
const CLOUD_IC=SV('<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.7 1.5A3.3 3.3 0 0117 18z"/>');
const syBtn=()=>`<button class="icon-btn sy ${SY.state}" id="sy-btn" data-act="syncnow" aria-label="Sync with cloud">${CLOUD_IC}</button>`;
const OFFLINE_MSG='Offline. Everything is saved on this device and uploads automatically when you are back online.';
function syText(){
 const n=PHD.size+PDEL.length,pend=n?` ${PHD.size?PHD.size+' photo'+(PHD.size>1?'s':''):''}${PHD.size&&PDEL.length?' and ':''}${PDEL.length?PDEL.length+' deletion'+(PDEL.length>1?'s':''):''} waiting to upload.`:'';
 if(SY.state==='ok')return'Synced at '+new Date(SY.last).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'.'+pend;
 if(SY.state==='busy')return'Syncing…'+pend;
 if(SY.state==='error')return'Sync problem: '+SY.msg+'. Tap Sync now to retry.'+pend;
 if(SY.state==='off')return SY.msg+pend;
 return'Connecting…'+pend;
}
function syUI(){const b=$('#sy-btn');if(b)b.className='icon-btn sy '+SY.state;const t=$('#sy-status');if(t)t.textContent=syText()}
function syState(st,msg){SY.state=st;SY.msg=msg||'';syUI()}
const syErrText=e=>{if(!navigator.onLine)return'no internet connection';const m=String((e&&(e.message||e.error_description||e.error))||e||'unknown error');
 if(/bucket not found/i.test(m))return'photo bucket is missing (run schema.sql)';
 if(/relation .* does not exist|could not find the table/i.test(m))return'tables are missing (run schema.sql)';
 if(/row-level security|permission denied|violates/i.test(m))return'permission denied (check the SQL setup)';
 if(/jwt|refresh token|not authenticated|invalid claim/i.test(m))return'sign-in expired, sign in again';
 if(/failed to fetch|load failed|network|fetch/i.test(m))return'cannot reach Supabase (no internet, or the free project is paused)';
 return m.slice(0,160)};
async function syRetry(fn){try{return await fn()}catch(e){if(!navigator.onLine)throw e;await new Promise(r=>setTimeout(r,1200));return await fn()}}
const sbOK=r=>{if(r&&r.error)throw r.error;return r?r.data:null};

function setUser(u){if(!u)return;if(SY.uid===u.id)return;if(SY.remUid&&SY.remUid!==u.id)resetREM();SY.uid=u.id;SY.remUid=u.id;SY.email=u.email||'';try{localStorage.setItem('qcfb-user',JSON.stringify({id:u.id,email:u.email||''}))}catch(e){}saveREM()}
async function syncInit(){
 if(!SB){syState('off','Cloud sync is off: put your Supabase URL and key in config.js.');return}
 SB.auth.onAuthStateChange((ev,session)=>{
  if(session&&session.user){setUser(session.user);if(ev==='SIGNED_IN')hideLogin();if(ev==='SIGNED_IN'||ev==='TOKEN_REFRESHED')setTimeout(scheduleSync,0)}
  else if(ev==='SIGNED_OUT'){SY.uid=null;syState('off','Signed out.')}
 });
 try{const s=(await SB.auth.getSession()).data.session;if(s)setUser(s.user)}catch(e){}
 if(!navigator.onLine)syState('off',OFFLINE_MSG);
 window.addEventListener('online',()=>scheduleSync());
 window.addEventListener('offline',()=>syState('off',OFFLINE_MSG));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync()});
 clearInterval(SY.poll);SY.poll=setInterval(()=>{if(!document.hidden)scheduleSync()},60000);
 scheduleSync();
}
function scheduleSync(){if(!SB)return;clearTimeout(SY.timer);SY.timer=setTimeout(()=>syncNow(false),SY.last?1500:250)}
async function syncNow(manual){
 if(!SB){if(manual)toast(SY.msg||'Cloud sync is not set up');return}
 if(!navigator.onLine){syState('off',OFFLINE_MSG);if(manual)toast('No internet connection. Your work is saved on this device.');return}
 if(!SY.uid){try{const s=(await SB.auth.getSession()).data.session;if(s)setUser(s.user)}catch(e){}}
 if(!SY.uid){syState('off','Not signed in. Sign in to upload your work.');if(manual)showLogin();return}
 if(SY.busy){SY.again=true;return}
 SY.busy=true;syState('busy');
 try{
  await syDeletes();await syPull();await syPushTemplates();await syPushCustomers();await syPushSettings();await syPushPhotos();await syPushReports();
  saveREM();SY.last=Date.now();syState('ok');if(manual)toast('Synced');
 }catch(e){console.error('sync',e);syState('error',syErrText(e));if(manual)toast('Sync problem: '+syErrText(e))}
 SY.busy=false;
 if(SY.again){SY.again=false;scheduleSync()}
}
async function syUpsert(key,rows){for(let i=0;i<rows.length;i+=20){const chunk=rows.slice(i,i+20).map(x=>({user_id:SY.uid,...x}));await syRetry(async()=>sbOK(await SB.from(TBL[key]).upsert(chunk,{onConflict:'user_id,id'})))}}

/* ---- storage helpers ---- */
async function sbUpload(pid,kind,blob){
 const path=SY.uid+'/'+pid+'/'+kind+'-'+uid()+'.jpg';
 const body=blob instanceof Blob?blob:new Blob([blob],{type:'image/jpeg'});
 await syRetry(async()=>sbOK(await SB.storage.from(BUCKET).upload(path,body,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'})));
 return path;
}
async function sbDownload(path){if(!SB||!path||!navigator.onLine)return null;try{const{data,error}=await SB.storage.from(BUCKET).download(path);if(error)throw error;return data}catch(e){console.warn('download',path,e);return null}}
const mineAsset=x=>!!(x&&SY.uid&&String(x).startsWith(SY.uid+'/'));

/* ---- push ---- */
async function syDelPhoto(ph){
 if(!ph||!ph.pid)return;const rem=SY.REM.p.get(ph.pid)||{};
 const paths=[...new Set([ph.assetId,ph.flatAssetId,ph.thumbAssetId,...(ph.stale||[]),rem.assetId,rem.flatAssetId,rem.thumbAssetId].filter(mineAsset))];
 if(paths.length){try{await SB.storage.from(BUCKET).remove(paths)}catch(e){}}
 await syUpsert('p',[{id:ph.pid,data:null,updated:Date.now(),deleted:true}]);SY.REM.p.delete(ph.pid);
}
async function syDeletes(){
 while(PDEL.length){
  const d=PDEL[0],k={report:'r',template:'t',customer:'c'}[d.kind];
  if(k){await syUpsert(k,[{id:d.id,data:null,updated:d.at||Date.now(),deleted:true}]);SY.REM[k].set(d.id,{updated:d.at||Date.now(),deleted:true})}
  for(const ph of d.photos||[])await syDelPhoto(ph);
  if(d.kind==='photo')await syDelPhoto(d.photo);
  PDEL.shift();savePDEL();syUI();
 }
}
const remNewer=(k,id,u)=>{const r=SY.REM[k].get(id);return!!r&&(r.updated||0)>=(u||0)};
async function syPushTemplates(){const L=TEMPLATES.filter(t=>t.updated&&!remNewer('t',t.id,t.updated));if(!L.length)return;await syUpsert('t',L.map(t=>({id:t.id,data:clone(t),updated:t.updated,deleted:false})));L.forEach(t=>SY.REM.t.set(t.id,{updated:t.updated,deleted:false}))}
async function syPushCustomers(){const L=CUSTOMERS.filter(c=>c.updated&&!remNewer('c',c.id,c.updated));if(!L.length)return;await syUpsert('c',L.map(c=>({id:c.id,data:clone(c),updated:c.updated,deleted:false})));L.forEach(c=>SY.REM.c.set(c.id,{updated:c.updated,deleted:false}))}
async function syPushSettings(){
 if(!SET.updated)return;if(SY.REM.s&&(SY.REM.s.updated||0)>=SET.updated)return;
 await syUpsert('s',[{id:'main',data:clone(SET),updated:SET.updated,deleted:false}]);SY.REM.s={updated:SET.updated};
}
async function syPushPhoto(pid){
 const p=await S.get('photos',pid);
 if(!p||!(p.blob instanceof Blob)){PHD.delete(pid);savePHD();return}
 const lu=p.u||p.ts||0;
 if(!mineAsset(p.assetId))p.assetId=await sbUpload(pid,'orig',p.blob);
 const hasFlat=p.flat instanceof Blob;
 if(hasFlat&&!mineAsset(p.flatAssetId))p.flatAssetId=await sbUpload(pid,'flat',p.flat);
 if(!hasFlat&&p.flatAssetId){(p.stale=p.stale||[]).push(p.flatAssetId);p.flatAssetId=null}
 if(p.thumb instanceof Blob&&!mineAsset(p.thumbAssetId)){try{p.thumbAssetId=await sbUpload(pid,'thumb',p.thumb)}catch(e){p.thumbAssetId=null}}
 const body={assetId:p.assetId,flatAssetId:p.flatAssetId||null,thumbAssetId:p.thumbAssetId||null,w:p.w,h:p.h,caption:p.caption||'',ts:p.ts||0,ann:p.ann||[]};
 await syUpsert('p',[{id:pid,data:body,updated:lu,deleted:false}]);SY.REM.p.set(pid,{...body,u:lu});SY.done.set(pid,lu);
 const stale=(p.stale||[]).filter(mineAsset);if(stale.length){try{await SB.storage.from(BUCKET).remove(stale)}catch(e){}}
 // keep the uploaded paths locally, unless the photo was edited while it was uploading
 const now=await S.get('photos',pid);
 if(now&&(now.u||now.ts||0)===lu){p.stale=[];p.__fromSync=true;await S.put('photos',pid,p);PHD.delete(pid);savePHD()}
}
async function syPushPhotos(){
 for(const pid of[...PHD]){
  if(String(pid).startsWith('tmp-'))continue;
  try{await syPushPhoto(pid)}catch(e){const m=String(e&&e.message||e);if(!navigator.onLine||/quota|exceed|row-level|bucket|jwt|fetch|network/i.test(m))throw e;console.warn('photo push skipped',pid,e)}
  syUI();
 }
}
async function syPushReports(){
 const L=REPORTS.filter(r=>!r.example&&r.updated&&!remNewer('r',r.id,r.updated));if(!L.length)return;
 await syUpsert('r',L.map(r=>{const body=clone(r);body.checkpoints.forEach(c=>c.photos=c.photos.filter(p=>!String(p).startsWith('tmp-')));body.defects.forEach(d=>d.photos=d.photos.filter(p=>!String(p).startsWith('tmp-')));return{id:r.id,data:body,updated:r.updated,deleted:false}}));
 L.forEach(r=>SY.REM.r.set(r.id,{updated:r.updated,deleted:false}));
}

/* ---- pull ---- */
async function syFetch(key){
 const out=[];let cur=SY.cur[key]||'1970-01-01T00:00:00Z';
 for(;;){
  const data=await syRetry(async()=>sbOK(await SB.from(TBL[key]).select('id,data,updated,deleted,modified_at').gt('modified_at',cur).order('modified_at',{ascending:true}).limit(500)))||[];
  out.push(...data);if(data.length)cur=data[data.length-1].modified_at;if(data.length<500)break;
 }
 return{rows:out,cur};
}
// Photos download in the background, a few at a time, so reports appear immediately on a new device
const PHQ={q:[],set:new Set(),busy:0};
function phqAdd(pid,front){if(!pid||String(pid).startsWith('tmp-'))return;if(PHQ.set.has(pid)){if(front){PHQ.q=PHQ.q.filter(x=>x!==pid);PHQ.q.unshift(pid)}return}PHQ.set.add(pid);if(front)PHQ.q.unshift(pid);else PHQ.q.push(pid);phqRun()}
function phqRun(){while(PHQ.busy<3&&PHQ.q.length){const pid=PHQ.q.shift();PHQ.busy++;syEnsurePhoto(pid).catch(()=>{}).finally(()=>{PHQ.busy--;PHQ.set.delete(pid);phqRun()})}}
function phRefresh(pid,url){document.querySelectorAll(`img[data-pid="${pid}"]`).forEach(im=>{im.src=url;delete im.dataset.rep})}
async function remURL(pid){
 const r=SY.REM.p.get(pid);if(!r||!SB||!navigator.onLine)return'';const path=r.thumbAssetId||r.flatAssetId||r.assetId;if(!path)return'';
 const c=SY.signed.get(path);if(c&&c.exp>Date.now())return c.url;
 try{const{data}=await SB.storage.from(BUCKET).createSignedUrl(path,3600);if(data&&data.signedUrl){SY.signed.set(path,{url:data.signedUrl,exp:Date.now()+3500e3});return data.signedUrl}}catch(e){}
 return'';
}
async function syEnsurePhoto(pid){
 if(!SB||!SY.uid||!navigator.onLine)return false;
 let rem=SY.REM.p.get(pid);
 if(!rem){try{const d=sbOK(await SB.from('photos').select('data,updated,deleted').eq('id',pid).maybeSingle());if(d&&!d.deleted&&d.data){rem={...d.data,u:d.updated||0};SY.REM.p.set(pid,rem)}}catch(e){}}
 if(!rem)return false;
 const lp=await S.get('photos',pid),ru=rem.u||0;
 if(lp&&(lp.u||lp.ts||0)>=ru){SY.done.set(pid,ru);return true}
 try{
  const blob=lp&&lp.assetId===rem.assetId&&lp.blob instanceof Blob?lp.blob:await sbDownload(rem.assetId);if(!blob)return false;
  const flat=rem.flatAssetId?await sbDownload(rem.flatAssetId):undefined;
  let thumb=rem.thumbAssetId?await sbDownload(rem.thumbAssetId):null;
  if(!thumb){const bmp=await loadBitmap(flat||blob),c=document.createElement('canvas');c.width=rem.w||bmp.width;c.height=rem.h||bmp.height;c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);if(bmp.close)bmp.close();thumb=await makeThumbBlob(c);c.width=c.height=0}
  const np={id:pid,blob,thumb,w:rem.w,h:rem.h,caption:rem.caption||'',ts:rem.ts||0,u:ru,ann:rem.ann||[],assetId:rem.assetId,flatAssetId:rem.flatAssetId||null,thumbAssetId:rem.thumbAssetId||null,__fromSync:true};
  if(flat)np.flat=flat;
  await S.put('photos',pid,np);
  if(np.ann.length)ANN.add(pid);else ANN.delete(pid);saveANN();
  const o=urlCache.get(pid);if(o)URL.revokeObjectURL(o);urlCache.delete(pid);const tu=URL.createObjectURL(thumb);thumbCache.set(pid,Promise.resolve(tu));phRefresh(pid,tu);
  SY.done.set(pid,ru);return true;
 }catch(e){console.error('photo pull',e);return false}
}
const syEditing=(kind,id)=>view.name===kind&&view.id===id&&Date.now()-SY.lastEdit<10000;
async function syPull(){
 const got={};for(const k of['s','t','c','r','p'])got[k]=await syFetch(k);
 let changed=false,again=false;
 for(const row of got.s.rows){if(row.id!=='main'||row.deleted||!row.data)continue;SY.REM.s={updated:row.updated||0};if((row.updated||0)>(SET.updated||0)){Object.assign(SET,clone(row.data),{updated:row.updated});await S.put('kv','settings',SET);changed=true}}
 for(const k of['t','c','r'])for(const row of got[k].rows){SY.REM[k].set(row.id,{updated:row.updated||0,deleted:!!row.deleted});SY.IN[k].set(row.id,row.deleted||!row.data?{id:row.id,deleted:true,updated:row.updated||0}:{...clone(row.data),id:row.id,updated:row.updated||0})}
 for(const row of got.p.rows){if(row.deleted||!row.data)SY.REM.p.delete(row.id);else SY.REM.p.set(row.id,{...row.data,u:row.updated||0})}
 let tc=false;
 for(const[id,d]of SY.IN.t){
  const i=TEMPLATES.findIndex(t=>t.id===id);
  if(d.deleted){if(i>=0&&(TEMPLATES[i].updated||0)<=(d.updated||0)){TEMPLATES.splice(i,1);tc=true}SY.IN.t.delete(id);continue}
  if(i<0&&syGone('template',id,d)){SY.IN.t.delete(id);continue}
  if(i>=0&&syEditing('tpl',id)){again=true;continue}
  if(i<0){TEMPLATES.push(clone(d));tc=true}else if((d.updated||0)>(TEMPLATES[i].updated||0)){TEMPLATES[i]=clone(d);tc=true}
  SY.IN.t.delete(id);
 }
 if(tc){if(!TEMPLATES.length){const t=defaultTemplate();t.updated=Date.now();TEMPLATES.push(t)}await S.put('kv','templates',TEMPLATES);changed=true}
 let cc=false;
 for(const[id,d]of SY.IN.c){
  const i=CUSTOMERS.findIndex(x=>x.id===id);
  if(d.deleted){if(i>=0&&(CUSTOMERS[i].updated||0)<=(d.updated||0)){CUSTOMERS.splice(i,1);cc=true;if(view.name==='cust'&&view.id===id)view={name:'home',tab:'customers'}}SY.IN.c.delete(id);continue}
  if(i<0&&syGone('customer',id,d)){SY.IN.c.delete(id);continue}
  if(i>=0&&syEditing('cust',id)){again=true;continue}
  if(i<0){CUSTOMERS.push(clone(d));cc=true}else if((d.updated||0)>(CUSTOMERS[i].updated||0)){CUSTOMERS[i]=clone(d);cc=true}
  SY.IN.c.delete(id);
 }
 if(cc){await S.put('kv','customers',CUSTOMERS);changed=true}
 for(const[id,d]of SY.IN.r){
  const i=REPORTS.findIndex(r=>r.id===id);
  if(d.deleted){
   if(i>=0&&(REPORTS[i].updated||0)<=(d.updated||0)){
    if(syEditing('report',id)){again=true;continue}
    for(const p of allPhotos(REPORTS[i])){await S.del('photos',p);ANN.delete(p)}
    REPORTS.splice(i,1);await S.del('reports',id);changed=true;
    if(view.name==='report'&&view.id===id)view={name:'home',tab:'reports'};
   }
   SY.IN.r.delete(id);continue;
  }
  if(i<0&&syGone('report',id,d)){SY.IN.r.delete(id);continue}
  if(i>=0&&(REPORTS[i].updated||0)>=(d.updated||0)){SY.IN.r.delete(id);continue}
  if(syEditing('report',id)){again=true;continue}
  const nr=clone(d);
  for(const pid of allPhotos(nr)){if(!(await S.has('photos',pid)))phqAdd(pid)}
  if(i>=0)REPORTS[i]=nr;else REPORTS.push(nr);
  await S.put('reports',id,nr);changed=true;SY.IN.r.delete(id);
 }
 if(got.p.rows.length){const used=new Set(REPORTS.flatMap(allPhotos));
  for(const row of got.p.rows){if(row.deleted||!row.data)continue;const ru=row.updated||0;if(SY.done.get(row.id)===ru)continue;
   if(!(await S.has('photos',row.id))){if(used.has(row.id))phqAdd(row.id);continue}
   const lp=await S.get('photos',row.id);if(lp&&(lp.u||lp.ts||0)<ru)phqAdd(row.id);else SY.done.set(row.id,ru)}}
 for(const k of['s','t','c','r','p'])if(got[k].rows.length)SY.cur[k]=got[k].cur;
 saveREM();
 if(changed){await saveANN();if(!AE&&(view.name==='home'||Date.now()-SY.lastEdit>10000))render()}
 if(again)setTimeout(scheduleSync,6000);
}

async function syPhotoRef(pid){const p=await S.get('photos',pid);return p?{pid,assetId:p.assetId||null,flatAssetId:p.flatAssetId||null,thumbAssetId:p.thumbAssetId||null,stale:p.stale||[]}:{pid}}
function syTomb(e){PDEL.push(e);savePDEL();if(e.id){GONE[e.kind+':'+e.id]=e.at||Date.now();S.put('kv','gone',GONE)}scheduleSync()}
const syGone=(kind,id,d)=>{const g=GONE[kind+':'+id];return!!g&&(d.updated||0)<=g};

/* ---------- sign-in (email magic link + code) ---------- */
const hasAuth=()=>{try{return!!(localStorage.getItem('qcfb-auth')||localStorage.getItem('qcfb-user'))}catch(e){return false}};
const lastEmail=()=>{try{return(JSON.parse(localStorage.getItem('qcfb-user')||'{}').email)||localStorage.getItem('qcfb-email')||''}catch(e){return''}};
let loginWait=null;
function showLogin(){
 if(!SB)return Promise.resolve();
 if($('#login'))return loginWait&&loginWait.p;
 let res;const p=new Promise(r=>res=r);loginWait={p,res};
 const el=document.createElement('div');el.id='login';el.className='login';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Sign in');
 el.innerHTML=`<div class="login-in">${BRAND}
  <div class="card"><h2>Sign in</h2>
   <div class="field"><label for="lg-email">Email</label><input id="lg-email" type="text" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(lastEmail())}" placeholder="you@example.com"></div>
   <div class="field"><label for="lg-pass">Password</label><input id="lg-pass" type="password" autocomplete="current-password" placeholder="Password"></div>
   <button class="btn primary block" id="lg-pw">Sign in</button>
   <button class="btn ghost" id="lg-send" style="align-self:center">Or email me a sign-in link / code</button>
   <div id="lg-code-box" hidden style="display:flex;flex-direction:column;gap:12px"><div class="field"><label for="lg-code">Code from the email</label><input id="lg-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></div><button class="btn dark block" id="lg-verify">Sign in with code</button></div>
   <p class="small" id="lg-msg" role="status" style="margin:0"></p>
  </div>
  ${hasLocalWork()?'<button class="btn ghost" id="lg-skip" style="color:var(--band-fg)">Continue offline (sign in later)</button>':''}</div>`;
 document.body.appendChild(el);
 const msg=(t,bad)=>{const m=$('#lg-msg');m.textContent=t;m.style.color=bad?'var(--fail)':'var(--pass)'};
 const emailOf=()=>$('#lg-email').value.trim().toLowerCase();
 $('#lg-send').onclick=async()=>{
  const email=emailOf();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg('Enter a valid email address.',true);return}
  if(!navigator.onLine){msg('No internet connection.',true);return}
  const b=$('#lg-send');b.disabled=true;b.textContent='Sending…';
  try{localStorage.setItem('qcfb-email',email)}catch(e){}
  const{error}=await SB.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});
  b.disabled=false;b.textContent='Send again';
  if(error){msg(/rate|security purposes/i.test(error.message)?'Too many emails. Wait a minute and try again. ('+error.message+')':'Could not send: '+error.message,true);return}
  $('#lg-code-box').hidden=false;$('#lg-code-box').style.display='flex';msg('Email sent to '+email+'. Open the link, or type the code below.');$('#lg-code').focus();
 };
 $('#lg-pw').onclick=async()=>{
  const email=emailOf(),password=$('#lg-pass').value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg('Enter a valid email address.',true);return}
  if(!password){msg('Enter your password.',true);$('#lg-pass').focus();return}
  if(!navigator.onLine){msg('No internet connection.',true);return}
  const b=$('#lg-pw');b.disabled=true;b.textContent='Signing in…';
  try{localStorage.setItem('qcfb-email',email)}catch(e){}
  const{data,error}=await SB.auth.signInWithPassword({email,password});
  b.disabled=false;b.textContent='Sign in';
  if(error||!data.session){msg(/invalid login/i.test((error&&error.message)||'')?'Wrong email or password.':'Could not sign in: '+((error&&error.message)||'try again'),true);return}
  setUser(data.session.user);hideLogin();toast('Signed in as '+(data.session.user.email||''));scheduleSync();
 };
 $('#lg-verify').onclick=async()=>{
  const token=$('#lg-code').value.replace(/\s/g,'');if(token.length<6){msg('Type the code from the email.',true);return}
  const b=$('#lg-verify');b.disabled=true;b.textContent='Checking…';
  const{data,error}=await SB.auth.verifyOtp({email:emailOf(),token,type:'email'});
  b.disabled=false;b.textContent='Sign in with code';
  if(error||!data.session){msg('That code did not work: '+((error&&error.message)||'try again'),true);return}
  setUser(data.session.user);hideLogin();toast('Signed in as '+(data.session.user.email||''));scheduleSync();
 };
 $('#lg-email').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#lg-pass').focus()}});
 $('#lg-pass').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#lg-pw').click()}});
 $('#lg-code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#lg-verify').click()}});
 if($('#lg-skip'))$('#lg-skip').onclick=()=>hideLogin();
 return p;
}
function hideLogin(){const el=$('#login');if(el)el.remove();if(loginWait){loginWait.res();loginWait=null}}
const hasLocalWork=()=>REPORTS.length>0;
async function signOut(erase){
 const pend=PHD.size+PDEL.length;
 confirmSheet(erase?'Sign out and erase this device?':'Sign out?',
  (pend?pend+' item(s) are not uploaded yet and '+(erase?'will be LOST. ':'will upload after you sign in again. '):'')+(erase?'All reports and photos are removed from this device. Your cloud copy stays in Supabase.':'Reports and photos stay on this device.'),
  erase?'Sign out and erase':'Sign out',async()=>{
   try{await SB.auth.signOut({scope:'local'})}catch(e){}
   try{localStorage.removeItem('qcfb-user');localStorage.removeItem('qcfb-auth')}catch(e){}
   SY.uid=null;
   if(erase){busy(true,'Erasing…');try{DB&&DB.close()}catch(e){}await new Promise(r=>{const q=indexedDB.deleteDatabase(DB_NAME);q.onsuccess=q.onerror=q.onblocked=()=>r()});location.reload();return}
   syState('off','Signed out.');render();showLogin();
  });
}

/* ---------- install as an app (PWA) ---------- */
let BIP=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();BIP=e;if(view.name==='home'&&view.tab==='settings')render()});
window.addEventListener('appinstalled',()=>{BIP=null;toast('App installed')});
const isStandalone=()=>window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iP(ad|hone|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function installHTML(){
 if(isStandalone())return'<p class="small" style="margin:0">Installed. You are using the home-screen app.</p>';
 if(BIP)return'<button class="btn primary" data-act="install">Install app</button>';
 if(isIOS())return'<p class="small" style="margin:0">In Safari tap the <b>Share</b> button, then <b>Add to Home Screen</b>. Sign in again inside the installed app (use the code from the email).</p>';
 return'<p class="small" style="margin:0">Use the browser menu → <b>Install app</b> / <b>Add to Home screen</b>.</p>';
}

function changePassword(){
 const s=sheet(`<h2>Change password</h2><div class="field"><label for="np1">New password (at least 8 characters)</label><input id="np1" type="password" autocomplete="new-password"></div><div class="field"><label for="np2">Repeat new password</label><input id="np2" type="password" autocomplete="new-password"></div><p class="small" id="np-msg" style="margin:0"></p><div class="row"><button class="btn grow" data-x="no">Cancel</button><button class="btn primary grow" data-x="ok">Save password</button></div>`);
 const m=t=>{const e=s.querySelector('#np-msg');e.textContent=t;e.style.color='var(--fail)'};
 s.querySelector('[data-x=no]').onclick=()=>s.remove();
 s.querySelector('[data-x=ok]').onclick=async()=>{const a=s.querySelector('#np1').value,b=s.querySelector('#np2').value;if(a.length<8)return m('Use at least 8 characters.');if(a!==b)return m('The two passwords are different.');if(!navigator.onLine)return m('No internet connection.');
  const{error}=await SB.auth.updateUser({password:a});if(error)return m('Could not change: '+error.message);s.remove();toast('Password changed')};
}


/* ---------- in-app camera (skips the phone camera's Retry/OK step when the browser allows it) ---------- */
const CAM={blocked:false,stream:null,facing:'environment'};
function camAllowed(){
 if(CAM.blocked||SET.inAppCam===false||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return false;
 try{const fp=document.permissionsPolicy||document.featurePolicy;if(fp&&fp.allowsFeature&&!fp.allowsFeature('camera'))return false}catch(e){}
 return true;
}
document.addEventListener('click',ev=>{
 const inp=ev.target.closest&&ev.target.closest('input[type=file][capture]');
 if(!inp||!camAllowed())return;
 ev.preventDefault();ev.stopPropagation();
 if(inp.dataset.kind==='newdef'){const d=$('#d-desc');if(!d||!d.value.trim()){toast('Enter a defect description first');d&&d.focus();return}}
 openCam(inp);
},true);
async function camStart(){
 if(CAM.stream)CAM.stream.getTracks().forEach(t=>t.stop());
 CAM.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:CAM.facing},width:{ideal:2560},height:{ideal:1920}}});
 return CAM.stream;
}
function camStop(){if(CAM.stream){CAM.stream.getTracks().forEach(t=>t.stop());CAM.stream=null}}
async function openCam(inp){
 const el=document.createElement('div');el.className='cam';el.setAttribute('role','dialog');el.setAttribute('aria-label','Camera');
 el.innerHTML=`<video playsinline muted autoplay></video><div class="cam-msg">Starting camera…</div>
  <div class="cam-bar"><button class="ae-btn" data-c="x">Cancel</button><button class="cam-shot" data-c="shot" aria-label="Take photo" disabled></button><button class="ae-ic" data-c="flip" aria-label="Switch camera">${SV('<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><path d="M9 13a3 3 0 015-2.2M15 13a3 3 0 01-5 2.2"/><path d="M14 9v2h2M10 17v-2H8"/>')}</button></div>`;
 document.body.appendChild(el);
 const v=el.querySelector('video'),msg=el.querySelector('.cam-msg'),shot=el.querySelector('[data-c=shot]');
 const close=()=>{camStop();el.remove()};
 const start=async()=>{shot.disabled=true;msg.hidden=false;msg.textContent='Starting camera…';
  try{v.srcObject=await camStart();await v.play().catch(()=>{});msg.hidden=true;shot.disabled=false}
  catch(e){close();const n=e&&e.name;CAM.blocked=true;
   toast(n==='NotAllowedError'||n==='SecurityError'?'Camera not allowed here. Tap Camera again to use the phone camera.':'Could not start the camera. Tap Camera again to use the phone camera.')}};
 el.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.c==='x')close();
  else if(b.dataset.c==='flip'){CAM.facing=CAM.facing==='environment'?'user':'environment';start()}
  else if(b.dataset.c==='shot'&&!shot.disabled){
   const w=v.videoWidth,h=v.videoHeight;if(!w||!h)return;shot.disabled=true;el.classList.add('flash');
   const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(v,0,0,w,h);
   const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));c.width=c.height=0;close();
   if(!blob){toast('Could not take the photo');return}
   const f=new File([blob],'photo-'+Date.now()+'.jpg',{type:'image/jpeg'});
   try{const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files}catch(err){toast('Could not use this photo');return}
   inp.dispatchEvent(new Event('change',{bubbles:true}));
  }});
 start();
}

/* ---------- boot ---------- */
(async()=>{
 if('serviceWorker' in navigator&&location.protocol!=='file:'){try{navigator.serviceWorker.register('sw.js')}catch(e){}}
 const ok=await openDB();
 try{navigator.storage?.persist?.()}catch(e){}
 try{SET=Object.assign(defaultSettings(),await S.get('kv','settings')||{})}catch(e){}
 try{ANN=new Set(await S.get('kv','annotated')||[])}catch(e){}
 try{PDEL=await S.get('kv','pdel')||[]}catch(e){PDEL=[]}
 try{GONE=await S.get('kv','gone')||{}}catch(e){GONE={}}
 try{(await S.get('kv','phdirty')||[]).forEach(x=>PHD.add(x))}catch(e){}
 await loadREM();
 try{TEMPLATES=await S.get('kv','templates')||[]}catch(e){TEMPLATES=[]}
 if(!TEMPLATES.length){const t=defaultTemplate();t.id='tpl-default';t.untouched=true;TEMPLATES=[t];S.put('kv','templates',TEMPLATES)}
 try{CUSTOMERS=await S.get('kv','customers')||[]}catch(e){CUSTOMERS=[]}
 try{REPORTS=await S.all('reports')||[]}catch(e){REPORTS=[]}
 const clean=a=>a.filter(p=>!String(p).startsWith('tmp-'));REPORTS.forEach(r=>{r.checkpoints.forEach(c=>c.photos=clean(c.photos));r.defects.forEach(d=>d.photos=clean(d.photos))});
 // one-time: build customers from the client names already typed into reports
 let cm=null;try{cm=await S.get('kv','custmig')}catch(e){}
 if(!cm){let ch=false;for(const r of REPORTS){const nm=(r.info&&r.info.client||'').trim();if(!nm||r.example||r.customerId)continue;const id='c-'+custHash(nm.toLowerCase());let c=CUSTOMERS.find(x=>x.id===id);if(!c){c=newCustomer();c.id=id;c.name=nm;CUSTOMERS.push(c)}r.customerId=id;await S.put('reports',r.id,r);ch=true}if(ch)await S.put('kv','customers',CUSTOMERS);S.put('kv','custmig',true)}
 try{const u=JSON.parse(localStorage.getItem('qcfb-user')||'null');if(u&&u.id&&(!SY.remUid||SY.remUid===u.id)){SY.email=u.email||''}}catch(e){}
 render(false);
 if(!ok)toast('This browser blocks storage. Data is kept only for this session.');
 if(SB){
  let s=null;try{s=(await Promise.race([SB.auth.getSession(),new Promise(r=>setTimeout(()=>r({data:{session:null}}),6000))])).data.session}catch(e){}
  if(s)setUser(s.user);
  else if(!hasAuth())await showLogin();
 }
 syncInit();
})();
