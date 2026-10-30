// Run:  node extension/test/logic.test.mjs
import assert from 'node:assert/strict';
import {freeMinsFor,pomsToUnblock,penMinutes,computeBudget,measuredMinutes,siteOf,pickSite,advance,sumMeasured,MAX_GAP_SEC,normaliseSite,normaliseSites,hostBlocked,buildRules,DEFAULT_SITES,fmtMin} from '../logic.js';

let n=0;
const t=(name,fn)=>{fn();n++;console.log('  ok  '+name);};

// ---- the allowance: the rest the day's pomodoros earned (default 25-5-25-5-25-5-25-15)
const CUSTOM={brk:10,longBrk:30,cycle:2};
t('allowance: 0 pomodoros is the flat 30',()=>assert.equal(freeMinsFor(0),30));
t('allowance: 1..3 pomodoros earn 5/10/15 but the floor holds',()=>{for(const p of [1,2,3])assert.equal(freeMinsFor(p),30);});
t('allowance: 4 pomodoros = 3 short + 1 long = 30',()=>assert.equal(freeMinsFor(4),30));
t('allowance: 5 -> 35, 8 -> 60, 12 -> 90, 20 -> 150 (15 short + 5 long)',()=>{
  assert.equal(freeMinsFor(5),35);assert.equal(freeMinsFor(8),60);assert.equal(freeMinsFor(12),90);assert.equal(freeMinsFor(20),150);
});
t('allowance: part of a pomodoro pays part of its break (4.5 -> 32.5 -> 33)',()=>assert.equal(freeMinsFor(4.5),33));
t('allowance: undefined is safe',()=>assert.equal(freeMinsFor(undefined),30));
t('allowance: follows the breaks set on the timer (10 short / 30 long / every 2nd)',()=>{
  assert.equal(freeMinsFor(4,CUSTOM),80);      // 2 short + 2 long
  assert.equal(freeMinsFor(3,CUSTOM),50);      // short 10, long 30, short 10
});
t('allowance: nonsense settings fall back to the defaults instead of breaking',()=>{
  assert.equal(freeMinsFor(20,{brk:'x',longBrk:null,cycle:0}),150);
  assert.equal(freeMinsFor(20,{brk:-5,longBrk:NaN,cycle:'4'}),150);
});

// ---- minutes logged
t('minutes: details.minutes wins, count is the fallback, other rewards ignored',()=>{
  const d={penalties:[
    {type:'internet',details:{minutes:10}},
    {type:'internet',count:5},
    {type:'drugs',count:3},
    {type:'internet',details:{minutes:0},count:7}]};
  assert.equal(penMinutes(d,'internet'),10+5+7);
});
t('minutes: no penalties',()=>assert.equal(penMinutes({},'internet'),0));

// ---- the decision
const day='2026-10-29';
const at=new Date('2026-10-29T18:00:00Z');                // still the 29th in Cancún (UTC-5)
const today=(o)=>({_date:day,_tz:'America/Cancun',pomodoros:0,penalties:[],...o});
const mins=m=>[{type:'internet',details:{minutes:m}}];

