'use strict';

const STORAGE_KEY = 'scrollguard-ai-v1';
const defaultState = {
  profile: { name:'', age:'', profession:'', usage:0, platforms:[], habits:[] },
  settings: { theme:'dark', voice:true, goal:2, demo:true },
  challenge: { completed:[] },
  score:72,
  chat: []
};

let state = loadState();
let usageChart = null;
let timer = { remaining:0, total:0, interval:null, warned:false, running:false };

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

function loadState(){
  try { return merge(defaultState, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); }
  catch { return structuredClone(defaultState); }
}
function merge(base, incoming){
  return { ...structuredClone(base), ...incoming,
    profile:{...base.profile,...(incoming.profile||{})}, settings:{...base.settings,...(incoming.settings||{})}, challenge:{...base.challenge,...(incoming.challenge||{})}, chat:Array.isArray(incoming.chat)?incoming.chat:[] };
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function initials(name){ return name ? name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase() : 'SG'; }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2600); }
function go(id){ document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}); $('#mainNav')?.classList.remove('open'); $('#mobileNavToggle')?.setAttribute('aria-expanded','false'); }

function calculateScore(){
  const p=state.profile; const usage=Number(p.usage)||0; const goal=Number(state.settings.goal)||2;
  let score=92 - usage*7;
  const penalties={bedtime:5,meals:3,notifications:4,multitask:6};
  (p.habits||[]).forEach(h=>score-=penalties[h]||0);
  if((p.habits||[]).includes('breaks')) score+=5;
  if((p.habits||[]).includes('goal')) score+=4;
  if(usage<=goal) score+=7; else if(usage>goal*1.5) score-=5;
  return clamp(Math.round(score),20,98);
}
function level(score){ return score>=78?'Low':score>=55?'Moderate':'High'; }
function summary(score){ return score>=78?'Your current pattern looks relatively balanced.':score>=55?'Your usage is workable, with a few attention habits worth improving.':'Your usage pattern suggests it may help to add clearer stopping points and screen breaks.'; }
function observations(){
  const p=state.profile, h=p.habits||[], out=[];
  if(Number(p.usage)>=4) out.push(['High daily exposure',`About ${p.usage} hours/day is a meaningful amount of discretionary screen time.`]);
  else if(Number(p.usage)>=2) out.push(['Steady exposure',`Your estimated ${p.usage} hours/day gives you a useful baseline to work from.`]);
  else out.push(['Lower exposure',`Your reported daily use is relatively contained.`]);
  if(h.includes('bedtime')) out.push(['Bedtime check-ins','Try creating a 30-minute phone-free wind-down window.']);
  if(h.includes('multitask')) out.push(['Context switching','A short focus block can reduce the urge to switch between tasks.']);
  if(h.includes('notifications')) out.push(['Notification loop','Batching non-essential notifications may reduce repeated checking.']);
  if(h.includes('breaks')) out.push(['Break habit','You already report intentional breaks — keep that routine visible.']);
  if(out.length<4) out.push(['Next experiment','Use the 15-minute session timer once today and notice what changes.']);
  return out.slice(0,4);
}
function recommendation(){
  const prof=state.profile.profession||'';
  const map={
    'CSE / AI & Data Science':['Build before browse.','Try a 25-minute coding or ML reading block before opening social apps.'],
    'Engineering':['One problem, one block.','Choose one technical problem and work on it for 20 minutes without social notifications.'],
    'Medical / Healthcare':['Protect your study block.','Use a short timer for focused reading, then take a deliberate break.'],
    'Business / Management':['Batch the checking.','Set two specific windows for social updates instead of checking continuously.'],
    'Design / Creative':['Create before consume.','Spend 20 minutes making something before opening inspiration feeds.'],
    'Teacher / Educator':['Deep-work first.','Finish one teaching task before checking social notifications.'],
    'Working Professional':['Close the loop.','Use a focused 15-minute session before your next message/feed check.']
  };
  return map[prof]||['Create one intentional screen break.','Use the timer to create a small, visible stopping point in your day.'];
}

