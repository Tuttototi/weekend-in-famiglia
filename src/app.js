import {people,rotation,colors,plus,dow,friday,localToday,overlaps,id,initial,normalize,planned,weekend,eventsOn,dayPlan,report} from './model.js';
import {download,parse} from './excel.js';
import {connect} from './cloud.js';
import {connectCloudflare} from './cloudflare.js';
const $=s=>document.querySelector(s);
const app=$('#app'), dialog=$('#dialog');
const storage='nicolina.calendar.v1';
const today=localToday();
const cloudflare=window.FAMILY_CLOUDFLARE===true;
let cloudError, state, revision=0, user=null, cloud=null, ready=false, saving=false, view='Calendario', month=today.slice(0,7), tabActor='Toti', editRevision;
let range=[today.slice(0,4)+'-01-01',today.slice(0,4)+'-12-31'];
const reportHeaders=['Persona','Weekend passati','Weekend previsti','Giorni con copertura','Giorni extra','Festività','Ponti'];
const weekdays=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
const dt=(s,options)=>new Intl.DateTimeFormat('it-IT',{timeZone:'UTC',...options}).format(new Date(s.length===7?s+'-01':s));
const fullDate=s=>dt(s,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const fmt=s=>dt(s,{day:'numeric',month:'short'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opts=(items,selected)=>items.map(x=>'<option'+(x===selected?' selected':'')+'>'+esc(x)+'</option>').join('');
const tag=(p,compact=false)=>'<span class="tag '+(colors[people.indexOf(p)]||'open')+'">'+(compact?'<span class="full">'+esc(p||'Da coprire')+'</span><span class="short">'+esc(p?p.slice(0,2):'!')+'</span>':esc(p||'Da coprire'))+'</span>';
const btn=(text,action,cls='')=>'<button type="button" class="'+cls+'" data-action="'+action+'">'+text+'</button>';
const canEdit=()=>!cloud||user?.editor;
const actor=()=>user?.name||tabActor;
const canEditExtra=()=>!cloud||Boolean(user&&(cloudflare||user.editor));
const canEditSlot=slot=>slot?.type==='Extra'?canEditExtra()&&slot.person===actor():Boolean(slot&&canEdit());
const editButton=(t,a,c)=>canEdit()?btn(t,a,c):'';
const field=(caption,name,type,value='',properties='required')=>'<label>'+caption+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+properties+'></label>';
const select=(caption,name,items,value)=>'<label>'+caption+'<select name="'+name+'">'+opts(items,value)+'</select></label>';
const table=(head,rows)=>'<div class="scroll"><table><thead><tr>'+head.map(v=>'<th scope="col">'+v+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
function local(){
 try{const saved=JSON.parse(localStorage.getItem(storage));return saved?{...saved,state:normalize(saved.state)}:{state:initial(),revision:0}}
 catch{return {state:initial(),revision:0}}
}
function notice(message){$('#notice').textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').textContent='',5500)}
function showDialog(title,html,submit,action='Salva'){
 editRevision=revision;
 dialog.innerHTML='<div class="heading"><h2>'+title+'</h2>'+btn('Chiudi','close')+'</div>'+(!submit?html:'<form>'+html+'<p class="form-error" role="alert" hidden></p><button class="primary">'+action+'</button></form>');
 if(!dialog.open)dialog.showModal();
 const form=dialog.querySelector('form');
 if(form&&submit)form.onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  const feedback=form.querySelector('.form-error');
  if(feedback)feedback.hidden=true;
  try{await submit(Object.fromEntries(new FormData(form)),form)}catch(error){if(feedback){feedback.textContent=error.message;feedback.hidden=false}else notice(error.message)}finally{button.disabled=false}
 };
}
async function save(change,details,mutate,allowed=canEdit()){
 if(!allowed||saving)throw Error('Modifica non disponibile.');
 if(editRevision!==revision||(!cloud&&local().revision!==revision))throw Error('Il calendario è cambiato. Chiudi e riapri la modifica.');
 const draft=structuredClone(state);
 mutate(draft);
 draft.audit.unshift({when:new Date().toISOString(),actor:user?.name||tabActor,action:change,details});
 saving=true;
 try{
  if(cloud)await cloud.save(draft,revision,change,details);
  else {localStorage.setItem(storage,JSON.stringify({state:draft,revision:revision+1}));state=draft;revision++}
  dialog.close(); render(); notice('Modifica salvata');
 }finally{saving=false}
}
function render(){
 $('#account').innerHTML=cloud?(user?esc(user.name)+(cloudflare?'':' '+btn('Esci','logout')):''):'<label class="subtle"><span class="profile-label">Profilo locale</span><select aria-label="Profilo locale" id="actor">'+opts(people,tabActor)+'</select></label>';
 if(!ready&&cloudflare){
  app.innerHTML='<section class="panel"><h1>Calendario di Nicolina</h1><p>'+esc(cloudError||'Caricamento del calendario condiviso…')+'</p></section>';return;
 }
 if(!ready){
  app.innerHTML='<section class="panel"><h1>Calendario di Nicolina</h1><p>'+(user?'Caricamento del calendario…':'Accedi con il tuo account familiare.')+'</p>'+(!user?btn('Accedi','login','primary'):'')+'</section>';return;
 }
 let f=friday(today);
 if(weekend(state,f).end<today)f=plus(f,7);
 const next=weekend(state,f);
 const upcoming=Array.from({length:3},(_,i)=>dayPlan(state,plus(f,i)));
 const assigned=[...new Set(upcoming.map(d=>d.person))];
 const title=assigned.join(', ');
 const navigation=[['Calendario','Calendario','▦'],['Riepilogo','Riepilogo','▥'],['Rotazioni','Turni','↻'],['Excel e storico','Dati','▤']];
 app.innerHTML='<nav class="nav" aria-label="Sezioni">'+navigation.map(([key,label,icon])=>'<button type="button" data-action="view:'+key+'" '+(view===key?'class="active" aria-current="page"':'')+'><span aria-hidden="true">'+icon+'</span>'+label+'</button>').join('')+'</nav>'+
 (view==='Calendario'?'<section class="hero"><div><p class="eyebrow">'+(f<=today?'Questo weekend':'Prossimo weekend')+'</p><h1>'+esc(title)+'</h1><p>'+fmt(next.start)+' – '+fmt(next.end)+'</p></div><div class="week-strip" aria-label="Giorni del prossimo turno">'+upcoming.map(d=>'<button type="button" class="'+colors[people.indexOf(d.person)]+'" data-action="day:'+d.day+'" aria-label="'+esc(fullDate(d.day)+' · '+d.person)+'"><span>'+dt(d.day,{weekday:'short'})+'</span><strong>'+Number(d.day.slice(-2))+'</strong></button>').join('')+'</div></section>':'')+
 '<section class="panel">'+({Calendario:calendar,Riepilogo:summary,Rotazioni:rules,'Excel e storico':dataPage}[view])()+'</section>';
}
function calendar(){
 const first=month+'-01', startPad=(dow(first)+6)%7;
 const next=new Date(first+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
 const count=Number(plus(next.toISOString().slice(0,10),-1).slice(-2));
 const cells=Array.from({length:count},(_,i)=>{
  const d=plus(first,i), {person,special,type}=dayPlan(state,d);
  const color=colors[people.indexOf(person)]||'open';
  const hint=special.map(e=>e.label).join(', ');
  return '<button type="button" aria-label="'+esc(fullDate(d)+' · '+(person||'Da coprire')+' · '+type+(hint?' · '+hint:''))+'" '+(d===today?'aria-current="date" ':'')+'class="day '+color+'" data-action="day:'+d+'"><strong>'+(i+1)+'</strong><span class="full">'+esc(person||'Da coprire')+'</span><span class="short">'+esc(person?person.slice(0,2):'!')+'</span>'+(special.length?'<span class="event-dot" aria-hidden="true"></span>':'')+'</button>';
 });
 return '<div class="heading calendar-heading"><h2>'+dt(month,{month:'long',year:'numeric'})+'</h2><div class="controls"><button class="month-button" type="button" aria-label="Mese precedente" data-action="prev">‹</button>'+btn('Oggi','today')+'<button class="month-button" type="button" aria-label="Mese successivo" data-action="next">›</button></div></div>'+
 '<div class="calendar">'+weekdays.map(x=>'<span class="weekday">'+x+'</span>').join('')+'<span class="empty"></span>'.repeat(startPad)+cells.join('')+'</div><div class="legend">'+[...people,''].map(p=>tag(p)).join('')+'</div>'+
 '<div class="row calendar-actions">'+(canEditExtra()?btn('+ Il mio extra','slot','primary'):'')+editButton('Sostituzione','substitution')+editButton('Ferie e feste','event')+'</div>';
}
function summary(){
 const r=report(state,...range);
 const rows=r.rows.map(x=>[tag(x.person==='Da coprire'?'':x.person),x.weekends.size,x.planned.size,x.days.size,x.extras.size,x.holidays.size,x.bridges.size]);
 const cards=rows.map(([name,...values])=>'<article class="summary-card">'+name+'<dl>'+values.map((v,i)=>'<div><dt>'+reportHeaders[i+1]+'</dt><dd>'+v+'</dd></div>').join('')+'</dl></article>').join('');
 const detail=table(['Data','Persona','Tipo','Eventi'],r.detail.map(x=>[dt(x.day,{day:'numeric',month:'short',year:'numeric'}),tag(x.person),x.type,esc(x.special.map(e=>e.label).join(', '))]));
 return '<div class="heading"><h2>Riepilogo</h2><div class="no-print row">'+btn('Stampa / PDF','print','primary')+btn('Esporta Excel','export')+'</div></div>'+
 '<form class="period no-print" id="period">'+field('Dal','from','date',range[0])+field('Al','to','date',range[1])+'<button>Applica</button></form><p class="report-print">'+esc(fullDate(range[0]))+' – '+esc(fullDate(range[1]))+'</p>'+
 '<div class="summary-table">'+table(reportHeaders,rows)+'</div><div class="summary-cards">'+cards+'</div>'+
 '<details class="detail"><summary>Dettaglio per data</summary>'+detail+'</details>';
}
function rules(){
 return '<div class="heading"><h2>Rotazioni e scambi</h2><div class="row">'+editButton('Cambia rotazione','rule','primary')+editButton('Scambia weekend','swap')+'</div></div>'+
 '<div class="stack">'+state.rules.toSorted((a,b)=>b.from.localeCompare(a.from)).map(r=>'<article><div class="entry"><div><strong>'+esc(r.id==='base'?'Rotazione di base':fullDate(r.from))+'</strong><div class="muted">'+esc(r.id==='base'?'Riferimento '+r.from:r.to?'Fino al '+r.to:'A tempo indeterminato')+'</div></div><div class="row">'+editButton('Modifica','rule:'+encodeURIComponent(r.id))+(r.id==='base'?'':editButton('Elimina','remove:rules:'+encodeURIComponent(r.id)))+'</div></div><p class="row">'+r.sequence.map(p=>tag(p)).join('')+'</p></article>').join('')+'</div>'+
 '<p class="muted">Il 18 dicembre 2026 è un riferimento di esempio. Modifica il riferimento di base con i dati effettivi.</p><h3>Eccezioni dei weekend</h3>'+state.swaps.toSorted((a,b)=>a.date.localeCompare(b.date)).map(x=>'<div class="entry">'+esc(fullDate(x.date))+' '+tag(x.person||planned(state,x.date))+'<div class="row">'+editButton('Ripristina','remove:swaps:'+x.date)+'</div></div>').join('');
}
function dataPage(){
 return '<div class="heading"><h2>Excel e storico</h2><div class="row">'+btn('Scarica modello','template')+btn('Esporta Excel','export','primary')+editButton('Importa Excel','import')+'</div></div>'+
 '<p class="muted">L’esportazione include le configurazioni, la cronologia e il riepilogo del periodo selezionato. L’importazione mostra un’anteprima prima di aggiornare il calendario.</p><h3>Cronologia modifiche</h3>'+
 (state.audit.length?table(['Quando','Chi','Operazione','Dettagli'],state.audit.map(x=>[esc(new Date(x.when).toLocaleDateString('it-IT',{timeZone:'Europe/Rome'})),esc(x.actor),esc(x.action),esc(x.details)])):'<p class="muted">Nessuna modifica registrata.</p>');
}
function dayDialog(d){
 const entry=dayPlan(state,d);
 showDialog(esc(fullDate(d)),'<div class="entry">'+tag(entry.person)+'<span>'+entry.type+'</span></div>'+
 eventsOn(state,d).map(e=>'<div class="entry"><span>'+esc(e.label)+'</span> '+editButton('Modifica','event:'+encodeURIComponent(e.id))+'</div>').join('')+
 '<p class="row">'+(entry.extra
  ? (canEditSlot(state.slots.find(slot=>slot.id===entry.extra))?btn('Modifica copertura','editSlot:'+encodeURIComponent(entry.extra),'primary'):'')
  : (canEditExtra()?btn('Aggiungi il mio extra','slot:'+d,'primary'):'')+editButton('Sostituzione','substitution:'+d))+'</p>');
}
function slotDialog(d,old,type=old?.type||'Extra'){
 const extra=type==='Extra';
 const allowed=()=>old?canEditSlot(old):extra?canEditExtra():canEdit();
 if(!allowed())return;
 const current=d||today;
 showDialog(old?'Modifica '+type.toLowerCase():extra?'Il mio extra':'Nuova sostituzione',
 field('Dal','start','date',old?.start||current)+field('Al','end','date',old?.end||current)+
 (extra?'<p class="muted">A nome di '+esc(actor())+'</p>':select('Persona','person',people,old?.person||actor()))+
 field('Nota','note','text',old?.note,'maxlength="200"')+
 (old?btn('Elimina copertura','removeSlot:'+encodeURIComponent(old.id)):''),
 x=>{
  const person=extra?actor():x.person;
  return save('Copertura '+type,person+' · '+fmt(x.start)+(x.start!==x.end?' – '+fmt(x.end):''),s=>{
   if(x.start>x.end)throw Error('La fine deve essere uguale o successiva all’inizio.');
   const next=s.slots.filter(y=>y.id!==old?.id);
   if(next.some(y=>overlaps(x,y)))throw Error('Una delle date ha già una copertura.');
   s.slots=[...next,{...x,id:old?.id||id(),person,type}];
  },allowed());
 });
 const form=dialog.querySelector('form');
 form.elements.start.onchange=()=>{if(form.elements.end.value<form.elements.start.value)form.elements.end.value=form.elements.start.value};
}
function eventDialog(old){
 showDialog(old?'Modifica evento':'Ferie, ponti e festività',field('Dal','from','date',old?.from||today)+field('Al','to','date',old?.to||today)+select('Tipo','type',['Ferie','Ponte','Festività','Chiusura'],old?.type)+field('Titolo','label','text',old?.label,'required maxlength="120"')+(old?editButton('Elimina evento','remove:events:'+encodeURIComponent(old.id)):''),
 x=>save('Evento '+x.type,x.label+' · '+x.from+' – '+x.to,s=>{
  if(x.from>x.to)throw Error('Controlla le date.');
  s.events=[...s.events.filter(e=>e.id!==old?.id),{id:old?.id||id(),...x}];
 }));
}
function upsertWeekend(s,date,person){
 s.swaps=[...s.swaps.filter(x=>x.date!==date),{date,person}];
}
function swapDialog(){
 const f=friday(today);
 showDialog('Scambia due weekend',field('Primo venerdì','one','date',f)+field('Secondo venerdì','two','date',plus(f,7))+'<p id="swap-preview" class="muted"></p>',
 x=>save('Scambio weekend',x.one+' ↔ '+x.two,s=>{
  if(x.one===x.two||[x.one,x.two].some(d=>dow(d)!==5))throw Error('Scegli due venerdì diversi.');
  const a=weekend(s,x.one),b=weekend(s,x.two);
  if(a.person===b.person)throw Error('I due weekend hanno la stessa persona.');
  upsertWeekend(s,x.one,b.person);
  upsertWeekend(s,x.two,a.person);
 }));
 const form=dialog.querySelector('form');
 form.oninput=()=>{const a=form.elements.one.value,b=form.elements.two.value;$('#swap-preview').textContent=a&&b&&dow(a)===5&&dow(b)===5?weekend(state,a).person+' ↔ '+weekend(state,b).person:'Scegli due venerdì.'};
 form.oninput();
}
function ruleDialog(old){
 const seq=[...(old?.sequence||rotation)];
 const renderSeq=()=>{$('#sequence').innerHTML=seq.map((p,i)=>'<span class="row">'+tag(p)+btn('−','seqremove:'+i)+'</span>').join('')};
 const preview=()=>{
  const form=dialog.querySelector('form'), d=form.elements.from.value;
  if(!d||dow(d)!==5||!seq.length){$('#preview').textContent='Scegli un venerdì e almeno una persona.';return}
  const s=structuredClone(state);
  const to=form.elements.to?.value||'';
  s.rules=[...s.rules.filter(r=>r.id!==old?.id),{id:old?.id||'preview',from:d,to,sequence:seq}];
  $('#preview').innerHTML=Array.from({length:6},(_,i)=>{const f=plus(d,i*7),custom=s.swaps.find(x=>x.date===f);return '<div>'+dt(f,{day:'numeric',month:'short'})+' '+tag(planned(s,f))+(custom?.person?' · già concordato con '+esc(custom.person):'')+'</div>'}).join('');
 };
 showDialog('Componi il ciclo',field('Da venerdì','from','date',old?.from||plus(friday(today),7))+(old?.id==='base'?'':field('Ultimo venerdì, facoltativo','to','date',old?.to,'') )+
 '<div id="sequence" class="row"></div><div class="row">'+rotation.map(p=>btn('+ '+p,'seqadd:'+p)).join('')+'</div><div id="preview"></div>',
 x=>save('Rotazione aggiornata',x.from+' · '+seq.join(' → '),s=>{
  if(!seq.length||dow(x.from)!==5||(x.to&&(dow(x.to)!==5||x.to<x.from)))throw Error('Controlla venerdì di inizio/fine e sequenza.');
  if(s.rules.some(r=>r.from===x.from&&r.id!==old?.id))throw Error('Esiste già una rotazione da questa data.');
  s.rules=[...s.rules.filter(r=>r.id!==old?.id),{id:old?.id||id(),from:x.from,to:x.to||'',sequence:seq}];
 }));
 dialog.seq=(action,value)=>{
  if(action==='seqadd')seq.push(value);
  else seq.splice(Number(value),1);
  renderSeq();preview();
 };
 dialog.querySelector('form').oninput=preview;
 renderSeq();preview();
}
function importDialog(){
 showDialog('Importa Excel','<label>File Excel<input name="file" type="file" accept=".xlsx,.xls" required></label><p class="muted">Usa il modello dell’app. I record con la stessa chiave vengono aggiornati.</p>',async (_,form)=>{
  const fromRevision=editRevision;
  const result=await parse(form.elements.file.files[0],state);
  if(fromRevision!==revision)throw Error('Il calendario è cambiato. Rileggi il file.');
  const otherExtra=slot=>slot.type==='Extra'&&slot.person!==actor();
  const comparable=slot=>[slot.id,slot.start,slot.end,slot.person,slot.type,slot.note||''];
  const extras=calendar=>JSON.stringify(calendar.slots.filter(otherExtra).toSorted((a,b)=>a.id.localeCompare(b.id)).map(comparable));
  if(extras(state)!==extras(result.copy))throw Error('Il file aggiunge o modifica extra di altri familiari. Importa soltanto i tuoi extra.');
  showDialog('Conferma importazione','<p>'+result.counts.map(esc).join(' · ')+'</p>',()=>save('Importazione Excel',result.counts.join(', '),s=>Object.assign(s,result.copy)),'Importa');
 },'Mostra anteprima');
}
app.addEventListener('submit',e=>{
 if(e.target.id!=='period')return;
 e.preventDefault();const x=Object.fromEntries(new FormData(e.target));
 if(x.to<x.from||(Date.parse(x.to)-Date.parse(x.from))/86400000>1095){notice('Scegli un periodo da 1 giorno a 3 anni.');return}
 range=[x.from,x.to];render();
});
document.addEventListener('change',e=>{if(e.target.id==='actor')tabActor=e.target.value});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-action]');if(!button)return;
 const [action,raw,rawKey]=button.dataset.action.split(':');
 const value=decodeURIComponent(raw||''), key=decodeURIComponent(rawKey||'');
 try{
  if(action==='close'){dialog.close();return}
  if(action==='login'){showDialog('Accesso famiglia',field('Email','email','email')+field('Password','password','password'),async x=>{await cloud.signIn(x.email,x.password);dialog.close()},'Entra');return}
  if(action==='logout'){await cloud.signOut();return}
  if(!ready)return;
  if(action==='view'){view=value;render();return}
  if(action==='today'){month=today.slice(0,7);render();return}
  if(action==='prev'||action==='next'){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+(action==='next'?1:-1));month=d.toISOString().slice(0,7);render();return}
  if(action==='day'){dayDialog(value);return}
  if(action==='template'){download();return}
  if(action==='export'){download(state,range);return}
  if(action==='print'){const detail=app.querySelector('.detail');const wasOpen=detail.open;detail.open=true;window.addEventListener('afterprint',()=>{detail.open=wasOpen},{once:true});window.print();return}
  if(action==='slot'){slotDialog(value);return}
  if(action==='substitution'){slotDialog(value,undefined,'Sostituzione');return}
  if(action==='editSlot'){const slot=state.slots.find(x=>x.id===value);if(slot)slotDialog(null,slot);return}
  if(action==='removeSlot'){
   const slot=state.slots.find(x=>x.id===value);
   if(canEditSlot(slot))showDialog('Conferma rimozione','<p>La modifica sarà registrata nello storico.</p>',()=>save('Rimozione copertura',slot.person+' · '+fmt(slot.start),s=>{s.slots=s.slots.filter(x=>x.id!==value)},canEditSlot(slot)),'Rimuovi');
   return;
  }
  if(!canEdit())return;
  if(action==='event')eventDialog(state.events.find(x=>x.id===value));
  if(action==='swap')swapDialog();
  if(action==='rule')ruleDialog(state.rules.find(x=>x.id===value));
  if(action.startsWith('seq'))dialog.seq(action,value);
  if(action==='import')importDialog();
  if(action==='remove'){
   showDialog('Conferma rimozione','<p>La modifica sarà registrata nello storico.</p>',()=>save('Rimozione',value+' · '+key,s=>{s[value]=s[value].filter(x=>x[value==='swaps'?'date':'id']!==key)}),'Rimuovi');
  }
 }catch(error){notice(error.message)}
});
if(cloudflare){
 cloud=connectCloudflare({
  onData:x=>{user=x.user;revision=x.revision;state=normalize(x.state);ready=true;cloudError=undefined;render()},
  onError:x=>{if(cloudError===x.message)return;cloudError=x.message;if(ready)notice(x.message);else render()}
 });
}else if(window.FAMILY_FIREBASE){
 cloud=connect(window.FAMILY_FIREBASE,{initial,onIdentity:x=>{user=x;ready=false;state=null;render()},onData:x=>{revision=x.revision;state=normalize(x.state);ready=true;render()},onError:x=>notice(x.message)});
}else{
 ({state,revision}=local());ready=true;
 window.addEventListener('storage',e=>{if(e.key===storage){({state,revision}=local());render()}});
}
render();
