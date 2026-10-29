import {normaliseSite,normaliseSites,DEFAULT_SITES,fmtMin} from './logic.js';

const $=id=>document.getElementById(id);
const store=chrome.storage.local;

async function paintAccount(){
  const {session}=await store.get('session');
  $('loggedOut').hidden=!!session;
  $('loggedIn').hidden=!session;
  if(session)$('who').textContent=session.email||'tu cuenta';
}
async function paintState(){
  const {status:st}=await store.get('status');
  const e=$('state');
  if(!st){e.textContent='Todavía no se ha revisado.';return;}
  if(st.reason==='login'){e.textContent='Sin sesión: no se bloquea nada.';return;}
  const base=fmtMin(st.used)+' gastados de '+fmtMin(st.allowed)+' ('+st.poms+' pomodoros hoy). ';
  const verdict=st.blocked?'BLOQUEADO.':'Te quedan '+fmtMin(st.left)+'.';
  const off=st.ok===false?' (sin conexión: dato posiblemente viejo)':'';
  e.textContent=base+verdict+off;
}
async function paintSites(){
  const {sites}=await store.get('sites');
  $('sites').value=(Array.isArray(sites)?sites:DEFAULT_SITES).join('\n');
}

$('login').onclick=async()=>{
  $('err').textContent='';
  $('login').disabled=true;
  const r=await chrome.runtime.sendMessage({type:'login',email:$('email').value,password:$('pass').value});
  $('login').disabled=false;
  if(r&&r.ok){$('pass').value='';await paintAccount();await paintState();}
  else $('err').textContent=(r&&r.error)||'No se pudo iniciar sesión';
};
$('pass').addEventListener('keydown',e=>{if(e.key==='Enter')$('login').click();});
$('logout').onclick=async()=>{
  await chrome.runtime.sendMessage({type:'logout'});
  await paintAccount();await paintState();
};
$('check').onclick=async()=>{
  $('check').disabled=true;
  try{await chrome.runtime.sendMessage({type:'check'});}catch(e){}
  await paintState();
  $('check').disabled=false;
};
$('save').onclick=async()=>{
  const lines=$('sites').value.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean);
  const clean=normaliseSites(lines);
  const skipped=lines.filter(l=>!normaliseSite(l));
  await store.set({sites:clean});
  $('sites').value=clean.join('\n');
  $('skipped').textContent=skipped.length?'No reconocí: '+skipped.join(', '):'';
  $('saved').textContent='Guardado';
  setTimeout(()=>{$('saved').textContent='';},2000);
};
$('reset').onclick=async()=>{
  await store.set({sites:DEFAULT_SITES});
  await paintSites();
  $('skipped').textContent='';
};
store.onChanged.addListener((ch,area)=>{
  if(area!=='local')return;
  if(ch.status)paintState();
  if(ch.session)paintAccount();
});

paintAccount();paintState();paintSites();
