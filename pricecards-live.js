/** Owner-only real product and variant QR price cards (no demo catalog). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id),cfg=window.MEB_FIREBASE_CONFIG||{};
const query=new URLSearchParams(location.search);
const ids=new Set(String(query.get('ids')||'').split(',').filter(Boolean));
// Free starts and stays on white. Pro/Tester may restore the requested accent style
// only after its server-owned entitlement has been verified.
let preferredStyle=query.get('style')==='white'?'white':'accent';
let style='white';
let planReady=false,priorPro=false;
let lines=[],brandName='',brandSlug='';

// Match the same 10 brand color presets used by settings.js and the storefront.
const palette={natural:['#315746','フォレスト'],monotone:['#252932','モノトーン'],urban:['#274D82','ネイビー'],soft:['#A04C67','ローズ'],active:['#A9472B','テラコッタ'],lavender:['#765E9A','ラベンダー'],sand:['#806544','サンド'],peach:['#F38FB8','ピーチミルク'],mint:['#307C75','ミント'],slate:['#385773','スレートブルー']};
function contrastInk(hex){const v=hex.replace('#',''),rgb=[0,2,4].map(n=>parseInt(v.slice(n,n+2),16)/255).map(x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179?'#1b2830':'#ffffff';}
function setAccent(preset){const [main,label]=palette[preset]||palette.natural;document.documentElement.style.setProperty('--meb-pricecard-accent',main);document.documentElement.style.setProperty('--meb-pricecard-ink',contrastInk(main));$('brand-accent-dot').style.backgroundColor=main;$('brand-accent-label').textContent='アクセント：'+label+'（'+main+'）';}
setAccent('natural');

const out=$('paper-output');
const yen=n=>'¥'+Math.round(Number(n)||0).toLocaleString('ja-JP');
function showMessage(s){out.replaceChildren();$('pricecards-notice').textContent=s;}
function productUrl(id){
 const u=new URL('./index.html',location.href);
 u.searchParams.set('brand',brandSlug);
 u.hash='#product/'+encodeURIComponent(id);
 return u.href;
}
function makeQr(url){
 const qr=new window.QRCodeCore(0,window.QRErrorCorrectLevel.M);
 qr.addData(url);qr.make();const n=qr.getModuleCount(),border=4,pixel=5;
 const c=document.createElement('canvas');c.width=c.height=(n+border*2)*pixel;
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
 ctx.fillStyle='#111';for(let r=0;r<n;r++)for(let col=0;col<n;col++)if(qr.isDark(r,col))ctx.fillRect((col+border)*pixel,(r+border)*pixel,pixel,pixel);
 return c.toDataURL('image/png');
}
// Price cards must show the SAME price that customer BAG and staff QR settlement use.
function effectiveReservation(product,variant){
 return typeof variant?.preorder==='boolean'?variant.preorder:product.preorder===true;
}
function priceBreakdown(product,variant){
 const regular=Number.isFinite(variant?.price)?variant.price:product.price;
 const event=Number.isFinite(variant?.eventPrice)?variant.eventPrice:product.eventPrice;
 const hasCampaign=Number.isFinite(event)&&event>=0&&event<regular;
 // Only preorders can opt out of an otherwise valid campaign price.
 const excluded=hasCampaign&&effectiveReservation(product,variant)
   && (variant?.reservationPriceMode||product.reservationPriceMode||'normal')!=='campaign';
 const promotion=hasCampaign&&!excluded;
 return {regular,now:promotion?event:regular,promotion,excluded};
}
function cardFor({product,published}){
 const el=document.createElement('article');el.className='pricecard '+style+(published?'':' unpublished');
 const variants=Array.isArray(product.variants)&&product.variants.length?product.variants:[];
 const qr=document.createElement('div');qr.className='qr-area';
 const img=document.createElement('img');img.src=makeQr(productUrl(product.id));img.alt=product.name+'の商品ページQR';
 const note=document.createElement('div');note.className='scan-note';note.textContent='商品ページQR';qr.append(img,note);
 const info=document.createElement('div');info.className='information';
 const brand=document.createElement('div');brand.className='brand';brand.textContent=brandName;
 const titleWrap=document.createElement('div');titleWrap.className='title-stack';
 if(product.preorder===true){const badge=document.createElement('span');badge.className='reservation-badge product-reservation';badge.textContent='受注予約';titleWrap.append(badge);}
 const name=document.createElement('div');name.className='item';name.textContent=product.name;titleWrap.append(name);
 const pricesByVariant=(variants.length?variants:[null]).map(v=>priceBreakdown(product,v));
 const promotional=pricesByVariant.filter(p=>p.promotion);
 // Show a real, matching before/after price pair from the SAME variant.
 // Never strike through the price of a different variant (misleading discount).
 const pricedRows=promotional.length?promotional:pricesByVariant;
 const display=pricedRows.reduce((best,p)=>p.now<best.now?p:best,pricedRows[0]);
 const varied=pricesByVariant.length>1&&pricesByVariant.some(p=>p.now!==display.now);
 const prices=document.createElement('div');prices.className='price';
 if(display.promotion){
   const old=document.createElement('div');old.className='normal strike';old.textContent='通常価格 '+yen(display.regular);prices.append(old);
   const caption=document.createElement('div');caption.className='campaign-label';caption.textContent=variants.length>1?'キャンペーン価格（対象種類）':'キャンペーン価格';prices.append(caption);
 }
 const now=document.createElement('div');now.className='now'+(display.promotion?' event':'');now.textContent=yen(display.now)+(varied?'～':'');prices.append(now);
 info.append(brand,titleWrap,prices);
 if(variants.length){
  const names=document.createElement('div');names.className='variant-list';
  if(variants.length>5)names.classList.add('dense');
  if(variants.length>9)names.classList.add('very-dense');
  for(const variant of variants){
   const chip=document.createElement('span');chip.className='variant-name';
   chip.append(document.createTextNode(variant.name||variant.code||'種類未設定'));
   // Label reservation only for the variants that are actually preorders.
   // When every variant is a preorder due to the parent-level setting, the
   // prominent badge above the title already covers it.
   if(effectiveReservation(product,variant)&&product.preorder!==true){
    const badge=document.createElement('span');badge.className='reservation-badge variant-reservation';badge.textContent='受注予約';chip.append(badge);
   }
   // If this SKU has a campaign price but sells at its regular reservation price,
   // clearly mark only THIS SKU as excluded from the campaign discount.
   if(priceBreakdown(product,variant).excluded){
    const excluded=document.createElement('span');excluded.className='discount-excluded-badge';excluded.textContent='割引対象外';chip.append(excluded);
   }
   names.append(chip);
  }
  info.append(names);
 }
 el.append(qr,info);return el;
}
function render(){out.replaceChildren();for(const t of ['white','accent'])$(t).classList.toggle('active',t===style);if(!lines.length){showMessage('該当する登録商品がありません。管理画面から選び直してください。');return;}
 for(let i=0;i<lines.length;i+=10){const paper=document.createElement('div');paper.className='paper';const sheet=document.createElement('div');sheet.className='sheet';lines.slice(i,i+10).forEach(x=>sheet.append(cardFor(x)));paper.append(sheet);out.append(paper);}
 const n=lines.filter(x=>!x.published).length;
 $('pricecards-notice').textContent=n?`⚠ 未公開のカードが${n}枚あります。商品を「お客様ページに反映」したあとに掲示してください。`:'登録済み商品IDごとに1枚のPRICE CARDです。印刷時はA4・倍率100%・余白なしを確認してください。';
}
for(const t of ['white','accent'])$(t).addEventListener('click',()=>{
 if(t==='accent'&&(!planReady||!window.MEB_PLAN?.isPro()))return;
 preferredStyle=t;style=t;render();
});
function applyPlanToPricecards(){
 const pro=planReady&&window.MEB_PLAN?.isPro()===true;
 $('accent').hidden=!pro;
 $('accent').disabled=!pro;
 $('brand-accent-info').hidden=!pro;
 if(pro&&!priorPro)style=preferredStyle;
 if(!pro)style='white';
 priorPro=pro;
 // Do not replace the loading message before the first catalog fetch finishes.
 if(lines.length)render();
 else for(const t of ['white','accent'])$(t).classList.toggle('active',t===style);
}
// No Pro-only controls are rendered before entitlement verification finishes.
$('print').disabled=true;
window.MEB_PLAN?.ready().then(()=>{
 planReady=true;
 $('print').disabled=false;
 applyPlanToPricecards();
}).catch(()=>{
 planReady=true;
 $('print').disabled=false;
 applyPlanToPricecards();
});
document.addEventListener('meb-plan-updated',()=>{if(planReady)applyPlanToPricecards();});
$('print').addEventListener('click',()=>{if(!planReady)return;window.print();});
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k]))showMessage('Firebase設定を確認してください。');
else{
 const app=getApps().length?getApp():initializeApp(cfg),db=getFirestore(app);
 onAuthStateChanged(getAuth(app),async user=>{
  if(!user){location.replace('./login.html');return;}
  // A successful first read must not be reported as a fetch failure.
  // Only retry transient Firestore/network errors, never authorization errors.
  for(let attempt=0;attempt<3;attempt++){
   try{
    const b=await getDoc(doc(db,'brands',user.uid));
    if(!b.exists()||b.data().ownerUid!==user.uid)throw Error('ブランド情報が見つかりません。');
    brandSlug=b.data().slug;brandName=b.data().displayName||brandSlug;
    const [drafts,pub,settingDoc]=await Promise.all([getDocs(collection(db,'brands',user.uid,'products')),getDoc(doc(db,'publishedCatalogs',brandSlug)),getDoc(doc(db,'brandSettings',brandSlug))]);
    setAccent(settingDoc.data()?.theme?.preset||'natural');
    const publicRecords=new Map((pub.data()?.products||[]).map(p=>[p.id,p]));
    const priceMatches=(p,r)=>{
      if(!r||p.active===false||p.name!==r.name||p.price!==r.price||(p.eventPrice??null)!==(r.eventPrice??null)
        ||(p.preorder===true)!==(r.preorder===true)||(p.reservationPriceMode||'normal')!==(r.reservationPriceMode||'normal'))return false;
      const vars=p.variants||[],live=r.variants||[];
      if(vars.length!==live.length)return false;
      return vars.every(v=>{const other=live.find(x=>x.code===v.code);return !!other&&(v.price??null)===(other.price??null)&&(v.eventPrice??null)===(other.eventPrice??null)
        &&(v.preorder===true)===(other.preorder===true)&&(v.reservationPriceMode||'normal')===(other.reservationPriceMode||'normal');});
    };
    const all=drafts.docs.map(s=>s.data()).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string');
    const selected=ids.size?all.filter(p=>ids.has(p.id)):all;
    lines=selected.map(product=>({product,published:priceMatches(product,publicRecords.get(product.id))}));
    render();
    return;
   }catch(e){
    console.error('プライスカード商品取得',e);
    const retryable=['unavailable','deadline-exceeded','aborted','resource-exhausted'].includes(e?.code);
    if(!retryable||attempt===2){showMessage('商品情報の取得に失敗しました：'+(e.message||'通信エラー'));return;}
    $('pricecards-notice').textContent='接続を確認しています…';
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
   }
  }
 });
}