t('budget: nothing logged -> not blocked, 30 left',()=>{
  const b=computeBudget(today(),at);
  assert.equal(b.blocked,false);assert.equal(b.left,30);assert.equal(b.used,0);
});
t('budget: 29 of 30 -> not blocked',()=>assert.equal(computeBudget(today({penalties:mins(29)}),at).blocked,false));
t('budget: exactly 30 of 30 -> blocked ("equal or more")',()=>assert.equal(computeBudget(today({penalties:mins(30)}),at).blocked,true));
t('budget: 45 of 30 -> blocked, 0 left',()=>{
  const b=computeBudget(today({penalties:mins(45)}),at);
  assert.equal(b.blocked,true);assert.equal(b.left,0);
});
t('budget: pomodoros unblock it (45 min used, 16 pomodoros = 120 allowed)',()=>{
  const b=computeBudget(today({penalties:mins(45),pomodoros:16}),at);
  assert.equal(b.blocked,false);assert.equal(b.allowed,120);assert.equal(b.left,75);
});
t('budget: a pomodoro lands and the block lifts (30 used, 12 pomodoros -> 90)',()=>{
  assert.equal(computeBudget(today({penalties:mins(30),pomodoros:0}),at).blocked,true);
  assert.equal(computeBudget(today({penalties:mins(30),pomodoros:12}),at).blocked,false);
});
t("budget: the day's own break lengths (today._pomoCfg) are the ones used",()=>{
  const b=computeBudget(today({penalties:mins(30),pomodoros:4,_pomoCfg:CUSTOM}),at);
  assert.equal(b.allowed,80);assert.equal(b.blocked,false);
});
t('needPoms: 0 whenever nothing is blocking',()=>{
  assert.equal(computeBudget(today(),at).needPoms,0);
  assert.equal(computeBudget(today({penalties:mins(29)}),at).needPoms,0);
  assert.equal(pomsToUnblock(10,0),0);
});
t('needPoms: 30 of 30 with none done -> 5 (4 only reach 30, 5 reach 35)',()=>{
  assert.equal(computeBudget(today({penalties:mins(30)}),at).needPoms,5);
});
t('needPoms: counts what is MISSING, not the total (45 used, 4 done -> 8 total -> 4 more)',()=>{
  assert.equal(computeBudget(today({penalties:mins(45),pomodoros:4}),at).needPoms,4);
});
t('needPoms: follows the break settings (30 used, 0 done, custom: 2 reach 40)',()=>{
  assert.equal(computeBudget(today({penalties:mins(30),_pomoCfg:CUSTOM}),at).needPoms,2);
});
t('needPoms: finishing exactly that many always lifts the block, and one fewer never does',()=>{
  for(const cfg of [undefined,CUSTOM,{brk:3,longBrk:20,cycle:3}]){
    for(let used=30;used<=300;used++){
      for(const have of [0,1,3,7,8,12,20]){
        if(freeMinsFor(have,cfg)>used)continue;
        const n=pomsToUnblock(used,have,cfg);
        assert.ok(n>=1,'blocked => at least 1');
        assert.ok(freeMinsFor(have+n,cfg)>used,'used '+used+' have '+have+' +'+n+' must lift');
        assert.ok(freeMinsFor(have+n-1,cfg)<=used,'used '+used+' have '+have+' +'+(n-1)+' must not lift');
      }
    }
  }
});t("budget: yesterday's record is a day with nothing on it",()=>{
  const b=computeBudget(today({_date:'2026-10-28',penalties:mins(99),pomodoros:20}),at);
  assert.equal(b.current,false);assert.equal(b.blocked,false);assert.equal(b.used,0);assert.equal(b.allowed,30);
});
t('budget: no record at all',()=>{
  const b=computeBudget(null,at);
  assert.equal(b.blocked,false);assert.equal(b.allowed,30);
});
t("budget: the day is Stoic's (Cancún), not UTC — 02:00 UTC on the 30th is still the 29th there",()=>{
  const late=new Date('2026-10-30T02:00:00Z');
  assert.equal(computeBudget(today({penalties:mins(40)}),late).blocked,true);
});
t('budget: ...and 06:00 UTC on the 30th is the 30th in Cancún, so the 29th is over',()=>{
  const next=new Date('2026-10-30T06:00:00Z');
  assert.equal(computeBudget(today({penalties:mins(40)}),next).blocked,false);
});
t('budget: respects the time zone stored on the record',()=>{
  const tokyo=today({_tz:'Asia/Tokyo',_date:'2026-10-30',penalties:mins(40)});
  assert.equal(computeBudget(tokyo,new Date('2026-10-29T18:00:00Z')).blocked,true);   // already the 30th in Tokyo
});
t('budget: a bad time zone falls back instead of throwing',()=>{
  assert.doesNotThrow(()=>computeBudget(today({_tz:'Not/AZone'}),at));
});

