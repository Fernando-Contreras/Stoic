// Runs background.js against a pretend browser and a pretend cloud.
//   node extension/test/background.test.mjs
import assert from 'node:assert/strict';

/* ── a pretend Chrome ─────────────────────────────────────────────────── */
const storage={};
const listeners={message:null,alarm:[],changed:[]};
let rules=[],tabs=[],badge={text:'',color:''},updates=[];
let focus={focused:true,activeUrl:'',idle:'active'};
const clone=o=>JSON.parse(JSON.stringify(o));
globalThis.chrome={
  storage:{
    local:{
      async get(k){const keys=Array.isArray(k)?k:[k];const o={};keys.forEach(x=>{if(x in storage)o[x]=clone(storage[x]);});return o;},
      async set(o){const ch={};for(const [k,v] of Object.entries(o)){ch[k]={oldValue:storage[k],newValue:v};storage[k]=clone(v);}listeners.changed.forEach(f=>f(ch,'local'));},
      async remove(k){(Array.isArray(k)?k:[k]).forEach(x=>delete storage[x]);}
    },
    onChanged:{addListener:f=>listeners.changed.push(f)}
  },
  alarms:{create(){},onAlarm:{addListener:f=>listeners.alarm.push(f)}},
  runtime:{
    onInstalled:{addListener(){}},onStartup:{addListener(){}},
    onMessage:{addListener:f=>{listeners.message=f;}},
    getURL:p=>'chrome-extension://stoicblock/'+p
  },
  declarativeNetRequest:{
    async getDynamicRules(){return clone(rules);},
    async updateDynamicRules({removeRuleIds=[],addRules=[]}){rules=rules.filter(r=>!removeRuleIds.includes(r.id)).concat(clone(addRules));}
  },
  tabs:{
    onActivated:{addListener(){}},onUpdated:{addListener(){}},
    async query(q){return clone(q&&q.audible?tabs.filter(t=>t.audible):tabs);},
    async update(id,p){updates.push({id,...p});const t=tabs.find(x=>x.id===id);if(t&&p.url)t.url=p.url;}
  },
  action:{setBadgeText:o=>{badge.text=o.text;},setBadgeBackgroundColor:o=>{badge.color=o.color;}},
  windows:{async getLastFocused(){return{focused:focus.focused,tabs:[{active:true,url:focus.activeUrl}]};},onFocusChanged:{addListener(){}}},
  idle:{async queryState(){return focus.idle;},setDetectionInterval(){},onStateChanged:{addListener(){}}}
};
const send=msg=>new Promise(res=>{listeners.message(msg,{},res);});

/* ── a pretend cloud ──────────────────────────────────────────────────── */
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
const jwt=(expSec)=>'x.'+b64({exp:expSec,sub:'user-1'})+'.y';
const realNow=Date.now.bind(Date);
let clockShift=0;Date.now=()=>realNow()+clockShift;
const nowSec=()=>Math.floor(Date.now()/1000);

const cloud={
  password:'secreta',user:'juan@example.com',
  today:null,netDown:false,rejectAccess:null,refreshOk:true,calls:[],methods:[],lifetimeSec:3600,
  rows:[],tableMissing:false,posts:[]
};
const cancunDay=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Cancun'});
const mkToday=(o)=>({_date:cancunDay(),_tz:'America/Cancun',pomodoros:0,penalties:[],...o});
const mins=m=>[{type:'internet',details:{minutes:m}}];
let issued=0;
const newAccess=()=>{issued++;return jwt(nowSec()+cloud.lifetimeSec)+'.'+issued;};   // distinguishable tokens
let validAccess=null;
const json=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

