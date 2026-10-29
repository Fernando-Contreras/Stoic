// Run:  node extension/test/logic.test.mjs
import assert from 'node:assert/strict';
import {freeMinsFor,penMinutes,computeBudget,normaliseSite,normaliseSites,hostBlocked,buildRules,DEFAULT_SITES,fmtMin} from '../logic.js';

let n=0;
const t=(name,fn)=>{fn();n++;console.log('  ok  '+name);};

// ---- the allowance, exactly as Stoic computes it
t('allowance: 0 pomodoros is the flat 30',()=>assert.equal(freeMinsFor(0),30));
t('allowance: 8 pomodoros is still 30 (it is the floor)',()=>assert.equal(freeMinsFor(8),30));
t('allowance: 12 buys 45',()=>assert.equal(freeMinsFor(12),45));
t('allowance: 16 buys 60',()=>assert.equal(freeMinsFor(16),60));
t('allowance: half pomodoros round (10 -> 38)',()=>assert.equal(freeMinsFor(10),38));
t('allowance: undefined is safe',()=>assert.equal(freeMinsFor(undefined),30));

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
t('budget: pomodoros unblock it (45 min used, 16 pomodoros = 60 allowed)',()=>{
  const b=computeBudget(today({penalties:mins(45),pomodoros:16}),at);
  assert.equal(b.blocked,false);assert.equal(b.allowed,60);assert.equal(b.left,15);
});
t('budget: a pomodoro lands and the block lifts (30 used, 12 pomodoros -> 45)',()=>{
  assert.equal(computeBudget(today({penalties:mins(30),pomodoros:0}),at).blocked,true);
  assert.equal(computeBudget(today({penalties:mins(30),pomodoros:12}),at).blocked,false);
});
t("budget: yesterday's record is a day with nothing on it",()=>{
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

console.log('\n'+n+' passed');
