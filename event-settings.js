/** MY EXPO BAG v1.0.1 — brand owner event label editor.
 * Only the public brandHandles.eventName is written; no catalog, order or PII is saved.
 */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const cfg=window.MEB_FIREBASE_CONFIG||{};
const loginUrl=new URL('./login.html',location.href).href;
const brandSetupUrl=new URL('./brand-setup.html',location.href).href;
let owner=null,brandSlug='',db=null;
function status(message,error=false){const node=$('event-status');node.textContent=message;node.className='status'+(error?' error':' ok');}
const preview=()=>{$('event-name-preview').textContent=$('event-name').value.trim();};
$('event-name').addEventListener('input',preview);
$('event-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!owner || !brandSlug || !db)return;
  const name=$('event-name').value.trim();
  if([...name].length>80){status('イベント名は80文字以内にしてください。',true);return;}
  const button=$('save-event');button.disabled=true;status('保存しています…');
  try{
    // Brand slug comes from brands/{authenticated UID}, never URL parameters.
    await updateDoc(doc(db,'brandHandles',brandSlug),{eventName:name});
    status('保存しました。お客様ページに反映されます。');
  }catch(err){console.error(err);status('保存できませんでした。Firestoreのルールと通信状態をご確認ください。',true);}
  finally{button.disabled=false;}
});
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k].trim())){
  $('loading').textContent='Firebaseの接続情報を確認してください。';
}else{
  try{
    const app=getApps().length?getApp():initializeApp(cfg);
    const auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth,async user=>{
      if(!user){location.replace(loginUrl);return;}
      try{
        const record=await getDoc(doc(db,'brands',user.uid));
        if(!record.exists()){location.replace(brandSetupUrl);return;}
        const brand=record.data();
        if(brand.ownerUid!==user.uid||!brand.slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand.slug))throw new Error('brand ownership invalid');
        const handleSnap=await getDoc(doc(db,'brandHandles',brand.slug));
        if(!handleSnap.exists()||handleSnap.data().brandId!==user.uid||handleSnap.data().ownerUid!==user.uid)throw new Error('public brand mapping invalid');
        owner=user;brandSlug=brand.slug;
        $('brand-name-preview').textContent=brand.displayName;
        $('event-name').value=handleSnap.data().eventName||'';
        preview();
        $('save-event').disabled=false;
        $('loading').hidden=true;$('shell').hidden=false;
      }catch(err){console.error(err);$('loading').textContent='ブランド情報を確認できませんでした。Firestoreのルールと通信状態をご確認ください。';}
    },()=>{$('loading').textContent='ログイン状態を確認できませんでした。';});
  }catch(err){$('loading').textContent='Firebaseを読み込めませんでした。';}
}
