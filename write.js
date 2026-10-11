// WRITE. Supabase stores the journal; this browser only displays it.
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WORDS={1:'Awful',2:'Rough',3:'Bad',4:'Meh',5:'Okay',6:'Fine',7:'Good',8:'Great',9:'Excellent',10:'Perfect'};
const PAGE=1000;
const isoDay=d=>{ const x=new Date(d); return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const today=()=>isoDay(new Date());
const parseDay=s=>{ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays=(s,n)=>isoDay(new Date(parseDay(s).getTime()+n*86400000+3600000*6));
const shortDate=s=>parseDay(s).toLocaleDateString([], {month:'short',day:'numeric'});
const longDate=s=>parseDay(s).toLocaleDateString([], {weekday:'long',month:'long',day:'numeric',year:'numeric'});
const medDate=s=>parseDay(s).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric',year:'numeric'});
const words=t=>(t.trim().match(/\S+/g)||[]).length;
const r1=n=>{ const v=Math.round(n*10)/10; return Number.isInteger(v)?String(v):v.toFixed(1); };

let client=null,user=null,busy=false,authSub=null,connecting=null,storageCleanup=null;
let entries=[],range='30',day=today(),rating=0,dirty=false,loadId=0,query='';

function message(id,text,kind=''){ $(id).textContent=text; $(id).className='message'+(kind?' '+kind:''); }

// ---- connection: the two public Supabase settings come from /api/config ----
function projectConfig(v){ const url=typeof v?.url==='string'?v.url.trim().replace(/\/$/,''):'', key=typeof v?.key==='string'?v.key.trim():''; if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('This page needs its Supabase connection set up in Vercel.'); return {url,key}; }
async function connect(){
  if(client)return client; if(connecting)return connecting;
  connecting=(async()=>{ let r; try{ r=await fetch('/api/config',{cache:'no-store'}); }catch{ throw new Error('Could not connect. Check your internet connection and try again.'); }
    if(!r.ok) throw new Error('This page needs its Supabase connection set up in Vercel.'); return makeClient(projectConfig(await r.json())); })();
  try{ return await connecting; } finally{ connecting=null; }
}
function makeClient(config){
  if(!window.supabase) throw new Error('The connection library could not load. Reload the page.');
  const storageKey='write.auth.'+new URL(config.url).hostname, storage=window.localStorage;
  authSub?.unsubscribe(); client?.auth.stopAutoRefresh(); storageCleanup?.();
  client=supabase.createClient(config.url,config.key,{auth:{storage,storageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const mine=client;
  authSub=client.auth.onAuthStateChange((_e,session)=>{ setTimeout(()=>{ if(client!==mine)return; setUser(session&&storage.getItem(storageKey)?session.user:null); },0); }).data.subscription;
  const changed=e=>{ if(client===mine&&e.storageArea===storage&&(e.key===storageKey||e.key===null)&&e.newValue===null)setUser(null); };
  window.addEventListener('storage',changed); storageCleanup=()=>window.removeEventListener('storage',changed);
  return client;
}
function setUser(next){
  if(next?.id===user?.id)return;
  user=next; loadId++; dirty=false;
  $('connect-open').hidden=!!user; $('sign-out').hidden=!user; $('today-open').hidden=!user; $('editor').hidden=!user;
  $('connection-status').textContent=user?'Connected':'Your record'; $('connection-status').classList.toggle('connected',!!user);
  if(!user){ entries=[]; day=today(); render(); $('entries-list').innerHTML='<p class="row-empty">Sign in to read your entries.</p>'; }
  else load();
  window.coachUser?.(user?.id);
}
$('connect-open').onclick=()=>{ $('connection-dialog').showModal(); $('email').focus(); };
$('connect-close').onclick=()=>{ if(!busy)$('connection-dialog').close(); };
$('connection-dialog').addEventListener('cancel',e=>{ if(busy)e.preventDefault(); });
$('connect-form').addEventListener('submit',async e=>{
  e.preventDefault(); if(busy)return; busy=true; $('connect-submit').disabled=true; message('connect-message','Signing in…');
  try{ const db=await connect(); const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if(error)throw error; $('password').value=''; setUser(data.user); $('connection-dialog').close(); message('connect-message',''); }
  catch(err){ message('connect-message',err.message||'Could not sign in.','error'); }
  finally{ busy=false; $('connect-submit').disabled=false; }
});
$('sign-out').onclick=async()=>{ if(!client||busy)return; if(dirty&&!confirm('You have unsaved writing. Sign out anyway?'))return; busy=true; try{ const {error}=await client.auth.signOut({scope:'local'}); if(error)throw error; setUser(null); }catch(err){ message('history-message',err.message,'error'); } finally{ busy=false; } };

// ---- reading all of it, and never some of it ----
async function readAll(make){ const all=[]; let from=0; for(;;){ const {data,error,count}=await make().range(from,from+PAGE-1); if(error)throw error; all.push(...data); from+=data.length; if(from>=count||!data.length)return all; } }
async function load(){
  const id=++loadId; message('history-message','');
  try{
    const db=await connect();
    const rows=await readAll(()=>db.from('journal_entries').select('*',{count:'exact'}).order('written_on',{ascending:false}));
    if(id!==loadId)return;
    entries=rows.map(r=>({...r,rating:Number(r.rating)})).sort((a,b)=>a.written_on<b.written_on?1:-1); render();
  }catch(err){ if(id!==loadId)return; const missing=/relation .* does not exist|schema cache/i.test(err.message||''); message('history-message',missing?'Run setup.sql in your Supabase SQL editor once, then reload.':(err.message||'Could not load your journal.'),'error'); }
}

// ---- derived ----
const byDay=d=>entries.find(e=>e.written_on===d);
function streak(){ let n=0, d=today(); if(!byDay(d)) d=addDays(d,-1); while(byDay(d)){ n++; d=addDays(d,-1); } return n; }
function render(){
  const t=today(), weekStart=addDays(t,-6); const week=entries.filter(e=>e.written_on>=weekStart&&e.written_on<=t);
  const avg=week.length?week.reduce((a,e)=>a+e.rating,0)/week.length:0;
  $('week-avg').textContent=week.length?r1(avg):'—';
  $('week-note').textContent=entries.length?`${week.length} of the last 7 days rated · ${entries.length} entr${entries.length===1?'y':'ies'} total`:'Your first entry starts here.';
  $('side-avg').textContent=week.length?r1(avg):'—'; const s=streak(); $('side-streak').textContent=entries.length?String(s):'—';
  $('tile-streak').textContent=entries.length?String(s):'—'; $('tile-count').textContent=entries.length?String(entries.length):'—';
  const best=entries.length?entries.reduce((a,e)=>e.rating>a.rating||(e.rating===a.rating&&e.written_on>a.written_on)?e:a,entries[0]):null;
  $('tile-best').textContent=best?`${best.rating}/10`:'—'; $('tile-best-note').textContent=best?medDate(best.written_on):'';
  $('tile-words').textContent=entries.length?entries.reduce((a,e)=>a+words(e.body),0).toLocaleString():'—';
  renderEditor(); drawLine(); drawDist(); renderEntries();
}

// ---- the editor: one entry per day ----
function buildStars(){ $('stars').innerHTML=Array.from({length:10},(_,i)=>`<button type="button" class="star" data-star="${i+1}" role="radio" aria-checked="false" aria-label="${i+1} out of 10">★</button>`).join(''); }
buildStars();
function paintStars(n,hover){ $('stars').querySelectorAll('.star').forEach(b=>{ const v=+b.dataset.star; b.classList.toggle('on',v<=n); b.classList.toggle('hover-on',hover!=null&&v<=hover); b.setAttribute('aria-checked',String(v===n)); }); }
function ratingWord(n){ return n?`<b>${n}/10</b> · ${WORDS[n]}`:'Tap a star to rate the day.'; }
$('stars').addEventListener('click',e=>{ const b=e.target.closest('.star'); if(!b)return; rating=+b.dataset.star; dirty=true; paintStars(rating); $('rating-word').innerHTML=ratingWord(rating); });
$('stars').addEventListener('pointerover',e=>{ const b=e.target.closest('.star'); if(b) paintStars(rating,+b.dataset.star); });
$('stars').addEventListener('pointerleave',()=>paintStars(rating));
$('body').addEventListener('input',()=>{ dirty=true; $('editor-note').textContent=`${words($('body').value)} words`; });
function renderEditor(){
  const t=today(), e=byDay(day);
  $('editor-title').textContent=day===t?'How was today?':day===addDays(t,-1)?'How was yesterday?':`How was ${longDate(day)}?`;
  $('day-label').textContent=day===t?'Today':day===addDays(t,-1)?'Yesterday':medDate(day); $('day-next').disabled=day>=t;
  if(!dirty){ rating=e?e.rating:0; $('body').value=e?e.body:''; paintStars(rating); $('rating-word').innerHTML=ratingWord(rating); }
  $('editor-note').textContent=e?`Saved ${new Date(e.updated_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · ${words($('body').value)} words`:(dirty?`${words($('body').value)} words`:'Not written yet.');
  $('save').textContent=e?'Save changes ↗':'Save entry ↗';
}
function goTo(d){ if(dirty&&!confirm('You have unsaved writing on this day. Leave without saving?'))return; dirty=false; day=d; message('save-message',''); renderEditor(); }
$('day-prev').onclick=()=>goTo(addDays(day,-1)); $('day-next').onclick=()=>{ if(day<today()) goTo(addDays(day,1)); };
$('today-open').onclick=()=>{ if(day!==today()) goTo(today()); $('editor').scrollIntoView({behavior:'smooth'}); setTimeout(()=>$('body').focus(),300); };
$('save').onclick=async()=>{
  if(busy||!user)return; if(!rating){ message('save-message','Rate the day first. One star is fine.','error'); return; }
  busy=true; $('save').disabled=true; message('save-message','Saving…');
  try{ const db=await connect(); const row={user_id:user.id,written_on:day,rating,body:$('body').value,updated_at:new Date().toISOString()};
    const {error}=await db.from('journal_entries').upsert(row,{onConflict:'user_id,written_on'}); if(error)throw error;
    dirty=false; message('save-message','Saved.','success'); setTimeout(()=>{ if($('save-message').textContent==='Saved.') message('save-message',''); },2000); await load(); }
  catch(err){ message('save-message',err.message||'Could not save.','error'); }
  finally{ busy=false; $('save').disabled=false; }
};
document.addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&document.activeElement===$('body')){ e.preventDefault(); $('save').click(); } });
window.addEventListener('beforeunload',e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });

// ---- line: rating per day ----
let linePts=[];
function drawLine(){
  const svg=$('line-plot'); const from=addDays(today(),-(Number(range)-1)); const hist=entries.filter(e=>e.written_on>=from).sort((a,b)=>a.written_on<b.written_on?-1:1);
  const has=hist.length>0; $('line-empty').hidden=has; svg.hidden=!has;
  $('line-sub').textContent=has?`Last ${range} days · average ${r1(hist.reduce((a,e)=>a+e.rating,0)/hist.length)} · ${hist.length} rated`:`Last ${range} days`; if(!has){ svg.innerHTML=''; return; }
  const W=700,H=260,L=40,R=16,T=16,B=34;
  const t0=parseDay(from).getTime(), t1=parseDay(today()).getTime(); const span=t1-t0||1;
  const x=d=>L+(parseDay(d).getTime()-t0)/span*(W-L-R); const y=v=>T+(H-T-B)*(1-(v-1)/9);
  linePts=hist.map(e=>({...e,px:x(e.written_on),py:y(e.rating)}));
  // Days you skipped break the line, so a gap reads as a gap and not as a slope.
  let path=''; for(let i=0;i<linePts.length;i++){ const p=linePts[i], prev=linePts[i-1]; path+=(i&&addDays(prev.written_on,1)===p.written_on)?`L${p.px.toFixed(1)} ${p.py.toFixed(1)}`:`M${p.px.toFixed(1)} ${p.py.toFixed(1)}`; }
  const ticks=[1,5,10].map(v=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`).join('');
  const n=Math.max(2,Math.min(7,Number(range)/5)); const xl=Array.from({length:n},(_,i)=>{ const d=addDays(from,Math.round(i*(Number(range)-1)/(n-1))); return `<text x="${x(d)}" y="${H-10}" text-anchor="middle">${esc(shortDate(d))}</text>`; }).join('');
  const dots=linePts.map(p=>`<circle cx="${p.px}" cy="${p.py}" r="4" fill="${p.rating>=7?'#ffd98a':p.rating>=4?'#bdb49f':'#ff9f9f'}" stroke="#0f0d08" stroke-width="2"/>`).join('');
  svg.innerHTML=`${ticks}<line class="axis" x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}"/><path d="${path}" fill="none" stroke="#ffd98a" stroke-width="2" stroke-linejoin="round"/>${dots}${xl}<g id="line-focus"></g><rect class="hit" x="${L}" y="0" width="${W-L-R}" height="${H}"/>`;
}
function lineHover(e){
  if(!linePts.length)return; const svg=$('line-plot'), r=svg.getBoundingClientRect(); const mx=(e.clientX-r.left)/r.width*700;
  let best=linePts[0]; for(const p of linePts) if(Math.abs(p.px-mx)<Math.abs(best.px-mx)) best=p;
  $('line-focus').innerHTML=`<line x1="${best.px}" x2="${best.px}" y1="16" y2="226" stroke="#ffd98a" stroke-opacity=".3"/><circle cx="${best.px}" cy="${best.py}" r="5.5" fill="#fff0cc" stroke="#0f0d08" stroke-width="2"/>`;
  const tip=$('line-tip'), card=$('line-card').getBoundingClientRect(); const snippet=best.body.trim().slice(0,60);
  tip.innerHTML=`${esc(medDate(best.written_on))}<strong>${best.rating}/10 · ${WORDS[best.rating]}</strong>${snippet?esc(snippet)+(best.body.trim().length>60?'…':''):'<span style="color:var(--muted)">no writing</span>'}`;
  tip.style.whiteSpace='normal'; tip.style.maxWidth='240px';
  tip.classList.remove('hidden'); tip.style.left=(r.left-card.left+best.px/700*r.width)+'px'; tip.style.top=(r.top-card.top+best.py/260*r.height)+'px';
}
$('line-plot').addEventListener('pointermove',lineHover); $('line-plot').addEventListener('pointerleave',()=>{ $('line-tip').classList.add('hidden'); const f=$('line-focus'); if(f)f.innerHTML=''; });
$('line-plot').addEventListener('click',e=>{ if(!linePts.length)return; const r=$('line-plot').getBoundingClientRect(); const mx=(e.clientX-r.left)/r.width*700; let best=linePts[0]; for(const p of linePts) if(Math.abs(p.px-mx)<Math.abs(best.px-mx)) best=p; goTo(best.written_on); $('editor').scrollIntoView({behavior:'smooth'}); });

// ---- spread: how often each rating comes up ----
function drawDist(){
  const from=addDays(today(),-(Number(range)-1)); const hist=entries.filter(e=>e.written_on>=from);
  const counts=Array.from({length:10},(_,i)=>hist.filter(e=>e.rating===i+1).length); const max=Math.max(...counts); const has=max>0;
  $('dist-empty').hidden=has; $('dist').hidden=!has; $('dist-sub').textContent=`Last ${range} days · how often each rating comes up`; if(!has){ $('dist').innerHTML=''; return; }
  $('dist').innerHTML=counts.map((c,i)=>`<div><b>${c||''}</b><i class="${c?'':'zero'}" style="height:${c?Math.max(6,Math.round(c/max*110)):3}px" title="${c} day${c===1?'':'s'} rated ${i+1}"></i><span>${i+1}</span></div>`).join('');
}

// ---- entries ----
function renderEntries(){
  const q=query.trim().toLowerCase(); const list=q?entries.filter(e=>e.body.toLowerCase().includes(q)||String(e.rating)===q):entries;
  $('entries-count').textContent=entries.length?(q?`${list.length} of ${entries.length}`:`${entries.length} total`):'';
  if(!entries.length){ $('entries-list').innerHTML='<p class="row-empty">Nothing written yet. Rate today and write a few lines above.</p>'; return; }
  if(!list.length){ $('entries-list').innerHTML='<p class="row-empty">No entries match that.</p>'; return; }
  $('entries-list').innerHTML=list.slice(0,60).map(e=>{ const long=e.body.length>260||e.body.split('\n').length>3; const stars='★'.repeat(e.rating)+'<i>'+'★'.repeat(10-e.rating)+'</i>';
    return `<article class="entry" data-day="${e.written_on}"><div class="entry-head"><b>${esc(medDate(e.written_on))}</b><span class="stars-small" aria-label="${e.rating} out of 10">${stars}</span><div class="ops"><button class="text-button" data-open="${e.written_on}" type="button">Open</button><button class="text-button" data-del="${e.written_on}" type="button">Delete</button></div></div>${e.body.trim()?`<p class="${long?'clamp':''}">${esc(e.body)}</p>${long?`<button class="text-button more" data-more type="button">Read more</button>`:''}`:'<p style="color:var(--muted)">No writing, just the rating.</p>'}</article>`; }).join('')+(list.length>60?`<p class="row-empty">Showing the latest 60. Search to find older ones.</p>`:'');
}
$('search').addEventListener('input',()=>{ query=$('search').value; renderEntries(); });
document.addEventListener('click',async e=>{
  const more=e.target.closest('[data-more]'); if(more){ const p=more.previousElementSibling; const open=p.classList.toggle('clamp'); more.textContent=open?'Read more':'Show less'; return; }
  const b=e.target.closest('button[data-open],button[data-del]'); if(!b||busy)return;
  if(b.dataset.open){ goTo(b.dataset.open); $('editor').scrollIntoView({behavior:'smooth'}); return; }
  const d=b.dataset.del; if(!confirm(`Delete your entry for ${medDate(d)}? This cannot be undone.`))return;
  busy=true; try{ const db=await connect(); const {error}=await db.from('journal_entries').delete().eq('written_on',d); if(error)throw error; if(day===d){ dirty=false; } await load(); } catch(err){ message('history-message',err.message||'Could not delete.','error'); } finally{ busy=false; }
});
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{ range=b.dataset.range; document.querySelectorAll('[data-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); drawLine(); drawDist(); });


// What the coach reads: the last 30 days of ratings and the text of your most recent entries.
function coachSummary(){
  const t=today(); const L=[]; const recent=entries.filter(e=>e.written_on>=addDays(t,-29));
  L.push(`Entries: ${entries.length} total, ${recent.length} in the last 30 days. Current streak ${streak()} days. Average rating last 30 days: ${recent.length?r1(recent.reduce((a,e)=>a+e.rating,0)/recent.length):'none'}.`);
  L.push('Ratings by day, last 30 days: '+recent.slice().sort((a,b)=>a.written_on<b.written_on?-1:1).map(e=>`${e.written_on} ${e.rating}`).join(', ')+'.');
  L.push('\nMost recent entries, newest first:');
  for(const e of entries.slice(0,10)) L.push(`${e.written_on} (${e.rating}/10, ${WORDS[e.rating]}): ${e.body.trim()?e.body.trim().slice(0,700).replace(/\s+/g,' ')+(e.body.length>700?'…':''):'(no writing)'}`);
  return L.join('\n');
}
window.coach={app:'write',note:'The coach also reads the text of your last ten entries.',userId:async()=>user?.id||null,session:async()=>{ try{ const db=await connect(); const {data:{session}}=await db.auth.getSession(); return session?.access_token||null; }catch{ return null; } },summary:coachSummary};
// Reconnect a saved session, if any.
render();
connect().catch(()=>{});
})();