function renderDashboard(){
  state.score=calculateScore();
  const p=state.profile, s=state.score, lvl=level(s);
  $('#dashScore').textContent=s; $('#progressScore').textContent=s; $('#heroScore').textContent=s;
  $('#scoreBar').style.width=s+'%'; $('#heroRing').style.background=`conic-gradient(var(--accent) 0 ${s}%,rgba(255,255,255,.06) ${s}% 100%)`;
  $('#usageLevel').textContent=lvl; $('#usageSummary').textContent=summary(s);
  $('#dashName').textContent=p.name||'ScrollGuard Explorer'; $('#dashAvatar').textContent=initials(p.name); $('#profileQuick').textContent=initials(p.name);
  $('#dashProfession').textContent=p.profession||'Set up your profile to personalize this view.';
  $('#dashUsage').textContent=(Number(p.usage)||0)+'h'; $('#dashPlatforms').textContent=(p.platforms||[]).length; $('#dashGoal').textContent=state.settings.goal+'h';
  $('#heroInsight').textContent=s>=78?'Your attention has room to breathe.':s>=55?'Your attention can use a clearer boundary.':'Your attention deserves a stronger stopping routine.';
  const list=observations(); $('#insightList').innerHTML=list.map(([t,d])=>`<div class="insight-item"><strong>${escapeHTML(t)}</strong><span>${escapeHTML(d)}</span></div>`).join('');
  const [rt,rd]=recommendation(); $('#recommendationTitle').textContent=rt; $('#recommendationText').textContent=rd;
  const improvement=state.challenge.completed.length ? Math.min(24,state.challenge.completed.length*4) : 0;
  $('#progressImprovement').textContent='+'+improvement+'%';
  renderChallenge(); renderChart();
  save();
}
function escapeHTML(v){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function renderChart(){
  const canvas=$('#usageChart'); if(!canvas||!window.Chart) return;
  const usage=Number(state.profile.usage)||2; const values=[usage*.9,usage*1.05,usage*.82,usage*1.2,usage*.96,usage*1.1,usage*.76].map(v=>Number(v.toFixed(1)));
  if(usageChart) usageChart.destroy();
  usageChart=new Chart(canvas,{type:'line',data:{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],datasets:[{data:values,borderColor:'#70f0b2',backgroundColor:'rgba(112,240,178,.08)',fill:true,tension:.38,pointRadius:3,pointBackgroundColor:'#70f0b2',pointBorderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{displayColors:false,callbacks:{label:c=>` ${c.parsed.y}h`}}},scales:{x:{grid:{display:false},ticks:{color:'#91aaa1',font:{size:10}}},y:{beginAtZero:true,grid:{color:'rgba(185,255,227,.07)'},ticks:{color:'#91aaa1',font:{size:9},callback:v=>v+'h'}}}}});
}

const challengeTasks=[
  ['Phone-free first 15','Keep your first 15 minutes after waking screen-light.'],
  ['One focused block','Complete one 20-minute task before checking social feeds.'],
  ['Mute one trigger','Turn off one non-essential social notification.'],
  ['Meal without scrolling','Choose one meal where your phone stays away.'],
  ['Evening boundary','Create a 30-minute screen-light wind-down window.'],
  ['Intentional check','Open a social app only after deciding what you want to do there.'],
  ['Reflect & reset','Write one sentence about what helped your attention this week.']
];
function renderChallenge(){
  const done=state.challenge.completed||[]; const pct=Math.round(done.length/7*100);
  $('#challengePercent').textContent=pct+'%'; $('#streakCount').textContent=done.length; $('#progressDays').textContent=`${done.length}/7`; $('#progressStreak').textContent=done.length; $('#streakBar').style.width=pct+'%';
  $('#challengeList').innerHTML=challengeTasks.map((t,i)=>{const is=done.includes(i);return `<div class="challenge-item ${is?'done':''}"><div class="day-badge">D${i+1}</div><div><h3>${escapeHTML(t[0])}</h3><p>${escapeHTML(t[1])}</p></div><button class="complete-btn" data-day="${i}">${is?'✓ Done':'Complete'}</button></div>`}).join('');
  $$('.complete-btn').forEach(b=>b.addEventListener('click',()=>toggleChallenge(Number(b.dataset.day))));
}
function toggleChallenge(day){ const done=new Set(state.challenge.completed||[]); if(done.has(day)) done.delete(day); else done.add(day); state.challenge.completed=[...done].sort((a,b)=>a-b); save(); renderDashboard(); toast(done.has(day)?`Day ${day+1} completed — keep the momentum.`:`Day ${day+1} marked incomplete.`); }

function applySettings(){
  document.body.classList.toggle('light',state.settings.theme==='light');
  ['themeToggle','themeQuickToggle'].forEach(id=>document.getElementById(id)?.setAttribute('aria-checked',state.settings.theme==='light'?'true':'false'));
  $('#themeToggle').setAttribute('aria-checked',state.settings.theme==='light'?'true':'false'); $('#voiceToggle').setAttribute('aria-checked',state.settings.voice?'true':'false'); $('#demoToggle').setAttribute('aria-checked',state.settings.demo?'true':'false'); $('#goalInput').value=state.settings.goal;
}

function fillForm(){ const p=state.profile; $('#name').value=p.name||''; $('#age').value=p.age||''; $('#profession').value=p.profession||''; $('#usage').value=p.usage||''; $$('#platforms input').forEach(x=>x.checked=(p.platforms||[]).includes(x.value)); $$('#habits input').forEach(x=>x.checked=(p.habits||[]).includes(x.value)); }
function validateProfile(){
  let ok=true; const fields=[['name',v=>v.trim().length>=2,'Enter your name.'],['age',v=>Number(v)>=13&&Number(v)<=100,'Enter an age from 13 to 100.'],['profession',v=>!!v,'Select your profession or study field.'],['usage',v=>Number(v)>=0&&Number(v)<=24,'Enter usage from 0 to 24 hours.']];
  fields.forEach(([id,test,msg])=>{const input=$('#'+id),e=$(`[data-error="${id}"]`); if(!test(input.value)){e.textContent=msg;ok=false}else e.textContent='';});
  const platforms=$$('#platforms input:checked'); const pe=$('[data-error="platforms"]'); if(!platforms.length){pe.textContent='Select at least one platform.';ok=false}else pe.textContent=''; return ok;
}
$('#profileForm').addEventListener('submit',e=>{e.preventDefault(); if(!validateProfile()){toast('Please fix the highlighted fields.'); return;} state.profile={name:$('#name').value.trim(),age:$('#age').value,profession:$('#profession').value,usage:Number($('#usage').value),platforms:$$('#platforms input:checked').map(x=>x.value),habits:$$('#habits input:checked').map(x=>x.value)}; save(); renderDashboard(); toast('Profile saved — your signals are updated.'); go('dashboard'); });

function timerDuration(){ return state.settings.demo?15:900; }
function updateTimerUI(){ const mins=Math.floor(timer.remaining/60), secs=timer.remaining%60; $('#timerDisplay').textContent=`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`; const pct=timer.total?timer.remaining/timer.total:1; $('#timerRing').style.background=`conic-gradient(var(--accent) 0 ${pct*100}%,rgba(255,255,255,.06) ${pct*100}% 100%)`; $('#timerStart').disabled=timer.running||timer.remaining<=0; $('#timerPause').disabled=!timer.running; }
function startTimer(){ if(timer.running)return; if(timer.remaining<=0)timer.remaining=timerDuration(); if(!timer.total)timer.total=timerDuration(); timer.running=true; $('#timerStatus').textContent=state.settings.demo?'Demo session running — 15 seconds.':'Focus session running — stay intentional.'; updateTimerUI(); timer.interval=setInterval(tick,1000); }
function tick(){ timer.remaining--; if(!timer.warned && timer.remaining<=Math.max(5,Math.floor(timer.total*.1)) && timer.remaining>0){timer.warned=true; warnUser();} if(timer.remaining<=0){clearInterval(timer.interval);timer.interval=null;timer.running=false;$('#timerStatus').textContent='Session complete. Take a breath before opening another feed.'; speak('Your ScrollGuard session is complete. Take a breath.'); showModal(true); toast('Session complete — nice work.');} updateTimerUI(); }
function pauseTimer(){ if(!timer.running)return; clearInterval(timer.interval);timer.interval=null;timer.running=false;$('#timerStatus').textContent='Paused. Resume when ready.';updateTimerUI(); }
function resetTimer(){clearInterval(timer.interval);timer={remaining:timerDuration(),total:timerDuration(),interval:null,warned:false,running:false};$('#timerStatus').textContent='Ready when you are.';updateTimerUI();}
function speak(text){ if(state.settings.voice && 'speechSynthesis' in window){window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));} }
function warnUser(){ $('#warningText').textContent=state.settings.demo?'Your demo session is almost finished. Choose what you want to do next.':'Your session is nearly finished. Decide intentionally whether you want to continue.'; showModal(); speak('Your session is nearly finished.'); }
function showModal(completed=false){$('#warningModal').classList.add('open');$('#warningModal').setAttribute('aria-hidden','false');$('#warningTitle').textContent=completed?'Session complete':'Your session is nearly done';$('#modalDismiss').textContent=completed?'Close':'Keep going';}
function hideModal(){ $('#warningModal').classList.remove('open');$('#warningModal').setAttribute('aria-hidden','true'); }
$('#timerStart').addEventListener('click',startTimer); $('#timerPause').addEventListener('click',pauseTimer); $('#timerReset').addEventListener('click',resetTimer); $('#modalDismiss').addEventListener('click',hideModal); $('#modalStop').addEventListener('click',()=>{hideModal();resetTimer();});

