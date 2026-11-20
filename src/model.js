export const people=['Toti','Enza','Nicolò','Giovanna'];
export const rotation=people.slice(0,3);
export const colors=['toti','enza','nicolo','giovanna'];
export const DAY=86400000, WEEK=7*DAY;
export const date=n=>new Date(n).toISOString().slice(0,10);
export const stamp=s=>Date.parse(s+'T00:00:00Z');
export const plus=(s,n)=>date(stamp(s)+n*DAY);
export const dow=s=>new Date(stamp(s)).getUTCDay();
export const friday=s=>plus(s,-((dow(s)+2)%7));
export const localToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
export const overlaps=(a,b)=>a.start<=b.end&&b.start<=a.end;
export const id=()=>crypto.randomUUID();
const start2026='2026-12-18';
const marks=[
 ['2026-12-07','2026-12-07','Ponte','Ponte dell’Immacolata'],
 ['2026-12-08','2026-12-08','Festività','Immacolata'],
 ['2026-12-23','2027-01-06','Ferie','Ferie di Nicolina · esempio'],
 ['2026-12-25','2026-12-26','Festività','Natale e Santo Stefano'],
 ['2027-01-01','2027-01-01','Festività','Capodanno'],
 ['2027-01-06','2027-01-06','Festività','Epifania'],
 ['2027-02-11','2027-02-12','Chiusura','Carnevale ambrosiano'],
 ['2027-03-22','2027-03-22','Festività','Festa del patrono'],
 ['2027-03-23','2027-03-24','Ponte','Ponte di Pasqua'],
 ['2027-03-25','2027-03-30','Chiusura','Vacanze scolastiche di Pasqua'],
 ['2027-03-28','2027-03-29','Festività','Pasqua e Lunedì dell’Angelo'],
 ['2027-06-02','2027-06-02','Festività','Festa della Repubblica']
];
export function initial(seed){return {rules:[{id:'base',from:start2026,to:'',sequence:rotation}],swaps:[],slots:[],events:marks.map(([from,to,type,label],index)=>({id:seed?seed+'-event-'+index:id(),from,to,type,label})),audit:[]}}
export function planned(state,f){
 const rule=state.rules.filter(r=>r.from<=f&&(!r.to||r.to>=f)).sort((a,b)=>a.from.localeCompare(b.from)).at(-1)??state.rules.find(r=>r.id==='base');
 const offset=Math.round((stamp(f)-stamp(rule.from))/WEEK);
 return rule.sequence[((offset%rule.sequence.length)+rule.sequence.length)%rule.sequence.length];
}
export function dayRange(start,end){
 return {start:start.slice(0,10),end:end.endsWith('T00:00')?plus(end.slice(0,10),-1):end.slice(0,10)};
}
export function normalize(state){
 const {settings, ...calendar}=state;
 const slots=[];
 for(const slot of calendar.slots.toSorted((a,b)=>a.start.localeCompare(b.start))){
  let remaining=[{...slot,...dayRange(slot.start,slot.end)}];
  for(const assigned of slots){
   remaining=remaining.flatMap(part=>{
    if(!overlaps(part,assigned))return [part];
    return [
     ...(part.start<assigned.start?[{...part,end:plus(assigned.start,-1)}]:[]),
     ...(part.end>assigned.end?[{...part,start:plus(assigned.end,1)}]:[])
    ];
   });
  }
  slots.push(...remaining.map((part,i)=>i?{...part,id:slot.id+'-'+part.start}:part));
 }
 return {...calendar,slots,swaps:calendar.swaps.filter(x=>x.person).map(({date,person})=>({date,person}))};
}
export function weekend(state,f){
 const custom=state.swaps.find(x=>x.date===f);
 return {start:f,end:plus(f,2),person:custom?.person||planned(state,f),key:f};
}
export const eventsOn=(state,d)=>state.events.filter(e=>e.from<=d&&e.to>=d);
export function dayPlan(state,d){
 const special=eventsOn(state,d);
 const isWeekend=[0,5,6].includes(dow(d));
 const w=isWeekend?weekend(state,friday(d)):null;
 const coverage=state.slots.find(x=>x.start<=d&&x.end>=d);
 const isOff=special.some(e=>['Ferie','Festività','Ponte'].includes(e.type));
 return {day:d,person:coverage?.person||w?.person||(isOff?'':'Giovanna'),
  type:coverage?.type||(w?'Weekend':isOff?'Da coprire':'In settimana'),
  weekend:w?.key||'',extra:coverage?.id||'',special};
}
export function report(state,from,to,today=localToday()){
 const map=Object.fromEntries([...people,'Da coprire'].map(person=>[person,{person,days:new Set(),weekends:new Set(),planned:new Set(),extras:new Set(),holidays:new Set(),bridges:new Set()}]));
 const detail=[];
 for(let d=from;d<=to;d=plus(d,1)){
  const x=dayPlan(state,d), row=map[x.person||'Da coprire'];
  row.days.add(d);
  if(x.weekend)(plus(x.weekend,2)<today?row.weekends:row.planned).add(x.weekend);
  if(x.type==='Extra')row.extras.add(d);
  if(x.special.some(e=>e.type==='Festività'))row.holidays.add(d);
  if(x.special.some(e=>e.type==='Ponte'))row.bridges.add(d);
  detail.push(x);
 }
 return {rows:Object.values(map),detail};
}
