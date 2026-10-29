/* Stoic Block — the rules, with nothing in here that talks to the browser, so
   they can be tested on their own.

   The one decision this extension makes is: "is the time you have spent on
   procrastination today at or past what today's pomodoros have bought?" The
   arithmetic is Stoic's own and is copied from it on purpose — see
   FREE_MINS_BASE / freeMinsFor in index.html. If one changes, change both. */

export const FREE_MINS_BASE=30;   // the flat daily allowance
export const FREE_MINS_POMS=8;    // 8 pomodoros buy another 30 minutes on top

/* What today's pomodoros allow: never less than the flat 30, and 30 more per 8
   pomodoros (12 → 45, 16 → 60). */
export function freeMinsFor(pomodoros){
  return Math.max(FREE_MINS_BASE,Math.round(FREE_MINS_BASE*(pomodoros||0)/FREE_MINS_POMS));
}

// Minutes logged against one reward in a day, however many entries it took.
// `excludeExt` leaves out the entries the app made FROM this extension's own
// measurements (details.ext): those are counted from the measurements
// themselves, and counting both would count that time twice.
export function penMinutes(day,type,excludeExt){
  return ((day&&day.penalties)||[])
    .filter(p=>p&&p.type===type&&!(excludeExt&&p.details&&p.details.ext))
    .reduce((s,p)=>s+((p.details&&p.details.minutes)||p.count||0),0);
}

/* Whole minutes measured on the blocked sites, per site, less whatever the
   person has dismissed in the app (today._extAck: seconds already thrown away).
   Rounded DOWN per site, exactly as the app turns it into entries, so the two
   can never disagree about whether a minute has passed. */
export function measuredMinutes(measured,ack){
  let m=0;
  for(const [site,sec] of Object.entries(measured||{})){
    const left=Math.max(0,(Number(sec)||0)-((ack&&Number(ack[site]))||0));
    m+=Math.floor(left/60);
  }
  return m;
}

/* Where we stand, from the `today` Stoic keeps in the cloud.

   `today` is a record of one particular day. Read on the next morning before the
   app has been opened, it still describes yesterday — and yesterday's minutes
   must not block today — so a record from any other day is a day with nothing
   logged and nothing earned yet, which is exactly what it is. The day is the one
   Stoic itself uses: in the time zone stored on the record (Cancún by default),
   not this computer's. */
export function stoicDay(today,now){
  now=now||new Date();
  const tz=(today&&today._tz)||'America/Cancun';
  try{return now.toLocaleDateString('en-CA',{timeZone:tz});}
  catch(e){return now.toLocaleDateString('en-CA',{timeZone:'America/Cancun'});}
}

/* `measured` is the time the extension itself has measured today, {site:
   seconds}, from every browser that has measured. What counts against the
   allowance is what was logged by hand PLUS that, so the block does not wait
   for the app to be opened and turn the measurements into entries. */
export function computeBudget(today,now,measured){
  const dayNow=stoicDay(today,now);
  const current=!!(today&&today._date===dayNow);
  const poms=current?(Number(today.pomodoros)||0):0;
  const manual=current?Math.round(penMinutes(today,'internet',true)):0;
  const meas=measuredMinutes(measured,current?today._extAck:null);
  const used=manual+meas;
  const allowed=freeMinsFor(poms);
  return{
    day:dayNow,
    current,
    poms:Math.round(poms*10)/10,
    used,
    manual,
    measured:meas,
    allowed,
    left:Math.max(0,allowed-used),
    blocked:used>=allowed      // "equal or more", as it was asked
  };
}

