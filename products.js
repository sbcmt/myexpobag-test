/** MY EXPO BAG v1.0.1 — brand-owned product management and public catalog publishing. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,getDocsFromServer,getDocFromServer,writeBatch,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const firebase=window.MEB_FIREBASE_CONFIG||{};
const loginUrl=new URL('./login.html',location.href).href;
const brandSetupUrl=new URL('./brand-setup.html',location.href).href;
const maxProducts=300;
let db,user=null,brand=null,products=new Map(),categories=[],importData=null,busy=false,brandSettingsExists=false,noveltyIds=new Set();
let publishedProductsById=new Map(),publishedBundles=[],publishedCatalogAt=null,hasPublishedSnapshot=false,forcePending=false,publishedCategories=[];
let publishedStockQuantities={},publishedVariantQuantities={};
let pendingImages=[undefined,undefined],imageProcessing=false,imageTaskCount=0,imageRevision=0,imageSlotRevision=[0,0],imagesReady=[],imageKnown=new Set();
const coll=()=>collection(db,'brands',user.uid,'products');
const prodRef=id=>doc(db,'brands',user.uid,'products',id);
const catRef=()=>doc(db,'brands',user.uid,'catalogSettings','main');
const imageRef=id=>doc(db,'brands',user.uid,'productImages',id);
const brandSettingsRef=()=>doc(db,'brandSettings',brand.slug);
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
function imagePreview(data,slot=0){
 const img=$(slot?'product-image-preview-2':'product-image-preview');img.hidden=!data;
 if(data){img.src=data;img.alt=slot?'商品サブ画像のプレビュー':'商品画像のプレビュー';}
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
   ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(photo,0,0,w,h);
   for(const mime of ['image/webp','image/jpeg']){
    for(const quality of [.83,.72,.60,.50,.40,.30]){
     const data=canvas.toDataURL(mime,quality);
     if(data.startsWith('data:'+mime+';base64,')&&data.length<=IMAGE_DATA_LIMIT)return data;
    }
   }
  }
  throw Error('80KB以下へ変換できませんでした。別の画像を試してください。');
 }finally{bitmap?.close?.();URL.revokeObjectURL(objectUrl);}
}
const imageId=(base,slot)=>base+(slot?'-2':'');
async function onImageSelected(slot=0){
 const input=$(imageId('product-image',slot)),file=input.files?.[0],revision=imageRevision,slotRevision=++imageSlotRevision[slot];
 const hint=$(imageId('product-image-hint',slot));
 if(!file){pendingImages[slot]=undefined;return;}
 imageTaskCount++;imageProcessing=true;refreshActionButtons();hint.textContent='画像を自動圧縮しています…';
 try{const data=await compressImage(file);if(revision!==imageRevision||slotRevision!==imageSlotRevision[slot])return;
  pendingImages[slot]=data;$(imageId('product-image-delete',slot)).checked=false;
  imagePreview(data,slot);hint.textContent='保存画像：約'+Math.ceil((data.length-data.indexOf(',')-1)*3/4/1024)+'KB ／ 商品を保存すると反映';
 }catch(err){if(revision===imageRevision&&slotRevision===imageSlotRevision[slot]){pendingImages[slot]=undefined;hint.textContent='画像は未選択です。';input.value='';status(err.message,true);}}
 finally{imageTaskCount=Math.max(0,imageTaskCount-1);imageProcessing=imageTaskCount>0;refreshActionButtons();}
}
async function loadSavedImage(id,revision){
 for(let slot=0;slot<2;slot++){$(imageId('product-image-hint',slot)).textContent='画像を確認しています…';imagePreview('',slot);}
 try{
  const snap=await getDoc(imageRef(id));if(revision!==imageRevision)return;
  for(let slot=0;slot<2;slot++){
   const data=snap.exists()?snap.data()[slot?'imageData2':'imageData']:'';
   const good=typeof data==='string'&&/^data:image\/(webp|jpeg);base64,/.test(data);
   imagePreview(good?data:'',slot);
   $(imageId('product-image-hint',slot)).textContent=good?'登録済み。変更する場合は新しい画像を選択してください。':'画像未登録。';
  }
  if(snap.exists())imageKnown.add(id);
 }catch(error){if(revision===imageRevision)$('product-image-hint').textContent='画像の読み込みに失敗しました。';}
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
    const previous=await getDoc(imageRef(entry.id));
    const batch=writeBatch(db);batch.set(imageRef(entry.id),{productId:entry.id,imageData:data,imageData2:previous.exists()?(previous.data().imageData2||''):'',updatedAt:serverTimestamp()});
    await batch.commit();imageKnown.add(entry.id);ok++;
   }catch(error){console.error(error);errors.push(entry.id+'：'+(error.message||'保存失敗'));}
  }
  if(ok){forcePending=true;updatePublishState();}if(!errors.length){$('images-import').value='';clearImagesPreview();status(ok+'件の商品画像を保存しました。お客様ページへ反映してください。');}
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
  const stock=trim(row.querySelector('.variant-stock').value);
  if(!name&&!code&&!stock)continue;
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
 input.placeholder=unlimited?'無制限（通常商品のみ）':'バリエーションごとの在庫数の参考合計';
 const hasReservation=[...$('variant-rows').children].some(row=>row.querySelector('.variant-stock')?.dataset.stockMode==='preorder');
 hint.textContent=incomplete?'バリエーション名・サブコードを入力してください。保存時に確認します。':
   unlimited?'一部の通常在庫が無制限です。予約対象の在庫数は必須です。':
   '参考合計：'+sum+'個'+(hasReservation?'（予約品在庫を含む）':'')+'。販売上限は各バリエーションで判定します。';
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
 const row=document.createElement('tr');row.className='variant-entry';
 row.dataset.axis1=values.axis1||'';row.dataset.axis2=values.axis2||'';
 const cell=()=>{const td=document.createElement('td');row.append(td);return td;};
 const textInput=(td,cls,placeholder,value,type='text')=>{const input=document.createElement('input');input.className=cls;input.type=type;input.autocomplete='off';input.placeholder=placeholder;input.value=value??'';td.append(input);return input;};
 const axis1=textInput(cell(),'variant-axis1','例：ブラック',values.axis1||values.name?.split(' / ')[0]||'');
 const axis2=textInput(cell(),'variant-axis2','例：M',values.axis2||values.name?.split(' / ')[1]||'');
 const cd=cell(),box=document.createElement('div');box.className='subcode-input';
 const prefix=document.createElement('span');prefix.className='subcode-prefix';prefix.textContent=(trim($('product-id').value)||'商品ID')+'_';
 box.append(prefix);cd.append(box);const code=textInput(box,'variant-code','BK_M',values.code);code.maxLength=25;
 const priceCell=cell(),parentPrice=trim($('product-price').value);
 const inherited=values.price===undefined||values.price===null||values.price==='';
 const price=textInput(priceCell,'variant-price','親価格',inherited?parentPrice:values.price,'number');price.min='0';price.max='100000000';price.step='1';
 price.dataset.inherited=inherited?'1':'0';price.readOnly=false;
 const hint=document.createElement('div');hint.className='price-note';hint.textContent=inherited?'親価格を使用':'個別価格';priceCell.append(hint);
 price.addEventListener('input',()=>{price.dataset.inherited='0';hint.textContent='個別価格';});
 price.addEventListener('blur',()=>{if(trim(price.value)===''){price.dataset.inherited='1';price.value=trim($('product-price').value);hint.textContent='親価格を使用';}});
 const stock=textInput(cell(),'variant-stock','空欄＝無制限',values.stock,'number');stock.min='0';stock.max='100000000';stock.step='1';
 // Preserve ordinary inventory when this single visible input switches to preorder inventory.
 // The two tabs share the same reservation quantity; Firestore still keeps both fields separate.
 row.dataset.normalStock=String(values.stock??'');stock.dataset.stockMode='normal';
 stock.addEventListener('input',()=>{
  if(stock.dataset.stockMode==='preorder'){
   const key=trim(code.value).toUpperCase();
   reservationDrafts.set(key,{...reserveFor(key),reservationStock:stock.value});
   const other=[...$('reservation-rows').children].find(tr=>tr.dataset.resKey===key);
   if(other)other.querySelector('.reservation-stock').value=stock.value;
  }else row.dataset.normalStock=stock.value;
 });
 const jan=textInput(cell(),'variant-jan','JAN（任意）',values.janCode);jan.inputMode='numeric';jan.maxLength=14;
 const reserv=cell(),preorder=document.createElement('input');preorder.className='variant-preorder';preorder.type='checkbox';preorder.setAttribute('aria-label','このバリエーションを予約販売');reserv.append(preorder);
 const controls=cell(),remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.className='danger';remove.addEventListener('click',()=>{reservationFromTable();reservationDrafts.delete(trim(code.value).toUpperCase());row.remove();updateTotalStockField();toggleRelease();updateVariantVisibility();});controls.append(remove);
 const extra=document.createElement('details');extra.className='variant-extra';extra.innerHTML='<summary>個別キャンペーン価格</summary><div class="field"><label>キャンペーン価格（任意）</label><input type="number" min="0" max="100000000" step="1" class="variant-event-price" placeholder="未設定なら親の設定を使用"></div>';
 controls.append(extra);extra.querySelector('input').value=values.eventPrice??'';
 const hidden=document.createElement('input');hidden.className='variant-name';hidden.type='hidden';controls.append(hidden);
 const updateAxis=()=>{row.dataset.axis1=trim(axis1.value);row.dataset.axis2=trim(axis2.value);hidden.value=[row.dataset.axis1,row.dataset.axis2].filter(Boolean).join(' / ');};
 updateAxis();for(const input of [axis1,axis2])input.addEventListener('input',updateAxis);
 for(const input of [axis1,axis2,code])input.addEventListener('change',()=>{updateAxis();toggleRelease();});
 preorder.addEventListener('change',()=>setReservationChoice(trim(code.value).toUpperCase(),preorder.checked));
 return row;
}
function syncInheritedPrices(){const val=trim($('product-price').value);for(const el of document.querySelectorAll('.variant-price'))if(el.dataset.inherited==='1')el.value=val;}
$('product-price').addEventListener('input',syncInheritedPrices);

function refreshSubcodePrefixes(){const id=trim($('product-id').value)||'商品ID';for(const el of document.querySelectorAll('.subcode-prefix'))el.textContent=id+'_';}
$('product-id').addEventListener('input',()=>{refreshSubcodePrefixes();toggleRelease();});
// Reservation rows live separately from the variant editor and are preserved by SKU code.
let reservationDrafts=new Map(),parentPreorderMode=false;
function reservationFromTable(){
 for(const tr of $('reservation-rows').querySelectorAll('tr[data-res-key]')){
  reservationDrafts.set(tr.dataset.resKey,{
   preorder:tr.querySelector('.reservation-on').checked,
   releaseYear:tr.querySelector('.reservation-year').value,
   releaseMonth:tr.querySelector('.reservation-month').value,
   releasePeriod:tr.querySelector('.reservation-period').value,
   reservationStock:tr.querySelector('.reservation-stock').value
  });
 }
}
function reserveFor(code){return reservationDrafts.get(code)||{preorder:parentPreorderMode,releaseYear:'',releaseMonth:'',releasePeriod:'',reservationStock:''};}
function syncPreorderBoxes(){
 $('product-preorder-all').checked=parentPreorderMode;
 for(const row of $('variant-rows').children){
  const key=trim(row.querySelector('.variant-code').value).toUpperCase();
  const checkbox=row.querySelector('.variant-preorder'),stock=row.querySelector('.variant-stock');
  const isReservation=reserveFor(key).preorder===true;
  checkbox.checked=isReservation;
  if(isReservation){
   if(stock.dataset.stockMode!=='preorder'){
    row.dataset.normalStock=stock.value;
    const item=reserveFor(key);
    // First time a SKU is marked as preorder, carry its entered quantity across.
    // If it had its own preorder quantity already, prefer the previously saved quantity.
    if(item.reservationStock===null||item.reservationStock===undefined||item.reservationStock==='')
     reservationDrafts.set(key,{...item,reservationStock:stock.value});
   }
   stock.dataset.stockMode='preorder';
   stock.value=String(reserveFor(key).reservationStock??'');
   stock.placeholder='予約在庫（必須）';
   stock.title='予約タブの「予約品在庫数」と同期します';
   stock.setAttribute('aria-label','予約品在庫数');
   const other=[...$('reservation-rows').children].find(tr=>tr.dataset.resKey===key);
   if(other)other.querySelector('.reservation-stock').value=stock.value;
  }else{
   if(stock.dataset.stockMode==='preorder')stock.value=row.dataset.normalStock??'';
   stock.dataset.stockMode='normal';
   stock.placeholder='空欄＝無制限';
   stock.title='通常在庫数';
   stock.setAttribute('aria-label','通常在庫数');
  }
 }
 updateTotalStockField();
}
function setReservationChoice(key,checked){
 reservationFromTable();
 // An individual change always overrides the parent all-reservations mode.
 if(parentPreorderMode){parentPreorderMode=false;}
 reservationDrafts.set(key,{...reserveFor(key),preorder:checked});
 renderReservationTable(false);syncPreorderBoxes();
}
$('product-preorder-all').addEventListener('change',event=>{
 reservationFromTable();parentPreorderMode=event.target.checked;
 const entries=[...$('variant-rows').children].map(el=>trim(el.querySelector('.variant-code').value).toUpperCase()).filter(Boolean);
 for(const key of entries.length?entries:['__base__'])reservationDrafts.set(key,{...reserveFor(key),preorder:parentPreorderMode});
 renderReservationTable(false);syncPreorderBoxes();
});
function renderReservationTable(sync=true){
 if(sync)reservationFromTable();const body=$('reservation-rows');body.replaceChildren();
 const rows=[...$('variant-rows').children].filter(el=>trim(el.querySelector('.variant-name').value)||trim(el.querySelector('.variant-code').value));
 const entries=rows.length?rows.map(el=>({key:trim(el.querySelector('.variant-code').value).toUpperCase(),name:trim(el.querySelector('.variant-name').value)||'名称未設定'})):[{key:'__base__',name:'なし'}];
 const yearNow=new Date().getFullYear();
 for(const entry of entries){
  const item=reserveFor(entry.key),tr=document.createElement('tr');tr.dataset.resKey=entry.key;
  const name=document.createElement('td');name.textContent=trim($('product-name').value)||'商品名未入力';
  const variant=document.createElement('td');variant.textContent=entry.name;
  const cbcell=document.createElement('td');const check=document.createElement('input');check.type='checkbox';check.className='reservation-on';check.checked=item.preorder===true;check.setAttribute('aria-label',entry.name+'を予約販売');cbcell.append(check);
  const dateCell=document.createElement('td');const dates=document.createElement('div');dates.className='reservation-date';
  const select=(cls,label,options,val)=>{const el=document.createElement('select');el.className=cls;el.setAttribute('aria-label',entry.name+'の'+label);
   for(const [value,title] of options){const opt=document.createElement('option');opt.value=value;opt.textContent=title;el.append(opt);}el.value=String(val??'');dates.append(el);return el;};
  const years=[['','年']];for(let y=yearNow-1;y<=yearNow+20;y++)years.push([String(y),y+'年']);
  const y=select('reservation-year','予定年',years,item.releaseYear);
  const m=select('reservation-month','予定月',[['','月'],...Array.from({length:12},(_,i)=>[String(i+1),(i+1)+'月'])],item.releaseMonth);
  const period=select('reservation-period','予定時期',[['','時期'],['上旬','上旬'],['中旬','中旬'],['下旬','下旬']],item.releasePeriod);
  dateCell.append(dates);
  const qtyCell=document.createElement('td');const qty=document.createElement('input');qty.type='number';qty.className='reservation-stock';qty.min='0';qty.max='100000000';qty.step='1';qty.value=String(item.reservationStock??'');qty.placeholder='個数';qty.setAttribute('aria-label',entry.name+'の予約品在庫数');qtyCell.append(qty);
  const toggle=()=>{for(const el of [y,m,period,qty])el.disabled=!check.checked;};
  // Typing in the reservation table immediately updates the same SKU's stock input
  // on the variations tab. It does not alter the preserved ordinary stock.
  qty.addEventListener('input',()=>{
   reservationDrafts.set(entry.key,{...reserveFor(entry.key),reservationStock:qty.value});
   const row=[...$('variant-rows').children].find(el=>trim(el.querySelector('.variant-code').value).toUpperCase()===entry.key);
   if(row&&row.querySelector('.variant-stock').dataset.stockMode==='preorder'){
    row.querySelector('.variant-stock').value=qty.value;
    updateTotalStockField();
   }
  });
  check.addEventListener('change',()=>{reservationFromTable();setReservationChoice(entry.key,check.checked);});toggle();
  tr.append(name,variant,cbcell,dateCell,qtyCell);body.append(tr);
 }
 syncPreorderBoxes();
}
function toggleRelease(){renderReservationTable();updateJanState();}

function updateJanState(){const has=[...$('variant-rows').children].some(row=>trim(row.querySelector('.variant-name').value)||trim(row.querySelector('.variant-code').value));$('product-jan').disabled=has;$('jan-hint').textContent=has?'バリエーション設定中のため無効です。各行のJANを入力してください。':'バリエーションなしの場合は任意で入力できます。';}
function updateVariantVisibility(){$('variant-entry-hint').hidden=$('variant-rows').children.length===0;}
function showVariants(variants=[]){const root=$('variant-rows');root.replaceChildren();for(const v of variants)root.append(variantRow(v));refreshSubcodePrefixes();updateTotalStockField();toggleRelease();updateVariantVisibility();}
function readVariants(id){
 reservationFromTable();const result=[],codes=new Set();
 for(const el of $('variant-rows').children){
  const name=trim(el.querySelector('.variant-name').value),raw=trim(el.querySelector('.variant-code').value);
  const priceText=trim(el.querySelector('.variant-price').value),eventText=trim(el.querySelector('.variant-event-price').value),stockText=trim(el.querySelector('.variant-stock').value),janCode=trim(el.querySelector('.variant-jan').value);
  if(!name&&!raw&&!eventText&&!stockText&&!janCode)continue;
  if(!name||!raw)throw Error('バリエーション名とサブコードはセットで入力してください。');
  if(raw.startsWith(id+'_'))throw Error('サブコード欄には商品IDを含めず、末尾だけを入力してください。');
  const code=raw.toUpperCase();if(!/^[A-Z0-9_-]{1,25}$/.test(code)||codes.has(code))throw Error('サブコードの形式・重複を確認してください。');codes.add(code);
  const price=el.querySelector('.variant-price').dataset.inherited==='1'?null:money(priceText,'バリエーション通常価格',true),eventPrice=money(eventText,'バリエーションキャンペーン価格',true);
  if(price!==null&&eventPrice!==null&&eventPrice>=price)throw Error('バリエーションキャンペーン価格は通常価格未満にしてください。');
  if(!trim(el.querySelector('.variant-axis1').value))throw Error('バリエーションの選択肢①を入力してください。');
  if(trim(el.querySelector('.variant-axis2').value)&&!trim($('axis2-name').value))throw Error('バリエーション項目名②を入力してください。');
  // A checked reservation displays reservationStock in the editor, not ordinary stock.
  // Persist ordinary stock from its separate in-memory draft so toggling back restores it.
  const stock=money(el.dataset.normalStock??stockText,'バリエーション通常在庫数',true);
  const reserve=reserveFor(code);
  result.push({code,name,price,eventPrice,stock,janCode,axis1:trim(el.querySelector('.variant-axis1').value),axis2:trim(el.querySelector('.variant-axis2').value),...reserve});
 }
 if(result.length>MAX_VARIANTS)throw Error('バリエーションは100件以内にしてください。');return result;
}
function axisSpec(){
 const rows=[...$('variant-rows').children];
 const ax1=[...new Set(rows.map(x=>trim(x.querySelector('.variant-axis1').value)).filter(Boolean))];
 const ax2=[...new Set(rows.map(x=>trim(x.querySelector('.variant-axis2').value)).filter(Boolean))];
 return {axis1Name:trim($('axis1-name').value),axis1Values:ax1,axis2Name:trim($('axis2-name').value),axis2Values:ax2};
}
$('add-variant').addEventListener('click',()=>{if($('variant-rows').children.length>=MAX_VARIANTS){status('バリエーションは100件以内にしてください。',true);return;}const el=variantRow();$('variant-rows').append(el);updateTotalStockField();updateVariantVisibility();toggleRelease();el.querySelector('.variant-axis1').focus();});
const bulkYear=$('bulk-year'),bulkMonth=$('bulk-month');
for(let y=new Date().getFullYear();y<=new Date().getFullYear()+20;y++){const option=document.createElement('option');option.value=String(y);option.textContent=y+'年';bulkYear.append(option);}
for(let m=1;m<=12;m++){const option=document.createElement('option');option.value=String(m);option.textContent=m+'月';bulkMonth.append(option);}
bulkMonth.value=String(new Date().getMonth()+1);
$('bulk-apply').addEventListener('click',()=>{
 const year=bulkYear.value,month=bulkMonth.value,period=$('bulk-period').value;
 if(!year||!month||!period){status('一括設定する年・月・時期を選択してください。',true);return;}
 reservationFromTable();let count=0;
 for(const [key,value] of reservationDrafts)if(value.preorder===true){reservationDrafts.set(key,{...value,releaseYear:year,releaseMonth:month,releasePeriod:period});count++;}
 renderReservationTable(false);status(count?count+'種類の予約発売予定を一括設定しました。保存ボタンで登録してください。':'予約チェックが入った商品がありません。',!count);
});
$('product-name').addEventListener('change',toggleRelease);
$('variant-rows').addEventListener('input',updateJanState);
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
const validPeriods=['上旬','中旬','下旬'];
function validateReservation(item,label){
 const preorder=item.preorder===true||item.preorder==='1';
 const releaseYear=preorder?Number(item.releaseYear):null,releaseMonth=preorder?Number(item.releaseMonth):null,releasePeriod=preorder?trim(item.releasePeriod):'';
 const reservationStock=preorder?money(item.reservationStock??'',label+'の予約品在庫数'):null;
 if(preorder){
  if(!Number.isInteger(releaseYear)||releaseYear<2020||releaseYear>2100||!Number.isInteger(releaseMonth)||releaseMonth<1||releaseMonth>12||!validPeriods.includes(releasePeriod))throw Error(label+'の予約予定（年・月・上旬／中旬／下旬）を入力してください。');
  // An already-registered reservation may retain its original date; new selections cannot be in the past.
  const now=new Date(),todayPeriod=now.getDate()<=10?0:now.getDate()<=20?1:2;
  const newRank=releaseYear*36+(releaseMonth-1)*3+validPeriods.indexOf(releasePeriod);
  const todayRank=now.getFullYear()*36+now.getMonth()*3+todayPeriod;
  if(newRank<todayRank)throw Error(label+'の予約予定は過去の時期を選択できません。');
  if(reservationStock===null)throw Error(label+'の予約品在庫数を入力してください。0も入力可能です。');
 }
 return {preorder,releaseYear,releaseMonth,releasePeriod,reservationStock};
}
function productOf(fields){
 const id=trim(fields.id),name=trim(fields.name),categoryName=trim(fields.categoryName);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(id))throw Error('商品IDは半角英数字で始まる40文字以内の英数字・-・_にしてください。');
 if(!name||name.length>100)throw Error(id+'：商品名は1〜100文字で入力してください。');
 if(!categoryName||categoryName.length>40)throw Error(id+'：カテゴリは1〜40文字で入力してください。');
 const price=money(fields.price,id+'の税込価格'),eventPrice=money(fields.eventPrice,id+'のキャンペーン価格',true);
 if(eventPrice!==null&&eventPrice>=price)throw Error(id+'：キャンペーン価格は税込価格より小さくしてください。');
 const rawVariants=Array.isArray(fields.variants)?fields.variants:parseVariants(fields.colors);
 if(rawVariants.length>MAX_VARIANTS)throw Error('バリエーションは100件以内です。');
 const variants=rawVariants.map(v=>{
  if(!v.code||!v.name||!/^[A-Z0-9_-]{1,25}$/i.test(v.code))throw Error('サブコード・バリエーション名を確認してください。');
  const variantPrice=money(v.price??'',id+'のバリエーション通常価格',true),variantEvent=money(v.eventPrice??'',id+'のバリエーションキャンペーン価格',true);
  const effectivePrice=variantPrice??price,effectiveEvent=variantEvent??eventPrice;
  if(effectiveEvent!==null&&effectiveEvent>=effectivePrice)throw Error(id+'：バリエーションのキャンペーン価格は、その種類の通常価格より小さくしてください。個別価格を調整するか、個別キャンペーン価格を設定してください。');
  const variantStock=money(v.stock??'',id+'のバリエーション在庫数',true);
  const janCode=trim(v.janCode??'');if(janCode&&!/^\d{8,14}$/.test(janCode))throw Error(id+'：バリエーションJANは8〜14桁にしてください。');
  return {code:trim(v.code).toUpperCase(),name:trim(v.name),price:variantPrice,eventPrice:variantEvent,stock:variantStock,janCode,axis1:trim(v.axis1),axis2:trim(v.axis2),...validateReservation(v,id+' / '+v.name)};
 });
 if(new Set(variants.map(v=>v.code)).size!==variants.length)throw Error(id+'：サブコードが重複しています。');
 const ids=variants.map(v=>v.janCode).filter(Boolean);if(new Set(ids).size!==ids.length)throw Error(id+'：バリエーションJANが重複しています。');
 const janCode=variants.length?'':trim(fields.janCode??'');if(janCode&&!/^\d{8,14}$/.test(janCode))throw Error(id+'：JANコードは8〜14桁の数字にしてください。');
 const stock=variants.length?null:money(fields.stock??'',id+'の在庫数',true);
 const reserve=variants.length?{preorder:false,releaseYear:null,releaseMonth:null,releasePeriod:'',reservationStock:null}:validateReservation(fields,id);
 const inputCombos=Array.isArray(fields.combos)?fields.combos:(fields.comboProductId?[{productId:fields.comboProductId,discount:fields.comboDiscount??0}]:[]);
 const combos=validateCombos(id,inputCombos);
 const comboProductId=combos[0]?.productId||'',comboDiscount=combos[0]?.discount||0;
 const variantAxes=fields.variantAxes||{axis1Name:'',axis1Values:[],axis2Name:'',axis2Values:[]};
 return {id,name,categoryName,price,eventPrice,variants,variantAxes,preorderAll:fields.preorderAll===true&&variants.length>0,active:fields.active!==false,noveltyTarget:fields.noveltyTarget===true,janCode,...reserve,stock,combos,comboProductId,comboDiscount};
}
function inputData(){
 reservationFromTable();const id=trim($('product-id').value);
 const base=reserveFor('__base__');return productOf({id,name:$('product-name').value,categoryName:$('product-category').value,
  price:$('product-price').value,eventPrice:$('product-event-price').value,variants:readVariants(id),variantAxes:axisSpec(),active:$('product-active').checked,noveltyTarget:noveltyIds.has(id),
  janCode:$('product-jan').value,stock:$('product-stock').value,...base,preorderAll:parentPreorderMode,combos:readCombos(id)});
}
function selectProductTab(name){
 for(const b of document.querySelectorAll('[data-product-tab]')){const active=b.dataset.productTab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',active?'true':'false');b.tabIndex=active?0:-1;}
 for(const panel of document.querySelectorAll('.product-tab-panel'))panel.hidden=panel.id!=='panel-'+name;
 const actions=document.querySelector('.editor-actions');if(actions)actions.hidden=name==='csv';
 if(name==='preorder')renderReservationTable();
}
for(const btn of document.querySelectorAll('[data-product-tab]'))btn.addEventListener('click',()=>selectProductTab(btn.dataset.productTab));
function focusProblemTab(error){
 const text=String(error.message||error);
 const tab=/バリエーション|サブコード|SKU|JAN.*重複/.test(text)?'variants':/予約|発売予定/.test(text)?'preorder':/組合せ/.test(text)?'combo':'basic';
 selectProductTab(tab);
}
// Only compare content controlled by product editor. Live sales update stock/updatedAt
// asynchronously, which must not trigger a false "unpublished" warning.
function publicProjectionOf(p){
 return {
  id:p.id,name:p.name,categoryId:p.categoryName,price:p.price,eventPrice:p.eventPrice??null,
  preorder:p.preorder===true,releaseYear:p.releaseYear??null,releaseMonth:p.releaseMonth??null,releasePeriod:p.releasePeriod||'',
  variants:(p.variants||[]).map(v=>({code:v.code,name:v.name,price:v.price??null,eventPrice:v.eventPrice??null,preorder:v.preorder===true,releaseYear:v.releaseYear??null,releaseMonth:v.releaseMonth??null,releasePeriod:v.releasePeriod||''})).sort((a,b)=>a.code.localeCompare(b.code)),
  combos:existingCombos(p).map(c=>({id:c.productId,discount:c.discount})).sort((a,b)=>a.id.localeCompare(b.id))
 };
}
function normalizedPublicRecord(p){
 return {id:p.id,name:p.name,categoryId:p.categoryId,price:p.price,eventPrice:p.eventPrice??null,preorder:p.preorder===true,releaseYear:p.releaseYear??null,releaseMonth:p.releaseMonth??null,releasePeriod:p.releasePeriod||'',variants:(p.variants||[]).map(v=>({code:v.code,name:v.name,price:v.price??null,eventPrice:v.eventPrice??null,preorder:v.preorder===true,releaseYear:v.releaseYear??null,releaseMonth:v.releaseMonth??null,releasePeriod:v.releasePeriod||''})).sort((a,b)=>a.code.localeCompare(b.code))};
}
function stableStringify(value){if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';return JSON.stringify(value);}
function productPending(p){
 // Sales update both the owner stock and publishedStock; manual inventory edits
 // should remain pending until the owner explicitly publishes.
 const equalStock=(a,b)=>(a??null)===(b??null);
 if((p.variants||[]).length){
  for(const v of p.variants){
   const k=p.id+'::'+v.code;
   if(Object.prototype.hasOwnProperty.call(publishedVariantQuantities,k)){
    const qty=v.preorder===true?v.reservationStock:v.stock;
    if(!equalStock(qty,publishedVariantQuantities[k]))return true;
   }
  }
 }else if(Object.prototype.hasOwnProperty.call(publishedStockQuantities,p.id)){
  const qty=p.preorder===true?p.reservationStock:p.stock;
  if(!equalStock(qty,publishedStockQuantities[p.id]))return true;
 }
 const published=publishedProductsById.get(p.id);
 if(p.active===false)return Boolean(published);
 if(!published)return true;
 const live=normalizedPublicRecord(published);
 const comparison=publicProjectionOf(p);delete comparison.combos;
 return stableStringify(comparison)!==stableStringify(live);
}
function hasUnpublishedChanges(){
 if(forcePending)return true;
 if([...products.values()].some(productPending))return true;
 if([...publishedProductsById.keys()].some(id=>!products.has(id)||products.get(id).active===false))return true;
 const active=[...products.values()].filter(p=>p.active!==false),activeIds=new Set(active.map(p=>p.id));
 const pairs=new Map();for(const p of active)for(const c of existingCombos(p)){
  if(!activeIds.has(c.productId)||c.productId===p.id)continue;
  const ids=[p.id,c.productId].sort();const k=ids.join('::');pairs.set(k,Math.max(pairs.get(k)||0,c.discount));
 }
 const normalizedBundles=[...pairs].map(([id,discount])=>id+'='+discount).sort();
 const currentBundles=(publishedBundles||[]).map(b=>[...(b.productIds||[])].sort().join('::')+'='+(b.discountAmount||0)).sort();
 if(JSON.stringify(normalizedBundles)!==JSON.stringify(currentBundles))return true;
 const currentCats=[...categories].sort((a,b)=>a.localeCompare(b,'ja'));
 const liveCats=[...publishedCategories].sort((a,b)=>a.localeCompare(b,'ja'));
 if(JSON.stringify(currentCats)!==JSON.stringify(liveCats))return true;
 return false;
}
function markDraftPending(){
 forcePending=true;
 const message=$('publish-status');if(message){message.hidden=true;message.textContent='';}
 updatePublishState();
}
function updatePublishState(){
 const node=$('publish-state'),label=$('publish-state-text');
 if(!node||!label)return;
 if(!hasPublishedSnapshot&&!products.size&&!categories.length){node.dataset.state='loading';label.textContent='商品はまだ登録されていません。商品を登録後、購入者ページへ公開できます。';return;}
 const pending=hasUnpublishedChanges();
 node.dataset.state=pending?'pending':'published';
 label.textContent=pending?'未反映の変更があります。購入者ページにはまだ反映されていません。':'保存済みの変更は購入者ページに反映されています。';
}
function categoryOptions(){
 $('categories').replaceChildren();$('category-options').replaceChildren();$('category-count').textContent=categories.length+'件';
 const selector=$('product-filter-category');const selected=selector.value;selector.replaceChildren();
 const all=document.createElement('option');all.value='';all.textContent='すべてのカテゴリ';selector.append(all);
 for(const name of [...categories].sort((a,b)=>a.localeCompare(b,'ja'))){const option=document.createElement('option');option.value=name;option.textContent=name;selector.append(option);}
 selector.value=categories.includes(selected)?selected:'';
 if(!categories.length){const p=document.createElement('p');p.className='muted';p.textContent='カテゴリは未登録です。';$('categories').append(p);}
 for(const name of categories){
  const dat=document.createElement('option');dat.value=name;$('category-options').append(dat);
  const item=document.createElement('span');item.className='cat';item.append(document.createTextNode(name));
  const btn=document.createElement('button');btn.type='button';btn.textContent='×';btn.title=name+'を削除';btn.disabled=[...products.values()].some(p=>p.categoryName===name)||busy;
  btn.addEventListener('click',()=>removeCategory(name));item.append(btn);$('categories').append(item);
 }
}
function stockLabel(p){
 const variants=Array.isArray(p.variants)?p.variants:[];
 const entries=variants.length?variants:[p];
 if(entries.every(v=>v.stock===null||v.stock===undefined))return '在庫：数量制限なし';
 const values=entries.map(v=>v.preorder===true?v.reservationStock:v.stock);
 if(values.some(v=>v===null||v===undefined))return '在庫：一部数量制限なし';
 const sum=values.reduce((acc,v)=>acc+(Number(v)||0),0);
 return '在庫：'+sum.toLocaleString('ja-JP')+'点'+(variants.length?'（全バリエーション計）':'');
}
function productSoldOut(p){
 const rows=p.variants?.length?p.variants:[p];
 return rows.every(v=>{
  const qty=v.preorder===true?v.reservationStock:v.stock;
  return qty!==null&&qty!==undefined&&Number(qty)===0;
 });
}
function productList(){
 $('product-count').textContent=products.size;
 const box=$('product-list');box.replaceChildren();
 const q=trim($('product-filter-search').value).normalize('NFKC').toLocaleLowerCase('ja-JP');
 const filterCat=$('product-filter-category').value,filterState=$('product-filter-state').value;
 if(!products.size){const p=document.createElement('p');p.className='muted';p.textContent='商品はまだ登録されていません。上の「商品登録・編集」から追加してください。';box.append(p);$('product-results-summary').textContent='0件';updatePublishState();return;}
 const rows=[...products.values()].filter(p=>{
  const match=(!q||(p.name+' '+p.id).normalize('NFKC').toLocaleLowerCase('ja-JP').includes(q))&&(!filterCat||p.categoryName===filterCat);
  if(!match)return false;
  if(filterState==='published')return p.active!==false&&publishedProductsById.has(p.id)&&!productPending(p);
  if(filterState==='pending')return productPending(p);
  if(filterState==='hidden')return p.active===false;
  if(filterState==='preorder')return p.preorder===true||(p.variants||[]).some(v=>v.preorder===true);
  if(filterState==='soldout')return productSoldOut(p);
  return true;
 }).sort((a,b)=>a.id.localeCompare(b.id,'ja'));
 $('product-results-summary').textContent=rows.length+'件を表示／登録 '+products.size+'件';
 if(!rows.length){const p=document.createElement('p');p.className='muted';p.textContent='該当する商品はありません。検索条件を変更してください。';box.append(p);updatePublishState();return;}
 for(const p of rows){
  const row=document.createElement('div');row.className='product';
  const info=document.createElement('div');info.className='product-info';
  const name=document.createElement('div');name.className='product-name';name.textContent=p.name;
  const meta=document.createElement('div');meta.className='product-meta';meta.textContent=[p.id,p.categoryName,yen(p.price),p.eventPrice!==null&&p.eventPrice!==undefined?'キャンペーン '+yen(p.eventPrice):'',(p.variants||[]).length?'バリエーション '+p.variants.length+'種':''].filter(Boolean).join(' ／ ');
  const tags=document.createElement('div');tags.className='product-state-tags';
  function tag(text,mode){const span=document.createElement('span');span.className='catalog-tag '+mode;span.textContent=text;tags.append(span);}
  if(p.active===false)tag(publishedProductsById.has(p.id)?'非公開・未反映':'非公開','off');
  else if(!publishedProductsById.has(p.id))tag('公開待ち','warn');
  else if(productPending(p))tag('変更未反映','warn');
  else tag('公開済み','ok');
  if(p.preorder===true||(p.variants||[]).some(v=>v.preorder===true))tag('予約販売あり','');
  if(productSoldOut(p))tag('在庫切れ','empty');else tag(stockLabel(p),'');
  info.append(name,meta,tags);
  const edit=document.createElement('button');edit.type='button';edit.textContent='編集';edit.addEventListener('click',()=>editProduct(p.id));
  const del=document.createElement('button');del.type='button';del.className='danger';del.textContent='削除';del.addEventListener('click',()=>deleteProduct(p.id));
  row.append(info,edit,del);box.append(row);
 }
 updatePublishState();
}
function render(){categoryOptions();productList();}
function editProduct(id){
 const p=products.get(id);if(!p)return;
 clearForm();$('product-id').value=p.id;$('product-id').readOnly=true;$('product-name').value=p.name;
 $('product-category').value=p.categoryName;$('product-price').value=p.price;$('product-event-price').value=p.eventPrice??'';
 const axes=p.variantAxes||{};
 for(const [name,value] of [['axis1-name',axes.axis1Name||''],['axis2-name',axes.axis2Name||'']])$(name).value=value;
 reservationDrafts.clear();$('reservation-rows').replaceChildren();parentPreorderMode=(p.variants||[]).length?p.preorderAll===true:p.preorder===true;
 if((p.variants||[]).length){for(const v of p.variants){reservationDrafts.set(trim(v.code).startsWith(p.id+'_')?trim(v.code).slice(p.id.length+1):v.code,{preorder:v.preorder===true,releaseYear:v.releaseYear??p.releaseYear??'',releaseMonth:v.releaseMonth??p.releaseMonth??'',releasePeriod:v.releasePeriod||p.releasePeriod||'',reservationStock:v.reservationStock??v.stock??''});}}
 else reservationDrafts.set('__base__',{preorder:p.preorder===true,releaseYear:p.releaseYear??'',releaseMonth:p.releaseMonth??'',releasePeriod:p.releasePeriod||'',reservationStock:p.reservationStock??p.stock??''});
 showVariants((p.variants||[]).map(v=>({code:trim(v.code).startsWith(p.id+'_')?trim(v.code).slice(p.id.length+1):v.code,name:v.name,price:v.price??'',eventPrice:v.eventPrice??'',stock:v.stock??'',janCode:v.janCode??'',axis1:v.axis1||'',axis2:v.axis2||''})));
 $('product-jan').value=p.janCode||'';resetTotalStockState(p.stock??'');
 showCombos(existingCombos(p));$('product-active').checked=p.active!==false;
 pendingImages=[undefined,undefined];for(let slot=0;slot<2;slot++){ $(imageId('product-image',slot)).value='';$(imageId('product-image-delete',slot)).checked=false; }
 loadSavedImage(id,++imageRevision);$('edit-note').textContent='編集中：'+p.id+'（商品IDは変更できません）';selectProductTab('basic');$('product-form').scrollIntoView({behavior:'smooth',block:'start'});
}
function clearForm(){
 ++imageRevision;imageSlotRevision=[0,0];pendingImages=[undefined,undefined];imageTaskCount=0;imageProcessing=false;$('product-form').reset();totalAutoMode=false;manualTotalDraft='';reservationDrafts.clear();$('reservation-rows').replaceChildren();parentPreorderMode=false;$('product-preorder-all').checked=false;
 for(const id of ['axis1-name','axis2-name'])$(id).value='';
 showVariants();showCombos();$('product-id').readOnly=false;$('product-active').checked=true;$('edit-note').textContent='新規登録';
 for(let slot=0;slot<2;slot++){imagePreview('',slot);$(imageId('product-image-hint',slot)).textContent='画像未登録。';$(imageId('product-image',slot)).value='';$(imageId('product-image-delete',slot)).checked=false;}
 selectProductTab('basic');setBusy(busy);
}
function toFirestore(p,original){return {...p,createdAt:original?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()};}
async function saveProduct(event){
 event.preventDefault();if(busy||imageProcessing||!user)return;
 let p;try{p=inputData();}catch(err){status(err.message,true);focusProblemTab(err);return;}
 if(!products.has(p.id)&&products.size>=maxProducts){status('登録上限300商品です。',true);return;}
 const nextCategories=categories.includes(p.categoryName)?categories:[...categories,p.categoryName];
 if(nextCategories.length>80){status('カテゴリは80件以内にしてください。',true);return;}
 setBusy(true);
 try{
  const batch=writeBatch(db);batch.set(prodRef(p.id),toFirestore(p,products.get(p.id)));
  const imageChange=pendingImages.some(x=>x!==undefined)||[0,1].some(slot=>$(imageId('product-image-delete',slot)).checked);
  if(imageChange){
   const old=await getDoc(imageRef(p.id)),imageData=old.exists()?old.data().imageData:'',imageData2=old.exists()?old.data().imageData2:'';
   const result=[imageData,imageData2].map((x,slot)=>$(imageId('product-image-delete',slot)).checked?'':(pendingImages[slot]===undefined?x:pendingImages[slot]));
   if(!result[0]&&result[1]){result[0]=result[1];result[1]='';}
   if(result.some(x=>x&&x.length>IMAGE_DATA_LIMIT))throw Error('画像の保存容量が上限を超えています。');
   if(result.some(Boolean))batch.set(imageRef(p.id),{productId:p.id,imageData:result[0]||'',imageData2:result[1]||'',updatedAt:serverTimestamp()});
   else if(old.exists())batch.delete(imageRef(p.id));
  }
  if(nextCategories.length!==categories.length)batch.set(catRef(),{categories:nextCategories,updatedAt:serverTimestamp()});
  await batch.commit();const imageWasSaved=imageChange;if(imageWasSaved)imageKnown.add(p.id);products.set(p.id,{...products.get(p.id),...p});categories=nextCategories;markDraftPending();render();clearForm();status('「'+p.name+'」を'+(imageWasSaved?'画像とともに':'')+'保存しました。購入者ページには未反映です。上の「お客様ページに反映」を押してください。');
 }catch(err){console.error(err);status('商品を保存できませんでした（'+(err.code||'保存失敗')+'）：'+(err.message||'認証・Firestoreルール・通信環境をご確認ください。')+'。画像が原因と思われる場合は画像を外して再試行してください。',true);}finally{setBusy(false);}
}
async function addCategory(event){
 event.preventDefault();if(busy)return;
 const name=trim($('new-category').value);if(!name||name.length>40){status('カテゴリ名は1〜40文字で入力してください。',true);return;}
 if(categories.includes(name)){status('このカテゴリは登録済みです。',true);return;}
 if(categories.length>=80){status('カテゴリは80件以内にしてください。',true);return;}
 setBusy(true);try{const next=[...categories,name];const batch=writeBatch(db);batch.set(catRef(),{categories:next,updatedAt:serverTimestamp()});await batch.commit();categories=next;markDraftPending();render();$('new-category').value='';status('カテゴリを追加しました。');}
 catch(err){console.error(err);status('カテゴリを保存できませんでした。',true);}finally{setBusy(false);}
}
async function removeCategory(name){
 if(busy||[...products.values()].some(p=>p.categoryName===name))return;
 if(!confirm('「'+name+'」を削除しますか？'))return;
 setBusy(true);try{const next=categories.filter(v=>v!==name);const batch=writeBatch(db);batch.set(catRef(),{categories:next,updatedAt:serverTimestamp()});await batch.commit();categories=next;markDraftPending();render();status('カテゴリを削除しました。お客様ページへの反映が必要です。');}
 catch(err){status('カテゴリの削除に失敗しました。',true);}finally{setBusy(false);}
}
async function deleteProduct(id){
 if(busy)return;const p=products.get(id);if(!p||!confirm('「'+p.name+'（'+id+'）」を削除しますか？'))return;
 setBusy(true);try{const batch=writeBatch(db);batch.delete(prodRef(id));batch.delete(imageRef(id));
  const nextIds=[...noveltyIds].filter(productId=>productId!==id).sort();
  if(brandSettingsExists&&noveltyIds.has(id))batch.set(brandSettingsRef(),{novelty:{productIds:nextIds,productId:nextIds[0]||''},updatedAt:serverTimestamp()},{merge:true});await batch.commit();noveltyIds=new Set(nextIds);products.delete(id);imageKnown.delete(id);markDraftPending();render();if($('product-id').value===id)clearForm();status('商品を削除しました。');}
 catch(err){console.error(err);status('商品を削除できませんでした。',true);}finally{setBusy(false);}
}
// 商品一括登録はCSV専用。既存形式の見出しも読み取れるようにする。
// 区分を分かりやすくするため、必須と条件付き必須を列名に明記する。
const headers=['カテゴリ(必須)','ID(必須)','商品名(必須)','税込価格(必須)','表示/非表示(必須)','JANコード(任意)','展示会特価(任意)','受注予約(任意)','在庫数(任意)','サブコード(バリエーション時必須)','バリエーション項目(バリエーション時必須)','バリエーションごとの通常価格(任意)','バリエーションごとの展示会特価(任意)','組合せ商品ID(組合せ時必須)','組合せ時割引金額(任意)','組合せ商品ID2(組合せ時必須)','組合せ時割引金額2(任意)','組合せ商品ID3(組合せ時必須)','組合せ時割引金額3(任意)','発売予定月(予約時必須)','発売予定時期(予約時必須)','バリエーション在庫数(任意)','バリエーション受注予約(任意)','ノベルティ対象(任意)','予約予定年(任意)','予約品在庫数(任意)','SKU別JAN(任意)','SKU予約予定年(任意)','SKU予約予定月(任意)','SKU予約予定時期(任意)','SKU予約品在庫数(任意)','第1軸の名前(任意)','第1軸の値(任意)','第2軸の名前(任意)','第2軸の値(任意)'];
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
  for(const v of variants)rows.push([p.categoryName,p.id,p.name,p.price,p.active===false?0:1,p.janCode||'',p.eventPrice??'',p.preorder?1:0,(p.variants||[]).length?(totalOfVariantStocks(p.variants)??''):(p.stock??''),v?.code||'',v?.name||'',v?.price??'',v?.eventPrice??'',combos[0]?.productId||'',combos[0]?.discount??'',combos[1]?.productId||'',combos[1]?.discount??'',combos[2]?.productId||'',combos[2]?.discount??'',(p.preorder||p.variants?.some(v=>v.preorder===true))?p.releaseMonth??'':'',(p.preorder||p.variants?.some(v=>v.preorder===true))?p.releasePeriod||'':'',v?.stock??'',typeof v?.preorder==='boolean'?(v.preorder?1:0):'',noveltyIds.has(p.id)?1:0,p.releaseYear??'',p.reservationStock??'',v?.janCode??'',v?.releaseYear??'',v?.releaseMonth??'',v?.releasePeriod||'',v?.reservationStock??'',p.variantAxes?.axis1Name||'',v?.axis1||'',p.variantAxes?.axis2Name||'',v?.axis2||'']);
 }
 return rows;
}
function parseProductRows(rows){
 if(rows.length<2)throw Error('CSVに登録する商品データがありません。');
 const normalize=h=>trim(h).replace(/[（(](?:任意|必須|予約時必須|バリエーション時必須|組合せ時必須)[)）]/g,'').replace(/\s+/g,'').toLowerCase();
 const indexes=headers.map(h=>(rows[0]||[]).findIndex(v=>normalize(v)===normalize(h)));
 if(indexes.slice(0,15).some(i=>i<0))throw Error('CSVに必要な列が不足しています。最新テンプレートをご使用ください。');
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
  const base={id,categoryName:get(0),name:get(2),price:get(3),active:active==='1',noveltyTarget:noveltyValue==='1',janCode:get(5),eventPrice:get(6),preorder:get(7)==='1',stock:get(8),combos,releaseMonth:get(19),releasePeriod:get(20),releaseYear:get(24),reservationStock:get(25)};
  const flatKey=JSON.stringify(base);
  let entry=entries.get(id);
  if(entry&&entry.key!==flatKey)throw Error((i+1)+'行目：同じIDの基本項目が他の行と異なります。');
  if(!entry){entry={key:flatKey,base,variants:[],axisNames:{axis1Name:'',axis2Name:''}};entries.set(id,entry);}
  const sub=get(9),variantName=get(10),price=get(11),eventPrice=get(12),variantStock=get(21),variantPreorder=get(22);
  if(variantPreorder&&!['0','1'].includes(variantPreorder))throw Error((i+1)+'行目：バリエーション受注予約は0か1、または空欄です。');
  if(sub||variantName||price||eventPrice||variantStock||variantPreorder){
   if(!sub||!variantName)throw Error((i+1)+'行目：サブコード末尾とバリエーション名をセットで記入してください。');
   if(sub.startsWith(id+'_')&&!legacyTemplate)throw Error((i+1)+'行目：サブコード欄には商品IDを入れず、BKなど末尾だけを入力してください。');
   const code=(legacyTemplate&&sub.startsWith(id+'_')?sub.slice(id.length+1):sub).toUpperCase();
   entry.variants.push({code,name:variantName,price,eventPrice,stock:variantStock,preorder:variantPreorder===''?base.preorder:variantPreorder==='1',janCode:get(26),releaseYear:get(27)||base.releaseYear,releaseMonth:get(28)||base.releaseMonth,releasePeriod:get(29)||base.releasePeriod,reservationStock:get(30)||base.reservationStock,axis1:get(32),axis2:get(34)});
   entry.axisNames={axis1Name:get(31),axis2Name:get(33)};
  }
 }
 if(entries.size>maxProducts)throw Error('一度に登録できるのは300商品までです。');
 const results=[];for(const entry of entries.values()){const ax=entry.axisNames;results.push(productOf({...entry.base,variants:entry.variants,variantAxes:{...ax,axis1Values:[...new Set(entry.variants.map(v=>v.axis1).filter(Boolean))],axis2Values:[...new Set(entry.variants.map(v=>v.axis2).filter(Boolean))]}}));}
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
  const nextIdsSet=new Set(noveltyIds);for(const item of rows){if(item.noveltyTarget===true)nextIdsSet.add(item.id);else nextIdsSet.delete(item.id);}
  const nextIds=[...nextIdsSet].sort();
  if(brandSettingsExists)batch.set(brandSettingsRef(),{novelty:{productIds:nextIds,productId:nextIds[0]||''},updatedAt:serverTimestamp()},{merge:true});
  if(newCategories.length!==categories.length)batch.set(catRef(),{categories:newCategories,updatedAt:serverTimestamp()});
  await batch.commit();noveltyIds=new Set(nextIds);for(const p of rows)products.set(p.id,{...products.get(p.id),...p});categories=newCategories;markDraftPending();
  importData=null;$('import-file').value='';$('import-preview').hidden=true;render();status(rows.length+'商品の一括登録が完了しました。お客様ページへ反映してください。');
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
   eventPrice:productRecord.eventPrice??null,noveltyTarget:productRecord.noveltyTarget===true,preorder:productRecord.preorder===true,releaseYear:productRecord.releaseYear??null,releaseMonth:productRecord.releaseMonth??null,releasePeriod:productRecord.releasePeriod||'',stock:productRecord.variants?.length?null:(productRecord.preorder===true?productRecord.reservationStock??null:productRecord.stock??null),
   variants:(productRecord.variants||[]).map(v=>({code:v.code,name:v.name,price:v.price??null,eventPrice:v.eventPrice??null,stock:v.preorder===true?v.reservationStock??null:v.stock??null,preorder:v.preorder===true,releaseYear:v.releaseYear??null,releaseMonth:v.releaseMonth??null,releasePeriod:v.releasePeriod||''}))
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
    const data=imageSnap.data(),image=data.imageData,image2=data.imageData2||'';
    if(typeof image==='string'&&image.length<=IMAGE_DATA_LIMIT&&/^data:image\/(webp|jpeg);base64,/.test(image))uploaded.push({id:productRecord.id,image,image2:typeof image2==='string'&&image2.length<=IMAGE_DATA_LIMIT&&/^data:image\/(webp|jpeg);base64,/.test(image2)?image2:''});
   }
  }
  publicationStage='画像アップロード';
  message.textContent='商品画像を公開しています… '+uploaded.length+'枚';
  // Small chunks keep within Firestore's batch write limit at 300 products.
  for(let i=0;i<uploaded.length;i+=100){
   const batch=writeBatch(db);
   for(const record of uploaded.slice(i,i+100))batch.set(
    doc(db,'publishedCatalogs',brand.slug,'images',record.id),
    {productId:record.id,imageData:record.image,imageData2:record.image2||'',updatedAt:serverTimestamp()}
   );
   await batch.commit();
  }
  for(const p of exposed){const record=uploaded.find(x=>x.id===p.id);p.imageCount=record?(record.image2?2:1):0;}
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
  let appliedStock=null;
  await runTransaction(db,async tx=>{
    const inventoryDocs=visible.map(productRecord=>prodRef(productRecord.id));
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
    tx.set(doc(db,'publishedStock',brand.slug),{
      brandId:user.uid,slug:brand.slug,quantities:next,variantQuantities,updatedAt:serverTimestamp()
    });
    appliedStock={quantities:next,variantQuantities};
  });
  if(appliedStock){publishedStockQuantities=appliedStock.quantities;publishedVariantQuantities=appliedStock.variantQuantities;}
  publishedProductsById=new Map(exposed.map(p=>[p.id,p]));publishedBundles=[...pairs.values()];publishedCategories=categoriesPublic.map(c=>c.name);publishedCatalogAt=Date.now();hasPublishedSnapshot=true;forcePending=false;render();
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
 const [catSnap,prodSnap,noveltySnap,publicSnap,pubStockSnap]=await Promise.all([getDoc(catRef()),getDocs(coll()),getDoc(brandSettingsRef()),getDocFromServer(doc(db,'publishedCatalogs',brand.slug)),getDocFromServer(doc(db,'publishedStock',brand.slug))]);
 publishedStockQuantities=pubStockSnap.data()?.quantities||{};publishedVariantQuantities=pubStockSnap.data()?.variantQuantities||{};
 brandSettingsExists=noveltySnap.exists();
 const n=noveltySnap.data()?.novelty||{};
 categories=catSnap.exists()&&Array.isArray(catSnap.data().categories)?catSnap.data().categories.filter(x=>typeof x==='string'):[];
 publishedProductsById=new Map((publicSnap.exists()?publicSnap.data().products||[]:[]).map(p=>[p.id,p]));publishedBundles=publicSnap.exists()?publicSnap.data().bundles||[]:[];hasPublishedSnapshot=publicSnap.exists();publishedCategories=(publicSnap.exists()?publicSnap.data().categories||[]:[]).map(x=>x.name);forcePending=false;products=new Map(prodSnap.docs.map(snapshot=>[snapshot.id,snapshot.data()]));noveltyIds=new Set(noveltySnap.exists()?(Array.isArray(n.productIds)?n.productIds:(n.productId?[n.productId]:[])):[...products.values()].filter(p=>p.noveltyTarget===true).map(p=>p.id));render();return true;
 }catch(err){console.error(err);status('商品情報を読み込めませんでした。Firestoreルールをご確認ください。',true);return false;}}
for(const id of ['product-filter-search','product-filter-category','product-filter-state'])$(id).addEventListener(id==='product-filter-search'?'input':'change',productList);
$('product-form').addEventListener('submit',saveProduct);$('product-clear').addEventListener('click',clearForm);
for(let slot=0;slot<2;slot++){$(imageId('product-image',slot)).addEventListener('change',()=>onImageSelected(slot));$(imageId('product-image-delete',slot)).addEventListener('change',event=>{if(event.target.checked){pendingImages[slot]=undefined;$(imageId('product-image',slot)).value='';imagePreview('',slot);$(imageId('product-image-hint',slot)).textContent='保存時に削除します。';}});}
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
   user=u;brand=b;$('brand-label').textContent=b.displayName+'　｜　v1.0.1';const publicLink=new URL('./index.html',location.href);publicLink.searchParams.set('brand',b.slug);$('public-customer-link').href=publicLink.href;await refresh();$('loading').hidden=true;$('shell').hidden=false;document.documentElement.classList.remove('auth-pending');const requestedId=new URLSearchParams(location.search).get('edit');if(requestedId&&products.has(requestedId))editProduct(requestedId);
  }catch(err){console.error(err);$('loading').textContent='ブランド情報を読み込めません。Firestoreルールをご確認ください。';document.documentElement.classList.remove('auth-pending');}
 },()=>{$('loading').textContent='ログイン情報を確認できませんでした。';document.documentElement.classList.remove('auth-pending');});
}catch(err){$('loading').textContent='Firebaseを読み込めませんでした。';document.documentElement.classList.remove('auth-pending');}