// ---- sites
t('sites: what people type',()=>{
  assert.equal(normaliseSite('https://www.Netflix.com/browse?x=1'),'netflix.com');
  assert.equal(normaliseSite('  Web.WhatsApp.com '),'web.whatsapp.com');
  assert.equal(normaliseSite('instagram.com/'),'instagram.com');
  assert.equal(normaliseSite('localhost:3000'),'');
  assert.equal(normaliseSite('hola'),'');
  assert.equal(normaliseSite(''),'');
  assert.equal(normaliseSite('x.com:443/foo'),'x.com');
});
t('sites: list is cleaned and de-duplicated',()=>{
  assert.deepEqual(normaliseSites(['Netflix.com','https://netflix.com/x','','???','tiktok.com']),['netflix.com','tiktok.com']);
});
t('hostBlocked: exact, subdomain, and not look-alikes',()=>{
  const s=['netflix.com','web.whatsapp.com'];
  assert.equal(hostBlocked('netflix.com',s),true);
  assert.equal(hostBlocked('www.netflix.com',s),true);
  assert.equal(hostBlocked('help.netflix.com',s),true);
  assert.equal(hostBlocked('notnetflix.com',s),false);
  assert.equal(hostBlocked('netflix.com.evil.io',s),false);
  assert.equal(hostBlocked('web.whatsapp.com',s),true);
  assert.equal(hostBlocked('whatsapp.com',s),false);     // only the web client was listed
});
t('rules: one redirect per site, main page only, unique ids',()=>{
  const r=buildRules(['netflix.com','x.com']);
  assert.equal(r.length,2);
  assert.deepEqual(r.map(x=>x.id),[1,2]);
  assert.deepEqual(r[0].condition,{requestDomains:['netflix.com'],resourceTypes:['main_frame']});
  assert.equal(r[0].action.type,'redirect');
  assert.equal(r[0].action.redirect.extensionPath,'/blocked.html?site=netflix.com');
});
t('rules: nothing to block, nothing to add',()=>assert.deepEqual(buildRules([]),[]));
t('default list: valid, no duplicates, has the two asked for',()=>{
  assert.deepEqual(normaliseSites(DEFAULT_SITES),DEFAULT_SITES);
  assert.ok(DEFAULT_SITES.includes('web.whatsapp.com')&&DEFAULT_SITES.includes('netflix.com'));
});
t('fmtMin',()=>{
  assert.equal(fmtMin(0),'0 min');assert.equal(fmtMin(12),'12 min');assert.equal(fmtMin(60),'1 h');assert.equal(fmtMin(65),'1 h 5 min');
});


// ---- measured time counts too
t('measured: whole minutes, rounded down per site',()=>{
  assert.equal(measuredMinutes({'netflix.com':119,'x.com':61}),1+1);
  assert.equal(measuredMinutes({'netflix.com':59}),0);
  assert.equal(measuredMinutes({}),0);assert.equal(measuredMinutes(null),0);
});
t('measured: what was dismissed in the app (_extAck) is not counted again',()=>{
  assert.equal(measuredMinutes({'netflix.com':600},{'netflix.com':300}),5);
  assert.equal(measuredMinutes({'netflix.com':600},{'netflix.com':900}),0);
});
t('budget: measured time adds to what was logged by hand, so it blocks without the app being opened',()=>{
  const b=computeBudget(today({penalties:mins(10)}),at,{'netflix.com':20*60});
  assert.equal(b.used,30);assert.equal(b.blocked,true);assert.equal(b.manual,10);assert.equal(b.measured,20);
});
t('budget: 29 min measured + 0 by hand is not yet blocked, 30 is',()=>{
  assert.equal(computeBudget(today(),at,{'netflix.com':29*60+59}).blocked,false);
  assert.equal(computeBudget(today(),at,{'netflix.com':30*60}).blocked,true);
});
t("budget: the entries the app made FROM the measurements are not counted twice",()=>{
  const imported=[{type:'internet',count:20,details:{minutes:20,ext:true,site:'netflix.com'}},{type:'internet',details:{minutes:5}}];
  const b=computeBudget(today({penalties:imported}),at,{'netflix.com':20*60});
  assert.equal(b.manual,5);assert.equal(b.measured,20);assert.equal(b.used,25);
});
t('budget: dismissing a measured entry in the app lowers it (the ack travels on today)',()=>{
  const b=computeBudget(today({_extAck:{'netflix.com':20*60}}),at,{'netflix.com':25*60});
  assert.equal(b.measured,5);
});
t("budget: measurements from another day are not today's (ack and all ignored for a stale record)",()=>{
  const b=computeBudget(today({_date:'2000-01-01',_extAck:{'netflix.com':99999}}),at,{'netflix.com':10*60});
  assert.equal(b.measured,10);
});
t('penMinutes: excludeExt leaves out only the imported entries',()=>{
  const d={penalties:[{type:'internet',count:7,details:{minutes:7,ext:true}},{type:'internet',count:3,details:{minutes:3}}]};
  assert.equal(penMinutes(d,'internet'),10);assert.equal(penMinutes(d,'internet',true),3);
});

