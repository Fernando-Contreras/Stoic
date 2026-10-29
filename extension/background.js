/* Stoic Block — the part that runs all the time.

   Every half minute (and at every switch of tab or window) it looks at which of
   the listed sites is being used and credits the time to it. Then it asks
   Stoic's cloud for today's record and for the time measured by every browser
   signed in to this account, works out whether the procrastination time —
   logged by hand plus measured — has reached what today's pomodoros allow
   (logic.js), and if it has, turns on a redirect for each listed site and sends
   any tab already open on one of them to the blocked page. When the allowance
   grows again — a pomodoro finishes — the redirects come off by themselves.

   What it writes: only its own measurements, to its own small table
   (procrastination_time), one row per day, site and browser. It NEVER writes to
   Stoic's own record of the day: that record is edited by the app on every
   device, and a second writer in it is how counts get overwritten. The app
   reads the measurements and turns them into entries itself.

   If the cloud cannot be read it does not guess: a block already in force stands
   for ten minutes and then lifts, and the badge says something is wrong. A
   blocker that locks you out of everything because the wifi dropped would be
   uninstalled the same day. */
import {SUPABASE_URL,SUPABASE_KEY,CHECK_EVERY_MIN,OFFLINE_GRACE_MS} from './config.js';
import {computeBudget,stoicDay,buildRules,hostBlocked,normaliseSites,pickSite,advance,sumMeasured,DEFAULT_SITES} from './logic.js';

const store=chrome.storage.local;
const get=async k=>(await store.get(k))[k];
const set=o=>store.set(o);

/* ── session ───────────────────────────────────────────────────────────── */
function tokenPayload(access){
  try{return JSON.parse(atob(access.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}
  catch(e){return {};}
}
const tokenExp=access=>{const p=tokenPayload(access);return p.exp?p.exp*1000:0;};

async function authCall(grant,body){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
    body:JSON.stringify(body)
  });
  return await r.json();
}
async function login(email,password){
  try{
    const d=await authCall('password',{email,password});
    if(!d.access_token)return{error:d.error_description||d.msg||'No se pudo iniciar sesión'};
    await set({session:{access:d.access_token,refresh:d.refresh_token,email}});
    return{ok:true};
  }catch(e){return{error:'Sin conexión'};}
}
async function refreshSession(){
  const s=await get('session');
  if(!s||!s.refresh)return null;
  try{
    const d=await authCall('refresh_token',{refresh_token:s.refresh});
    if(d.access_token){
      const next={access:d.access_token,refresh:d.refresh_token||s.refresh,email:s.email};
      await set({session:next});
      return next;
    }
    // The server said no (revoked, expired for good): the person has to sign in again.
    if(d.error||d.error_code||d.msg){await store.remove('session');}
  }catch(e){/* offline: keep what we have */}
  return null;
}
async function validToken(){
  let s=await get('session');
  if(!s)return null;
  if(tokenExp(s.access)-Date.now()<2*60*1000){
    const n=await refreshSession();
    if(n)s=n;
    else if(!(await get('session')))return null;   // signed out by the server
  }
  return s.access;
}

/* One call to the data API, renewing the session once if the cloud refuses it.
   Returns {res} or {err:'login'|'net'}. */
async function api(path,opts){
  const tok=await validToken();
  if(!tok)return{err:'login'};
  const go=t=>fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    ...opts,
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+t,...((opts&&opts.headers)||{})}
  });
  try{
    let r=await go(tok);
    if(r.status===401){
      const n=await refreshSession();
      if(!n)return{err:(await get('session'))?'net':'login'};
      r=await go(n.access);
    }
    return{res:r};
  }catch(e){return{err:'net'};}
}

/* ── the cloud ─────────────────────────────────────────────────────────── */
// Only today's record, not the whole row (history, diary, planner...): a few
// hundred bytes twice a minute instead of the whole app.
async function fetchToday(){
  const a=await api('stoic_data?select=today&limit=1');
  if(a.err)return{err:a.err};
  if(!a.res.ok)return{err:'net'};
  try{
    const rows=await a.res.json();
    return{today:rows&&rows.length?rows[0].today:null};
  }catch(e){return{err:'net'};}
}

