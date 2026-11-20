import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'firebase/auth';
import {getFirestore,doc,getDoc,onSnapshot,runTransaction} from 'firebase/firestore';
export function connect(config,{onIdentity,onData,onError,initial}){
 const app=initializeApp(config);
 const auth=getAuth(app), db=getFirestore(app), board=doc(db,'family','calendar');
 let unsubscribe=()=>{}, user=null;
 onAuthStateChanged(auth,async identity=>{
  unsubscribe();user=null;onIdentity(null);
  if(!identity)return;
  try{
   const member=await getDoc(doc(db,'familyMembers',identity.uid));
   if(auth.currentUser?.uid!==identity.uid)return;
   if(!member.exists())throw Error('Questo account non è ancora abilitato.');
   user={name:member.data().name,editor:member.data().editor===true};
   onIdentity(user);
   unsubscribe=onSnapshot(board,snapshot=>onData(snapshot.exists()?snapshot.data():{revision:0,state:initial()}),onError);
  }catch(e){onError(e)}
 },onError);
 return {
  signIn:(email,password)=>signInWithEmailAndPassword(auth,email,password),
  signOut:()=>signOut(auth),
  save:(state,revision)=>runTransaction(db,async tx=>{
   if(!user?.editor)throw Error('Accesso in sola lettura');
   const current=await tx.get(board);
   if((current.data()?.revision??0)!==revision)throw Error('Il calendario è appena cambiato. Riapri la modifica e riprova.');
   tx.set(board,{state,revision:revision+1});
  })
 };
}
