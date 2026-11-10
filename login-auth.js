/** MY EXPO BAG v1.0.1 — Login uses Firebase Authentication, never localStorage passwords. */
const form=document.getElementById('login-form');
const email=document.getElementById('login-email');
const password=document.getElementById('login-password');
const submit=document.getElementById('login-submit');
const reset=document.getElementById('reset-password');
const status=document.getElementById('login-status');
const toggle=document.getElementById('toggle-password');
const config=window.MEB_FIREBASE_CONFIG||{};
const configured=['apiKey','authDomain','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim().length>0);
const setStatus=(message,kind='')=>{status.textContent=message;status.className='status'+(kind?' '+kind:'');};
toggle.addEventListener('click',()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.textContent=show?'非表示':'表示';toggle.setAttribute('aria-pressed',String(show));});
if(configured){
  try {
  const [{initializeApp,getApps,getApp},{getAuth,onAuthStateChanged,signInWithEmailAndPassword,sendPasswordResetEmail}] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')
  ]);
  const app=getApps().length?getApp():initializeApp(config);
  const auth=getAuth(app);
  const next=()=>{
    const url=new URL('./admin.html',location.href);
    const brand=new URLSearchParams(location.search).get('brand');
    if(brand && /^[a-z0-9-]{1,48}$/.test(brand))url.searchParams.set('brand',brand);
    location.replace(url.href);
  };
  onAuthStateChanged(auth,user=>{if(user){next();}else{submit.disabled=false;reset.disabled=false;setStatus('メールアドレスとパスワードを入力してください。','good');}},()=>{setStatus('認証状態を確認できません。通信状況をご確認ください。','error');});
  const explain=(e)=>{
    switch(e?.code){
      case 'auth/invalid-email':return 'メールアドレスの形式をご確認ください。';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':return 'メールアドレスまたはパスワードを確認してください。';
      case 'auth/too-many-requests':return '試行回数が多いため、一時的にログインできません。時間をおいてお試しください。';
      case 'auth/network-request-failed':return '通信できません。インターネット接続をご確認ください。';
      case 'auth/operation-not-allowed':return 'Firebase側でメール／パスワード認証を有効にしてください。';
      default:return '認証に失敗しました。設定または接続状態をご確認ください。';
    }
  };
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(submit.disabled)return;
    submit.disabled=true;submit.textContent='確認中…';setStatus('ログイン情報を確認しています。');
    try{await signInWithEmailAndPassword(auth,email.value.trim(),password.value);next();}
    catch(error){setStatus(explain(error),'error');submit.disabled=false;submit.textContent='ログイン';}
  });
  reset.addEventListener('click',async()=>{
    if(!email.checkValidity()||!email.value.trim()){
      email.focus();setStatus('先にメールアドレスを入力してください。','error');return;
    }
    reset.disabled=true;
    try{await sendPasswordResetEmail(auth,email.value.trim());setStatus('登録済みのアドレスには、パスワード再設定メールが送信されます。','good');}
    catch(error){setStatus(explain(error),'error');}
    finally{reset.disabled=false;}
  });
  }catch(e){setStatus('Firebase認証ライブラリを読み込めませんでした。通信状況をご確認ください。','error');}
}else{
  setStatus('Firebase認証は未接続です。firebase-config.jsの設定後に利用できるようになります。');
}
