import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const slug=new URLSearchParams(location.search).get('brand')||'';
const fail=msg=>{$('loading').hidden=true;$('error').hidden=false;$('error').textContent=msg;};
if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){fail('ブランド専用のURLからアクセスしてください。');}
else{
  $('back').href='./index.html?brand='+encodeURIComponent(slug);
  try{
    const cfg=window.MEB_FIREBASE_CONFIG||{};
    const app=getApps().length?getApp():initializeApp(cfg);
    const dataSnap=await getDoc(doc(getFirestore(app),'brandHandles',slug));
    if(!dataSnap.exists()||dataSnap.data().slug!==slug)throw Error('ブランドが見つかりません。');
    const data=dataSnap.data();
    const name=String(data.operatorName||'').trim();
    if(!name)throw Error('運営者のプライバシーポリシー情報が未登録です。出展者にお問い合わせください。');
    $('operator').textContent=name;
    $('operator-detail').textContent=name;
    $('brand-name').textContent=String(data.displayName||slug);
    $('loading').hidden=true;
    $('content').hidden=false;
  }catch(error){fail(error.message||'プライバシーポリシーを取得できませんでした。');}
}