// What every browser on this account has measured on `day`: [{site,seconds,device}].
async function fetchMeasuredRows(day){
  const a=await api(`procrastination_time?select=site,seconds,device&day=eq.${day}`);
  if(a.err||!a.res)return{err:a.err||'net'};
  if(a.res.status===404)return{missing:true};   // the table has not been created yet (PostgREST: "could not find the table")
  if(!a.res.ok)return{err:'net'};
  try{return{rows:await a.res.json()};}catch(e){return{err:'net'};}
}

async function deviceId(){
  let d=await get('device');
  if(!d){d='b'+Math.random().toString(36).slice(2,9)+Date.now().toString(36);await set({device:d});}
  return d;
}

// Sends this browser's seconds, one row per site, only when they changed.
async function pushMeasure(m,tableOk){
  if(tableOk===false)return;
  const sites=Object.keys((m&&m.sites)||{});
  if(!sites.length)return;
  const pushed=(await get('pushed'))||{};
  const same=pushed.day===m.day&&sites.every(s=>Math.floor(m.sites[s])===pushed.sites[s]);
  if(same)return;
  const s=await get('session');
  const uid=s?tokenPayload(s.access).sub:null;
  if(!uid)return;
  const device=await deviceId();
  const nowIso=new Date().toISOString();
  const rows=sites.map(site=>({user_id:uid,day:m.day,site,device,seconds:Math.floor(m.sites[site]),updated_at:nowIso}));
  const a=await api('procrastination_time?on_conflict=user_id,day,site,device',{
    method:'POST',
    headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(rows)
  });
  if(a.res&&a.res.ok){
    const rec={};sites.forEach(x=>{rec[x]=Math.floor(m.sites[x]);});
    await set({pushed:{day:m.day,sites:rec}});
  }
}

/* ── measuring ─────────────────────────────────────────────────────────── */
async function getSites(){
  const s=await get('sites');
  return normaliseSites(Array.isArray(s)?s:DEFAULT_SITES);
}
async function readContext(){
  const ctx={windowFocused:false,activeUrl:'',audibleUrls:[],idleState:'active'};
  try{
    const w=await chrome.windows.getLastFocused({populate:true});
    ctx.windowFocused=!!w.focused;
    const a=(w.tabs||[]).find(t=>t.active);
    ctx.activeUrl=(a&&a.url)||'';
  }catch(e){}
  try{ctx.audibleUrls=(await chrome.tabs.query({audible:true})).map(t=>t.url).filter(Boolean);}catch(e){}
  try{ctx.idleState=await chrome.idle.queryState(60);}catch(e){}
  return ctx;
}
let sampling=null;
async function sample(){
  if(sampling)return sampling;
  sampling=(async()=>{
    const sites=await getSites();
    const tz=await get('tz');
    const day=stoicDay({_tz:tz});
    const cur=pickSite(await readContext(),sites);
    const next=advance(await get('measure'),Date.now(),cur,day);
    await set({measure:next});
    return next;
  })().finally(()=>{sampling=null;});
  return sampling;
}

/* ── blocking ──────────────────────────────────────────────────────────── */
async function redirectOpenTabs(sites){
  let tabs=[];
  try{tabs=await chrome.tabs.query({});}catch(e){return;}
  for(const tab of tabs){
    if(!tab.url||!/^https?:/i.test(tab.url))continue;
    let host='';
    try{host=new URL(tab.url).hostname;}catch(e){continue;}
    if(!hostBlocked(host,sites))continue;
    const site=sites.find(s=>host===s||host.endsWith('.'+s))||host;
    const to=chrome.runtime.getURL('blocked.html')+'?site='+encodeURIComponent(site)+'&back='+encodeURIComponent(tab.url);
    try{await chrome.tabs.update(tab.id,{url:to});}catch(e){}
  }
}
async function applyBlocking(blocked,sites){
  const old=await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds:old.map(r=>r.id),
    addRules:blocked?buildRules(sites):[]
  });
  if(blocked)await redirectOpenTabs(sites);
}

