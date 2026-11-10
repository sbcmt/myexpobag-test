/** Owner-only real product and variant QR price cards (no demo catalog). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id),cfg=window.MEB_FIREBASE_CONFIG||{};
const query=new URLSearchParams(location.search);
const ids=new Set(String(query.get('ids')||'').split(',').filter(Boolean));
let style=query.get('style')==='white'?'white':'accent';
let lines=[],brandName='',brandSlug='';
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
// Mirror customer app.js: variants have their own regular/event prices.
function priceFor(product,variant){
 const regular=Number.isFinite(variant?.price)?variant.price:product.price;
 const event=Number.isFinite(variant?.eventPrice)?variant.eventPrice:product.eventPrice;
 return Number.isFinite(event)&&event>=0&&event<regular?event:regular;
}
function effectiveReservation(product,variant){
 return typeof variant?.preorder==='boolean'?variant.preorder:product.preorder===true;
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
 const candidatePrices=(variants.length?variants:[null]).map(v=>priceFor(product,v));
 const minimum=Math.min(...candidatePrices),different=new Set(candidatePrices).size>1;
 const prices=document.createElement('div');prices.className='price';
 const now=document.createElement('div');now.className='now';now.textContent=yen(minimum)+(different?'～':'');prices.append(now);
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
   names.append(chip);
  }
  info.append(names);
 }
 el.append(qr,info);return el;
}
function render(){out.replaceChildren();if(!lines.length){showMessage('該当する登録商品がありません。管理画面から選び直してください。');return;}
 for(let i=0;i<lines.length;i+=10){const paper=document.createElement('div');paper.className='paper';const sheet=document.createElement('div');sheet.className='sheet';lines.slice(i,i+10).forEach(x=>sheet.append(cardFor(x)));paper.append(sheet);out.append(paper);}
 for(const t of ['white','accent'])$(t).classList.toggle('active',t===style);
 const n=lines.filter(x=>!x.published).length;
 $('pricecards-notice').textContent=n?`⚠ 未公開のカードが${n}枚あります。商品を「お客様ページに反映」したあとに掲示してください。`:'登録済み商品IDごとに1枚のPRICE CARDです。印刷時はA4・倍率100%・余白なしを確認してください。';
}
for(const t of ['white','accent'])$(t).addEventListener('click',()=>{style=t;render();});
$('print').addEventListener('click',()=>window.print());
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
    const [drafts,pub]=await Promise.all([getDocs(collection(db,'brands',user.uid,'products')),getDoc(doc(db,'publishedCatalogs',brandSlug))]);
    const pubIds=new Set((pub.data()?.products||[]).map(p=>p.id));
    const all=drafts.docs.map(s=>s.data()).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string');
    const selected=ids.size?all.filter(p=>ids.has(p.id)):all;
    lines=selected.map(product=>({product,published:pubIds.has(product.id)}));
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
