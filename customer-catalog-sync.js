/**
 * MY EXPO BAG TEST — shared automatic, public-safe catalog synchronizer.
 * Runs AFTER a private product/category/image write is committed.
 * No visitor personal data, private draft-only fields, or billing secrets are published.
 * The original snapshot publisher is shared by detailed editor and quick editor.
 */
import {collection,doc,getDocsFromServer,getDocFromServer,writeBatch,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const IMAGE_DATA_LIMIT=109200;
const validPeriods=['上旬','中旬','下旬'];
const toHex=bytes=>Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('');
async function imageDigest(image,image2){const input=new TextEncoder().encode(image+'\u0000'+image2);return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',input)));}
const syncFlag=(uid,slug)=>'meb-auto-publication-pending:'+uid+':'+slug;
export function markCustomerSyncPending(uid,slug){try{localStorage.setItem(syncFlag(uid,slug),'1');}catch(_){/* browser storage may be unavailable */}}
export function customerSyncIsPending(uid,slug){try{return localStorage.getItem(syncFlag(uid,slug))==='1';}catch(_){return false;}}
export function clearCustomerSyncPending(uid,slug){try{localStorage.removeItem(syncFlag(uid,slug));}catch(_){/* noop */}}
export async function syncCustomerCatalog({db,uid,slug,pro=false,onProgress=()=>{}}){
 if(!db||!uid||!slug)throw Error('ブランドの情報がありません。');
 let publicationStage='準備';
 try{
  // Read current server data, not a potentially stale form or previous page view.
  publicationStage='商品の読込';
  const [drafts,catSnapshot,oldSnapshot]=await Promise.all([
   getDocsFromServer(collection(db,'brands',uid,'products')),getDocFromServer(doc(db,'brands',uid,'catalogSettings','main')),getDocFromServer(doc(db,'publishedCatalogs',slug))
  ]);
  const source=drafts.docs.map(x=>x.data());
  if(!pro&&(source.length>10||source.some(p=>p.preorder||p.preorderAll||(p.variants||[]).some(v=>v.preorder)||(p.combos||[]).length)))throw Error('Free版の利用上限またはPro.限定商品が含まれています。');
  for(const item of source.filter(p=>p.active!==false)){const rows=item.variants?.length?item.variants:[item];for(const v of rows)if(v.preorder===true&&(!Number.isInteger(v.releaseYear)||!Number.isInteger(v.releaseMonth)||!validPeriods.includes(v.releasePeriod)||!Number.isInteger(v.reservationStock)))throw Error('予約商品の年月・時期・予約品在庫が未設定です：'+item.name+' / '+(v.name||'なし'));}
  const visible=source.filter(productRecord=>productRecord.active!==false && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(productRecord.id));
  const ids=new Set(visible.map(productRecord=>productRecord.id));
  const categoryNames=catSnapshot.exists()&&Array.isArray(catSnapshot.data().categories)
    ?catSnapshot.data().categories.filter(v=>typeof v==='string') : [];
  for(const productRecord of visible)if(!categoryNames.includes(productRecord.categoryName))categoryNames.push(productRecord.categoryName);
  const categoriesPublic=categoryNames.map(n=>({id:n,name:n}));
  publicationStage='公開用データ作成';
  const exposed=visible.map(productRecord=>({
   id:productRecord.id,name:productRecord.name,categoryId:productRecord.categoryName,price:productRecord.price,
   eventPrice:productRecord.eventPrice??null,noveltyTarget:productRecord.noveltyTarget===true,preorder:productRecord.preorder===true,reservationPriceMode:productRecord.reservationPriceMode||'normal',releaseYear:productRecord.releaseYear??null,releaseMonth:productRecord.releaseMonth??null,releasePeriod:productRecord.releasePeriod||'',stock:productRecord.variants?.length?null:(productRecord.preorder===true?productRecord.reservationStock??null:productRecord.stock??null),
   variants:(productRecord.variants||[]).map(v=>({code:v.code,name:v.name,price:v.price??null,eventPrice:v.eventPrice??null,stock:v.preorder===true?v.reservationStock??null:v.stock??null,preorder:v.preorder===true,reservationPriceMode:v.reservationPriceMode||'normal',releaseYear:v.releaseYear??null,releaseMonth:v.releaseMonth??null,releasePeriod:v.releasePeriod||''}))
  }));
  // Each product can propose up to 3 combinations. Keep the best discount
  // once when both sides define the same pair. Not an ordered purchase.
  const pairs=new Map();
  for(const productRecord of visible){
   const combos=Array.isArray(productRecord.combos)?productRecord.combos:(productRecord.comboProductId?[{productId:productRecord.comboProductId,discount:productRecord.comboDiscount||0}]:[]);
   for(const c of combos.slice(0,3)){
    if(!ids.has(c.productId)||c.productId===productRecord.id)continue;
    const pair=[productRecord.id,c.productId].sort();const key=pair.join('::');
    const amount=Math.max(0,Math.floor(Number(c.discount)||0));
    const old=pairs.get(key);
    if(!old||amount>old.discountAmount)pairs.set(key,{id:'pair-'+pair.join('-'),name:'一緒にいかがですか？',productIds:pair,discountAmount:amount});
   }
  }
  publicationStage='商品画像読込';
  const oldPublicProducts=new Map((oldSnapshot.exists()?oldSnapshot.data().products||[]:[]).map(p=>[p.id,p]));
  const oldImageIds=new Set(oldSnapshot.exists()&&Array.isArray(oldSnapshot.data().publishedImageIds)?oldSnapshot.data().publishedImageIds:[]);
  const uploaded=[],imageChanges=[];
  for(const productRecord of visible){
   const imageSnap=await getDocFromServer(doc(db,'brands',uid,'productImages',productRecord.id));
   if(!imageSnap.exists())continue;
   const data=imageSnap.data(),image=data.imageData,image2=data.imageData2||'';
   if(typeof image!=='string'||image.length>IMAGE_DATA_LIMIT||!/^data:image\/(webp|jpeg);base64,/.test(image))continue;
   const img2=pro&&typeof image2==='string'&&image2.length<=IMAGE_DATA_LIMIT&&/^data:image\/(webp|jpeg);base64,/.test(image2)?image2:'';
   const digest=await imageDigest(image,img2);
   const record={id:productRecord.id,image,image2:img2,digest};
   uploaded.push(record);
   if(!oldImageIds.has(record.id)||oldPublicProducts.get(record.id)?.imageDigest!==digest)imageChanges.push(record);
  }
  publicationStage='画像アップロード';
  onProgress('画像を確認しました（更新 '+imageChanges.length+'枚）');
  // Avoid re-uploading unchanged, high-volume images on every price/stock save.
  // First sync from a legacy snapshot intentionally uploads all images once.
  for(let i=0;i<imageChanges.length;i+=100){
   const batch=writeBatch(db);
   for(const record of imageChanges.slice(i,i+100))batch.set(
    doc(db,'publishedCatalogs',slug,'images',record.id),
    {productId:record.id,imageData:record.image,imageData2:record.image2||'',updatedAt:serverTimestamp()}
   );
   await batch.commit();
  }
  const indexed=new Map(uploaded.map(p=>[p.id,p]));
  for(const p of exposed){const record=indexed.get(p.id);p.imageCount=record?(record.image2?2:1):0;p.imageDigest=record?.digest||'';}
  publicationStage='商品カタログ公開';
  // Write the public index AFTER images, so a reader never sees a new
  // public product with an image pointer that has not been uploaded yet.
  await (async()=>{const batch=writeBatch(db);
   batch.set(doc(db,'publishedCatalogs',slug),{
    brandId:uid,slug:slug,products:exposed,categories:categoriesPublic,
    bundles:[...pairs.values()],publishedImageIds:uploaded.map(x=>x.id),updatedAt:serverTimestamp()
   });await batch.commit();})();
  const previous=oldSnapshot.exists()&&Array.isArray(oldSnapshot.data().publishedImageIds)?oldSnapshot.data().publishedImageIds:[];
  const removed=previous.filter(id=>!uploaded.some(productRecord=>productRecord.id===id));
  for(let i=0;i<removed.length;i+=100){
   const batch=writeBatch(db);
   for(const id of removed.slice(i,i+100))batch.delete(doc(db,'publishedCatalogs',slug,'images',id));
   await batch.commit();
  }
  publicationStage='公開在庫同期';
  // Inventory is separate from the public catalog to avoid downloading large catalog documents per sale.
  // Publishing stock from the latest private draft prevents stale client overwrites.
  // Read private stock values INSIDE a transaction. A concurrent QR sale
  // retries the publish instead of accidentally restoring deducted inventory.
  let appliedStock=null;
  await runTransaction(db,async tx=>{
    const inventoryDocs=visible.map(productRecord=>doc(db,'brands',uid,'products',productRecord.id));
    const stocks=await Promise.all(inventoryDocs.map(ref=>tx.get(ref)));
    const next=Object.fromEntries(visible.map((productRecord,i)=>[
      productRecord.id,stocks[i].exists()&&!(stocks[i].data().variants||[]).length?((stocks[i].data().preorder===true?stocks[i].data().reservationStock:stocks[i].data().stock)??null):null
    ]));
    const variantQuantities={};
    visible.forEach((productRecord,i)=>{
      const current=stocks[i].exists()?stocks[i].data():productRecord;
      for(const variant of current.variants||[]){
        variantQuantities[productRecord.id+'::'+variant.code]=(variant.preorder===true?variant.reservationStock:variant.stock)??null;
      }
    });
    tx.set(doc(db,'publishedStock',slug),{
      brandId:uid,slug:slug,quantities:next,variantQuantities,updatedAt:serverTimestamp()
    });
    appliedStock={quantities:next,variantQuantities};
  });
  // Verify the public catalog contains every variant before reporting a successful publish.
  const publicCheck=await getDocFromServer(doc(db,'publishedCatalogs',slug));
  if(!publicCheck.exists())throw Error('公開データを確認できません。もう一度公開してください。');
  const confirmed=new Map((publicCheck.data().products||[]).map(p=>[p.id,p]));
  for(const p of exposed){
    const record=confirmed.get(p.id),expected=p.variants||[],received=record?.variants||[];
    if(!record||expected.length!==received.length||expected.some(v=>!received.some(x=>x.code===v.code&&x.name===v.name)))
      throw Error('バリエーションの公開検証に失敗：'+p.name+'。管理画面から公開操作をやり直してください。');
  }
  clearCustomerSyncPending(uid,slug);
  return {products:exposed,bundles:[...pairs.values()],categories:categoriesPublic,stock:appliedStock};
 }catch(error){
  const err=new Error('お客様ページの自動反映に失敗（'+publicationStage+'）：'+(error?.message||'通信と権限を確認してください。'));
  err.cause=error;
  throw err;
 }
}