function paintBadge(st){
  let text='',color='#555';
  if(st.reason==='login'){text='!';color='#d4a017';}
  else if(st.ok===false&&st.reason==='net'){text='?';color='#d4a017';}
  else if(st.blocked){text='X';color='#e5484d';}
  else{text=String(st.left);color=st.left<=5?'#d4a017':'#2f9e44';}
  chrome.action.setBadgeText({text});
  chrome.action.setBadgeBackgroundColor({color});
}

let busy=null;
async function check(){
  // One at a time: the alarm and a person pressing "revisar ahora" can overlap.
  if(busy)return busy;
  busy=(async()=>{
    const sites=await getSites();
    const own=await sample();                     // look first, so the time is up to date
    const r=await fetchToday();
    const prev=(await get('status'))||{};
    const now=Date.now();
    let st;
    if(r.err==='login'){
      st={ok:false,reason:'login',blocked:false,checkedAt:now};
    }else if(r.err==='net'){
      const holds=prev.blocked&&prev.okAt&&now-prev.okAt<OFFLINE_GRACE_MS;
      st={...prev,ok:false,reason:'net',blocked:!!holds,checkedAt:now};
    }else{
      if(r.today&&r.today._tz)await set({tz:r.today._tz});
      const day=stoicDay(r.today);
      const ownSites=own.day===day?own.sites:{};
      const rows=await fetchMeasuredRows(day);
      const device=await deviceId();
      // If the other browsers' rows cannot be read, this browser's own count still stands.
      const measured=sumMeasured(rows.rows||[],device,ownSites);
      const b=computeBudget(r.today,new Date(),measured);
      st={ok:true,...b,perSite:measured,table:rows.missing?'missing':'ok',okAt:now,checkedAt:now};
      await pushMeasure(own,!rows.missing);
    }
    await set({status:st});
    try{await applyBlocking(st.blocked,sites);}catch(e){console.warn('Stoic Block: could not apply rules',e);}
    paintBadge(st);
    return st;
  })().finally(()=>{busy=null;});
  return busy;
}

/* ── wiring ────────────────────────────────────────────────────────────── */
function startAlarm(){chrome.alarms.create('stoic-check',{periodInMinutes:CHECK_EVERY_MIN});}
chrome.runtime.onInstalled.addListener(async()=>{
  if(!Array.isArray(await get('sites')))await set({sites:DEFAULT_SITES});
  startAlarm();check();
});
chrome.runtime.onStartup.addListener(()=>{startAlarm();check();});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='stoic-check')check();});
// Changing the list takes effect at once, not at the next half minute.
chrome.storage.onChanged.addListener((ch,area)=>{if(area==='local'&&ch.sites)check();});

// A switch of tab or window closes the stretch at the moment it happens, so the
// time is credited to what you were on and not to where you went.
chrome.tabs.onActivated.addListener(()=>{sample();});
chrome.tabs.onUpdated.addListener((_id,info)=>{if(info.url||info.audible!==undefined||info.status==='complete')sample();});
chrome.windows.onFocusChanged.addListener(()=>{sample();});
chrome.idle.onStateChanged.addListener(()=>{sample();});
chrome.idle.setDetectionInterval(60);

chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
  (async()=>{
    if(msg&&msg.type==='check')reply(await check());
    else if(msg&&msg.type==='login'){
      const r=await login(String(msg.email||'').trim(),String(msg.password||''));
      if(r.ok)await check();
      reply(r);
    }else if(msg&&msg.type==='logout'){
      await store.remove(['session','status','pushed']);
      await check();
      reply({ok:true});
    }else reply(null);
  })();
  return true;   // the answer is asynchronous
});

// A service worker that was asleep when the browser opened still has to start.
startAlarm();
check();
