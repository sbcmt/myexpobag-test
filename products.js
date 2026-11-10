/** MY EXPO BAG v1.0.1 — brand-owned product management and public catalog publishing. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,getDocsFromServer,getDocFromServer,writeBatch,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const firebase=window.MEB_FIREBASE_CONFIG||{};
const loginUrl=new URL('./login.html',location.href).href;
const brandSetupUrl=new URL('./brand-setup.html',location.href).href;
const maxProducts=300;
let db,user=null,brand=null,products=new Map(),categories=[],importData=null,busy=false,brandSettingsExists=false;
let pendingImage=null,imageProcessing=false,imageRevision=0,imagesReady=[],imageKnown=new Set();
const coll=()=>collection(db,'brands',user.uid,'products');
const prodRef=id=>doc(db,'brands',user.uid,'products',id);
const catRef=()=>doc(db,'brands',user.uid,'catalogSettings','main');
const imageRef=id=>doc(db,'brands',user.uid,'productImages',id);
const brandSettingsRef=()=>doc(db,'brandSettings',brand.slug);
const selectedNoveltyIds=(overrides=new Map())=>{const merged=new Map(products);for(const [id,p] of overrides)merged.set(id,p);return [...merged.values()].filter(p=>p&&p.noveltyTarget===true).map(p=>p.id).sort();};
const trim=v=>String(v??'').trim();
const yen=n=>'¥'+Number(n).toLocaleString('ja-JP');
function status(message,error=false){const e=$('status');e.textContent=message;e.className='status'+(error?' error':'');e.hidden=false;}
function refreshActionButtons(){for(const id of ['product-save','import-save','images-save','publish-catalog'])$(id).disabled=busy||imageProcessing||(id==='import-save'&&!importData)||(id==='images-save'&&!imagesReady.length);if(user)categoryOptions();}
function setBusy(flag){busy=flag;refreshActionButtons();}
function money(value,label,optional=false){
 const v=trim(value);if(optional&&v==='')return null;
 if(!/^\d{1,9}$/.test(v)||Number(v)>100000000)throw Error(label+'は0〜100,000,000の整数で入力してください。');
 return Number(v);
}
// Images are isolated from product documents so product list reads stay small.
// Uploaded originals (<=15 MB) are converted in the browser to <=80 KiB each.
const IMAGE_DATA_LIMIT=109200; // data URI characters: roughly 80 KiB of image bytes
const MAX_ORIGINAL_IMAGE_BYTES=15*1024*1024;
function imagePreview(data){
 const img=$('product-image-preview');img.hidden=!data;
 if(data){img.src=data;img.alt='商品画像のプレビュー';}
 else img.removeAttribute('src');
}
function imageFormatOK(f){return /\.(?:jpe?g|png|webp|heic|heif)$/i.test(f.name||'') || /^image\/(?:jpe?g|png|webp|heic|heif)$/i.test(f.type||'');}
async function compressImage(file){
 if(!imageFormatOK(file))throw Error('画像はJPG・PNG・WebP・HEIC/HEIFから選択してください。');
 if(!file.size||file.size>MAX_ORIGINAL_IMAGE_BYTES)throw Error('元画像は1枚15MB以内にしてください。');
 const objectUrl=URL.createObjectURL(file);let bitmap;
 try{
  let photo;
  try{photo=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('画像形式を読み取れませんでした。'));img.src=objectUrl;});}
  catch(error){if(typeof createImageBitmap==='function'){try{bitmap=await createImageBitmap(file);photo=bitmap;}catch(_){/* unsupported */}}
   if(!photo)throw Error('画像を開けませんでした。iPhoneの場合は写真をJPEGで書き出して再度お試しください。');
  }
  const width=photo.naturalWidth||photo.width,height=photo.naturalHeight||photo.height;
  if(!width||!height)throw Error('画像のサイズを確認できませんでした。');
  for(const maxSide of [800,720,640,560,480,400,320]){
   const scale=Math.min(1,maxSide/Math.max(width,height));
   const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
   const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('画像処理に対応していないブラウザです。');
   // White product-photo background keeps transparent PNGs predictable in JPEG fallback.
   ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(photo,0,0,w,h);
   for(const mime of ['image/webp','image/jpeg']){
    for(const quality of [.83,.72,.60,.50,.40,.30]){
     const data=canvas.toDataURL(mime,quality);
     // Safari may silently encode a different image type: detect it.
     if(data.startsWith('data:'+mime+';base64,')&&data.length<=IMAGE_DATA_LIMIT)return data;
    }
   }
  }
  throw Error('80KB以下へ変換できませんでした。別の画像を試してください。');
 }finally{bitmap?.close?.();URL.revokeObjectURL(objectUrl);}
}
async function onImageSelected(){
 const file=$('product-image').files?.[0],revision=++imageRevision;
 pendingImage=null;imagePreview('');if(!file){$('product-image-hint').textContent='未選択の場合、登録済み画像は変更しません。';return;}
 imageProcessing=true;refreshActionButtons();$('product-image-hint').textContent='画像を自動圧縮しています…';
 try{const data=await compressImage(file);if(revision!==imageRevision)return;
  pendingImage=data;imagePreview(data);$('product-image-hint').textContent='保存画像：約'+Math.ceil((data.length-data.indexOf(',')-1)*3/4/1024)+'KB ／ 「商品を保存」で画像も登録';
 }catch(err){if(revision===imageRevision){$('product-image-hint').textContent='画像は未選択です。';$('product-image').value='';status(err.message,true);}}
 finally{if(revision===imageRevision){imageProcessing=false;refreshActionButtons();}}
}
async function loadSavedImage(id,revision){
 $('product-image-hint').textContent='登録済み画像を確認しています…';imagePreview('');
 try{
  const snap=await getDoc(imageRef(id));if(revision!==imageRevision)return;
  const data=snap.exists()?snap.data().imageData:'';
  imagePreview(typeof data==='string'&&/^data:image\/(webp|jpeg);base64,/.test(data)?data:'');
  $('product-image-hint').textContent=snap.exists()?'登録済み画像あり。画像を選び直すと上書きされます。':'画像未登録。画像を選択して保存できます。';
  if(snap.exists())imageKnown.add(id);
 }catch(error){if(revision===imageRevision)$('product-image-hint').textContent='登録済み画像の確認に失敗しました。';}
}
function clearImagesPreview(){imagesReady=[];$('images-save').disabled=true;$('images-preview').hidden=true;$('images-preview').replaceChildren();$('images-count').textContent='';}
async function imageBulkCheck(){
 clearImagesPreview();const archive=$('images-import').files?.[0];if(!archive)return;
 if(!window.JSZip){status('ZIP読み込みライブラリを読み込めません。インターネット接続を確認してください。',true);return;}
 if(!/\.zip$/i.test(archive.name)||archive.size>50*1024*1024){status('ZIPファイルは50MB以内にしてください。',true);return;}
 imageProcessing=true;refreshActionButtons();$('images-count').textContent='ZIPの内容を確認中…';
 try{
  const zip=await window.JSZip.loadAsync(await archive.arrayBuffer());
  const entries=Object.values(zip.files).filter(entry=>!entry.dir&&!/(^|\/)__MACOSX\//.test(entry.name)&&!/(^|\/)\./.test(entry.name));
  if(entries.length>50)throw Error('ZIPに入れられる画像は1回50枚までです。');
  if(!entries.length)throw Error('ZIPに画像がありません。');
  let total=0;const accepted=[],errors=[],seen=new Set(),duplicates=new Set();
  for(const entry of entries){
   const fileName=entry.name.split('/').pop();const match=fileName.match(/^(.+)\.(jpg|jpeg|png|webp|heic|heif)$/i);
   if(!match){errors.push(fileName+'：対応していない形式');continue;}
   const id=match[1];if(!products.has(id)){errors.push(fileName+'：商品ID「'+id+'」が未登録');continue;}
   if(seen.has(id)){duplicates.add(id);errors.push(fileName+'：商品IDが重複しています');continue;}
   seen.add(id);
   const size=entry._data?.uncompressedSize;
   if(!Number.isFinite(size)||size>MAX_ORIGINAL_IMAGE_BYTES||size<=0){errors.push(fileName+'：画像は展開後15MB以内にしてください');continue;}
   total+=size;if(total>150*1024*1024)throw Error('ZIP内の画像容量合計が150MBを超えています。');
   accepted.push({id,entry,fileName});
  }
  imagesReady=accepted.filter(e=>!duplicates.has(e.id));
  const box=$('images-preview');box.replaceChildren();
  for(const item of imagesReady){const el=document.createElement('div');el.textContent='✓ '+item.id+' ← '+item.fileName;box.append(el);}
  for(const error of errors){const el=document.createElement('div');el.style.color='#a4342c';el.textContent='× '+error;box.append(el);}
  box.hidden=false;$('images-count').textContent=imagesReady.length+'画像登録可能'+(errors.length?'／'+errors.length+'件除外':'');
  status(imagesReady.length?'内容を確認しました。保存ボタンで圧縮・登録できます。':'登録可能な画像がありません。',!imagesReady.length);
 }catch(err){clearImagesPreview();status('ZIPの確認に失敗しました：'+err.message,true);}
 finally{imageProcessing=false;refreshActionButtons();}
}
async function saveBulkImages(){
 if(busy||!imagesReady.length)return;
 const toSave=imagesReady.slice();if(!confirm(toSave.length+'件の画像を商品IDに紐づけて保存しますか？既存画像は上書きします。'))return;
 setBusy(true);let ok=0;const errors=[];
 try{
  for(const entry of toSave){
   status('画像を保存中… '+(ok+errors.length+1)+' / '+toSave.length+'（'+entry.id+'）');
   try{
    const blob=await entry.entry.async('blob');
    if(blob.size>MAX_ORIGINAL_IMAGE_BYTES)throw Error('展開した画像が15MBを超えています');
    const extension=entry.fileName.split('.').pop().toLowerCase();
    const mime={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'}[extension];
    const file=new File([blob],entry.fileName,{type:mime||'application/octet-stream'});
    const data=await compressImage(file);
    const batch=writeBatch(db);batch.set(imageRef(entry.id),{productId:entry.id,imageData:data,updatedAt:serverTimestamp()});
    await batch.commit();imageKnown.add(entry.id);ok++;
   }catch(error){console.error(error);errors.push(entry.id+'：'+(error.message||'保存失敗'));}
  }
  if(!errors.length){$('images-import').value='';clearImagesPreview();status(ok+'件の商品画像を保存しました。');}
  else{imagesReady=toSave.filter(e=>errors.some(v=>v.startsWith(e.id+'：')));$('images-count').textContent='失敗した'+imagesReady.length+'件は再試行できます';$('images-save').disabled=false;status(ok+'件保存、'+errors.length+'件失敗。\n'+errors.slice(0,5).join('\n'),true);}
 }finally{setBusy(false);}
}
const MAX_VARIANTS=100;
// A completely specified set of variant stocks determines the total available
// stock for this product (informational only). An item with variants is
// sellable exclusively according to its individual variant stock, never parent stock.
function totalOfVariantStocks(variants){
 if(!variants.length)return null;
 let sum=0;
 for(const v of variants){
  if(v.stock===null||v.stock===undefined||trim(v.stock)==='')return null;
  const n=Number(v.stock);
  if(!Number.isInteger(n)||n<0||n>100000000)return null;
  sum+=n;
 }
 return sum<=100000000?sum:null;
}
let totalAutoMode=false,manualTotalDraft='';
function updateTotalStockField(){
 const input=$('product-stock'),hint=$('product-stock-hint');
 const variants=[];let incomplete=false,unlimited=false;
 for(const row of $('variant-rows').children){
  const name=trim(row.querySelector('.variant-name').value),code=trim(row.querySelector('.variant-code').value);
  const price=trim(row.querySelector('.variant-price').value),eventPrice=trim(row.querySelector('.variant-event-price').value);
  const stock=trim(row.querySelector('.variant-stock').value),reserved=row.querySelector('.variant-preorder').checked;
  if(!name&&!code&&!price&&!eventPrice&&!stock&&!reserved)continue;
  if(!name||!code){incomplete=true;continue;}
  if(stock===''){unlimited=true;variants.push({stock:null});continue;}
  if(!/^\d+$/.test(stock)){incomplete=true;continue;}
  variants.push({stock});
 }
 const hasVariants=variants.length>0||incomplete;
 const sum=!incomplete&&!unlimited?totalOfVariantStocks(variants):null;
 if(!hasVariants){
  if(totalAutoMode)input.value=manualTotalDraft;
  totalAutoMode=false;input.readOnly=false;input.removeAttribute('aria-readonly');input.placeholder='空欄は無制限';
  hint.textContent='バリエーションなしの商品はここで在庫を入力します。空欄は上限なしです。';return;
 }
 if(!totalAutoMode)manualTotalDraft=input.value;
 totalAutoMode=true;input.value=sum===null?'':String(sum);input.readOnly=true;input.setAttribute('aria-readonly','true');
 input.placeholder=unlimited?'無制限（カラー別に管理）':'カラーごとに入力すると参考合計を表示';
 hint.textContent=incomplete?'バリエーション名・サブコードを入力してください。保存時に確認します。':
   unlimited?'カラー別の在庫に空欄があるため、総数は「無制限」です。空欄でも商品登録できます。':
   '参考合計：'+sum+'個。販売上限はカラー別在庫で判定します。';
}
function resetTotalStockState(value=''){
 totalAutoMode=false;manualTotalDraft=String(value??'');
 $('product-stock').value=manualTotalDraft;
 updateTotalStockField();
}
$('product-stock').addEventListener('input',()=>{if(!totalAutoMode)manualTotalDraft=$('product-stock').value;});
$('variant-rows').addEventListener('input',updateTotalStockField);
function parseVariants(value){
 const input=trim(value);if(!input)return [];
 const entries=input.split('|').map(v=>trim(v)).filter(Boolean);
 const used=new Set();return entries.map(item=>{const i=item.indexOf(':');if(i<1)throw Error('バリエーションは「BK:ブラック」の形式にしてください。');
  const code=trim(item.slice(0,i)).toUpperCase(),name=trim(item.slice(i+1));
  if(!/^[A-Z0-9_-]{1,25}$/.test(code)||!name||used.has(code))throw Error('サブコードまたは名前を確認してください。');
  used.add(code);return {code,name,price:null,eventPrice:null};
 });
}
function variantRow(values={}){
 const row=document.createElement('div');row.className='variant-entry';row.style.cssText='border-bottom:1px dashed #d7e2e8;padding:8px 0';
 const main=document.createElement('div');main.className='variant-row';
 const make=(label,cls,placeholder,value)=>{const wrap=document.createElement('div');wrap.className='field';const lb=document.createElement('label');lb.textContent=label;const input=document.createElement('input');input.className=cls;input.type='text';input.autocomplete='off';input.placeholder=placeholder;input.value=value??'';wrap.append(lb,input);return wrap;};
 main.append(make('バリエーション名（登録時必須）','variant-name','例：ブラック / M',values.name));
 const code=make('サブコード（登録時必須・末尾のみ）','variant-code','例：BK',values.code);const codeInput=code.querySelector('input');codeInput.maxLength=25;
 const codeBox=document.createElement('div');codeBox.className='subcode-input';const prefix=document.createElement('span');prefix.className='subcode-prefix';prefix.textContent=(trim($('product-id').value)||'商品ID')+'_';
 codeBox.append(prefix,codeInput);codeBox.classList.add('subcode-input');code.querySelector('label').after(codeBox);main.append(code);
 const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='danger';remove.addEventListener('click',()=>{row.remove();updateTotalStockField();toggleRelease();updateVariantVisibility();});main.append(remove);row.append(main);
 const prices=document.createElement('div');prices.className='cols';prices.append(make('バリエーション通常価格（任意）','variant-price','未設定なら商品価格',values.price));prices.append(make('バリエーション展示会特価（任意）','variant-event-price','未設定なら商品価格',values.eventPrice));prices.append(make('バリエーション在庫数（任意）','variant-stock','空欄は無制限・0は完売',values.stock));row.append(prices);
 const preorderWrap=document.createElement('label');preorderWrap.className='variant-preorder-label';
 const preorderBox=document.createElement('input');preorderBox.type='checkbox';preorderBox.className='variant-preorder';
 preorderBox.checked=values.preorder===true||values.preorder==='1';
 const preorderText=document.createElement('span');preorderText.textContent='このバリエーションを予約受注';
 preorderWrap.append(preorderBox,preorderText);row.append(preorderWrap);
 preorderBox.addEventListener('change',toggleRelease);
 return row;
}
function refreshSubcodePrefixes(){const id=trim($('product-id').value)||'商品ID';for(const el of document.querySelectorAll('.subcode-prefix'))el.textContent=id+'_';}
$('product-id').addEventListener('input',refreshSubcodePrefixes);
for(let m=1;m<=12;m++){const option=document.createElement('option');option.value=String(m);option.textContent=m+'月';$('release-month').append(option);}
function toggleRelease(){const entire=$('product-preorder').checked;const boxes=[...document.querySelectorAll('.variant-preorder')];for(const box of boxes){box.disabled=entire;box.parentElement.title=entire?'商品全体が予約受注のため、すべてのバリエーションが予約扱いになります。':'';}const required=entire||boxes.some(x=>x.checked);$('release-settings').hidden=!required;$('release-month').required=required;$('release-period').required=required;}
$('product-preorder').addEventListener('change',toggleRelease);toggleRelease();
function updateVariantVisibility(){
 $('variant-entry-hint').hidden=$('variant-rows').children.length===0;
}
function showVariants(variants=[]){
 const root=$('variant-rows');root.replaceChildren();const rows=variants;
 for(const v of rows)root.append(variantRow(v));
 refreshSubcodePrefixes();updateTotalStockField();toggleRelease();updateVariantVisibility();
}
function readVariants(id){
 const result=[],codes=new Set();
 for(const el of $('variant-rows').children){
  const name=trim(el.querySelector('.variant-name').value);
  const raw=trim(el.querySelector('.variant-code').value);
  const priceText=trim(el.querySelector('.variant-price').value);
  const eventText=trim(el.querySelector('.variant-event-price').value);
  const stockText=trim(el.querySelector('.variant-stock').value);
  const variantPreorder=el.querySelector('.variant-preorder').checked;
  if(!name&&!raw&&!priceText&&!eventText&&!stockText&&!variantPreorder)continue;
  if(!name||!raw)throw Error('バリエーション名とサブコードはセットで入力してください。');
  if(raw.startsWith(id+'_'))throw Error('サブコード欄には商品IDを含めず、BKなど末尾だけを入力してください。');
  const code=raw.toUpperCase();
  if(!/^[A-Z0-9_-]{1,25}$/.test(code)||codes.has(code))throw Error('サブコードの形式または重複を確認してください。');
  codes.add(code);
  const price=money(priceText,'バリエーション通常価格',true),eventPrice=money(eventText,'バリエーション展示会価格',true);
  if(price!==null&&eventPrice!==null&&eventPrice>=price)throw Error('バリエーション展示会価格は同じバリエーションの通常価格未満にしてください。');
  const stock=money(stockText,'バリエーション在庫数',true);
  result.push({code,name,price,eventPrice,stock,preorder:variantPreorder?true:null});
 }
 if(result.length>MAX_VARIANTS)throw Error('バリエーションは100件以内にしてください。');
 return result;
}
$('add-variant').addEventListener('click',()=>{
 if($('variant-rows').children.length>=MAX_VARIANTS){status('バリエーションは100件以内にしてください。',true);return;}
 const el=variantRow();$('variant-rows').append(el);updateTotalStockField();updateVariantVisibility();el.querySelector('.variant-name').focus();
});
showVariants();
const MAX_COMBOS=3;
function comboRow(values={}){
 const el=document.createElement('div');el.className='combo-entry';el.style.cssText='border-bottom:1px dashed #d7e2e8;padding:9px 0';
 const fields=document.createElement('div');fields.className='cols';
 const make=(label,cls,value,placeholder,type='text')=>{const wrap=document.createElement('div');wrap.className='field';const lb=document.createElement('label');lb.textContent=label;const input=document.createElement('input');input.className=cls;input.type=type;input.value=value??'';input.placeholder=placeholder;if(type==='number'){input.min='0';input.step='1';input.max='100000000'}else input.maxLength=40;wrap.append(lb,input);return wrap;};
 fields.append(make('組合せ商品ID（登録時必須）','combo-id',values.productId,'例：BG-002'));
 fields.append(make('組合せ時割引金額（税込・円）','combo-discount',values.discount??'','例：500','number'));
 const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='danger';remove.style.marginBottom='10px';remove.addEventListener('click',()=>{el.remove();updateComboAddButton()});
 el.append(fields,remove);return el;
}
function updateComboAddButton(){const count=$('combo-rows').children.length;$('add-combo').disabled=count>=MAX_COMBOS;$('combo-count').textContent=count+' / '+MAX_COMBOS+'件';$('combo-entry-hint').hidden=count===0;}
function showCombos(combos=[]){const box=$('combo-rows');box.replaceChildren();for(const item of combos)box.append(comboRow(item));updateComboAddButton();}
function readCombos(id){const rows=[];for(const el of $('combo-rows').children){const productId=trim(el.querySelector('.combo-id').value);const discountText=trim(el.querySelector('.combo-discount').value);
 if(!productId&&!discountText)continue;
 if(!productId)throw Error('組合せ割引金額を入力する場合は、組合せ商品IDも入力してください。');
 rows.push({productId,discount:discountText===''?0:discountText});
 }return validateCombos(id,rows);}
function validateCombos(id,entries){if(entries.length>MAX_COMBOS)throw Error('組合せは最大3件までです。');const seen=new Set();return entries.map(entry=>{
 const productId=trim(entry.productId);if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(productId))throw Error(id+'：組合せ商品IDに使用できない文字があります。');
 if(productId===id)throw Error(id+'：自分自身を組合せ商品に指定できません。');
 if(seen.has(productId))throw Error(id+'：同じ組合せ商品IDは重複登録できません。');seen.add(productId);
 return {productId,discount:money(entry.discount??0,id+'の組合せ割引金額')};
 });}
function existingCombos(p){if(Array.isArray(p?.combos))return p.combos;if(p?.comboProductId)return [{productId:p.comboProductId,discount:p.comboDiscount||0}];return [];}
$('add-combo').addEventListener('click',()=>{if($('combo-rows').children.length>=MAX_COMBOS)return;const row=comboRow();$('combo-rows').append(row);updateComboAddButton();row.querySelector('.combo-id').focus();});
showCombos();
function productOf(fields){
 const id=trim(fields.id),name=trim(fields.name),categoryName=trim(fields.categoryName);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(id))throw Error('商品IDは半角英数字で始まる40文字以内の英数字・-・_にしてください。');
 if(!name||name.length>100)throw Error(id+'：商品名は1〜100文字で入力してください。');
 if(!categoryName||categoryName.length>40)throw Error(id+'：カテゴリは1〜40文字で入力してください。');
 const price=money(fields.price,id+'の税込価格'),eventPrice=money(fields.eventPrice,id+'の展示会特価',true);
 if(eventPrice!==null&&eventPrice>=price)throw Error(id+'：展示会特価は税込価格より小さくしてください。');
 const rawVariants=Array.isArray(fields.variants)?fields.variants:parseVariants(fields.colors);
 if(rawVariants.length>MAX_VARIANTS)throw Error('バリエーションは100件以内です。');
 const variants=rawVariants.map(v=>{
  if(!v.code||!v.name||!/^[A-Z0-9_-]{1,25}$/i.test(v.code))throw Error('サブコード・バリエーション名を確認してください。');
  const variantPrice=money(v.price??'',id+'のバリエーション通常価格',true);
  const variantEvent=money(v.eventPrice??'',id+'のバリエーション展示会特価',true);
  const effectivePrice=variantPrice??price;
  if(variantEvent!==null&&variantEvent>=effectivePrice)throw Error(id+'：バリエーション展示会特価は通常価格より小さくしてください。');
  const variantStock=money(v.stock??'',id+'のバリエーション在庫数',true);
  const preorderOverride=v.preorder===true||v.preorder==='1'?true:v.preorder===false||v.preorder==='0'?false:null;
  return {code:trim(v.code).toUpperCase(),name:trim(v.name),price:variantPrice,eventPrice:variantEvent,stock:variantStock,preorder:preorderOverride};
 });
 if(new Set(variants.map(v=>v.code)).size!==variants.length)throw Error(id+'：サブコードが重複しています。');
 const janCode=trim(fields.janCode??'');if(janCode&&!/^\d{8,14}$/.test(janCode))throw Error(id+'：JANコードは8〜14桁の数字にしてください。');
 const stock=variants.length?null:money(fields.stock??'',id+'の在庫数',true); // SKU商品は総在庫を販売制限に使わない
   const preorder=fields.preorder===true;
   const hasReservation=preorder||variants.some(v=>v.preorder===true);
   const releaseMonth=hasReservation?Number(fields.releaseMonth):null;
   const releasePeriod=hasReservation?trim(fields.releasePeriod):'';
   if(hasReservation&&(!Number.isInteger(releaseMonth)||releaseMonth<1||releaseMonth>12||!['上旬','中旬','下旬'].includes(releasePeriod)))
     throw Error(id+'：予約商品は発売予定月（1～12月）と時期（上旬・中旬・下旬）が必須です。');
 const inputCombos=Array.isArray(fields.combos)?fields.combos:(fields.comboProductId?[{productId:fields.comboProductId,discount:fields.comboDiscount??0}]:[]);
 const combos=validateCombos(id,inputCombos);
 // Preserve the legacy first-combination fields until the customer-page promotion logic is migrated.
 const comboProductId=combos[0]?.productId||'',comboDiscount=combos[0]?.discount||0;
 return {id,name,categoryName,price,eventPrice,variants,active:fields.active!==false,noveltyTarget:fields.noveltyTarget===true,janCode,preorder,releaseMonth,releasePeriod,stock,combos,comboProductId,comboDiscount};
}
function inputData(){
 const id=trim($('product-id').value);
 return productOf({id,name:$('product-name').value,categoryName:$('product-category').value,
  price:$('product-price').value,eventPrice:$('product-event-price').value,variants:readVariants(id),active:$('product-active').checked,noveltyTarget:$('product-novelty').checked,
  janCode:$('product-jan').value,stock:$('product-stock').value,preorder:$('product-preorder').checked,releaseMonth:$('release-month').value,releasePeriod:$('release-period').value,
  combos:readCombos(id)});
}
function categoryOptions(){
 $('categories').replaceChildren();$('category-options').replaceChildren();$('category-count').textContent=categories.length+'件';
 if(!categories.length){const p=document.createElement('p');p.className='muted';p.textContent='カテゴリは未登録です。';$('categories').append(p);}
 for(const name of categories){
  const dat=document.createElement('option');dat.value=name;$('category-options').append(dat);
  const item=document.createElement('span');item.className='cat';item.append(document.createTextNode(name));
  const btn=document.createElement('button');btn.type='button';btn.textContent='×';btn.title=name+'を削除';btn.disabled=[...products.values()].some(p=>p.categoryName===name)||busy;
  btn.addEventListener('click',()=>removeCategory(name));item.append(btn);$('categories').append(item);
 }
}
function productList(){
 $('product-count').textContent=products.size;
 const box=$('product-list');box.replaceChildren();
 if(!products.size){const p=document.createElement('p');p.className='muted';p.textContent='商品はまだ登録されていません。';box.append(p);return;}
 for(const p of [...products.values()].sort((a,b)=>a.id.localeCompare(b.id,'ja'))){
  const row=document.createElement('div');row.className='product';
  const info=document.createElement('div');info.className='product-info';
  const name=document.createElement('div');name.className='product-name';name.textContent=p.name+(p.active===false?'（非表示）':'')+(p.noveltyTarget===true?' 🎁ノベルティ対象':'');
  const meta=document.createElement('div');meta.className='product-meta';meta.textContent=[p.id,p.categoryName,yen(p.price),p.eventPrice!==null&&p.eventPrice!==undefined?'展示会 '+yen(p.eventPrice):'',(p.variants||[]).length?'バリエーション '+p.variants.length+'種':'',(p.preorder||(p.variants||[]).some(v=>v.preorder===true))&&p.releaseMonth?`${p.releaseMonth}月${p.releasePeriod}予定`:'',(p.variants||[]).length?((p.variants||[]).every(v=>v.stock===0)?'SOLD OUT':''):(p.stock===0?'SOLD OUT':''),].filter(Boolean).join(' ／ ');
  info.append(name,meta);const edit=document.createElement('button');edit.type='button';edit.textContent='編集';edit.addEventListener('click',()=>editProduct(p.id));
  const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='削除';del.addEventListener('click',()=>deleteProduct(p.id));
  row.append(info,edit,del);box.append(row);
 }
}
function render(){categoryOptions();productList();}
function editProduct(id){
 const p=products.get(id);if(!p)return;
 $('product-id').value=p.id;$('product-id').readOnly=true;$('product-name').value=p.name;
 $('product-category').value=p.categoryName;$('product-price').value=p.price;$('product-event-price').value=p.eventPrice??'';
 showVariants((p.variants||[]).map(v=>({code:trim(v.code).startsWith(p.id+'_')?trim(v.code).slice(p.id.length+1):v.code,name:v.name,price:v.price??'',eventPrice:v.eventPrice??'',stock:v.stock??'',preorder:v.preorder}))); 
 $('product-novelty').checked=p.noveltyTarget===true;
 $('product-jan').value=p.janCode||'';resetTotalStockState(p.stock??'');$('product-preorder').checked=p.preorder===true;$('release-month').value=p.releaseMonth??'';$('release-period').value=p.releasePeriod||'';toggleRelease();
 showCombos(existingCombos(p));$('product-active').checked=p.active!==false;
 pendingImage=null;$('product-image').value='';loadSavedImage(id,++imageRevision);
 $('edit-note').textContent='編集中：'+p.id+'（商品IDは変更できません）';$('product-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function clearForm(){ ++imageRevision;pendingImage=null;imageProcessing=false;$('product-form').reset();totalAutoMode=false;manualTotalDraft='';showVariants();showCombos();toggleRelease();$('product-id').readOnly=false;$('product-active').checked=true;$('product-novelty').checked=false;$('edit-note').textContent='新規登録';imagePreview('');$('product-image-hint').textContent='未選択の場合、登録済み画像は変更しません。';setBusy(busy);}
function toFirestore(p,original){return {...p,createdAt:original?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()};}
async function saveProduct(event){
 event.preventDefault();if(busy||imageProcessing||!user)return;
 let p;try{p=inputData();}catch(err){status(err.message,true);return;}
 if(!products.has(p.id)&&products.size>=maxProducts){status('登録上限300商品です。',true);return;}
 const nextCategories=categories.includes(p.categoryName)?categories:[...categories,p.categoryName];
 if(nextCategories.length>80){status('カテゴリは80件以内にしてください。',true);return;}
 setBusy(true);
 try{
  const batch=writeBatch(db);batch.set(prodRef(p.id),toFirestore(p,products.get(p.id)));
  const nextNoveltyIds=selectedNoveltyIds(new Map([[p.id,p]]));
  if(brandSettingsExists)batch.set(brandSettingsRef(),{novelty:{productIds:nextNoveltyIds,productId:nextNoveltyIds[0]||''},updatedAt:serverTimestamp()},{merge:true});
  if(pendingImage)batch.set(imageRef(p.id),{productId:p.id,imageData:pendingImage,updatedAt:serverTimestamp()});
  if(nextCategories.length!==categories.length)batch.set(catRef(),{categories:nextCategories,updatedAt:serverTimestamp()});
  await batch.commit();const imageWasSaved=!!pendingImage;if(imageWasSaved)imageKnown.add(p.id);products.set(p.id,{...products.get(p.id),...p});categories=nextCategories;render();clearForm();status('「'+p.name+'」を'+(imageWasSaved?'画像とともに':'')+'保存しました。公開処理を続行します…');
  // Customer-facing catalog is a separate snapshot: saving only drafts used to leave visitors seeing the old product list.
  const published=await publishCatalog({automatic:true,allowBusy:true});
  if(published)status('「'+p.name+'」を保存し、お客様ページへの公開も確認しました。');
  else status('「'+p.name+'」の商品登録は成功しましたが、お客様ページの公開に失敗しました。上の「お客様ページに反映」のエラーを確認し、再実行してください。',true);
 }catch(err){console.error(err);status('商品を保存できませんでした（'+(err.code||'保存失敗')+'）：'+(err.message||'認証・Firestoreルール・通信環境をご確認ください。')+'。画像が原因と思われる場合は画像を外して再試行してください。',true);}finally{setBusy(false);}
}
async function addCategory(event){
 event.preventDefault();if(busy)return;
 const name=trim($('new-category').value);if(!name||name.length>40){status('カテゴリ名は1〜40文字で入力してください。',true);return;}
 if(categories.includes(name)){status('このカテゴリは登録済みです。',true);return;}
 if(categories.length>=80){status('カテゴリは80件以内にしてください。',true);return;}
 setBusy(true);try{const next=[...categories,name];const batch=writeBatch(db);batch.set(catRef(),{categories:next,updatedAt:serverTimestamp()});await batch.commit();categories=next;render();$('new-category').value='';status('カテゴリを追加しました。');}
 catch(err){console.error(err);status('カテゴリを保存できませんでした。',true);}finally{setBusy(false);}
}
async function removeCategory(name){
 if(busy||[...products.values()].some(p=>p.categoryName===name))return;
 if(!confirm('「'+name+'」を削除しますか？'))return;
 setBusy(true);try{const next=categories.filter(v=>v!==name);const batch=writeBatch(db);batch.set(catRef(),{categories:next,updatedAt:serverTimestamp()});await batch.commit();categories=next;render();status('カテゴリを削除しました。');}
 catch(err){status('カテゴリの削除に失敗しました。',true);}finally{setBusy(false);}
}
async function deleteProduct(id){
 if(busy)return;const p=products.get(id);if(!p||!confirm('「'+p.name+'（'+id+'）」を削除しますか？'))return;
 setBusy(true);try{const batch=writeBatch(db);batch.delete(prodRef(id));batch.delete(imageRef(id));
  const nextIds=selectedNoveltyIds(new Map([[id,{id,noveltyTarget:false}]]));
  if(brandSettingsExists)batch.set(brandSettingsRef(),{novelty:{productIds:nextIds,productId:nextIds[0]||''},updatedAt:serverTimestamp()},{merge:true});await batch.commit();products.delete(id);imageKnown.delete(id);render();if($('product-id').value===id)clearForm();status('商品を削除しました。');}
 catch(err){console.error(err);status('商品を削除できませんでした。',true);}finally{setBusy(false);}
}
// 商品一括登録はCSV専用。既存形式の見出しも読み取れるようにする。
// 区分を分かりやすくするため、必須と条件付き必須を列名に明記する。
const headers=['カテゴリ(必須)','ID(必須)','商品名(必須)','税込価格(必須)','表示/非表示(必須)','JANコード(任意)','展示会特価(任意)','受注予約(任意)','在庫数(任意)','サブコード(バリエーション時必須)','バリエーション項目(バリエーション時必須)','バリエーションごとの通常価格(任意)','バリエーションごとの展示会特価(任意)','組合せ商品ID(組合せ時必須)','組合せ時割引金額(任意)','組合せ商品ID2(組合せ時必須)','組合せ時割引金額2(任意)','組合せ商品ID3(組合せ時必須)','組合せ時割引金額3(任意)','発売予定月(予約時必須)','発売予定時期(予約時必須)','バリエーション在庫数(任意)','バリエーション受注予約(任意)','ノベルティ対象(任意)'];
const sample=[
 ['ランタン','LT-001','LEDランタン',4800,1,'',4200,0,'','BK','カラー：ブラック','','','BG-002',500,'TB-003',300,'','','','','','',1],
 ['ランタン','LT-001','LEDランタン',4800,1,'',4200,0,'','KH','カラー：カーキ','','','BG-002',500,'TB-003',300,'','','','','','',1],
 ['バッグ','BG-002','キャンバスバッグ',3200,1,'','','','','','','','','','','','','','','','','','',0],
 ['テーブル','TB-003','サイドテーブル',5900,1,'','','','','','','','','','','','','','','','','','','']
];
function spreadsheetRows(){
 const rows=[];
 for(const p of [...products.values()].sort((a,b)=>a.id.localeCompare(b.id,'ja'))){
  const variants=p.variants?.length?p.variants:[null];
  const combos=existingCombos(p);
  for(const v of variants)rows.push([p.categoryName,p.id,p.name,p.price,p.active===false?0:1,p.janCode||'',p.eventPrice??'',p.preorder?1:0,(p.variants||[]).length?(totalOfVariantStocks(p.variants)??''):(p.stock??''),v?.code||'',v?.name||'',v?.price??'',v?.eventPrice??'',combos[0]?.productId||'',combos[0]?.discount??'',combos[1]?.productId||'',combos[1]?.discount??'',combos[2]?.productId||'',combos[2]?.discount??'',(p.preorder||p.variants?.some(v=>v.preorder===true))?p.releaseMonth??'':'',(p.preorder||p.variants?.some(v=>v.preorder===true))?p.releasePeriod||'':'',v?.stock??'',typeof v?.preorder==='boolean'?(v.preorder?1:0):'',p.noveltyTarget===true?1:0]);
 }
 return rows;
}
function parseProductRows(rows){
 if(rows.length<2)throw Error('CSVに登録する商品データがありません。');
 const normalize=h=>trim(h).replace(/[（(](?:任意|必須|予約時必須|バリエーション時必須|組合せ時必須)[)）]/g,'').replace(/\s+/g,'').toLowerCase();
 const indexes=headers.map(h=>(rows[0]||[]).findIndex(v=>normalize(v)===normalize(h)));
 if(indexes.slice(0,15).some(i=>i<0))throw Error('CSVに必要な列が不足しています。24列のCSVテンプレートをご使用ください（旧形式の一部も読込可能）。');
 // Existing 15-column exports used full prefixed subcodes: accept those only for legacy templates.
 const legacyTemplate=indexes.slice(15).every(index=>index<0);
 const entries=new Map();
 for(let i=1;i<rows.length;i++){
  const row=rows[i],get=k=>indexes[k]<0?'':trim(row[indexes[k]]??'');
  if(!row.some(v=>trim(v)!==''))continue;
  const id=get(1),active=get(4);
  if(!['0','1'].includes(active))throw Error((i+1)+'行目：表示/非表示は 0 か 1 を入力してください。');
  if(get(7)&&!['0','1'].includes(get(7)))throw Error((i+1)+'行目：受注予約は 0 か 1 を入力してください。');
  const combos=[];for(const [idCol,discountCol] of [[13,14],[15,16],[17,18]]){const toId=get(idCol),toDiscount=get(discountCol);if(toId||toDiscount)combos.push({productId:toId,discount:toDiscount||0});}
  const noveltyValue=get(23);if(noveltyValue&&!['0','1'].includes(noveltyValue))throw Error((i+1)+'行目：ノベルティ対象は 1 または 0 で入力してください。');
  const base={id,categoryName:get(0),name:get(2),price:get(3),active:active==='1',noveltyTarget:noveltyValue==='1',janCode:get(5),eventPrice:get(6),preorder:get(7)==='1',stock:get(8),combos,releaseMonth:get(19),releasePeriod:get(20)};
  const flatKey=JSON.stringify(base);
  let entry=entries.get(id);
  if(entry&&entry.key!==flatKey)throw Error((i+1)+'行目：同じIDの基本項目が他の行と異なります。');
  if(!entry){entry={key:flatKey,base,variants:[]};entries.set(id,entry);}
  const sub=get(9),variantName=get(10),price=get(11),eventPrice=get(12),variantStock=get(21),variantPreorder=get(22);
  if(variantPreorder&&!['0','1'].includes(variantPreorder))throw Error((i+1)+'行目：バリエーション受注予約は0か1、または空欄です。');
  if(sub||variantName||price||eventPrice||variantStock||variantPreorder){
   if(!sub||!variantName)throw Error((i+1)+'行目：サブコード末尾とバリエーション名をセットで記入してください。');
   if(sub.startsWith(id+'_')&&!legacyTemplate)throw Error((i+1)+'行目：サブコード欄には商品IDを入れず、BKなど末尾だけを入力してください。');
   const code=(legacyTemplate&&sub.startsWith(id+'_')?sub.slice(id.length+1):sub).toUpperCase();
   entry.variants.push({code,name:variantName,price,eventPrice,stock:variantStock,preorder:variantPreorder===''?null:variantPreorder==='1'});
  }
 }
 if(entries.size>maxProducts)throw Error('一度に登録できるのは300商品までです。');
 const results=[];for(const entry of entries.values())results.push(productOf({...entry.base,variants:entry.variants}));
 if(new Set([...categories,...results.map(p=>p.categoryName)]).size>80)throw Error('カテゴリ上限80件を超えます。');
 if(products.size+results.filter(p=>!products.has(p.id)).length>maxProducts)throw Error('ブランドの商品上限300件を超えます。');
 return results;
}
function parseCsvText(text){
 const clean=String(text||'').replace(/^\uFEFF/,'');
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<clean.length;i++){
  const c=clean[i];
  if(quoted){if(c==='"'&&clean[i+1]==='"'){field+='"';i++;}else if(c==='"')quoted=false;else field+=c;}
  else if(c==='"'&&field==='')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&clean[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('CSV内の引用符が閉じられていません。');
 row.push(field);if(row.some(v=>v!==''))rows.push(row);
 return rows;
}
function csvFile(fileName,rows){
 const data='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
 const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=fileName;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function fileChanged(){
 importData=null;$('import-save').disabled=true;$('import-preview').hidden=true;
 const f=$('import-file').files?.[0];if(!f)return;
 if(!/\.csv$/i.test(f.name)||f.size>5*1024*1024){status('CSV（.csv）、5MB以内のファイルを選んでください。Excel（.xlsx）は読み込めません。',true);return;}
 try{const rows=parseProductRows(parseCsvText(await f.text()));importData=rows;
  const box=$('import-preview');box.replaceChildren();const h=document.createElement('strong');
  h.textContent='確認：'+rows.length+'商品（新規 '+rows.filter(p=>!products.has(p.id)).length+'件、上書き '+rows.filter(p=>products.has(p.id)).length+'件）';box.append(h);
  rows.slice(0,12).forEach(p=>{const d=document.createElement('div');d.textContent=p.id+' ／ '+p.name+' ／ '+p.categoryName+' ／ '+yen(p.price)+' ／ バリエーション'+p.variants.length+'件';box.append(d);});
  if(rows.length>12){const d=document.createElement('div');d.textContent='ほか '+(rows.length-12)+'件';box.append(d);}
  box.hidden=false;$('import-save').disabled=false;status('内容を確認しました。間違いがなければ「確認した商品を登録」を押してください。');
 }catch(err){status(err.message,true);}
}
async function importProducts(){
 if(!importData||busy)return;
 const rows=importData;const newCategories=[...new Set([...categories,...rows.map(p=>p.categoryName)])];
 if(!confirm(rows.length+'商品の登録・上書きを実行しますか？'))return;
 setBusy(true);
 try{const batch=writeBatch(db);
  for(const p of rows)batch.set(prodRef(p.id),toFirestore(p,products.get(p.id)));
  const changes=new Map(rows.map(p=>[p.id,p]));const nextIds=selectedNoveltyIds(changes);
  if(brandSettingsExists)batch.set(brandSettingsRef(),{novelty:{productIds:nextIds,productId:nextIds[0]||''},updatedAt:serverTimestamp()},{merge:true});
  if(newCategories.length!==categories.length)batch.set(catRef(),{categories:newCategories,updatedAt:serverTimestamp()});
  await batch.commit();for(const p of rows)products.set(p.id,{...products.get(p.id),...p});categories=newCategories;
  importData=null;$('import-file').value='';$('import-preview').hidden=true;render();status(rows.length+'商品の一括登録が完了しました。');
 }catch(err){console.error(err);status('一括登録できませんでした。保存内容は更新されていません。',true);}finally{setBusy(false);}
}
// Publish an explicit, public-safe snapshot. Private drafts and customer info
// are NEVER copied. Images are stored in separate read-on-demand documents.
async function publishCatalog({automatic=false,allowBusy=false}={}){
 if((busy&&!allowBusy)||!user||!brand)return false;
 const button=$('publish-catalog'),message=$('publish-status');
 let publicationStage='準備';
 if(!automatic&&!confirm('表示対象の商品をお客様ページに反映しますか？ 非表示の商品は公開しません。'))return false;
 setBusy(true);message.hidden=false;message.className='status';
 try{
  // Read current server data, not a potentially stale form or previous page view.
  publicationStage='商品の読込';
  const [drafts,catSnapshot,oldSnapshot]=await Promise.all([
   getDocsFromServer(coll()),getDocFromServer(catRef()),getDocFromServer(doc(db,'publishedCatalogs',brand.slug))
  ]);
  const source=drafts.docs.map(x=>x.data());
  for(const productRecord of source.filter(productRecord=>productRecord.active!==false && ((productRecord.variants||[]).length?(productRecord.variants||[]).some(v=>typeof v.preorder==='boolean'?v.preorder:productRecord.preorder===true):productRecord.preorder===true)))if(!Number.isInteger(productRecord.releaseMonth)||productRecord.releaseMonth<1||productRecord.releaseMonth>12||!['上旬','中旬','下旬'].includes(productRecord.releasePeriod))throw Error('予約商品「'+productRecord.name+'」（'+productRecord.id+'）に発売予定月・時期がありません。商品を編集して保存してください。');
  const visible=source.filter(productRecord=>productRecord.active!==false && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(productRecord.id));
  const ids=new Set(visible.map(productRecord=>productRecord.id));
  const categoryNames=catSnapshot.exists()&&Array.isArray(catSnapshot.data().categories)
    ?catSnapshot.data().categories.filter(v=>typeof v==='string') : [];
  for(const productRecord of visible)if(!categoryNames.includes(productRecord.categoryName))categoryNames.push(productRecord.categoryName);
  const categoriesPublic=categoryNames.map(n=>({id:n,name:n}));
  publicationStage='公開用データ作成';
  const exposed=visible.map(productRecord=>({
   id:productRecord.id,name:productRecord.name,categoryId:productRecord.categoryName,price:productRecord.price,
   eventPrice:productRecord.eventPrice??null,noveltyTarget:productRecord.noveltyTarget===true,preorder:productRecord.preorder===true,releaseMonth:productRecord.releaseMonth??null,releasePeriod:productRecord.releasePeriod||'',stock:(productRecord.variants||[]).length?null:(productRecord.stock??null),
   variants:(productRecord.variants||[]).map(v=>({code:v.code,name:v.name,price:v.price??null,eventPrice:v.eventPrice??null,stock:v.stock??null,preorder:typeof v.preorder==='boolean'?v.preorder:null}))
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
  const uploaded=[];
  for(const productRecord of visible){
   const imageSnap=await getDocFromServer(imageRef(productRecord.id));
   if(imageSnap.exists()){
    const image=imageSnap.data().imageData;
    if(typeof image==='string' && image.length<=109200 && /^data:image\/(webp|jpeg);base64,/.test(image))uploaded.push({id:productRecord.id,image});
   }
  }
  publicationStage='画像アップロード';
  message.textContent='商品画像を公開しています… '+uploaded.length+'枚';
  // Small chunks keep within Firestore's batch write limit at 300 products.
  for(let i=0;i<uploaded.length;i+=100){
   const batch=writeBatch(db);
   for(const record of uploaded.slice(i,i+100))batch.set(
    doc(db,'publishedCatalogs',brand.slug,'images',record.id),
    {productId:record.id,imageData:record.image,updatedAt:serverTimestamp()}
   );
   await batch.commit();
  }
  publicationStage='商品カタログ公開';
  // Write the public index AFTER images, so a reader never sees a new
  // public product with an image pointer that has not been uploaded yet.
  await (async()=>{const batch=writeBatch(db);
   batch.set(doc(db,'publishedCatalogs',brand.slug),{
    brandId:user.uid,slug:brand.slug,products:exposed,categories:categoriesPublic,
    bundles:[...pairs.values()],publishedImageIds:uploaded.map(x=>x.id),updatedAt:serverTimestamp()
   });await batch.commit();})();
  const previous=oldSnapshot.exists()&&Array.isArray(oldSnapshot.data().publishedImageIds)?oldSnapshot.data().publishedImageIds:[];
  const removed=previous.filter(id=>!uploaded.some(productRecord=>productRecord.id===id));
  for(let i=0;i<removed.length;i+=100){
   const batch=writeBatch(db);
   for(const id of removed.slice(i,i+100))batch.delete(doc(db,'publishedCatalogs',brand.slug,'images',id));
   await batch.commit();
  }
  publicationStage='公開在庫同期';
  // Inventory is separate from the public catalog to avoid downloading large catalog documents per sale.
  // Publishing stock from the latest private draft prevents stale client overwrites.
  // Read private stock values INSIDE a transaction. A concurrent QR sale
  // retries the publish instead of accidentally restoring deducted inventory.
  await runTransaction(db,async tx=>{
    const inventoryDocs=visible.map(productRecord=>prodRef(productRecord.id));
    const stocks=await Promise.all(inventoryDocs.map(ref=>tx.get(ref)));
    const next=Object.fromEntries(visible.map((productRecord,i)=>[
      productRecord.id,stocks[i].exists()&&!(stocks[i].data().variants||[]).length?(stocks[i].data().stock??null):null
    ]));
    const variantQuantities={};
    visible.forEach((productRecord,i)=>{
      const current=stocks[i].exists()?stocks[i].data():productRecord;
      for(const variant of current.variants||[]){
        variantQuantities[productRecord.id+'::'+variant.code]=variant.stock??null;
      }
    });
    tx.set(doc(db,'publishedStock',brand.slug),{
      brandId:user.uid,slug:brand.slug,quantities:next,variantQuantities,updatedAt:serverTimestamp()
    });
  });
  message.textContent='公開しました：商品'+exposed.length+'件／商品画像'+uploaded.length+'枚。右のリンクからお客様ページを確認してください。';
  message.className='status';
  return true;
 }catch(error){
  console.error('公開エラー',error);
  message.textContent='公開できませんでした（'+publicationStage+'）：'+(error.code==='permission-denied'?'Firestoreのルールを確認してください。':error.message||'通信や容量の制限をご確認ください。');
  message.className='status error';
  return false;
 }finally{if(!allowBusy)setBusy(false);}
}
$('publish-catalog').addEventListener('click',()=>publishCatalog());
async function refresh(){if(!user)return;try{
 const [catSnap,prodSnap,noveltySnap]=await Promise.all([getDoc(catRef()),getDocs(coll()),getDoc(brandSettingsRef())]);
 brandSettingsExists=noveltySnap.exists();
 const n=noveltySnap.data()?.novelty||{};const legacyId=!Array.isArray(n.productIds)?n.productId:'';
 categories=catSnap.exists()&&Array.isArray(catSnap.data().categories)?catSnap.data().categories.filter(x=>typeof x==='string'):[];
 products=new Map(prodSnap.docs.map(snapshot=>{const p=snapshot.data();return [snapshot.id,{...p,noveltyTarget:p.noveltyTarget===true||(legacyId===snapshot.id&&p.noveltyTarget!==false)}];}));render();return true;
 }catch(err){console.error(err);status('商品情報を読み込めませんでした。Firestoreルールをご確認ください。',true);return false;}}
$('product-form').addEventListener('submit',saveProduct);$('product-clear').addEventListener('click',clearForm);
$('product-image').addEventListener('change',onImageSelected);
$('images-import').addEventListener('change',imageBulkCheck);$('images-save').addEventListener('click',saveBulkImages);
$('category-form').addEventListener('submit',addCategory);$('refresh-products').addEventListener('click',async()=>{if(await refresh())status('登録情報を更新しました。');});
$('import-file').addEventListener('change',fileChanged);$('import-save').addEventListener('click',importProducts);
$('download-csv').addEventListener('click',()=>csvFile('MY_EXPO_BAG_商品登録テンプレート.csv',[headers]));
$('sample-csv').addEventListener('click',()=>csvFile('MY_EXPO_BAG_商品登録_入力例.csv',[headers,...sample]));
$('export-csv').addEventListener('click',()=>csvFile('MY_EXPO_BAG_登録商品.csv',[headers,...spreadsheetRows()]));
const configured=['apiKey','authDomain','projectId','appId'].every(k=>typeof firebase[k]==='string'&&firebase[k].trim());
if(!configured){$('loading').textContent='Firebaseの接続設定がありません。';document.documentElement.classList.remove('auth-pending');}
else try{
 const app=getApps().length?getApp():initializeApp(firebase);db=getFirestore(app);const auth=getAuth(app);
 onAuthStateChanged(auth,async u=>{
  if(!u){location.replace(loginUrl);return;}
  try{const snap=await getDoc(doc(db,'brands',u.uid));if(!snap.exists()){location.replace(brandSetupUrl);return;}
   const b=snap.data();if(b.ownerUid!==u.uid||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug))throw Error('brand mismatch');
   user=u;brand=b;$('brand-label').textContent=b.displayName+'　｜　v1.0.1';const publicLink=new URL('./index.html',location.href);publicLink.searchParams.set('brand',b.slug);$('public-customer-link').href=publicLink.href;await refresh();$('loading').hidden=true;$('shell').hidden=false;document.documentElement.classList.remove('auth-pending');
  }catch(err){console.error(err);$('loading').textContent='ブランド情報を読み込めません。Firestoreルールをご確認ください。';document.documentElement.classList.remove('auth-pending');}
 },()=>{$('loading').textContent='ログイン情報を確認できませんでした。';document.documentElement.classList.remove('auth-pending');});
}catch(err){$('loading').textContent='Firebaseを読み込めませんでした。';document.documentElement.classList.remove('auth-pending');}
