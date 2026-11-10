/** MY EXPO BAG v1.0.1 — brand onboarding for existing Auth users. */
import {brandSlug,validateBrand,createBrand,explainBrandError} from './brand-registration.js';
const input=document.getElementById('brand-setup-name');
const preview=document.getElementById('brand-setup-slug');
const status=document.getElementById('brand-setup-status');
const button=document.getElementById('brand-setup-submit');
const form=document.getElementById('brand-setup-form');
const opInput=document.getElementById('brand-setup-operator');
const opSame=document.getElementById('brand-setup-same-operator');
opSame.addEventListener('change',()=>{opInput.readOnly=opSame.checked;if(opSame.checked)opInput.value=input.value;});
const login=new URL('./login.html',location.href).href;
const admin=new URL('./admin.html',location.href).href;
const setStatus=(msg,kind='')=>{status.textContent=msg;status.className='status'+(kind?' '+kind:'');};
input.addEventListener('input',()=>{if(opSame.checked)opInput.value=input.value;preview.textContent=brandSlug(input.value)||'入力すると表示されます';});
const cfg=window.MEB_FIREBASE_CONFIG||{};
if(!['apiKey','authDomain','projectId','appId'].every(k=>!!cfg[k])){
  setStatus('Firebaseの接続設定が見つかりません。','error');
}else{
  try{
    const [{initializeApp,getApps,getApp},{getAuth,onAuthStateChanged,signOut},{getFirestore,getDoc,doc}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
    ]);
    const app=getApps().length?getApp():initializeApp(cfg);
    const auth=getAuth(app),db=getFirestore(app);
    let user=null;
    onAuthStateChanged(auth,async current=>{
      if(!current){location.replace(login);return;}
      user=current;
      try{
        const brand=await getDoc(doc(db,'brands',current.uid));
        if(brand.exists()){location.replace(admin);return;}
        button.disabled=false;
        setStatus('ブランド名を登録してください。','good');
      }catch(e){setStatus('ブランド情報を取得できません。Firestoreの作成とルール公開を確認してください。','error');}
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(button.disabled||!user)return;
      const invalid=validateBrand(input.value);
      if(invalid){setStatus(invalid,'error');return;}
      if(!opInput.value.trim()){setStatus('運営者名を入力してください。','error');return;}
      button.disabled=true;setStatus('ブランドを登録しています…');
      try{await createBrand(user,input.value,{operatorName:opInput.value});setStatus('登録できました。管理画面を開きます。','good');location.replace(admin);}
      catch(err){setStatus(explainBrandError(err),'error');button.disabled=false;}
    });
    document.getElementById('brand-setup-logout').addEventListener('click',async()=>{await signOut(auth);location.replace(login);});
  }catch(e){setStatus('Firebaseライブラリを読み込めませんでした。','error');}
}