const coachRules=[
  [/reduce|less|scroll|screen time/i, 'Try a small boundary rather than a perfect one: pick one 15-minute block today where the social apps stay closed.'],
  [/focus|study|work|concentrat/i, 'Make the first 20 minutes friction-free: silence non-essential notifications, put the phone out of reach, and start one clearly defined task.'],
  [/bed|sleep|night|evening/i, 'A simple wind-down cue can help: choose a 30-minute screen-light window before bed and keep the phone physically away.'],
  [/challenge|task|start/i, 'Start with Day 1 of the challenge: keep your first 15 minutes after waking screen-light. Small experiments create useful evidence.'],
  [/stress|overwhel|tired/i, 'Pause before changing anything. Take one slow breath, step away from the feed, and choose one offline activity for five minutes.'],
];
const coachFallback='I can help you explore a small digital-wellbeing experiment. Tell me whether your main challenge is scrolling, focus, notifications, bedtime use, or starting a new habit.';
function coachReply(msg){ const hit=coachRules.find(([r])=>r.test(msg)); return hit?hit[1]:coachFallback; }
function addChat(role,text){ state.chat.push({role,text}); state.chat=state.chat.slice(-30); save(); renderChat(); }
function renderChat(){ const log=$('#chatLog'); if(!state.chat.length) state.chat=[{role:'coach',text:'Hi! I’m your ScrollGuard demo coach. What would you like to change about your digital routine?'}]; log.innerHTML=state.chat.map(m=>`<div class="bubble ${m.role}">${escapeHTML(m.text)}</div>`).join(''); log.scrollTop=log.scrollHeight; }
$('#chatForm').addEventListener('submit',e=>{e.preventDefault();const input=$('#chatInput');const msg=input.value.trim();if(!msg)return;addChat('user',msg);setTimeout(()=>addChat('coach',coachReply(msg)),280);input.value='';});
$$('.quick-prompts button').forEach(b=>b.addEventListener('click',()=>{$('#chatInput').value=b.dataset.prompt;$('#chatForm').requestSubmit();})); $('#clearChat').addEventListener('click',()=>{state.chat=[];save();renderChat();});