// ---- which site is in use
const S=['netflix.com','web.whatsapp.com','x.com'];
t('siteOf: subdomain, www, look-alike, junk',()=>{
  assert.equal(siteOf('https://www.netflix.com/browse',S),'netflix.com');
  assert.equal(siteOf('https://web.whatsapp.com/',S),'web.whatsapp.com');
  assert.equal(siteOf('https://notnetflix.com/',S),null);
  assert.equal(siteOf('chrome://extensions',S),null);
  assert.equal(siteOf('',S),null);assert.equal(siteOf(undefined,S),null);
});
t('in use: the front tab of the front window, with the person at the computer',()=>{
  assert.equal(pickSite({windowFocused:true,idleState:'active',activeUrl:'https://netflix.com/x',audibleUrls:[]},S),'netflix.com');
});
t('not in use: another application in front (window not focused), silent',()=>{
  assert.equal(pickSite({windowFocused:false,idleState:'active',activeUrl:'https://netflix.com/x',audibleUrls:[]},S),null);
});
t('not in use: idle at the computer and silent (left the tab open and walked away)',()=>{
  assert.equal(pickSite({windowFocused:true,idleState:'idle',activeUrl:'https://netflix.com/x',audibleUrls:[]},S),null);
  assert.equal(pickSite({windowFocused:true,idleState:'locked',activeUrl:'https://netflix.com/x',audibleUrls:[]},S),null);
});
t('in use: a film playing counts even when idle, locked or in another window',()=>{
  assert.equal(pickSite({windowFocused:false,idleState:'idle',activeUrl:'https://example.com',audibleUrls:['https://www.netflix.com/watch/1']},S),'netflix.com');
});
t('not in use: a sound from a site that is not on the list',()=>{
  assert.equal(pickSite({windowFocused:true,idleState:'active',activeUrl:'https://example.com',audibleUrls:['https://open.spotify.com']},S),null);
});
t('in use: the front tab wins over an audible one',()=>{
  assert.equal(pickSite({windowFocused:true,idleState:'active',activeUrl:'https://x.com',audibleUrls:['https://netflix.com']},S),'x.com');
});

// ---- crediting the time
const D='2026-10-29';
t('advance: credits the time since the last look to what was in use at that look',()=>{
  let m=advance(null,1000,'netflix.com',D);              // first look: nothing to credit yet
  assert.deepEqual(m.sites,{});
  m=advance(m,1000+30000,'netflix.com',D);               // 30 s later, still there
  assert.equal(m.sites['netflix.com'],30);
  m=advance(m,1000+60000,null,D);                        // another 30 s, now left
  assert.equal(m.sites['netflix.com'],60);
  m=advance(m,1000+90000,null,D);                        // nothing in use: nothing credited
  assert.equal(m.sites['netflix.com'],60);
});
t('advance: a switch is credited to what you were on, not what you went to',()=>{
  let m=advance(null,0,'netflix.com',D);
  m=advance(m,10000,'x.com',D);                          // 10 s on netflix, then x
  m=advance(m,25000,null,D);                             // 15 s on x
  assert.equal(m.sites['netflix.com'],10);assert.equal(m.sites['x.com'],15);
});
t('advance: a long gap (the computer slept) credits at most MAX_GAP_SEC',()=>{
  let m=advance(null,0,'netflix.com',D);
  m=advance(m,3*3600*1000,'netflix.com',D);
  assert.equal(m.sites['netflix.com'],MAX_GAP_SEC);
});
t('advance: a new day starts from zero',()=>{
  let m=advance(null,0,'netflix.com',D);m=advance(m,30000,'netflix.com',D);
  m=advance(m,60000,'netflix.com','2026-10-30');
  assert.deepEqual(m.sites,{});assert.equal(m.day,'2026-10-30');
});
t('advance: does not mutate what it was given',()=>{
  const a=advance(null,0,'netflix.com',D);const snap=JSON.stringify(a);
  advance(a,30000,'netflix.com',D);
  assert.equal(JSON.stringify(a),snap);
});
t('sumMeasured: browsers add up, and this one uses its fresher local copy',()=>{
  const rows=[{site:'netflix.com',seconds:100,device:'chrome'},{site:'netflix.com',seconds:50,device:'edge'},{site:'x.com',seconds:10,device:'edge'}];
  const out=sumMeasured(rows,'chrome',{'netflix.com':130.7});
  assert.equal(out['netflix.com'],50+130);assert.equal(out['x.com'],10);
});
console.log('\n'+n+' passed');
