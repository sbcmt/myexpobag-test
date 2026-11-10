/** MY EXPO BAG v1.0.1 — scan → atomic stock reservation → customer review → handoff. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const firebase=window.MEB_FIREBASE_CONFIG||{};
let user=null,brand=null,db=null,scanner=null,cameraStarting=false,working=false,candidate=null,stage='scan';
const yen=n=>'¥'+Math.round(n).toLocaleString('ja-JP');
const loginUrl=new URL('./login.html',location.href).href;

// Scanner remains usable if the optional shared shipping helper has not yet
// been fetched (for example, a GitHub Pages deployment/cache race).
// The fallback implements the same prefecture and shipping rules. It NEVER
// skips final amount or order signature checks.
const PREFECTURES=('北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県').split(' ');
const shippingTools=window.MEB_SHIPPING||{
  validPref:pref=>PREFECTURES.includes(pref),
  calc:(shipping,base,hasPreorder,prefecture='')=>{
    const sh=shipping||{};
    if(!hasPreorder||sh.mode==='all')return 0;
    const limit=Number(sh.threshold)||0;
    if(limit>0&&base>=limit)return 0;
    if(sh.mode==='prefecture'){
      if(!PREFECTURES.includes(prefecture))return null;
      const n=sh.rates?.[prefecture];
      return Number.isInteger(n)&&n>=0&&n<=100000?n:null;
    }
    if(sh.mode==='threshold')return Number(sh.charge)||0;
    return 0;
  }
};

function say(message,isError=false){$('result').textContent=message;$('result').className=isError?'error':'good';}
function display(stageName){
 stage=stageName;
 for(const id of ['scan','review','prepared','closed','cancelled'])$(id+'-panel').hidden=id!==stageName;
}
function ready(){return !!user&&!!brand&&!!db&&!working;}
function codeFor(p,code){
 const variants=Array.isArray(p.variants)?p.variants:[];
 const v=code?variants.find(v=>v.code===code):null;
 if(variants.length&&!v)throw Error('バリエーション指定が不正です：'+p.name);
 if(!variants.length&&code)throw Error('この商品にサブコードはありません：'+p.name);
 return v;
}
function priceFor(p,code){
 const v=codeFor(p,code);
 const normal=Number.isInteger(v?.price)?v.price:p.price;
 const event=Number.isInteger(v?.eventPrice)?v.eventPrice:p.eventPrice;
 return Number.isInteger(event)&&event>=0&&event<normal?event:normal;
}
function parseOrder(text){
 let raw;try{raw=JSON.parse(String(text||'').replace(/^\uFEFF/,'').trim());}catch{throw Error('購入QRのデータ形式が不正です。お客様ページで「最新版を表示」して、新しい購入QRを発行してください。');}
 if(raw?.t!=='MEB2'||typeof raw.o!=='string'||!/^(?:MEB|DEMO)-[A-F0-9]{20}$/.test(raw.o))throw Error('対応していない購入QRです。');
 if(raw.b!==brand.slug||raw.e!==brand.slug)throw Error('別の出展ブランドのQRです。');
 if(!Array.isArray(raw.i)||raw.i.length<1||raw.i.length>30)throw Error('購入商品数が不正です。');
 const counts=new Map(),items=[],keys=new Set();
 for(const line of raw.i){
  if(!Array.isArray(line)||line.length!==3)throw Error('商品データが不正です。');
  const [id,sku,qty]=line;
  if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(id)||typeof sku!=='string'||sku.length>70||!Number.isInteger(qty)||qty<1||qty>20)throw Error('商品ID・数量が不正です。');
  const variant=sku?(sku.startsWith(id+'_')?sku.slice(id.length+1):null):'';
  if(variant===null)throw Error('サブコードと商品IDが一致しません。');
  const key=id+'::'+variant;if(keys.has(key))throw Error('QRに重複した商品・バリエーションがあります。');keys.add(key);
  items.push({id,variant,qty,key});counts.set(id,(counts.get(id)||0)+qty);
 }
 if(items.some(x=>counts.get(x.id)>20))throw Error('同一商品の数量が上限を超えています。');
 return {raw,items,counts};
}
function calculate(parsed,catalog,settings={}){
 const {raw,items,counts}=parsed;
 const published=new Map((catalog.products||[]).map(p=>[p.id,p]));
 const details=items.map(item=>{
  const p=published.get(item.id);if(!p)throw Error('現在公開されていない商品です：'+item.id);
  const v=codeFor(p,item.variant);
  return {...item,name:p.name,variantName:v?.name||'',unitPrice:priceFor(p,item.variant),preorder:typeof v?.preorder==='boolean'?v.preorder:p.preorder===true};
 });
 let amount=0;for(const x of details)amount+=x.unitPrice*x.qty;
 const remaining=new Map(counts);let bundleDiscount=0;
 const bundles=(catalog.bundles||[]).filter(b=>Array.isArray(b.productIds)&&b.productIds.length===2&&Number.isInteger(b.discountAmount)&&b.discountAmount>0).sort((a,b)=>b.discountAmount-a.discountAmount);
 for(const b of bundles){
  const [a,c]=b.productIds;const count=Math.min(remaining.get(a)||0,remaining.get(c)||0);if(!count)continue;
  const minPrice=id=>Math.min(...details.filter(x=>x.id===id).map(x=>x.unitPrice));
  const saving=Math.min(b.discountAmount,minPrice(a)+minPrice(c));bundleDiscount+=saving*count;
  remaining.set(a,remaining.get(a)-count);remaining.set(c,remaining.get(c)-count);
 }
 const base=Math.max(0,amount-Math.min(amount,bundleDiscount));
 const discountSettings=settings?.discount||{};
 const mode=['percent','amount'].includes(discountSettings.mode)?discountSettings.mode:'none';
 const value=Number.isInteger(discountSettings.value)?discountSettings.value:0;
 const minSpend=Number.isInteger(discountSettings.minSpend)&&discountSettings.minSpend>=0?discountSettings.minSpend:0;
 if((mode==='percent'&&(value<1||value>100))||(mode==='amount'&&(value<1||value>100000000)))throw Error('アプリ割引設定が不正です。');
 if(raw.r!==0&&raw.r!==1)throw Error('QRの登録状態が不正です。');
 const registered=raw.r===1;
 const hasPreorder=details.some(x=>x.preorder===true);
 if(hasPreorder&&!registered)throw Error('予約商品はお名前・メールの入力が必須です。購入QRを発行し直してください。');
 const applyToPreorder=discountSettings.applyToPreorder!==false;
 const regularSubtotal=details.filter(x=>!x.preorder).reduce((sum,x)=>sum+x.unitPrice*x.qty,0);
 const discountBase=applyToPreorder?base:(amount>0?Math.floor(base*regularSubtotal/amount):0);
 const eligible=registered&&discountBase>=minSpend;
 const percent=eligible&&mode==='percent'?value:0;
 const reduction=eligible&&mode==='percent'?Math.min(discountBase,Math.round(discountBase*value/100)):eligible&&mode==='amount'?Math.min(discountBase,value):0;
 const sh=settings?.shipping||{};
 const shipMode=['threshold','prefecture'].includes(sh.mode)?sh.mode:'all';
 const shipThreshold=shipMode!=='all'?Math.max(0,Math.floor(Number(sh.threshold)||0)):0;
 const shippingPrefecture=shipMode==='prefecture'&&hasPreorder?String(raw.f||''):'';
 if(shipMode==='prefecture'&&hasPreorder&&!shippingTools.validPref(shippingPrefecture))throw Error('送料計算用の都道府県が未選択です。お客様にQRを作り直していただいてください。');
 const shipCharge=shipMode==='prefecture'&&hasPreorder?sh.rates?.[shippingPrefecture]:shipMode==='threshold'?Math.max(0,Math.floor(Number(sh.charge)||0)):0;
 if(!Number.isInteger(shipCharge)||shipThreshold>100000000||shipCharge>100000||shipCharge<0)throw Error(shipMode==='prefecture'&&hasPreorder?'送料設定で「'+shippingPrefecture+'」の料金が未設定です。管理画面の設定を確認してください。':'送料設定の金額が不正です。');
 const shippingFee=shippingTools.calc(sh,base,hasPreorder,shippingPrefecture);
 if(shippingFee===null)throw Error('都道府県・送料が確定していません。送料設定を確認し、お客様に新しいQRを発行していただいてください。');
 const finalAmount=base-reduction+shippingFee;
 if(!Number.isInteger(raw.h)||raw.h!==shippingFee)throw Error('QRの送料が最新設定と一致しません。購入QRを作り直してください。');
 if(!Number.isInteger(raw.a)||raw.s!==base||raw.p!==percent||raw.d!==reduction||raw.a!==finalAmount)throw Error('QRの金額と公開中の割引設定が一致しません。QRを再発行してください。');
 const n=settings?.novelty||{};
 const noveltyMode=['all','minimum','product'].includes(n.mode)?n.mode:'none';
 return {details,amount:finalAmount,discountMode:registered?mode:'none',discountValue:registered?value:0,discountMinSpend:minSpend,discountRegistered:registered,discountApplyToPreorder:applyToPreorder,
   hasPreorder,shippingFee,shippingMode:shipMode,shippingThreshold:shipThreshold,shippingCharge:shipCharge,shippingPrefecture,
   noveltyMode,noveltyName:noveltyMode==='none'?'':String(n.name||''),noveltyMinSpend:Number.isInteger(n.minSpend)?n.minSpend:0,noveltyProductId:noveltyMode==='product'?String(n.productId||''):''};
}
function checkStock(parsed,stock,privateMap=null){
 const quantities=stock.quantities||{};
 const variantQuantities=stock.variantQuantities||{};
 for(const [id,qty] of parsed.counts){
  if(!Object.prototype.hasOwnProperty.call(quantities,id))throw Error('在庫情報が未設定の商品です：'+id);
  const p=privateMap?.get(id);
  if(privateMap&&(!p||p.active===false))throw Error('販売できない商品です：'+id);
  const hasVariants=Array.isArray(p?.variants)&&p.variants.length>0;
  if(!hasVariants&&quantities[id]!==null&&(!Number.isInteger(quantities[id])||quantities[id]<qty))throw Error('在庫が不足しています：'+id+'（必要 '+qty+'点）');
  if(privateMap){
   if(!hasVariants&&p.stock!==null&&(!Number.isInteger(p.stock)||p.stock<qty))throw Error('在庫が不足しています（管理側）：'+id);
  }
 }
 for(const item of parsed.items){
  if(!item.variant)continue;
  const privateProduct=privateMap?.get(item.id);
  const privateVariant=privateProduct?.variants?.find(v=>v.code===item.variant);
  if(privateProduct&&!privateVariant)throw Error('登録されていないバリエーションです：'+item.id+'_'+item.variant);
  const key=item.key;
  if(privateVariant && Number.isInteger(privateVariant.stock) && !(key in variantQuantities))
   throw Error('カラー別在庫が未公開です。管理画面から商品を再公開してください：'+key);
  const qty=variantQuantities[key]??null;
  if(qty!==null&&(!Number.isInteger(qty)||qty<item.qty))throw Error('このバリエーションは在庫不足です：'+item.id+'_'+item.variant);
  if(Number.isInteger(privateVariant?.stock)&&privateVariant.stock<item.qty)throw Error('このバリエーションは在庫不足（管理側）です：'+key);
 }
}
// All prices are frozen at first reservation. Subsequent cancellations recalculate
// using the originally accepted SKU prices and pair discounts, never today's catalog.
function reprice(lines,bundles,offer={},beforeAppDiscountOnly=false){
 const counts=new Map(), prices=new Map();let subtotal=0;
 for(const x of lines){
  subtotal+=x.unitPrice*x.qty;
  counts.set(x.id,(counts.get(x.id)||0)+x.qty);
  prices.set(x.id,Math.min(prices.get(x.id)??Infinity,x.unitPrice));
 }
 let saving=0;
 const sorted=[...bundles].sort((a,b)=>b.discountAmount-a.discountAmount);
 for(const bundle of sorted){
  const [a,b]=bundle.productIds;
  const pairs=Math.min(counts.get(a)||0,counts.get(b)||0);
  if(pairs<=0)continue;
  const cut=Math.min(bundle.discountAmount,(prices.get(a)||0)+(prices.get(b)||0));
  saving+=cut*pairs;
  counts.set(a,counts.get(a)-pairs);counts.set(b,counts.get(b)-pairs);
 }
 const base=Math.max(0,subtotal-Math.min(subtotal,saving));
 if(beforeAppDiscountOnly)return base;
 const active=offer.discountRegistered===true;
 const value=Number(offer.discountValue)||0;
 const regularSubtotal=lines.filter(x=>x.preorder!==true).reduce((sum,x)=>sum+x.unitPrice*x.qty,0);
 const discountBase=offer.discountApplyToPreorder===false?(subtotal>0?Math.floor(base*regularSubtotal/subtotal):0):base;
 const eligibleDiscount=active&&discountBase>=Math.max(0,Number(offer.discountMinSpend)||0);
 const discount=eligibleDiscount&&offer.discountMode==='percent'?Math.min(discountBase,Math.round(discountBase*value/100)):eligibleDiscount&&offer.discountMode==='amount'?Math.min(discountBase,value):0;
 const hasPreorder=lines.some(x=>x.preorder===true);
 const shippingFee=hasPreorder&&['threshold','prefecture'].includes(offer.shippingMode)&&((offer.shippingThreshold||0)<=0||base<(offer.shippingThreshold||0))?(offer.shippingCharge||0):0;
 return base-discount+shippingFee;
}
// Show novelty using the pre-app-discount subtotal; maintain this after item cancellation.
function giftLabel(order){
 const lines=order.lines||order.remainingLines||[];
 if(!lines.length)return '';
 const mode=order.noveltyMode;
 const eligible=mode==='all'||mode==='minimum'&&reprice(lines,order.bundles||[],order,true)>=order.noveltyMinSpend||mode==='product'&&lines.some(x=>x.id===order.noveltyProductId);
 return eligible?'🎁 ノベルティ対象｜'+(order.noveltyName||'ノベルティ')+'　※商品と一緒に必ずお渡しください':'';
}
function refreshGift(order){for(const id of ['review-gift','prepared-gift']){const el=$(id);if(!el)continue;const name=giftLabel(order);el.textContent=name;el.hidden=!name;}}

const sameItems=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const compactItems=items=>items.map(({id,variant,qty})=>({id,variant,qty}));
const refsForOrder=raw=>({
 sale:doc(db,'brands',user.uid,'scannedOrders',raw.o),
 confirmation:doc(db,'publicOrderConfirmations',brand.slug,'orders',raw.o),
 stock:doc(db,'publishedStock',brand.slug),
 catalog:doc(db,'publishedCatalogs',brand.slug),
 settings:doc(db,'brandSettings',brand.slug)
});
function fillItems(elementId,items,canCancel=false){
 const el=$(elementId);el.replaceChildren();
 for(const item of items){
  const li=document.createElement('li'),left=document.createElement('div'),name=document.createElement('div'),qty=document.createElement('div');
  name.className='line-name';name.textContent=item.name;left.append(name);
  if(candidate?.noveltyMode==='product'&&item.id===candidate.noveltyProductId){const tag=document.createElement('span');tag.className='product-novelty-tag';tag.textContent='ノベルティ対象商品';left.append(tag);}
  if(item.variantName||item.variant){const v=document.createElement('div');v.className='line-variant';v.textContent='バリエーション：'+(item.variantName||item.variant);left.append(v);}
  const code=document.createElement('div');code.className='line-code';code.textContent='商品コード：'+item.id+(item.variant?'_'+item.variant:'');left.append(code);
  qty.className='line-qty';qty.textContent='× '+item.qty;
  const info=document.createElement('div');info.className='line-info';info.append(left,qty);li.append(info);
  if(canCancel){
   const btn=document.createElement('button');btn.type='button';btn.className='cancel-line';btn.dataset.cancelKey=item.key||item.id+'::'+item.variant;
   btn.textContent='この商品を取り消す（'+item.qty+'点）';btn.disabled=working;
   li.append(btn);
  }
  el.append(li);
 }
}
function acceptedView(order,already=false){
 candidate=order;refreshGift(order);
 if(order.status==='cancelled'||!order.lines.length){display('cancelled');return;}
 if(order.status==='handedOff'){
  fillItems('prepared-items',order.lines,false);
  $('prepared-total').textContent=yen(order.amount);
  $('prepared-panel').querySelector('.status-badge').textContent='すでにお渡し済み';
  $('prepared-panel').querySelector('.step-hint').textContent='この注文はお渡し済みです。再度在庫は減らしていません。';
  $('handoff').hidden=true;$('prepared-cancel-all').hidden=true;display('prepared');return;
 }
 $('handoff').hidden=false;
 $('review-total').textContent=yen(order.amount);$('review-shipping').textContent=order.hasPreorder?'予約商品あり／'+(order.shippingFee>0?'送料 '+yen(order.shippingFee):'送料当社負担'):'';
 fillItems('review-items',order.lines,true);
 $('review-status').textContent=already?'確保済み注文を再表示しています。追加の在庫減算はありません。':'QRを読み取り、在庫を確保しました。';
 $('customer-checked').checked=false;$('prepare').disabled=true;
 $('review-error').hidden=true;$('review-error').textContent='';
 display('review');
}
function prepView(){
 if(!candidate)return;
 fillItems('prepared-items',candidate.lines,true);
 $('prepared-total').textContent=yen(candidate.amount);$('prepared-shipping').textContent=candidate.hasPreorder?'予約商品：'+(candidate.shippingFee>0?'送料 '+yen(candidate.shippingFee):'送料当社負担')+'。お客様がQR読取後に配送先を入力します。':'';refreshGift(candidate);
 $('prepared-panel').querySelector('.status-badge').textContent='在庫確保済み';
 $('prepared-panel').querySelector('.step-hint').textContent='準備する商品と数量はこちらです。不要な商品はこの画面からも取り消せます。';
 $('handoff').hidden=false;display('prepared');
}
async function reserveAtScan(parsed,quote){
 const {raw,items,counts}=parsed;
 const refs=refsForOrder(raw);
 const ids=[...counts.keys()];
 const productRefs=ids.map(id=>doc(db,'brands',user.uid,'products',id));
 return runTransaction(db,async tx=>{
  // Firebase transactions retry if another staff member changes the same stock.
  const sold=await tx.get(refs.sale);
  if(sold.exists()){
   const old=sold.data();
   if(old.originalAmount!==undefined){
    if(old.originalAmount!==quote.amount||!sameItems(old.originalItems,compactItems(items)))throw Error('同じ注文番号ですが、元の商品または金額が一致しません。');
   }else if(old.amount!==quote.amount||!sameItems(old.items,compactItems(items))){
    throw Error('同じ注文番号ですが、元の商品または金額が一致しません。');
   }
   if(!Array.isArray(old.originalLines))throw Error('以前の形式で確保した注文です。個別取消には対応していません。管理者へお問い合わせください。');
   return {already:true,data:old};
  }
  // Preserve the public cancellation marker: deleting a sale must never make its QR reusable.
  // All reads precede writes. Concurrency on stock prevents overselling.
  const customerRef=doc(db,'customerOrders',brand.slug,'orders',raw.o);
  const [ackSnap,stockSnap,catalogSnap,settingsSnap,customerSnap,...prodSnaps]=await Promise.all([tx.get(refs.confirmation),tx.get(refs.stock),tx.get(refs.catalog),tx.get(refs.settings),tx.get(customerRef),...productRefs.map(ref=>tx.get(ref))]);
  if(ackSnap.exists())throw Error(ackSnap.data().status==='cancelled'?'この購入QRは取消済みのため再利用できません。':'この購入QRはすでに受付済みです。履歴を確認してください。');
  if(!stockSnap.exists()||!catalogSnap.exists())throw Error('商品・在庫の公開が未完了です。');
  const stock=stockSnap.data(),catalog=catalogSnap.data();
  if(stock.brandId!==user.uid||catalog.brandId!==user.uid)throw Error('別ブランドの商品です。');
  const privateMap=new Map();prodSnaps.forEach((snap,i)=>{if(snap.exists())privateMap.set(ids[i],snap.data());});
  const latest=calculate(parsed,catalog,settingsSnap.exists()&&settingsSnap.data().brandId===user.uid?settingsSnap.data():{});
  if(latest.amount!==quote.amount)throw Error('商品価格が変更されました。QRを作り直してください。');
  const customer=customerSnap.exists()?customerSnap.data():null;
  if(raw.r===1 && (!customer||customer.registered!==true||customer.brandId!==user.uid||customer.slug!==brand.slug))throw Error('お客様の登録データを確認できません。QRを再発行してください。');
  if(raw.r===0&&customer&&customer.registered===true)throw Error('注文の登録状態が一致しません。QRを再発行してください。');
  if(latest.hasPreorder && (!customer||customer.hasPreorder!==true||customer.brandId!==user.uid||customer.shipping?.prefecture!==latest.shippingPrefecture))throw Error('予約商品の受付情報が見つかりません。購入QRを再発行してください。');
  checkStock(parsed,stock,privateMap);
  const originalLines=latest.details.map(x=>({id:x.id,variant:x.variant,qty:x.qty,key:x.key,name:x.name,variantName:x.variantName,unitPrice:x.unitPrice,preorder:x.preorder===true}));
  const bundles=(catalog.bundles||[]).filter(b=>Array.isArray(b.productIds)&&b.productIds.length===2&&b.productIds.every(id=>counts.has(id))&&Number.isInteger(b.discountAmount)&&b.discountAmount>0)
    .map(b=>({productIds:[...b.productIds],discountAmount:b.discountAmount}));
  if(reprice(originalLines,bundles,latest)!==latest.amount)throw Error('セット割引の計算に不整合があります。');
  const newQuantities={...stock.quantities};
  const newVariantQuantities={...(stock.variantQuantities||{})};
  for(const [id,qty] of counts){
   const privateProduct=privateMap.get(id);
   if(!(privateProduct.variants||[]).length && Number.isInteger(newQuantities[id]))newQuantities[id]-=qty;
   else if((privateProduct.variants||[]).length)newQuantities[id]=null;
   const newVariants=(privateProduct.variants||[]).map(v=>({...v}));
   let variantChanged=false;
   for(const item of items.filter(x=>x.id===id && x.variant)){
    const v=newVariants.find(x=>x.code===item.variant);
    if(!v)throw Error('バリエーション情報が一致しません。');
    if(Number.isInteger(newVariantQuantities[item.key]))newVariantQuantities[item.key]-=item.qty;
    if(Number.isInteger(v.stock)){v.stock-=item.qty;variantChanged=true;}
   }
   if(Number.isInteger(privateProduct.stock)||variantChanged){
    const update={updatedAt:serverTimestamp()};
    if((privateProduct.variants||[]).length)update.stock=null;
    else if(Number.isInteger(privateProduct.stock))update.stock=privateProduct.stock-qty;
    if(variantChanged)update.variants=newVariants;
    tx.update(productRefs[ids.indexOf(id)],update);
   }
  }
  tx.update(refs.stock,{quantities:newQuantities,variantQuantities:newVariantQuantities,updatedAt:serverTimestamp()});
  const data={orderId:raw.o,brandId:user.uid,originalItems:compactItems(items),originalAmount:latest.amount,
   originalLines,remainingLines:originalLines,bundles,items:compactItems(items),amount:latest.amount,status:'reserved',
   discountMode:latest.discountMode,discountValue:latest.discountValue,discountMinSpend:latest.discountMinSpend,discountRegistered:latest.discountRegistered,discountApplyToPreorder:latest.discountApplyToPreorder,
   shippingFee:latest.shippingFee,shippingMode:latest.shippingMode,shippingThreshold:latest.shippingThreshold,shippingCharge:latest.shippingCharge,shippingPrefecture:latest.shippingPrefecture,
   hasPreorder:latest.hasPreorder,hasCustomerData:!!customer,
   noveltyMode:latest.noveltyMode,noveltyName:latest.noveltyName,noveltyMinSpend:latest.noveltyMinSpend,noveltyProductId:latest.noveltyProductId,
   scanTime:serverTimestamp(),updatedAt:serverTimestamp()};
  tx.set(refs.sale,data);
  tx.set(refs.confirmation,{slug:brand.slug,brandId:user.uid,orderId:raw.o,status:'confirmed',confirmedAt:serverTimestamp(),
    amount:latest.amount,modified:false,hasPreorder:latest.hasPreorder,updatedAt:serverTimestamp()});
  return {already:false,data};
 },{maxAttempts:5});
}
async function loadQr(text){
 if(!ready()||stage!=='scan')return;
 working=true;$('camera-start').disabled=true;
 say('注文内容を検証し、在庫を確保しています…');
 try{
  const parsed=parseOrder(text),refs=refsForOrder(parsed.raw);
  const [snap,settingSnap]=await Promise.all([getDoc(refs.catalog),getDoc(refs.settings)]);
  if(!snap.exists()||snap.data().brandId!==user.uid)throw Error('このブランドの商品公開が未完了です。');
  const quote=calculate(parsed,snap.data(),settingSnap.exists()&&settingSnap.data().brandId===user.uid?settingSnap.data():{});
  const result=await reserveAtScan(parsed,quote);
  acceptedView({raw:parsed.raw,lines:result.data.remainingLines,amount:result.data.amount,status:result.data.status,bundles:result.data.bundles||[],discountMode:result.data.discountMode,discountValue:result.data.discountValue,discountMinSpend:result.data.discountMinSpend,discountRegistered:result.data.discountRegistered,discountApplyToPreorder:result.data.discountApplyToPreorder,shippingFee:result.data.shippingFee,shippingMode:result.data.shippingMode,shippingThreshold:result.data.shippingThreshold,shippingCharge:result.data.shippingCharge,shippingPrefecture:result.data.shippingPrefecture,hasPreorder:result.data.hasPreorder,noveltyMode:result.data.noveltyMode,noveltyName:result.data.noveltyName,noveltyMinSpend:result.data.noveltyMinSpend,noveltyProductId:result.data.noveltyProductId},result.already);
 }catch(err){
  console.error('MY EXPO BAG QR確認／在庫確保エラー',err);
  const code=String(err?.code||'');
  const friendly=code==='permission-denied'?'Firebaseの権限により在庫確保が拒否されました。ルールとブランド管理権限を確認してください。':
    code==='unavailable'?'Firebaseへの接続に失敗しました。通信状況を確認し、再度読み取ってください。':
    code==='failed-precondition'?'在庫情報または注文状態が更新されています。新しいQRで再度お試しください。':
    (err?.message||'注文の確認または在庫確保に失敗しました。');
  say('QRは認識しましたが、注文を確定できませんでした。\n'+friendly,true);candidate=null;
 }
 finally{working=false;document.querySelectorAll('.cancel-line').forEach(b=>b.disabled=false);if(stage==='scan'&&user){$('camera-start').disabled=false;}}
}
async function cancelLine(key,all=false){
 if(!ready()||!candidate||!['review','prepared'].includes(stage))return;
 const target=candidate.lines.find(x=>x.key===key);
 if(!all&&!target)return;
 const subject=all?'残りの商品すべて':target.name+(target.variantName?'（'+target.variantName+'）':'')+' × '+target.qty;
 if(!window.confirm(subject+'を取り消しますか？\n在庫を戻し、合計金額を再計算します。'))return;
 working=true;const previousStage=stage;
 document.querySelectorAll('.cancel-line,#prepare,#handoff,#retry,#cancel-all,#prepared-cancel-all').forEach(b=>b.disabled=true);
 $('review-error').hidden=true;
 try{
  const refs=refsForOrder(candidate.raw);
  const updated=await runTransaction(db,async tx=>{
   const saleSnap=await tx.get(refs.sale);
   if(!saleSnap.exists())throw Error('注文履歴が見つかりません。');
   const sale=saleSnap.data();
   if(sale.status!=='reserved')throw Error('この注文は確保中ではありません。取り消しできません。');
   if(!Array.isArray(sale.originalLines)||!Array.isArray(sale.remainingLines))throw Error('以前の形式の注文は取り消せません。');
   const removed=all?sale.remainingLines:sale.remainingLines.filter(x=>x.key===key);
   if(!removed.length)throw Error('この商品はすでに取り消されています。画面を再表示してください。');
   const kept=all?[]:sale.remainingLines.filter(x=>x.key!==key);
   const totals=new Map();for(const line of removed)totals.set(line.id,(totals.get(line.id)||0)+line.qty);
   const ids=[...totals.keys()];const productRefs=ids.map(id=>doc(db,'brands',user.uid,'products',id));
   const customerRef=doc(db,'customerOrders',brand.slug,'orders',candidate.raw.o);
   const [stockSnap,ackSnap,customerSnap,...privateSnaps]=await Promise.all([tx.get(refs.stock),tx.get(refs.confirmation),tx.get(customerRef),...productRefs.map(r=>tx.get(r))]);
   if(!stockSnap.exists()||!ackSnap.exists())throw Error('現在の在庫情報に不整合があります。');
   const stock=stockSnap.data(),next={...stock.quantities},nextVariants={...(stock.variantQuantities||{})};
   if(stock.brandId!==user.uid)throw Error('在庫の管理ブランドが一致しません。');
   ids.forEach((id,i)=>{
    if(!(id in next))throw Error('在庫情報が見つかりません：'+id);
    const qty=totals.get(id),current=next[id];
    // Parent stock does not control variants. Handle unvarianted items below, after reading product.
    if(current!==null&&!Number.isInteger(current))throw Error('在庫の復元数が不正です');
    if(!privateSnaps[i].exists())throw Error('元の商品が見つかりません：'+id);
    const priv=privateSnaps[i].data();
    if(!(priv.variants||[]).length && current!==null){if(current+qty>100000000)throw Error('在庫の復元数が不正です');next[id]=current+qty;}
    else if((priv.variants||[]).length)next[id]=null;
    const revised=(priv.variants||[]).map(v=>({...v}));
    let variantChanged=false;
    for(const line of removed.filter(x=>x.id===id && x.variant)){
     const key=id+'::'+line.variant;
     const currentVariantStock=nextVariants[key];
     if(Number.isInteger(currentVariantStock)){
      if(currentVariantStock+line.qty>100000000)throw Error('SKU在庫の復元数が不正です');
      nextVariants[key]=currentVariantStock+line.qty;
     }
     const variant=revised.find(v=>v.code===line.variant);
     if(!variant)throw Error('元のバリエーションが見つかりません：'+key);
     if(Number.isInteger(variant.stock)){variant.stock+=line.qty;variantChanged=true;}
    }
    if(Number.isInteger(priv.stock)||variantChanged){
     const update={updatedAt:serverTimestamp()};
     if((priv.variants||[]).length)update.stock=null;
     else if(Number.isInteger(priv.stock)){if(priv.stock+qty>100000000)throw Error('商品在庫が上限を超えます');update.stock=priv.stock+qty;}
     if(variantChanged)update.variants=revised;
     tx.update(productRefs[i],update);
    }
   });
   const amount=reprice(kept,sale.bundles||[],sale);
   const base=reprice(kept,sale.bundles||[],sale,true);
   const shippingFee=kept.some(x=>x.preorder===true)&&['threshold','prefecture'].includes(sale.shippingMode)&&((sale.shippingThreshold||0)<=0||base<(sale.shippingThreshold||0))?(sale.shippingCharge||0):0;
   const nextStatus=kept.length?'reserved':'cancelled';
   tx.update(refs.stock,{quantities:next,variantQuantities:nextVariants,updatedAt:serverTimestamp()});
   if(kept.length){
    tx.update(refs.sale,{items:compactItems(kept),remainingLines:kept,amount,shippingFee,status:nextStatus,updatedAt:serverTimestamp()});
   }else{
    // Full cancellation removes the sale and private buyer record atomically.
    // The public confirmation is retained as a non-personal QR replay blocker.
    tx.delete(refs.sale);
    if(customerSnap.exists())tx.delete(customerRef);
   }
   tx.update(refs.confirmation,{amount:kept.length?amount:0,status:kept.length?'confirmed':'cancelled',hasPreorder:kept.some(x=>x.preorder===true),modified:true,updatedAt:serverTimestamp()});
   return {lines:kept,amount,shippingFee,hasPreorder:kept.some(x=>x.preorder===true),status:nextStatus};
  },{maxAttempts:5});
  candidate={...candidate,...updated};refreshGift(candidate);
  if(updated.status==='cancelled'){display('cancelled');}
  else if(previousStage==='prepared')prepView();else acceptedView(candidate,true);
 }catch(err){console.error(err);const errorEl=$('review-error');errorEl.textContent=err.message||'取消処理に失敗しました。';errorEl.hidden=false;
  if(stage==='prepared')window.alert(errorEl.textContent);}
 finally{working=false;document.querySelectorAll('.cancel-line,#retry,#handoff,#cancel-all,#prepared-cancel-all').forEach(b=>b.disabled=false);$('prepare').disabled=(!$('customer-checked').checked||working);}
}
async function handoff(){
 if(!ready()||stage!=='prepared'||!candidate)return;
 working=true;$('handoff').disabled=true;
 try{
  const refs=refsForOrder(candidate.raw);
  const expiryMap={1:1,3:3,5:5,10:10};
  const data=await runTransaction(db,async tx=>{
   const [s,settingsSnap]=await Promise.all([tx.get(refs.sale),tx.get(refs.settings)]);
   if(!s.exists())throw Error('注文履歴が見つかりません。');
   if(s.data().status==='handedOff')return s.data();
   if(s.data().status!=='reserved')throw Error('注文は取り消されています。お渡しできません。');
   const settings=settingsSnap.exists()&&settingsSnap.data().brandId===user.uid?settingsSnap.data():{};
   const handoffExpiryMinutes=expiryMap[Number(settings?.checkout?.handoffExpiryMinutes)]||5;
   tx.update(refs.sale,{status:'handedOff',updatedAt:serverTimestamp()});
   tx.update(refs.confirmation,{status:'handedOff',modified:true,hasPreorder:!!s.data().hasPreorder,amount:s.data().amount,handedOffAt:serverTimestamp(),expiresInMinutes:handoffExpiryMinutes,updatedAt:serverTimestamp()});
   return {...s.data(),status:'handedOff',handoffExpiryMinutes};
  });
  candidate.status=data.status;display('closed');
 }catch(err){window.alert(err.message||'お渡し情報を保存できませんでした。');}
 finally{working=false;$('handoff').disabled=false;}
}
async function stopCamera(){
 const active=scanner;scanner=null;
 if(active){try{await active.stop();}catch{}try{active.clear();}catch{}}
 $('camera-stop').disabled=true;
}

let scannerLibraryLoading=null;
async function ensureScannerLibrary(){
 if(window.Html5Qrcode)return true;
 if(!scannerLibraryLoading){
  scannerLibraryLoading=new Promise((resolve,reject)=>{
   const tag=document.createElement('script');
   tag.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
   tag.async=true;
   tag.onload=()=>window.Html5Qrcode?resolve(true):reject(Error('QRカメラプログラムを読み込めませんでした。'));
   tag.onerror=()=>reject(Error('QRカメラプログラムを取得できません。インターネット接続をご確認ください。'));
   document.head.appendChild(tag);
  }).catch(err=>{scannerLibraryLoading=null;throw err;});
 }
 return scannerLibraryLoading;
}
async function startCamera(){
 if(!ready()||stage!=='scan'||cameraStarting)return;
 cameraStarting=true;$('camera-start').disabled=true;
 try{
  await ensureScannerLibrary();
  await stopCamera();
  const onDecoded=async text=>{
   if(working||stage!=='scan')return;
   working=true;
   try{await stopCamera();}finally{working=false;}
   await loadQr(text);
  };
  const opts={fps:8,qrbox:{width:225,height:225}};
  // The environment-facing constraint is not supported by every browser/camera.
  // Retry with a physical camera ID if the browser rejects that constraint.
  let firstError=null;
  try{
   scanner=new window.Html5Qrcode('reader');
   await scanner.start({facingMode:'environment'},opts,onDecoded,()=>{});
  }catch(err){
   firstError=err;
   await stopCamera();
   if(err?.name==='NotAllowedError'||err?.name==='SecurityError')throw err;
   const cameras=await window.Html5Qrcode.getCameras();
   if(!cameras?.length)throw firstError;
   const preferred=cameras.find(c=>/back|rear|environment|背面|後面/i.test(c.label||''))||cameras[cameras.length-1];
   scanner=new window.Html5Qrcode('reader');
   await scanner.start(preferred.id,opts,onDecoded,()=>{});
  }
  $('camera-stop').disabled=false;say('QRをカメラ枠に合わせてください。');
 }catch(err){console.error('QRカメラ起動エラー',err);
   const msg=err?.name==='NotAllowedError'?'カメラの利用が許可されていません。ブラウザのカメラ権限を確認してください。':
     err?.name==='NotFoundError'?'カメラが見つかりません。カメラ搭載端末でお試しください。':
     err?.message||'カメラを起動できません。カメラの権限と通信状況をご確認ください。';
   say('カメラを起動できませんでした。\n'+msg,true);await stopCamera();}
 finally{cameraStarting=false;if(stage==='scan'&&user)$('camera-start').disabled=false;}
}
function reset(){candidate=null;$('customer-checked').checked=false;$('prepare').disabled=true;display('scan');say('QRの読み取り待ちです。');$('camera-start').disabled=!user;}
document.querySelector('header a[href]').addEventListener('click',event=>{
 if(candidate?.status==='reserved'&&['review','prepared'].includes(stage)){event.preventDefault();window.alert('この注文は在庫確保済みです。管理画面へ戻る前に、お渡しを完了するか、残りの商品をすべて取り消してください。');}
});
$('camera-start').addEventListener('click',startCamera);
$('camera-stop').addEventListener('click',stopCamera);
$('customer-checked').addEventListener('change',()=>{$('prepare').disabled=!$('customer-checked').checked||working;});
$('prepare').addEventListener('click',()=>{if(ready()&&stage==='review'&&candidate&&$('customer-checked').checked)prepView();});
document.addEventListener('click',event=>{const b=event.target.closest('[data-cancel-key]');if(b)cancelLine(b.dataset.cancelKey);});
$('cancel-all').addEventListener('click',()=>cancelLine('',true));
$('prepared-cancel-all').addEventListener('click',()=>cancelLine('',true));
$('retry').addEventListener('click',()=>{if(candidate?.status==='reserved'){window.alert('在庫が確保されています。別のQRへ進む場合は、先に商品をすべて取り消すか、お渡しまで完了してください。');return;}reset();});
$('handoff').addEventListener('click',handoff);
$('next-scan').addEventListener('click',async()=>{reset();await startCamera();});
$('cancelled-next').addEventListener('click',async()=>{reset();await startCamera();});
if(['apiKey','authDomain','projectId','appId'].some(k=>!firebase[k]))say('Firebaseの接続情報が見つかりません。',true);
else{
 const app=getApps().length?getApp():initializeApp(firebase);db=getFirestore(app);
 onAuthStateChanged(getAuth(app),async u=>{
  if(!u){location.replace(loginUrl);return;}
  try{
   const s=await getDoc(doc(db,'brands',u.uid));if(!s.exists()||s.data().ownerUid!==u.uid)throw Error('ブランド管理権限がありません。');
   user=u;brand=s.data();$('auth-state').textContent='ログイン中：'+brand.displayName;
   $('camera-start').disabled=false;
  }catch(err){console.error(err);say('ブランド情報を確認できませんでした。',true);}
 });
}
