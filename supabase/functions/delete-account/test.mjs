// Runs the function's logic against a pretend Supabase.   node supabase/functions/delete-account/test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The file is plain JavaScript in a .ts coat; Node needs only the import swapped out.
let src=fs.readFileSync(new URL('./index.ts',import.meta.url),'utf8');
src=src.replace(/import \{ createClient \} from "npm:@supabase\/supabase-js@2";/,'const createClient=()=>null;');
const mod=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const {handle}=mod;

let n=0;
const t=async(name,fn)=>{await fn();n++;console.log('  ok  '+name);};

const mkAdmin=(o={})=>{
  const calls={deletes:[],users:[]};
  const admin={
    calls,
    auth:{
      async getUser(jwt){return jwt==='good'?{data:{user:{id:'user-1'}},error:null}:{data:{user:null},error:{message:'bad jwt'}};},
      admin:{async deleteUser(id){calls.users.push(id);return{error:o.deleteUserError||null};}}
    },
    from(table){
      return{delete(){return{async eq(col,val){
        calls.deletes.push({table,col,val});
        if(o.failTable===table)return{error:{message:'permission denied'}};
        if(o.missing&&o.missing.includes(table))return{error:{message:'relation "public.'+table+'" does not exist'}};
        return{error:null};
      }};}};
    }
  };
  return admin;
};
const req=(method,auth,body)=>new Request('https://x.test/f',{method,headers:auth?{authorization:auth,'content-type':'application/json'}:{},body:method==='POST'?(body||'{}'):undefined});

await t('no token: refused, nothing touched',async()=>{
  const a=mkAdmin();const r=await handle(req('POST',null),a);
  assert.equal(r.status,401);assert.equal(a.calls.deletes.length,0);assert.equal(a.calls.users.length,0);
});
await t('a token the server does not recognise: refused, nothing touched',async()=>{
  const a=mkAdmin();const r=await handle(req('POST','Bearer forged'),a);
  assert.equal(r.status,401);assert.equal(a.calls.deletes.length,0);assert.equal(a.calls.users.length,0);
});
await t('only POST (and the CORS preflight)',async()=>{
  const a=mkAdmin();
  assert.equal((await handle(req('GET','Bearer good'),a)).status,405);
  assert.equal((await handle(req('OPTIONS',null),a)).status,200);
  assert.equal(a.calls.deletes.length,0);
});
await t('a good token deletes that person\'s rows from every table, then the account, once',async()=>{
  const a=mkAdmin();const r=await handle(req('POST','Bearer good'),a);
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
  assert.deepEqual(a.calls.deletes.map(d=>d.table),['stoic_data','stoic_backups','push_subs','push_sent','procrastination_time']);
  assert.ok(a.calls.deletes.every(d=>d.col==='user_id'&&d.val==='user-1'));
  assert.deepEqual(a.calls.users,['user-1']);
});
await t('it deletes by the id the TOKEN proves, never by anything in the request body',async()=>{
  const a=mkAdmin();
  await handle(req('POST','Bearer good',JSON.stringify({user_id:'someone-else',id:'someone-else',email:'victim@x.com'})),a);
  assert.ok(a.calls.deletes.every(d=>d.val==='user-1'));
  assert.deepEqual(a.calls.users,['user-1']);
});
await t('a table that does not exist in this project is skipped, not a failure',async()=>{
  const a=mkAdmin({missing:['push_subs','push_sent','procrastination_time']});
  const r=await handle(req('POST','Bearer good'),a);
  assert.equal(r.status,200);assert.deepEqual(a.calls.users,['user-1']);
});
await t('if data cannot be fully removed the ACCOUNT IS LEFT ALONE and it says which',async()=>{
  const a=mkAdmin({failTable:'stoic_backups'});
  const r=await handle(req('POST','Bearer good'),a);
  assert.equal(r.status,500);
  const b=await r.json();assert.match(b.error,/stoic_backups/);
  assert.equal(a.calls.users.length,0,'the account must not be deleted while data remains');
});
await t('if the account itself cannot be removed it says so (the data is already gone)',async()=>{
  const a=mkAdmin({deleteUserError:{message:'boom'}});
  const r=await handle(req('POST','Bearer good'),a);
  assert.equal(r.status,500);assert.match((await r.json()).error,/no la cuenta/);
});
await t('answers carry the CORS headers the browser needs',async()=>{
  const r=await handle(req('POST',null),mkAdmin());
  assert.equal(r.headers.get('access-control-allow-origin'),'*');
  assert.equal(r.headers.get('content-type'),'application/json');
});
await t('the table list covers every per-person table this project has',async()=>{
  const re=src.match(/const TABLES = \[([^\]]*)\]/)[1];
  for(const tb of ['stoic_data','stoic_backups','push_subs','push_sent','procrastination_time'])assert.ok(re.includes(tb),tb);
});
console.log('\n'+n+' passed');