globalThis.fetch=async(url,opts={})=>{
  cloud.calls.push(String(url).replace(/^https:\/\/[^/]+/,''));
  cloud.methods.push((opts.method||'GET').toUpperCase()+' '+String(url).replace(/^https:\/\/[^/]+/,'').split('?')[0]);
  if(cloud.netDown)throw new TypeError('network down');
  const u=String(url);
  if(u.includes('/auth/v1/token?grant_type=password')){
    const b=JSON.parse(opts.body);
    if(b.email===cloud.user&&b.password===cloud.password){validAccess=newAccess();return json(200,{access_token:validAccess,refresh_token:'R'+issued});}
    return json(400,{error_description:'Invalid login credentials'});
  }
  if(u.includes('/auth/v1/token?grant_type=refresh_token')){
    if(!cloud.refreshOk)return json(400,{error:'invalid_grant',error_description:'Refresh Token Not Found'});
    validAccess=newAccess();return json(200,{access_token:validAccess,refresh_token:'R'+issued});
  }
  if(u.includes('/rest/v1/procrastination_time')){
    const auth=(opts.headers&&opts.headers.Authorization)||'';
    if(!auth.includes(validAccess||'#'))return json(401,{message:'JWT invalid'});
    if(cloud.tableMissing)return json(404,{code:'PGRST205',message:'Could not find the table'});
    if((opts.method||'GET')==='POST'){
      const body=JSON.parse(opts.body);cloud.posts.push(body);
      for(const r of body){
        const i=cloud.rows.findIndex(x=>x.day===r.day&&x.site===r.site&&x.device===r.device);
        if(i>=0)cloud.rows[i]=r;else cloud.rows.push(r);
      }
      return json(201,null);
    }
    const day=new URL(u).searchParams.get('day').replace('eq.','');
    return json(200,cloud.rows.filter(r=>r.day===day).map(({site,seconds,device})=>({site,seconds,device})));
  }  if(u.includes('/rest/v1/stoic_data')){
    const auth=(opts.headers&&opts.headers.Authorization)||'';
    if(cloud.rejectAccess&&auth.includes(cloud.rejectAccess))return json(401,{message:'JWT expired'});
    if(!auth.includes(validAccess||'#'))return json(401,{message:'JWT invalid'});
    return json(200,cloud.today===undefined?[]:[{today:cloud.today}]);
  }
  throw new Error('unexpected request '+u);
};

/* ── load it ──────────────────────────────────────────────────────────── */
await import('../background.js');
const settle=()=>new Promise(r=>setTimeout(r,30));
await settle();

let n=0;
const t=async(name,fn)=>{await fn();n++;console.log('  ok  '+name);};
const ids=()=>rules.map(r=>r.condition.requestDomains[0]).sort();

await t('without a session nothing is blocked and the badge asks for one',async()=>{
  assert.equal(storage.status.reason,'login');
  assert.equal(rules.length,0);
  assert.equal(badge.text,'!');
});

await t('a wrong password is refused and keeps no session',async()=>{
  const r=await send({type:'login',email:cloud.user,password:'mala'});
  assert.equal(r.ok,undefined);assert.match(r.error,/Invalid/);
  assert.equal(storage.session,undefined);
});

await t('signing in stores a session and NEVER the password',async()=>{
  cloud.today=mkToday({pomodoros:0,penalties:mins(10)});
  const r=await send({type:'login',email:cloud.user,password:cloud.password});
  assert.equal(r.ok,true);
  assert.ok(storage.session.access&&storage.session.refresh);
  assert.ok(!JSON.stringify(storage).includes(cloud.password),'the password must not be stored anywhere');
});

await t('under the allowance: nothing blocked, the badge shows minutes left (20)',async()=>{
  assert.equal(storage.status.blocked,false);assert.equal(storage.status.left,20);
  assert.equal(rules.length,0);assert.equal(badge.text,'20');
});

await t('reaching the allowance (30 of 30) blocks every listed site',async()=>{
  tabs=[{id:1,url:'https://www.netflix.com/browse'},{id:2,url:'https://example.com/'},
        {id:3,url:'https://web.whatsapp.com/'},{id:4,url:'chrome://extensions'},{id:5,url:'https://notnetflix.com/'}];
  updates=[];
  cloud.today=mkToday({pomodoros:0,penalties:mins(30)});
  const st=await send({type:'check'});
  assert.equal(st.blocked,true);
  assert.ok(ids().includes('netflix.com')&&ids().includes('web.whatsapp.com'));
  assert.equal(badge.text,'X');
});

await t('tabs already open on a blocked site are sent to the blocked page, others left alone',async()=>{
  const moved=updates.map(u=>u.id).sort();
  assert.deepEqual(moved,[1,3]);
  const u1=updates.find(u=>u.id===1).url;
  assert.match(u1,/^chrome-extension:\/\/stoicblock\/blocked\.html\?site=netflix\.com&back=/);
  assert.equal(decodeURIComponent(u1.split('&back=')[1]),'https://www.netflix.com/browse');
  assert.equal(tabs.find(x=>x.id===2).url,'https://example.com/');
  assert.equal(tabs.find(x=>x.id===5).url,'https://notnetflix.com/');
});

