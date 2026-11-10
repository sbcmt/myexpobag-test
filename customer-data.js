/** MY EXPO BAG v1.0.1 — Owner-only paginated CSV exports (no third-party API). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged,EmailAuthProvider,reauthenticateWithCredential} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,getDocsFromServer,getDocFromServer,query,orderBy,limit,startAfter,deleteDoc,writeBatch} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id),firebase=window.MEB_FIREBASE_CONFIG||{};
const app=getApps().length?getApp():initializeApp(firebase),db=getFirestore(app);
let owner=null,brand=null,busy=false,customers=[],sales=[],selectedCustomers=[],selectedSales=[];
async function requirePasswordBeforeDelete(description){
 if(!owner?.email)throw Error('パスワード認証に対応していないアカウントです。ログイン方法をご確認ください。');
 const raw=await new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;background:rgba(5,21,32,.68);z-index:99999;display:grid;place-items:center;padding:16px';
  const card=document.createElement('form');card.style.cssText='background:#fff;color:#193340;border-radius:16px;padding:22px;width:min(420px,100%);box-shadow:0 10px 40px #0003';
  const title=document.createElement('h3');title.textContent='削除の本人確認';title.style.marginTop='0';
  const msg=document.createElement('p');msg.textContent=description+'を削除します。操作の前にログイン時のパスワードで再認証してください。';msg.style.cssText='font-size:14px;line-height:1.7';
  const label=document.createElement('label');label.textContent='ログインパスワード';label.htmlFor='confirm-login-password';label.style.cssText='display:block;margin:12px 0 6px;font-size:13px;font-weight:700';
  const input=document.createElement('input');input.id='confirm-login-password';input.type='password';input.autocomplete='current-password';input.required=true;input.style.cssText='width:100%;box-sizing:border-box;border:1px solid #a9bdc5;border-radius:8px;padding:12px;font-size:16px';
  const row=document.createElement('div');row.style.cssText='display:flex;justify-content:flex-end;gap:10px;margin-top:18px';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='キャンセル';cancel.style.cssText='padding:12px;border:1px solid #a4b5c0;background:#fff;color:#19303f;-webkit-text-fill-color:#19303f;border-radius:8px;font-weight:800';
  const submit=document.createElement('button');submit.type='submit';submit.textContent='再認証して削除';submit.style.cssText='padding:12px;background:#174a60;color:white;border:0;border-radius:8px';
  const done=value=>{const answer=value===null?null:input.value;input.value='';overlay.remove();resolve(value===null?null:answer);};
  cancel.onclick=()=>done(null);card.onsubmit=e=>{e.preventDefault();done(true);};
  row.append(cancel,submit);card.append(title,msg,label,input,row);overlay.append(card);document.body.append(overlay);input.focus();
 });
 if(raw===null)return false;
 try{await reauthenticateWithCredential(owner,EmailAuthProvider.credential(owner.email,raw));return true;}
 catch(error){console.error('Firebase再認証に失敗',error.code);throw Error('パスワードを確認できませんでした。ログイン時のパスワードをご確認ください。');}
}
function message(value,failed=false){$('status').textContent=value;$('status').classList.toggle('error',failed);}
function clearMessage(value,failed=false){message(value,failed); const e=$('clear-status'); if(e){e.textContent=value;e.style.color=failed?'#a3342d':'#147048';}}
function lock(flag){
 busy=flag;
 if($('clear-test-history'))$('clear-test-history').disabled=flag||!owner;
 ['load','mail','sales','shipping','shipping-xlsx'].forEach(id=>$(id).disabled=flag||!owner);
 for(const [type,selectId,deleteId] of [['customer','select-customers','delete-customers'],['sale','select-sales','delete-sales']]){
  const eligible=type==='customer'?selectedCustomers.length:selectedSales.filter(x=>['handedOff','cancelled'].includes(x.status)).length;
  $(selectId).disabled=flag||!owner||eligible===0;
  $(deleteId).disabled=flag||!owner||historyPicked(type).length===0;
 }
}
const localDate=(date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const localStamp=date=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
const dateOf=x=>x?.toDate?.()|| (typeof x==='string'?new Date(x):null);
const validDate=x=>x instanceof Date&&!Number.isNaN(x.getTime());
async function fetchAll(ref,ordering){
 let last=null,records=[];
 for(let batch=0;batch<200;batch++){
  const q=last?query(ref,orderBy(ordering,'asc'),startAfter(last),limit(200)):query(ref,orderBy(ordering,'asc'),limit(200));
  const page=await getDocsFromServer(q);
  for(const snap of page.docs)records.push({id:snap.id,...snap.data()});
  if(page.size<200)return records;
  last=page.docs.at(-1);
  message(`${records.length}件まで読み込み中…`);
 }
 throw Error('大量データの取得上限に達しました。バックエンドで分割処理が必要です。');
}
function csvCell(value){let s=String(value??'');if(/^[\s\uFEFF]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function writeCsv(filename,header,rows){
 const csv='\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function nameFor(type,ext='csv'){return `MY_EXPO_BAG_${brand.slug}_${type}_${localDate(new Date()).replaceAll('-','')}.${ext}`;}
const receiptState=id=>sales.find(s=>s.orderId===id)?.status||'QR発行済み（未受付）';
function renderHistory(){
 // All history for this brand; CSV includes dates for later filtering in Excel.
 const configs=[
  {data:selectedCustomers,id:'customer-history',className:'registration-select',select:'select-customers',del:'delete-customers',count:'customer-selection-count',type:'customer'},
  {data:selectedSales,id:'sales-history',className:'sale-select',select:'select-sales',del:'delete-sales',count:'sales-selection-count',type:'sale'}
 ];
 for(const cfg of configs){
  const ul=$(cfg.id);ul.replaceChildren();let available=0;
  for(const rec of cfg.data){
   const eligible=cfg.type==='customer'||['handedOff','cancelled'].includes(rec.status);
   if(eligible)available++;
   const li=document.createElement('li');if(!eligible)li.className='blocked';
   const cb=document.createElement('input');cb.type='checkbox';cb.className=cfg.className;cb.value=rec.orderId||rec.id;
   cb.disabled=!eligible;cb.setAttribute('aria-label',(rec.orderId||rec.id)+' を削除対象に選択');
   const info=document.createElement('span');
   info.textContent=cfg.type==='customer'?(rec.orderId||rec.id)+'｜'+(rec.buyerName||rec.shipping?.name||'氏名未登録')+(rec.deliverySubmitted?'｜配送先登録済み':''):
     (rec.orderId||rec.id)+'｜'+({handedOff:'お渡し済み',cancelled:'取消済み',reserved:'在庫確保中'}[rec.status]||rec.status||'不明')+'｜'+(Number(rec.amount||0)).toLocaleString('ja-JP')+'円';
   if(!eligible){const t=document.createElement('small');t.textContent='（処理中のため削除不可）';info.append(t);}
   li.append(cb,info);ul.append(li);
  }
  if(!cfg.data.length){const li=document.createElement('li');li.textContent='該当する履歴はありません。';ul.append(li);}
  $(cfg.select).disabled=busy||!owner||available===0;
  const picked=ul.querySelectorAll('input:checked').length;
  $(cfg.del).disabled=busy||!owner||!picked;
  $(cfg.count).textContent=available+'件が選択可能／選択中：'+picked+'件';
 }
}
function historyPicked(type){return [...document.querySelectorAll(type==='customer'?'.registration-select:checked':'.sale-select:checked')].map(x=>x.value);}
for(const [type,sel,del] of [['customer','select-customers','delete-customers'],['sale','select-sales','delete-sales']]){
 $(sel).addEventListener('click',()=>{
  const cl=type==='customer'?'.registration-select:not(:disabled)':'.sale-select:not(:disabled)';
  const all=[...document.querySelectorAll(cl)];const isAll=all.every(cb=>cb.checked);
  all.forEach(cb=>cb.checked=!isAll);
  refreshHistorySelection();
 });
 $(del).addEventListener('click',()=>deleteHistory(type));
}
function refreshHistorySelection(){
 for(const [type,del,count] of [['customer','delete-customers','customer-selection-count'],['sale','delete-sales','sales-selection-count']]){
  const available=type==='customer'?selectedCustomers.length:selectedSales.filter(x=>['handedOff','cancelled'].includes(x.status)).length;
  const picked=historyPicked(type).length;
  $(del).disabled=busy||!owner||picked===0;
  $(count).textContent=available+'件が選択可能／選択中：'+picked+'件';
 }
}
$('customer-history').addEventListener('change',refreshHistorySelection);
$('sales-history').addEventListener('change',refreshHistorySelection);
async function deleteHistory(type){
 if(busy||!owner||!brand)return;
 const ids=historyPicked(type);if(!ids.length)return;
 const isCustomer=type==='customer';
 if(!isCustomer){
  const valid=new Set(selectedSales.filter(x=>['handedOff','cancelled'].includes(x.status)).map(x=>x.orderId));
  if(ids.some(id=>!valid.has(id))){message('進行中の販売記録は削除できません。',true);return;}
 }
 const description=isCustomer?'登録者・配送先データ':'販売履歴';
 const warning=isCustomer?'未対応注文の本人確認・配送情報登録ができなくなる場合があります。':'売上履歴から消えます。在庫は元に戻りません。QRの公開確認情報は再利用防止のため残ります。';
 if(!confirm(description+' '+ids.length+'件をFirebaseから完全に削除します。\n'+warning+'\n復元できません。続けますか？'))return;
 try{if(!await requirePasswordBeforeDelete(description+' '+ids.length+'件'))return;}catch(error){message(error.message,true);return;}
 lock(true);let done=0;const errors=[];
 try{
  for(const id of ids){
   try{
    await deleteDoc(isCustomer?doc(db,'customerOrders',brand.slug,'orders',id):doc(db,'brands',owner.uid,'scannedOrders',id));
    done++;
    if(isCustomer){customers=customers.filter(x=>x.orderId!==id);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==id);}
    else{sales=sales.filter(x=>x.orderId!==id);selectedSales=selectedSales.filter(x=>x.orderId!==id);}
   }catch(err){errors.push(id+'：'+(err.message||err));}
  }
  refreshCounts();
  message(description+' '+done+'件を削除しました。'+(errors.length?'\n失敗：'+errors.join('\n'):'')+'\n全期間の集計とCSV出力に反映されています。',errors.length>0);
 }finally{lock(false);refreshCounts();}
 await reload(); // Server authority after deleting sale or customer history
}
function refreshCounts(){
 const handed=selectedSales.filter(x=>x.status==='handedOff');
 const delivery=handed.filter(x=>x.hasPreorder&&customers.some(y=>y.orderId===x.orderId&&y.deliverySubmitted===true));
 $('count').textContent=`登録者：${selectedCustomers.filter(c=>c.registered===true).length}件 ／ 完了注文：${handed.length}件 ／ 配送対象：${delivery.length}件`;
 const ul=$('deletable');ul.replaceChildren();$('select-delivery').disabled=!delivery.length;$('delete-selected').disabled=!delivery.length;
 if(!delivery.length){const li=document.createElement('li');li.textContent='削除できる配送情報はありません。';ul.append(li);renderHistory();return;}
 for(const sale of delivery){const customer=selectedCustomers.find(c=>c.orderId===sale.orderId);const li=document.createElement('li');const span=document.createElement('span');span.textContent=sale.orderId+'｜'+(customer?.shipping?.name||customer?.buyerName||'')+'（要：発送済み確認）';
 const check=document.createElement('input');check.type='checkbox';check.className='delivery-select';check.value=sale.orderId;check.setAttribute('aria-label',sale.orderId+' を一括削除対象に選択');check.style.width='18px';check.style.height='18px';li.append(check);
 const btn=document.createElement('button');btn.type='button';btn.className='delete';btn.textContent='個人情報を削除';
 btn.onclick=async()=>{
  if(busy)return;
  if(!confirm('この注文は発送済みですか？\n'+sale.orderId+'\n氏名・住所・電話番号・メールがFirebaseから消え、復元できません。購入履歴は残ります。'))return;
  try{if(!await requirePasswordBeforeDelete('配送先個人情報 1件'))return;}catch(error){message(error.message,true);return;}
  lock(true);try{await deleteDoc(doc(db,'customerOrders',brand.slug,'orders',sale.orderId));message('個人情報を削除しました。CSVデータを再取得してください。');customers=customers.filter(x=>x.orderId!==sale.orderId);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==sale.orderId);refreshCounts();}catch(err){console.error(err);message('削除に失敗しました：'+(err.message||err),true);}finally{lock(false);}
 };li.append(span,btn);ul.append(li);}
 renderHistory();
}
$('select-delivery').onclick=()=>{const checks=[...document.querySelectorAll('.delivery-select')];const all=checks.every(c=>c.checked);checks.forEach(c=>c.checked=!all);};
$('delete-selected').onclick=async()=>{
 if(busy||!owner)return;
 const ids=[...document.querySelectorAll('.delivery-select:checked')].map(c=>c.value);
 if(!ids.length){message('削除する発送済み注文を選択してください。',true);return;}
 if(!confirm('選択した'+ids.length+'件はすべて発送済みですか？\nFirebaseの氏名・住所・電話番号・メールが削除され、元に戻せません。\n購入履歴は残ります。'))return;
 try{if(!await requirePasswordBeforeDelete('配送先個人情報 '+ids.length+'件'))return;}catch(error){message(error.message,true);return;}
 lock(true);let done=0;const errors=[];
 try{
  for(const id of ids){
   try{await deleteDoc(doc(db,'customerOrders',brand.slug,'orders',id));done++;customers=customers.filter(x=>x.orderId!==id);selectedCustomers=selectedCustomers.filter(x=>x.orderId!==id);}
   catch(err){errors.push(id+'：'+(err.message||err));}
  }
  refreshCounts();message(done+'件の個人情報を削除しました。'+(errors.length?'\n失敗：'+errors.join('\n'):'') ,!!errors.length);
 }finally{lock(false);}
};
// Remove records cancelled by older app versions. The public QR marker stays intact.
// Check the authoritative cancellation acknowledgement before deleting either record.
async function cleanupOldCancelled(allSales){
 let removed=0,failed=0;
 for(const sale of allSales.filter(x=>x.status==='cancelled'&&x.brandId===owner.uid)){
  try{
   const ack=await getDocFromServer(doc(db,'publicOrderConfirmations',brand.slug,'orders',sale.orderId));
   if(!ack.exists()||ack.data().status!=='cancelled'){failed++;continue;}
   const batch=writeBatch(db);
   batch.delete(doc(db,'brands',owner.uid,'scannedOrders',sale.orderId));
   batch.delete(doc(db,'customerOrders',brand.slug,'orders',sale.orderId));
   await batch.commit();removed++;
  }catch(error){console.error('取消済み履歴の整理に失敗',sale.orderId,error);failed++;}
 }
 return {removed,failed};
}
async function reload(){if(!owner||busy)return;
 lock(true);message('Firebaseの注文履歴を取得しています…');try{
  const [allCustomers,allSales]=await Promise.all([
   fetchAll(collection(db,'customerOrders',brand.slug,'orders'),'createdAt'),
   fetchAll(collection(db,'brands',owner.uid,'scannedOrders'),'scanTime')
  ]);
  const cleanup=await cleanupOldCancelled(allSales);
  // Re-fetch after cleanup so both lists and CSV exports reflect server state.
  const [currentCustomers,currentSales]=cleanup.removed?await Promise.all([
   fetchAll(collection(db,'customerOrders',brand.slug,'orders'),'createdAt'),
   fetchAll(collection(db,'brands',owner.uid,'scannedOrders'),'scanTime')
  ]):[allCustomers,allSales];
  customers=currentCustomers.filter(x=>x.brandId===owner.uid);
  sales=currentSales.filter(x=>x.brandId===owner.uid);
  selectedCustomers=[...customers];
  selectedSales=[...sales];
  message(`サーバーから全期間の履歴を取得：登録・配送情報 ${customers.length}件／販売履歴 ${sales.length}件（お渡し済み ${sales.filter(x=>x.status==='handedOff').length}件、取消済み ${sales.filter(x=>x.status==='cancelled').length}件、確保中 ${sales.filter(x=>x.status==='reserved').length}件）。${cleanup.removed?'\n旧版の取消済み履歴 '+cleanup.removed+'件を自動削除しました。':''}${cleanup.failed?'\n取消済み履歴の整理に失敗 '+cleanup.failed+'件。':''}\n※販売履歴・登録情報は別保存先です。注文QRの再利用防止用の公開確認データはセキュリティのため削除対象外です。`);
  refreshCounts();
  return true;
 }catch(err){console.error(err);message('履歴の取得に失敗しました。認証・Firestoreルールを確認してください：'+(err.message||err),true);return false;}finally{lock(false);}
}
$('load').onclick=reload;
$('clear-test-history').onclick=async()=>{
 if(busy){clearMessage('履歴の取得または操作中です。完了後にもう一度押してください。',true);return;}
 if(!owner||!brand){clearMessage('管理者としてログインし、履歴を読み込んでください。',true);return;}
 clearMessage('パスワードを確認してください。');
 try{
  if(!await requirePasswordBeforeDelete('販売履歴と登録情報の一括クリア')){
   clearMessage('削除をキャンセルしました。');return;
  }
 }catch(error){clearMessage(error.message,true);return;}
 clearMessage('認証完了。サーバーの最新データを確認中…');
 if(!await reload()){clearMessage('最新の履歴を確認できなかったため、削除は実行していません。',true);return;}
 if(sales.some(s=>s.status==='reserved')){clearMessage('在庫確保中の注文が残っています。先にお渡し完了または取消を行ってください。',true);return;}
 const saleIds=[...new Set(sales.filter(s=>['handedOff','cancelled'].includes(s.status)).map(s=>s.orderId))];
 const customerIds=[...new Set(customers.map(c=>c.orderId))];
 if(!saleIds.length&&!customerIds.length){clearMessage('削除対象の販売履歴・登録情報は0件です。');return;}
 if(!confirm('販売履歴 '+saleIds.length+'件と登録者・配送先 '+customerIds.length+'件を削除します。\n元に戻せず、在庫も復元されません。\n必要なCSVを保存してから進めてください。続けますか？'))return;
 lock(true);let saleDeleted=0,customerDeleted=0;const errors=[];
 try{
  // Sales and customer records are separate collections. Clear both, never public QR replay markers.
  for(const id of saleIds){try{await deleteDoc(doc(db,'brands',owner.uid,'scannedOrders',id));saleDeleted++;}catch(err){errors.push('販売 '+id+'：'+(err.message||err));}}
  for(const id of customerIds){try{await deleteDoc(doc(db,'customerOrders',brand.slug,'orders',id));customerDeleted++;}catch(err){errors.push('顧客 '+id+'：'+(err.message||err));}}
 }finally{lock(false);}
 await reload();
 clearMessage('サーバー再取得済み：販売記録 '+sales.length+'件／登録情報 '+customers.length+'件。今回削除：販売 '+saleDeleted+'件／顧客 '+customerDeleted+'件。'+(errors.length?'\n失敗：'+errors.slice(0,7).join('\n'):''),errors.length>0);
};
$('mail').onclick=()=>{
 const header=['注文ID','登録日時(JST)','氏名','メールアドレス','メール配信希望','注文状態','予約商品あり'];
 const rows=selectedCustomers.filter(c=>c.registered===true).map(c=>[c.orderId,localStamp(dateOf(c.createdAt)),c.buyerName,c.buyerEmail,c.marketingConsent?'はい':'いいえ',receiptState(c.orderId),c.hasPreorder?'はい':'いいえ']);
 writeCsv(nameFor('mailing_list'),header,rows);
};
$('sales').onclick=()=>{
 const header=['注文ID','QR読取日時(JST)','状態','商品ID','商品名','バリエーションコード','バリエーション名','数量','商品単価(税込)','商品行小計(税込)','商品合計(税込・送料別)','送料(税込)','請求合計(税込・送料含む)','予約商品'];
 const rows=[];for(const s of selectedSales.filter(x=>x.status==='handedOff'))(s.remainingLines||[]).forEach((line,i)=>{rows.push([s.orderId,localStamp(dateOf(s.scanTime)),'受付完了',line.id,line.name,line.variant||'',line.variantName||'',line.qty,line.unitPrice,line.unitPrice*line.qty,i===0?s.amount-(s.shippingFee||0):'',i===0?(s.shippingFee||0):'',i===0?s.amount:'',line.preorder?'はい':'いいえ']);});
 writeCsv(nameFor('purchased_items'),header,rows);
};
const shipHeader=['注文ID','QR読取日時(JST)','予約商品ID','商品名','バリエーション','数量','郵便番号','都道府県','住所','お届け先氏名','電話番号','発送通知メール','商品合計(税込・送料別)','送料(税込)','請求合計(税込・送料含む)','送料区分'];
function shippingRows(){
 const info=new Map(customers.filter(c=>c.deliverySubmitted===true).map(c=>[c.orderId,c]));
 const entries=[];
 for(const sale of selectedSales.filter(x=>x.status==='handedOff'&&x.hasPreorder)){
  const customer=info.get(sale.orderId);if(!customer)continue;
  for(const line of sale.remainingLines||[]){if(!line.preorder)continue;entries.push({sale,customer,line});}
 }
 entries.sort((a,b)=>String(a.line.id).localeCompare(String(b.line.id),'ja',{numeric:true})||a.sale.orderId.localeCompare(b.sale.orderId));
 const seen=new Set();
 return entries.map(({sale:s,customer:c,line})=>{
  const first=!seen.has(s.orderId);seen.add(s.orderId);
  return [s.orderId,localStamp(dateOf(s.scanTime)),line.id,line.name,line.variantName||line.variant||'',line.qty,
    String(c.shipping?.postal||''),c.shipping?.prefecture||'',c.shipping?.address||'',c.shipping?.name||'',String(c.shipping?.phone||''),c.shipping?.email||'',
    first?s.amount-(s.shippingFee||0):'',first?(s.shippingFee||0):'',first?s.amount:'',(s.shippingFee||0)>0?'送料お客様負担':'送料当社負担'];
 });
}
$('shipping').onclick=()=>{
 const rows=shippingRows().map(row=>row.map((v,i)=>(i===6||i===10)&&v?"'"+v:v));
 writeCsv(nameFor('shipping_private'),shipHeader,rows);
};
function excel(type){
 if(!window.XLSX){message('Excel出力ライブラリを読み込めません。ネットワークを確認するかCSVをご利用ください。',true);return;}
 const rows=shippingRows();if(!rows.length){message('対象の配送データがありません。配送先入力とスタッフ対応完了をご確認ください。',true);return;}
 const ws=window.XLSX.utils.aoa_to_sheet([shipHeader,...rows]);
 // Force postal codes and phone numbers to textual Excel cells (leading zeros).
 for(let i=1;i<=rows.length;i++)for(const col of [6,10]){const addr=window.XLSX.utils.encode_cell({r:i,c:col});if(ws[addr]){ws[addr].t='s';ws[addr].v=String(rows[i-1][col]||'');ws[addr].z='@';}}
 ws['!cols']=[{wch:28},{wch:23},{wch:17},{wch:28},{wch:20},{wch:8},{wch:13},{wch:13},{wch:48},{wch:23},{wch:18},{wch:34},{wch:22},{wch:12},{wch:22},{wch:20}];
 const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,ws,'配送先・予約商品ID順');
 try{window.XLSX.writeFile(book,nameFor('shipping_private','xlsx'),{bookType:'xlsx'});}catch(error){console.error(error);message('Excelの出力に失敗しました：'+error.message,true);}
}
$('shipping-xlsx').onclick=()=>excel('xlsx');
if(!['apiKey','authDomain','projectId','appId'].every(k=>cfgValue(k)))message('Firebase設定がありません。',true);
function cfgValue(k){return typeof firebase[k]==='string'&&firebase[k].length>0;}
onAuthStateChanged(getAuth(app),async user=>{
 if(!user){location.replace('./login.html');return;}
 try{const docSnap=await getDoc(doc(db,'brands',user.uid));if(!docSnap.exists()||docSnap.data().ownerUid!==user.uid)throw Error('管理権限がありません。');owner=user;brand=docSnap.data();$('brand-state').textContent=`${brand.displayName}｜管理者のみ閲覧可能`;lock(false);await reload();if($('clear-status'))$('clear-status').textContent='取得済み：販売 '+sales.length+'件／登録・配送 '+customers.length+'件。削除時はパスワード再認証が必要です。';}
 catch(err){console.error(err);message('ブランド情報を取得できません：'+(err.message||err),true);}
});
