/** MY EXPO BAG TEST — subscription entitlement reader + plan badge.
 * A browser cannot grant Pro: this file only READS a server-owned entitlement.
 * Stripe integration will later update planEntitlements/{uid} from a VERIFIED webhook.
 */
(()=>{
 'use strict';
 let state={plan:'free',status:'inactive',verified:false};
 let resolveReady;
 const readyPromise=new Promise(resolve=>{resolveReady=resolve;});
 const freeColors=['natural','monotone','urban','soft','active'];
 const isPro=()=>state.plan==='pro'&&state.verified;
 const badge=()=>{
  if(!document.body)return;
  let el=document.getElementById('meb-plan-label');
  if(!el){
   el=document.createElement('span');el.id='meb-plan-label';el.setAttribute('aria-label','ご利用プラン');
   el.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-width:60px;min-height:28px;padding:4px 10px;background:#e8edf0;color:#234252;border:1px solid #a9bbc3;border-radius:999px;font:800 12px/1.2 -apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif;white-space:nowrap;flex:none';
   const header=document.querySelector('.meb-admin-page-header')||document.querySelector('header.header')||document.querySelector('header.top')||document.querySelector('header.meb-admin-nav-host');
   if(header){header.insertBefore(el,header.querySelector('.meb-admin-back')||header.querySelector('.controls')||null);}
   else {el.style.cssText+=';position:fixed;z-index:900;right:10px;top:10px';document.body.prepend(el);}
  }
  el.textContent=isPro()?'Pro.':'Free';
  el.style.background=isPro()?'#173d55':'#e8edf0';el.style.color=isPro()?'#fff':'#234252';
  document.documentElement.dataset.mebPlan=isPro()?'pro':'free';
  for(const link of document.querySelectorAll('a[href$="shipping-settings.html"],a[href$="customer-data.html"]'))link.hidden=!isPro();
  document.dispatchEvent(new CustomEvent('meb-plan-updated',{detail:{plan:isPro()?'pro':'free'}}));
 };
 window.MEB_PLAN={
  ready:()=>readyPromise,
  isPro,
  current:()=>({...state}),
  freeColors,
  requirePro:(feature)=>{if(isPro())return true;alert(`${feature}はPro.限定機能です。`);return false;}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',badge,{once:true});else badge();
 (async()=>{
  try{
   const cfg=window.MEB_FIREBASE_CONFIG||{};
   if(!cfg.apiKey||!cfg.projectId)throw Error('Firebase config missing');
   const [{initializeApp,getApps,getApp},{getAuth,onAuthStateChanged},{getFirestore,doc,getDocFromServer}]=await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
   ]);
   const app=getApps().length?getApp():initializeApp(cfg),auth=getAuth(app),db=getFirestore(app);
   onAuthStateChanged(auth,async user=>{
    try{
     if(!user){state={plan:'free',status:'signed-out',verified:false};return;}
     const snap=await getDocFromServer(doc(db,'planEntitlements',user.uid));
     const ent=snap.exists()?snap.data():{};
     const active=ent.plan==='pro'&&['active','trialing','tester'].includes(ent.status);
     state={plan:active?'pro':'free',status:ent.status||'inactive',verified:true};
    }catch(error){
     console.warn('[MY EXPO BAG] 権限を検証できません。Freeとして扱います。',error.code||error.message);
     state={plan:'free',status:'unverified',verified:false};
    }finally{badge();resolveReady({...state});}
   });
  }catch(error){console.warn('[MY EXPO BAG] プラン判定に失敗しました。',error);badge();resolveReady({...state});}
 })();
})();