await t('a pomodoro-driven allowance lifts the block (12 pomodoros buy 45; 30 used -> 15 left)',async()=>{
  cloud.today=mkToday({pomodoros:12,penalties:mins(30)});
  const st=await send({type:'check'});
  assert.equal(st.blocked,false);assert.equal(rules.length,0);assert.equal(badge.text,'15');
});

await t('blocking again re-adds the rules (no duplicates of ids)',async()=>{
  cloud.today=mkToday({pomodoros:12,penalties:mins(50)});
  await send({type:'check'});await send({type:'check'});
  assert.equal(new Set(rules.map(r=>r.id)).size,rules.length);
  assert.ok(rules.length>=9);
});

await t("a new day (yesterday's record) lifts everything",async()=>{
  cloud.today=mkToday({_date:'2000-01-01',pomodoros:0,penalties:mins(500)});
  const st=await send({type:'check'});
  assert.equal(st.blocked,false);assert.equal(rules.length,0);
});

await t('cloud down while blocked: the block stands inside the grace period',async()=>{
  cloud.today=mkToday({penalties:mins(40)});await send({type:'check'});
  assert.equal(storage.status.blocked,true);
  cloud.netDown=true;
  clockShift+=2*60*1000;
  const st=await send({type:'check'});
  assert.equal(st.blocked,true);assert.equal(st.reason,'net');assert.equal(badge.text,'?');
  assert.ok(rules.length>0);
});

await t('cloud still down past the grace period: it lifts instead of locking you out',async()=>{
  clockShift+=11*60*1000;
  const st=await send({type:'check'});
  assert.equal(st.blocked,false);assert.equal(rules.length,0);
});

await t('cloud down while NOT blocked: it does not invent a block',async()=>{
  cloud.today=mkToday();cloud.netDown=false;clockShift+=1000;await send({type:'check'});
  cloud.netDown=true;
  const st=await send({type:'check'});
  assert.equal(st.blocked,false);assert.equal(rules.length,0);
  cloud.netDown=false;
});

await t('an expired access token is renewed with the refresh token and the check goes through',async()=>{
  cloud.today=mkToday({penalties:mins(35)});
  const before=storage.session.access;
  cloud.rejectAccess=before;                       // the cloud now refuses this token
  const calls0=cloud.calls.length;
  const st=await send({type:'check'});
  assert.equal(st.blocked,true);
  assert.notEqual(storage.session.access,before);
  assert.ok(cloud.calls.slice(calls0).some(c=>c.includes('grant_type=refresh_token')));
  cloud.rejectAccess=null;
});

await t('a token about to lapse is renewed ahead of time',async()=>{
  clockShift+=3600*1000-60*1000;                    // 1 minute left on a 1-hour token
  const before=storage.session.access;
  await send({type:'check'});
  assert.notEqual(storage.session.access,before);
});

await t('a refresh the server rejects for good signs you out and stops blocking',async()=>{
  cloud.refreshOk=false;cloud.rejectAccess=storage.session.access;
  const st=await send({type:'check'});
  assert.equal(st.reason,'login');assert.equal(st.blocked,false);
  assert.equal(storage.session,undefined);assert.equal(rules.length,0);assert.equal(badge.text,'!');
  cloud.refreshOk=true;cloud.rejectAccess=null;
});

await t('changing the site list re-applies at once (storage change triggers a check)',async()=>{
  await send({type:'login',email:cloud.user,password:cloud.password});
  cloud.today=mkToday({penalties:mins(40)});await send({type:'check'});
  await chrome.storage.local.set({sites:['only-this.com']});
  await settle();
  assert.deepEqual(ids(),['only-this.com']);
});

await t('only today is requested from the cloud, never the whole row',async()=>{
  const reqs=cloud.calls.filter(c=>c.includes('/rest/v1/stoic_data'));
  assert.ok(reqs.length>5);
  assert.ok(reqs.every(c=>c.includes('select=today')&&!/history|diary|planner/.test(c)),'it must not pull history/diary/planner');
});

await t('it only ever reads Stoic data: every request to stoic_data was a GET',async()=>{
  const data=cloud.methods.filter(m=>m.includes('/rest/v1/stoic_data'));
  assert.ok(data.length>5);
  assert.ok(data.every(m=>m.startsWith('GET ')),'a non-GET reached the data API: '+data.find(m=>!m.startsWith('GET ')));
  // and so far the only POSTs are the sign-in / token renewal calls
  const posts=cloud.methods.filter(m=>m.startsWith('POST '));
  assert.ok(posts.length>0&&posts.every(m=>m.includes('/auth/v1/token')));
});