$('#themeToggle').addEventListener('click',()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';save();applySettings();}); $('#themeQuickToggle').addEventListener('click',()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';save();applySettings();});
$('#voiceToggle').addEventListener('click',()=>{state.settings.voice=!state.settings.voice;save();applySettings();toast(state.settings.voice?'Voice warnings enabled.':'Voice warnings disabled.');}); $('#demoToggle').addEventListener('click',()=>{state.settings.demo=!state.settings.demo;save();resetTimer();applySettings();toast(state.settings.demo?'Demo timer enabled (15 seconds).':'Full 15-minute timer enabled.');});
$('#goalInput').addEventListener('change',e=>{state.settings.goal=clamp(Number(e.target.value)||2,.5,24);e.target.value=state.settings.goal;save();renderDashboard();toast('Daily goal updated.');});
$('#resetAll').addEventListener('click',()=>{if(confirm('Reset all ScrollGuard AI data stored in this browser?')){localStorage.removeItem(STORAGE_KEY);state=loadState();applySettings();fillForm();resetTimer();renderDashboard();renderChat();toast('All local data has been reset.');go('home');}});
$('#refreshInsights').addEventListener('click',()=>{renderDashboard();toast('Attention signals refreshed.');});
$('#mobileNavToggle').addEventListener('click',()=>{const nav=$('#mainNav'),open=nav.classList.toggle('open');$('#mobileNavToggle').setAttribute('aria-expanded',String(open));});
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
$$('.nav a').forEach(a=>a.addEventListener('click',()=>$('#mainNav').classList.remove('open')));

const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.08}); $$('.reveal').forEach(el=>observer.observe(el));

fillForm(); applySettings(); resetTimer(); renderDashboard(); renderChat();
