import {fmtMin} from './logic.js';

const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};

async function paint(){
  const {status:st}=await chrome.storage.local.get('status');
  const m=$('main');m.replaceChildren();
  if(!st){m.append(el('p','dim','Revisando…'));return;}
  if(st.reason==='login'){
    m.append(el('div','big warn','Falta sesión'));
    m.append(el('p','sm dim','Abre Opciones e inicia sesión con tu cuenta de Stoic.'));
    return;
  }
  if(st.ok===false&&st.reason==='net'&&!st.used&&!st.allowed){
    m.append(el('div','big warn','Sin conexión'));
    m.append(el('p','sm dim','No pude leer Stoic. No se bloquea nada mientras no sepa.'));
    return;
  }
  m.append(el('div','big '+(st.blocked?'no':'ok'),st.blocked?'Bloqueado':fmtMin(st.left)+' libres'));
  const bar=el('div','bar'+(st.blocked?' over':''));
  const fill=document.createElement('i');
  fill.style.width=Math.min(100,Math.round(st.used/Math.max(1,st.allowed)*100))+'%';
  bar.append(fill);m.append(bar);
  m.append(el('p','sm dim',fmtMin(st.used)+' gastados de '+fmtMin(st.allowed)+' · '+st.poms+' pomodoros hoy'));
  if(st.measured)m.append(el('p','sm dimmer','🧩 '+fmtMin(st.measured)+' medidos en tus sitios'+(st.manual?' + '+fmtMin(st.manual)+' que registraste':'')));
  if(st.table==='missing')m.append(el('p','sm warn','Falta crear la tabla en Supabase: el tiempo medido solo cuenta en este navegador.'));
  if(st.ok===false)m.append(el('p','sm warn','Sin conexión: este dato puede no estar al día.'));
}

$('now').onclick=async()=>{
  $('now').disabled=true;
  try{await chrome.runtime.sendMessage({type:'check'});}catch(e){}
  await paint();
  $('now').disabled=false;
};
$('opts').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener((ch,area)=>{if(area==='local'&&ch.status)paint();});
paint();
