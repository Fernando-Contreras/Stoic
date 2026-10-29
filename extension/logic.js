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
export function penMinutes(day,type){
  return ((day&&day.penalties)||[])
    .filter(p=>p&&p.type===type)
    .reduce((s,p)=>s+((p.details&&p.details.minutes)||p.count||0),0);
}

/* Where we stand, from the `today` Stoic keeps in the cloud.

   `today` is a record of one particular day. Read on the next morning before the
   app has been opened, it still describes yesterday — and yesterday's minutes
   must not block today — so a record from any other day is a day with nothing
   logged and nothing earned yet, which is exactly what it is. The day is the one
   Stoic itself uses: in the time zone stored on the record (Cancún by default),
   not this computer's. */
export function computeBudget(today,now){
  now=now||new Date();
  const tz=(today&&today._tz)||'America/Cancun';
  let dayNow;
  try{dayNow=now.toLocaleDateString('en-CA',{timeZone:tz});}
  catch(e){dayNow=now.toLocaleDateString('en-CA',{timeZone:'America/Cancun'});}
  const current=!!(today&&today._date===dayNow);
  const poms=current?(Number(today.pomodoros)||0):0;
  const used=current?penMinutes(today,'internet'):0;
  const allowed=freeMinsFor(poms);
  return{
    day:dayNow,
    current,
    poms:Math.round(poms*10)/10,
    used:Math.round(used),
    allowed,
    left:Math.max(0,allowed-Math.round(used)),
    blocked:Math.round(used)>=allowed      // "equal or more", as it was asked
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