await t('sanity: the harness would notice a write (the check above is not vacuous)',async()=>{
  const fake=['POST /rest/v1/stoic_data'];
  assert.ok(!fake.filter(m=>m.includes('/rest/v1/')).every(m=>m.startsWith('GET ')));
});


/* ── measuring ────────────────────────────────────────────────────────── */
const minutesPass=async(mins)=>{for(let i=0;i<mins*2;i++){clockShift+=30*1000;await send({type:'check'});}};   // a look every 30 s, as the alarm does
const resetMeasure=async()=>{await chrome.storage.local.remove(['measure','pushed']);cloud.rows=[];cloud.posts=[];};
const secondsOn=site=>(storage.measure&&storage.measure.sites&&storage.measure.sites[site])||0;

await t('measuring: set up (fresh day, two sites listed, signed in, nothing logged)',async()=>{
  await chrome.storage.local.set({sites:['netflix.com','x.com']});
  await send({type:'login',email:cloud.user,password:cloud.password});
  await resetMeasure();
  tabs=[];cloud.tableMissing=false;cloud.netDown=false;
  cloud.today=mkToday({pomodoros:0,penalties:[]});
  focus={focused:true,activeUrl:'https://www.netflix.com/browse',idle:'active'};
  const st=await send({type:'check'});
  assert.equal(st.blocked,false);assert.equal(st.measured,0);
});

await t('measuring: time on a listed site, in front and at the computer, is counted',async()=>{
  await minutesPass(10);
  const s=secondsOn('netflix.com');
  assert.ok(s>=590&&s<=610,'expected ~600 s, got '+s);
  assert.equal(storage.status.measured,10);assert.equal(storage.status.used,10);assert.equal(storage.status.blocked,false);
});

await t('measuring: it is uploaded to its own table, one row for this browser, with a whole number of seconds',async()=>{
  const mine=cloud.rows.filter(r=>r.site==='netflix.com');
  assert.equal(mine.length,1);
  assert.ok(mine[0].device&&mine[0].user_id&&mine[0].day===cancunDay());
  assert.ok(Number.isInteger(mine[0].seconds)&&mine[0].seconds>=590);
});

await t('measuring: it is NOT counted when another application is in front and nothing is playing',async()=>{
  focus={focused:false,activeUrl:'https://www.netflix.com/browse',idle:'active'};
  clockShift+=1000;await send({type:'check'});            // the look that closes the stretch you were still on
  const before=secondsOn('netflix.com');
  await minutesPass(5);
  assert.equal(secondsOn('netflix.com'),before);
});

await t('measuring: nor when the person is idle at the computer with the tab open and silent',async()=>{
  focus={focused:true,activeUrl:'https://www.netflix.com/browse',idle:'idle'};
  clockShift+=1000;await send({type:'check'});
  const before=secondsOn('netflix.com');
  await minutesPass(5);
  assert.equal(secondsOn('netflix.com'),before);
});

await t('measuring: a film playing counts even when idle',async()=>{
  tabs=[{id:20,url:'https://www.netflix.com/watch/1',audible:true}];
  focus={focused:true,activeUrl:'https://example.com',idle:'idle'};
  await send({type:'check'});                              // first look at the film: nothing credited yet
  const before=secondsOn('netflix.com');
  await minutesPass(5);
  const gained=secondsOn('netflix.com')-before;
  assert.ok(gained>=280&&gained<=320,'expected ~300 s, got '+gained);
  tabs=[];
});

await t('measuring: a site that is not listed is never counted',async()=>{
  focus={focused:true,activeUrl:'https://github.com/',idle:'active'};
  clockShift+=1000;await send({type:'check'});
  const before=JSON.stringify(storage.measure.sites);
  await minutesPass(5);
  assert.equal(JSON.stringify(storage.measure.sites),before);
});

await t('measuring: it reaches the allowance and blocks, with nothing logged by hand and the app never opened',async()=>{
  focus={focused:true,activeUrl:'https://www.netflix.com/browse',idle:'active'};
  tabs=[{id:30,url:'https://www.netflix.com/browse'}];updates=[];
  await minutesPass(20);                                   // 10 + 5 (film) + 20 = past 30
  assert.equal(storage.status.blocked,true);
  assert.ok(storage.status.measured>=30);
  assert.ok(rules.length>0);
  assert.ok(updates.some(u=>u.id===30),'the open Netflix tab should have been sent to the blocked page');
});

