import {STOIC_URL} from './config.js';
import {fmtMin,freeMinsFor,FREE_MINS_BASE,FREE_MINS_POMS} from './logic.js';

const q=new URLSearchParams(location.search);
const site=q.get('site')||'';
const back=q.get('back')||'';
const $=id=>document.getElementById(id);

$('site').textContent=site?site+' está bloqueado ahora mismo.':'';
$('open').onclick=()=>{location.href=STOIC_URL;};

// Where to go once it lifts: the exact page that was open, or the site itself.
function destination(){
  if(back&&/^https?:\/\//i.test(back))return back;
  return site?'https://'+site+'/':'';
}

async function paint(){
  const {status:st}=await chrome.storage.local.get('status');
  if(!st){$('nums').textContent='—';return;}
  if(st.reason==='login'){
    $('title').textContent='Falta iniciar sesión';
    $('nums').textContent='!';
    $('nums').className='big warn';
    $('detail').textContent='Abre las opciones de la extensión e inicia sesión con tu cuenta de Stoic.';
    $('how').textContent='';
    return;
  }
  if(!st.blocked){
    // Time came back — a pomodoro landed, or the day turned over.
    const to=destination();
    if(to)location.replace(to);
    return;
  }
  $('nums').textContent=fmtMin(st.used)+' de '+fmtMin(st.allowed);
  $('detail').textContent='Tu tiempo de procrastinación de hoy ya llegó a lo que te dan tus pomodoros ('+st.poms+' hoy).';
  // How many more pomodoros it takes for the allowance to pass what is logged.
  let need=0;
  for(let p=st.poms;p<=st.poms+400;p=Math.round((p+0.1)*10)/10){
    if(freeMinsFor(p)>st.used){need=Math.round((p-st.poms)*10)/10;break;}
  }
  $('how').textContent=need>0
    ?'Te faltan '+(Number.isInteger(need)?need:need.toFixed(1))+' pomodoro(s) más para que se abra. Pasados los '
      +FREE_MINS_POMS+', cada uno suma '+(FREE_MINS_BASE/FREE_MINS_POMS)+' minutos.'
    :'';
}

$('recheck').onclick=async()=>{
  $('recheck').disabled=true;
  try{await chrome.runtime.sendMessage({type:'check'});}catch(e){}
  await paint();
  $('recheck').disabled=false;
};
paint();
setInterval(paint,5000);
chrome.storage.onChanged.addListener((ch,area)=>{if(area==='local'&&ch.status)paint();});