// What people type: a bare host, a pasted link, with www., with a path, in capitals.
export function normaliseSite(raw){
  let s=String(raw||'').trim().toLowerCase();
  if(!s)return '';
  s=s.replace(/^[a-z][a-z0-9+.-]*:\/\//,'');   // scheme
  s=s.split(/[\/?#]/)[0];                      // path, query, fragment
  s=s.replace(/^www\./,'');
  s=s.replace(/:\d+$/,'');                     // port
  if(!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s))return '';
  return s;
}
export function normaliseSites(list){
  const out=[];
  (list||[]).forEach(x=>{const n=normaliseSite(x);if(n&&!out.includes(n))out.push(n);});
  return out;
}

// Is this host one of the blocked sites, or a subdomain of one?
export function hostBlocked(host,sites){
  host=String(host||'').toLowerCase().replace(/^www\./,'');
  return (sites||[]).some(s=>host===s||host.endsWith('.'+s));
}

/* One redirect per site, for the page itself (not for the images and scripts a
   page pulls in — blocking those would only break pages in strange ways). A
   domain rule covers its subdomains too. */
export function buildRules(sites){
  return (sites||[]).map((host,i)=>({
    id:i+1,
    priority:1,
    action:{type:'redirect',redirect:{extensionPath:'/blocked.html?site='+encodeURIComponent(host)}},
    condition:{requestDomains:[host],resourceTypes:['main_frame']}
  }));
}

/* ── measuring the time spent on those sites ─────────────────────────────── */

const hostOf=u=>{try{return new URL(u).hostname;}catch(e){return '';}};
// The listed site this address belongs to (a subdomain belongs to its parent), or null.
export function siteOf(url,sites){
  const h=hostOf(url).toLowerCase().replace(/^www\./,'');
  if(!h)return null;
  return (sites||[]).find(s=>h===s||h.endsWith('.'+s))||null;
}

/* Which listed site, if any, is being USED right now. In use means one of:
   - it is the tab in front, in the window in front, and the person is at the
     computer (not idle, not locked); or
   - it is making sound — a film playing while you do something else, or while
     you sit back and do not touch anything, is still time on it.
   A tab open in the background that is silent is not use. */
export function pickSite(ctx,sites){
  if(ctx&&ctx.windowFocused&&ctx.idleState==='active'){
    const s=siteOf(ctx.activeUrl,sites);
    if(s)return s;
  }
  for(const u of (ctx&&ctx.audibleUrls)||[]){
    const s=siteOf(u,sites);
    if(s)return s;
  }
  return null;
}

/* The measurement is taken by looking, every half minute and again at every
   switch of tab or window, and crediting the time since the last look to what
   was in use at that last look. A look after a long gap (the computer slept)
   credits at most MAX_GAP_SEC — sleeping is not time on Netflix. */
export const MAX_GAP_SEC=90;
export function advance(m,nowMs,curSite,day){
  const next=(m&&m.day===day)
    ?{day,sites:{...m.sites},lastAt:m.lastAt,lastSite:m.lastSite}
    :{day,sites:{},lastAt:null,lastSite:null};
  if(next.lastSite&&next.lastAt!=null){
    const dt=Math.max(0,Math.min(MAX_GAP_SEC,(nowMs-next.lastAt)/1000));
    next.sites[next.lastSite]=(next.sites[next.lastSite]||0)+dt;
  }
  next.lastSite=curSite||null;
  next.lastAt=nowMs;
  return next;
}

// Several browsers (Chrome and Edge) each measure their own: the total is the sum.
export function sumMeasured(rows,ownDevice,ownSites){
  const out={};
  for(const r of rows||[]){
    if(r.device===ownDevice)continue;          // our own row is replaced by the fresher local copy
    out[r.site]=(out[r.site]||0)+(Number(r.seconds)||0);
  }
  for(const [site,sec] of Object.entries(ownSites||{}))out[site]=(out[site]||0)+Math.floor(sec);
  return out;
}

/* A starting list. Editable in the options. WhatsApp Web and Netflix are the
   two that were asked for by name; the rest are the usual suspects. YouTube is
   left out on purpose: for this person it is also where tutorials live. */
export const DEFAULT_SITES=[
  'web.whatsapp.com','netflix.com','instagram.com','facebook.com',
  'x.com','twitter.com','tiktok.com','reddit.com','twitch.tv'
];

// "12 min" / "1h 5m", for the screens.
export function fmtMin(min){
  min=Math.max(0,Math.round(min||0));
  const h=Math.floor(min/60),m=min%60;
  if(!h)return m+' min';
  return m?h+' h '+m+' min':h+' h';
}
