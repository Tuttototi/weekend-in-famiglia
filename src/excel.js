import * as XLSX from 'xlsx';
import {people,rotation,dow,overlaps,report,id,dayRange} from './model.js';
const fields={
 Rotazioni:['ID','Dal','Al','Sequenza'],Scambi:['Venerdì','Persona'],
 Coperture:['ID','Dal','Al','Persona','Tipo','Nota'],Eventi:['ID','Dal','Al','Tipo','Titolo'],
 Storico:['Data UTC','Autore','Operazione','Dettagli']
};
function sheet(book,name,headers,rows){const w=XLSX.utils.aoa_to_sheet([headers,...rows]); w['!cols']=headers.map(x=>({wch:Math.max(17,x.length+4)}));XLSX.utils.book_append_sheet(book,w,name)}
export function workbook(state,range){
 const book=XLSX.utils.book_new();
 sheet(book,'Istruzioni',['Foglio','Come compilare'],[
  ['Rotazioni','Data di venerdì in formato AAAA-MM-GG. Sequenza: Toti | Enza | Nicolò. Ripetere i nomi se necessario. Al vuoto significa senza termine.'],
  ['Scambi','Una riga per venerdì. Per lo scambio di due weekend compilare entrambe le righe.'],
  ['Coperture','Dal e Al inclusi, in formato AAAA-MM-GG. Tipi: Extra, Sostituzione. Una sola copertura per giorno.'],
  ['Eventi','Da e A inclusi, in formato AAAA-MM-GG. Tipi: Ferie, Ponte, Festività, Chiusura.'],
  ['Importazione','Compilare i fogli dati. I fogli di riepilogo sono informativi. Le righe con ID esistente aggiornano i dati.']
 ]);
 const rows=state?{
  Rotazioni:state.rules.map(r=>[r.id,r.from,r.to,r.sequence.join(' | ')]),
  Scambi:state.swaps.map(s=>[s.date,s.person]),
  Coperture:state.slots.map(s=>[s.id,s.start,s.end,s.person,s.type,s.note]),
  Eventi:state.events.map(e=>[e.id,e.from,e.to,e.type,e.label]),
  Storico:state.audit.map(a=>[a.when.slice(0,10),a.actor,a.action,a.details])
 }:{};
 for(const [name,headers] of Object.entries(fields))sheet(book,name,headers,rows[name]||[]);
 if(state&&range){
  const r=report(state,...range);
  sheet(book,'Riepilogo',['Persona','Weekend passati','Weekend previsti','Giorni con copertura','Giorni extra','Festività','Ponti'],r.rows.map(x=>[x.person,x.weekends.size,x.planned.size,x.days.size,x.extras.size,x.holidays.size,x.bridges.size]));
  sheet(book,'Dettaglio',['Data','Persona','Tipo','Eventi'],r.detail.map(x=>[x.day,x.person||'Da coprire',x.type,x.special.map(e=>e.label).join(', ')]));
 }
 return book;
}
export function download(state,range){XLSX.writeFile(workbook(state,range),state?'Calendario_Nicolina.xlsx':'Template_Calendario_Nicolina.xlsx')}
export const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const validTime=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const validStamp=s=>s.length===16&&s[10]==='T'&&validDate(s.slice(0,10))&&validTime(s.slice(11));
export async function parse(file,state){
 const book=XLSX.read(await file.arrayBuffer(),{cellDates:true});
 if(!Object.keys(fields).slice(0,-1).some(k=>book.Sheets[k]))throw Error('Usa il modello Excel dell’app per mappare le colonne.');
 const copy=structuredClone(state); const counts=[];
 const each=(key,fn)=>{
  if(!book.Sheets[key])return;
  const [headers,...rows]=XLSX.utils.sheet_to_json(book.Sheets[key],{header:1,defval:'',blankrows:false});
  const legacy=key==='Coperture'&&headers?.[1]==='Inizio'&&headers?.[2]==='Fine';
  if(!headers||(!legacy&&!fields[key].every((h,i)=>headers[i]===h)))throw Error('Intestazioni non valide in '+key);
  rows.forEach((row,i)=>{
   try{fn(row.map(v=>v instanceof Date?v.toISOString().slice(0,10):String(v).trim()))}
   catch(e){throw Error(key+' · riga '+(i+2)+' · '+e.message)}
  });if(rows.length)counts.push(key+' '+rows.length);
 };
 const require=(ok,msg)=>{if(!ok)throw Error(msg)};
 const upsert=(arr,v,key='id')=>{const i=arr.findIndex(x=>x[key]===v[key]);if(i<0)arr.push(v);else arr[i]=v};
 each('Rotazioni',([key,from,to,seq])=>{
  const sequence=seq.split('|').map(s=>s.trim());
  require(validDate(from)&&dow(from)===5&&(!to||validDate(to)&&dow(to)===5&&to>=from)&&sequence.every(p=>rotation.includes(p)),'Venerdì o sequenza non validi');
  require(key!=='base'||!to,'La rotazione di base deve avere una durata illimitata');
  const existing=copy.rules.find(x=>x.from===from);
  if(existing&&key&&existing.id!==key)throw Error('Esiste già una rotazione con questa data');
  upsert(copy.rules,{id:key||existing?.id||id(),from,to,sequence});
 });
 each('Scambi',([date,person])=>{
  require(validDate(date)&&dow(date)===5&&(!person||rotation.includes(person)),'Venerdì o persona non validi');
  if(person)upsert(copy.swaps,{date,person},'date');
 });
 each('Coperture',([key,start,end,person,type,note])=>{
  require((validDate(start)&&validDate(end)||validStamp(start)&&validStamp(end)&&start<end)&&people.includes(person)&&['Extra','Sostituzione'].includes(type),'Date, persona o tipo non validi');
  const range=dayRange(start,end);
  require(range.start<=range.end,'Controlla le date.');
  upsert(copy.slots,{id:key||id(),...range,person,type,note});
 });
 each('Eventi',([key,from,to,type,label])=>{
  require(validDate(from)&&validDate(to)&&from<=to&&['Ferie','Festività','Ponte','Chiusura'].includes(type)&&label,'Date, tipo o titolo non validi');
  upsert(copy.events,{id:key||id(),from,to,type,label});
 });
 const sorted=copy.slots.toSorted((a,b)=>a.start.localeCompare(b.start));
 require(!sorted.some((x,i)=>i&&overlaps(x,sorted[i-1])),'Ci sono più coperture nello stesso giorno.');
 require(counts.length,'Il file non contiene righe da importare.');
 return {copy,counts};
}
