/* Stoic Block — the part that runs all the time.

   Every half minute it asks Stoic's cloud for today's record, works out whether
   the procrastination time logged has reached what today's pomodoros allow
   (logic.js), and if it has, turns on a redirect for each listed site and sends
   any tab already open on one of them to the blocked page. When the allowance
   grows again — a pomodoro finishes — the redirects come off by themselves.

   It only ever READS. It writes nothing to Stoic, so it cannot disturb the data
   the app and its other devices keep in sync.

   If the cloud cannot be read it does not guess: a block already in force stands
   for ten minutes and then lifts, and the badge says something is wrong. A
   blocker that locks you out of everything because the wifi dropped would be
   uninstalled the same day. */
import {SUPABASE_URL,SUPABASE_KEY,CHECK_EVERY_MIN,OFFLINE_GRACE_MS} from './config.js';
import {computeBudget,buildRules,hostBlocked,normaliseSites,DEFAULT_SITES} from './logic.js';

const store=chrome.storage.local;
const get=async k=>(await store.get(k))[k];
const set=o=>store.set(o);

/* ── session ───────────────────────────────────────────────────────────── */
function tokenExp(access){
  try{
    const p=JSON.parse(atob(access.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return p.exp?p.exp*1000:0;
  }catch(e){return 0;}
}
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

/* ── the cloud ─────────────────────────────────────────────────────────── */
// Only today's record, not the whole row (history, diary, planner...): a few
// hundred bytes twice a minute instead of the whole app.
async function fetchToday(){
  let tok=await validToken();
  if(!tok)return{err:'login'};
  const go=t=>fetch(`${SUPABASE_URL}/rest/v1/stoic_data?select=today&limit=1`,
    {headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+t}});
  try{
    let r=await go(tok);
    if(r.status===401){
      const n=await refreshSession();
      if(!n)return{err:(await get('session'))?'net':'login'};
      r=await go(n.access);
    }
    if(!r.ok)return{err:'net'};
    const rows=await r.json();
    return{today:rows&&rows.length?rows[0].today:null};
  }catch(e){return{err:'net'};}
}

/* ── blocking ──────────────────────────────────────────────────────────── */
async function getSites(){
  const s=await get('sites');
  return normaliseSites(Array.isArray(s)?s:DEFAULT_SITES);
}
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
      st={ok:true,...computeBudget(r.today),okAt:now,checkedAt:now};
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

chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
  (async()=>{
    if(msg&&msg.type==='check')reply(await check());
    else if(msg&&msg.type==='login'){
      const r=await login(String(msg.email||'').trim(),String(msg.password||''));
      if(r.ok)await check();
      reply(r);
    }else if(msg&&msg.type==='logout'){
      await store.remove(['session','status']);
      await check();
      reply({ok:true});
    }else reply(null);
  })();
  return true;   // the answer is asynchronous
});

// A service worker that was asleep when the browser opened still has to start.
startAlarm();
check();