await t('measuring: a pomodoro lifts it even though the measured time stays',async()=>{
  cloud.today=mkToday({pomodoros:16,penalties:[]});        // 60 minutes allowed
  focus={focused:false,activeUrl:'',idle:'active'};
  const st=await send({type:'check'});
  assert.equal(st.blocked,false);assert.equal(rules.length,0);assert.ok(st.measured>=30);
});

await t("measuring: another browser's time on this account is added, and this one's own row is not counted twice",async()=>{
  cloud.today=mkToday({pomodoros:0,penalties:[]});
  const ownBefore=secondsOn('x.com');
  cloud.rows.push({user_id:'u',day:cancunDay(),site:'x.com',device:'edge-device',seconds:600,updated_at:''});
  const st=await send({type:'check'});
  assert.equal(st.perSite['x.com'],600+Math.floor(ownBefore));
  // this browser's stale cloud copy of netflix is replaced by the fresher local one, not added to it
  const stale=cloud.rows.find(r=>r.site==='netflix.com'&&r.device!=='edge-device');
  assert.ok(stale);
  assert.equal(st.perSite['netflix.com'],Math.floor(secondsOn('netflix.com')));
});

await t('measuring: what the app already turned into entries is not counted a second time',async()=>{
  const day=cancunDay();
  cloud.today=mkToday({pomodoros:0,penalties:[
    {id:'ext:'+day+':netflix.com',type:'internet',count:30,details:{minutes:30,ext:true,site:'netflix.com'}},
    {id:'m1',type:'internet',count:4,details:{minutes:4}}]});
  const st=await send({type:'check'});
  assert.equal(st.manual,4);                                     // only the entry made by hand
  assert.equal(st.used,4+st.measured);
});

await t('measuring: dismissing the measured time in the app (_extAck) takes it off',async()=>{
  const total=Math.floor(secondsOn('netflix.com'));
  cloud.today=mkToday({pomodoros:0,penalties:[],_extAck:{'netflix.com':total,'x.com':99999}});
  const st=await send({type:'check'});
  assert.equal(st.measured,0);assert.equal(st.blocked,false);
});

await t('measuring: no upload when nothing changed (no needless writes)',async()=>{
  cloud.today=mkToday({pomodoros:0,penalties:[]});
  focus={focused:false,activeUrl:'',idle:'active'};
  await send({type:'check'});
  const n0=cloud.posts.length;
  await send({type:'check'});await send({type:'check'});
  assert.equal(cloud.posts.length,n0);
});

await t('measuring: the table not created yet does not break anything, and still blocks on its own count',async()=>{
  await chrome.storage.local.remove('pushed');
  cloud.tableMissing=true;cloud.rows=[];
  cloud.today=mkToday({pomodoros:0,penalties:[{type:'internet',count:25,details:{minutes:25}}]});
  const posts0=cloud.posts.length;
  focus={focused:true,activeUrl:'https://www.netflix.com/browse',idle:'active'};
  await minutesPass(6);                                    // own measure adds to the 25 by hand
  assert.equal(storage.status.table,'missing');
  assert.equal(storage.status.blocked,true);
  assert.equal(cloud.posts.length,posts0,'it must not keep trying to write to a table that is not there');
  cloud.tableMissing=false;
});

await t('measuring: a new day starts the count again',async()=>{
  await chrome.storage.local.set({measure:{day:'2000-01-01',sites:{'netflix.com':99999},lastAt:Date.now(),lastSite:'netflix.com'}});
  focus={focused:false,activeUrl:'',idle:'active'};
  cloud.rows=[];cloud.today=mkToday();
  await send({type:'check'});
  assert.equal(storage.measure.day,cancunDay());
  assert.ok(secondsOn('netflix.com')<5);
});

await t("measuring: it writes ONLY to its own table, never to Stoic's own record of the day",async()=>{
  const writes=cloud.methods.filter(m=>!m.startsWith('GET '));
  assert.ok(writes.some(m=>m==='POST /rest/v1/procrastination_time'));
  assert.ok(writes.every(m=>m==='POST /rest/v1/procrastination_time'||m.includes('/auth/v1/token')),
    'unexpected write: '+writes.find(m=>m!=='POST /rest/v1/procrastination_time'&&!m.includes('/auth/v1/token')));
  assert.ok(!cloud.methods.some(m=>!m.startsWith('GET ')&&m.includes('stoic_data')));
});
await t('signing out clears the session and any block',async()=>{
  await send({type:'logout'});
  assert.equal(storage.session,undefined);assert.equal(rules.length,0);
});

console.log('\n'+n+' passed');
process.exit(0);
