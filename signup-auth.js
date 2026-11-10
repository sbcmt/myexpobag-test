/** MY EXPO BAG v1.0.1 — Signup stores brand and owner mapping in Firestore. */
import {brandSlug,validateBrand,createBrand,explainBrandError,isBrandSlugTaken} from './brand-registration.js';
const form=document.getElementById('signup-form');
const brand=document.getElementById('signup-brand');
const brandPreview=document.getElementById('brand-slug-preview');
const opName=document.getElementById('signup-operator');
const opSame=document.getElementById('signup-same-operator');
opSame.addEventListener('change',()=>{opName.readOnly=opSame.checked;if(opSame.checked)opName.value=brand.value;});
const email=document.getElementById('signup-email');
const password=document.getElementById('signup-password');
const confirm=document.getElementById('signup-confirm');
const submit=document.getElementById('signup-submit');
const status=document.getElementById('signup-status');
const config=window.MEB_FIREBASE_CONFIG||{};
const configured=['apiKey','authDomain','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim().length>0);
const setStatus=(message,kind='')=>{status.textContent=message;status.className='status'+(kind?' '+kind:'');};
const passwordRule=/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@&_\-])[A-Za-z\d@&_\-]{8,}$/;
brand.addEventListener('input',()=>{if(opSame.checked)opName.value=brand.value;
  const slug=brandSlug(brand.value);
  brandPreview.textContent=slug?'?brand='+slug:'ブランド名を入力すると表示されます';
});
const toggle=document.getElementById('signup-show-password');
toggle.addEventListener('click',()=>{
  const show=password.type==='password';password.type=show?'text':'password';
  toggle.textContent=show?'非表示':'表示';toggle.setAttribute('aria-pressed',String(show));
});
if(configured){
  try{
    const [{initializeApp,getApps,getApp},{getAuth,createUserWithEmailAndPassword,sendEmailVerification,signOut}] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')
    ]);
    const app=getApps().length?getApp():initializeApp(config);
    const auth=getAuth(app);
    const explain=e=>{
      switch(e?.code){
        case 'auth/email-already-in-use':return 'このメールアドレスはすでに登録されています。ログインまたはパスワード再設定をお試しください。';
        case 'auth/invalid-email':return 'メールアドレスの形式をご確認ください。';
        case 'auth/weak-password':return 'パスワードの条件をご確認ください。';
        case 'auth/too-many-requests':return 'しばらく待ってからお試しください。';
        case 'auth/operation-not-allowed':return 'Firebase Authenticationのメール／パスワード認証を確認してください。';
        case 'auth/network-request-failed':return '通信できません。ネットワークをご確認ください。';
        default:return 'アカウントを作成できませんでした。設定または接続状態をご確認ください。';
      }
    };
    submit.disabled=false;
    setStatus('ブランド名とログイン情報を入力してください。');
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(submit.disabled)return;
      const problem=validateBrand(brand.value);
      if(problem){setStatus(problem,'error');brand.focus();return;}
      if(!opName.value.trim()){setStatus('運営者名を入力してください。','error');return;}
      if(!passwordRule.test(password.value)){
        setStatus('パスワードは8文字以上で、大文字・小文字・数字・指定記号（@ & - _）をすべて含めてください。','error');password.focus();return;
      }
      if(password.value!==confirm.value){setStatus('確認用パスワードが一致しません。','error');confirm.focus();return;}
      submit.disabled=true;submit.textContent='確認中…';setStatus('ブランド名が登録可能か確認しています。');
      try{
        if(await isBrandSlugTaken(brand.value)){
          setStatus('このURL識別子はすでに登録されています。別のブランド名または英数字を加えた名前にしてください。','error');
          submit.disabled=false;submit.textContent='アカウントを作成';return;
        }
      }catch(e){
        setStatus('ブランド識別子を確認できません。Firestoreの作成とセキュリティルールを確認してください。アカウント登録はまだ実行していません。','error');
        submit.disabled=false;submit.textContent='アカウントを作成';return;
      }
      submit.textContent='登録中…';setStatus('アカウントとブランドを登録しています。');
      let user=null,brandSaved=false,emailSent=false,brandProblem='';
      try{
        const created=await createUserWithEmailAndPassword(auth,email.value.trim(),password.value);
        user=created.user;
        try{await createBrand(user,brand.value,{operatorName:opName.value});brandSaved=true;}
        catch(err){brandProblem=err.message==='brand-already-exists'?'すでにブランド登録があります。':explainBrandError(err);}
        try{await sendEmailVerification(user);emailSent=true;}catch(err){ /* manual resend from login */ }
        form.hidden=true;
        if(brandSaved){
          setStatus(emailSent?'ブランドとアカウントを登録しました。確認メール内のリンクを開いてからログインしてください。':'ブランドとアカウントを登録しましたが、確認メールを送信できませんでした。ログイン画面で確認メールの再送を依頼してください。',emailSent?'good':'error');
        }else{
          setStatus('アカウントは作成されましたが、ブランド登録は未完了です。'+brandProblem+' Firebaseの設定を修正後、メール確認・ログインを行うと初回ブランド登録画面へ進めます。','error');
        }
      }catch(err){setStatus(explain(err),'error');}
      finally{
        if(user){try{await signOut(auth);}catch(err){setStatus('登録後のログアウトに失敗しました。画面を閉じ、ログインをやり直してください。','error');}}
        else{submit.disabled=false;submit.textContent='アカウントを作成';}
      }
    });
  }catch(e){setStatus('Firebase認証を読み込めませんでした。通信状況をご確認ください。','error');}
}else{setStatus('Firebase認証は未接続です。firebase-config.jsを確認してください。','error');}
