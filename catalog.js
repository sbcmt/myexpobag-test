/** MY EXPO BAG — authenticated, draft-only quick editing. All public changes need explicit publishing. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocsFromServer,getDocFromServer,collection,query,where,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const config=window.MEB_FIREBASE_CONFIG||{};
const MAX_PRICE=100000000;
let db,user,brand,products=[],published=new Map(),publicStock=null,publishedExists=false,busy=false;
const selectedProductIds=new Set();
let visibleProductIds=[];
const text=v=>String(v??'');
const yen=n=>'¥'+Number(n||0).toLocaleString('ja-JP');
const emptyStock=n=>n===null||n===undefined?'':String(n);
const emptyPrice=n=>n===null||n===undefined?'':String(n);
const errText=e=>e?.message||'操作に失敗しました。';
function message(t,error=false){const el=$('message');el.hidden=false;el.className='status'+(error?' error':'');el.textContent=t;}
function field(label,cls,value,{placeholder='',type='number',disabled=false,hint='',max=MAX_PRICE}={}){
 const wrapper=document.createElement('label');wrapper.className='field';
 const span=document.createElement('span');span.textContent=label;wrapper.append(span);
 const el=document.createElement('input');el.className=cls;el.type=type;el.placeholder=placeholder;el.value=value??'';el.disabled=disabled;
 if(type==='number'){el.min='0';el.max=String(max);el.step='1';el.inputMode='numeric';}
 wrapper.append(el);
 if(hint){const msg=document.createElement('span');msg.className='hint';msg.textContent=hint;wrapper.append(msg);}
 return wrapper;
}
function integer(value,label,nullable=false){
 const v=text(value).trim();if(nullable&&v==='')return null;
 if(!/^\d{1,9}$/.test(v)||Number(v)>MAX_PRICE)throw Error(label+'は0〜100,000,000の整数で入力してください。');
 return Number(v);
}
function stockField(p,variant){return ((variant||p).preorder===true)?'reservationStock':'stock';}
function quantityOf(product,code){
 if(!publicStock)return undefined;
 const q=code?publicStock.variantQuantities?.[product.id+'::'+code]:publicStock.quantities?.[product.id];
 return q===undefined?undefined:q;
}
function same(a,b){return (a===undefined||a===null?null:a)===(b===undefined||b===null?null:b);}
function pending(p){
 if(!publishedExists)return p.active!==false;
 const live=published.get(p.id);
 if(p.active===false)return !!live;
 if(!live)return true;
 if(p.name!==live.name||p.price!==live.price||!same(p.eventPrice,live.eventPrice)||p.categoryName!==live.categoryId)return true;
 const localVariants=Array.isArray(p.variants)?p.variants:[],pubVariants=Array.isArray(live.variants)?live.variants:[];
 if(localVariants.length!==pubVariants.length)return true;
 if(!localVariants.length){const qty=quantityOf(p);if(qty!==undefined&&!same(p[stockField(p)],qty))return true;}
 else for(const v of localVariants){
  const w=pubVariants.find(x=>x.code===v.code);
  if(!w||v.name!==w.name||!same(v.price,w.price)||!same(v.eventPrice,w.eventPrice)||v.preorder!==w.preorder)return true;
  const qty=quantityOf(p,v.code);if(qty!==undefined&&!same(v[stockField(p,v)],qty))return true;
 }
 return false;
}
function stateBadge(label,klass){const el=document.createElement('span');el.className='pill '+klass;el.textContent=label;return el;}
function addVariantEditor(details,v,p){
 const row=document.createElement('div');row.className='variant-grid';row.dataset.variantCode=v.code;
 const title=document.createElement('div');title.className='variant-name';title.textContent=v.name||v.code;
 const code=document.createElement('div');code.className='hint';code.textContent='商品コード：'+v.code;title.append(code);
 const kind=stockField(p,v);
 const price=field('通常価格（空欄＝親価格）','v-price',emptyPrice(v.price),{placeholder:yen(p.price)});
 const event=field('特価（空欄＝親に連動）','v-event',emptyPrice(v.eventPrice),{placeholder:p.eventPrice==null?'設定なし':yen(p.eventPrice)});
 const stock=field(kind==='reservationStock'?'予約在庫':'通常在庫','v-stock',emptyStock(v[kind]),{placeholder:'空欄＝無制限'});
 row.append(title,price,event,stock);details.append(row);
}
function updateDeleteSelection(){
 const ids=new Set(products.map(p=>p.id));
 for(const id of [...selectedProductIds])if(!ids.has(id))selectedProductIds.delete(id);
 const checkbox=$('select-visible');
 const count=visibleProductIds.filter(id=>selectedProductIds.has(id)).length;
 checkbox.checked=visibleProductIds.length>0&&count===visibleProductIds.length;
 checkbox.indeterminate=count>0&&count<visibleProductIds.length;
 checkbox.disabled=busy||!visibleProductIds.length;
 $('delete-selected').disabled=busy||selectedProductIds.size===0;
 $('delete-selected-count').textContent=selectedProductIds.size+'件を選択中';
 document.querySelectorAll('.item .catalog-select input').forEach(input=>{input.checked=selectedProductIds.has(input.value);input.disabled=busy;});
}
function draw(){
 $('total').textContent=products.length;
 const categories=[...new Set(products.map(p=>p.categoryName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
 const cat=$('category'),selected=cat.value;cat.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='すべて';cat.append(all);
 for(const name of categories){const option=document.createElement('option');option.value=name;option.textContent=name;cat.append(option);}cat.value=categories.includes(selected)?selected:'';
 const search=$('search').value.normalize('NFKC').toLocaleLowerCase('ja-JP').trim(),f=$('filter').value;
 const found=products.filter(p=>{
  if(search&&!([p.name,p.id,p.categoryName,...(p.variants||[]).map(v=>v.name+' '+v.code)].join(' ').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(search)))return false;
  if(cat.value&&p.categoryName!==cat.value)return false;
  if(f==='visible'&&p.active===false)return false;
  if(f==='hidden'&&p.active!==false)return false;
  if(f==='pending'&&!pending(p))return false;
  if(f==='reserved'&&p.preorder!==true&&!(p.variants||[]).some(v=>v.preorder===true))return false;
  return true;
 }).sort((a,b)=>a.id.localeCompare(b.id,'ja'));
 $('results').textContent=found.length+'件を表示／登録'+products.length+'件';
 visibleProductIds=found.map(p=>p.id);
 $('publish-hint').textContent=products.some(pending)?'購入者ページに未反映の変更があります。公開操作を行ってください。':'登録商品の変更は公開済みです。';
 const container=$('items');container.replaceChildren();
 if(!found.length){const e=document.createElement('div');e.className='empty';e.textContent=products.length?'条件に合う商品がありません。':'まだ商品は登録されていません。「＋ 商品を新規登録」から登録できます。';container.append(e);updateDeleteSelection();return;}
 for(const p of found){
  const form=document.createElement('form');form.className='item';form.dataset.productId=p.id;
  const head=document.createElement('div');head.className='itemhead';
  const hgroup=document.createElement('div');const title=document.createElement('p');title.className='item-name';title.textContent=p.name;const meta=document.createElement('p');meta.className='item-info';meta.textContent=p.categoryName+' ／ 商品ID：'+p.id+' ／ '+((p.variants||[]).length?p.variants.length+'種類のバリエーション':'単品商品');hgroup.append(title,meta);
  const pills=document.createElement('div');pills.className='pills';pills.append(stateBadge(p.active===false?'非表示設定':pending(p)?'公開待ち・変更未反映':'公開済み',p.active===false?'off':pending(p)?'pending':'ok'));
  if(p.preorder===true||(p.variants||[]).some(v=>v.preorder===true))pills.append(stateBadge('予約販売あり',''));
  const right=document.createElement('div');right.className='itemhead-right';
  const selectLabel=document.createElement('label');selectLabel.className='catalog-select';
  const select=document.createElement('input');select.type='checkbox';select.className='p-select';select.value=p.id;select.checked=selectedProductIds.has(p.id);
  select.setAttribute('aria-label','「'+p.name+'」を削除対象に選択');
  select.addEventListener('change',()=>{if(select.checked)selectedProductIds.add(p.id);else selectedProductIds.delete(p.id);updateDeleteSelection();});
  const selectText=document.createElement('span');selectText.textContent='選択';selectLabel.append(select,selectText);right.append(pills,selectLabel);
  head.append(hgroup,right);
  const fields=document.createElement('div');fields.className='form-grid';
  const label=document.createElement('label');label.className='toggle';const chk=document.createElement('input');chk.type='checkbox';chk.className='p-active';chk.checked=p.active!==false;const labelText=document.createElement('span');labelText.textContent='表示対象にする';label.append(chk,labelText);fields.append(label);
  fields.append(field('通常価格（税込）','p-price',p.price));
  fields.append(field('キャンペーン価格（任意）','p-event',emptyPrice(p.eventPrice),{placeholder:'設定なし'}));
  const hasVariants=Array.isArray(p.variants)&&p.variants.length>0;
  const kind=stockField(p);
  fields.append(field(hasVariants?'在庫（バリエーション別）':kind==='reservationStock'?'予約在庫':'通常在庫','p-stock',hasVariants?'':emptyStock(p[kind]),{placeholder:hasVariants?'種類ごとに設定':'空欄＝無制限',disabled:hasVariants}));
  form.append(head,fields);
  if(hasVariants){const details=document.createElement('details');details.className='variants';const summary=document.createElement('summary');summary.textContent='バリエーションごとの価格・在庫を変更（'+p.variants.length+'種類）';details.append(summary);for(const v of p.variants)addVariantEditor(details,v,p);form.append(details);}
  const actions=document.createElement('div');actions.className='actions';const edit=document.createElement('a');edit.href='./products.html?edit='+encodeURIComponent(p.id);edit.textContent='詳細編集';edit.style.cssText='font-size:13px;color:#175878;text-decoration:underline;padding:9px';const save=document.createElement('button');save.className='primary';save.type='submit';save.textContent='この商品の変更を保存';actions.append(edit,save);form.append(actions);
  form.addEventListener('submit',event=>saveRow(event,p,form));container.append(form);
 }
 updateDeleteSelection();
}
function changedFields(form,p){
 const payload={};const get=(name)=>form.querySelector('.'+name);
 const active=get('p-active').checked,price=integer(get('p-price').value,'通常価格'),eventPrice=integer(get('p-event').value,'キャンペーン価格',true);
 if(eventPrice!==null&&eventPrice>=price)throw Error('キャンペーン価格は通常価格より低くしてください。');
 if(active!==(p.active!==false))payload.active=active;
 if(price!==p.price)payload.price=price;
 if(!same(eventPrice,p.eventPrice))payload.eventPrice=eventPrice;
 if(!(p.variants||[]).length){const stock=integer(get('p-stock').value,'在庫',true),key=stockField(p);if(!same(stock,p[key]))payload[key]=stock;}
 const variants={};
 for(const row of form.querySelectorAll('.variant-grid')){
  const v=p.variants.find(x=>x.code===row.dataset.variantCode);if(!v)throw Error('商品コードが一致しません。再読み込みしてください。');
  const item={};const variantPrice=integer(row.querySelector('.v-price').value,'バリエーション通常価格',true),variantEvent=integer(row.querySelector('.v-event').value,'バリエーションキャンペーン価格',true);
  const effectivePrice=variantPrice??price,effectiveEvent=variantEvent??eventPrice;
  if(effectiveEvent!==null&&effectiveEvent>=effectivePrice)throw Error('「'+(v.name||v.code)+'」のキャンペーン価格は通常価格より低くしてください。');
  if(!same(variantPrice,v.price))item.price=variantPrice;
  if(!same(variantEvent,v.eventPrice))item.eventPrice=variantEvent;
  const key=stockField(p,v),qty=integer(row.querySelector('.v-stock').value,'バリエーション在庫',true);
  if(!same(qty,v[key]))item[key]=qty;
  if(Object.keys(item).length)variants[v.code]=item;
 }
 if(Object.keys(variants).length)payload.variants=variants;
 return payload;
}
async function saveRow(event,origin,form){
 event.preventDefault();if(busy)return;
 let patch;try{patch=changedFields(form,origin);}catch(e){message(e.message,true);return;}
 if(!Object.keys(patch).length){message('「'+origin.name+'」に変更はありません。');return;}
 if(!user){message('ログイン状態を確認できません。',true);return;}
 busy=true;document.querySelectorAll('#items button, #refresh').forEach(b=>b.disabled=true);message('「'+origin.name+'」を保存しています…');
 try{
  const ref=doc(db,'brands',user.uid,'products',origin.id);
  await runTransaction(db,async tx=>{
   const snap=await tx.get(ref);if(!snap.exists())throw Error('商品が削除されています。一覧を再読み込みしてください。');
   const current=snap.data();const updates={updatedAt:serverTimestamp()};
   for(const [key,value] of Object.entries(patch)){
    if(key==='variants')continue;
    if(!same(current[key],origin[key]))throw Error('別の操作で「'+key+'」が更新されています。最新データを取得してください。');
    updates[key]=value;
   }
   if(patch.variants){
    const currentVs=Array.isArray(current.variants)?current.variants:[];
    if(currentVs.length!==(origin.variants||[]).length)throw Error('バリエーション構成が更新されました。最新データを取得してください。');
    updates.variants=currentVs.map(v=>{
     const changes=patch.variants[v.code];if(!changes)return v;
     const original=origin.variants.find(x=>x.code===v.code);if(!original)throw Error('バリエーションが変更されました。最新データを取得してください。');
     const n={...v};for(const [key,value] of Object.entries(changes)){
      // QR sales can reduce stock while this page is open. Never overwrite that change.
      if(!same(v[key],original[key]))throw Error('「'+(original.name||original.code)+'」の'+(key.includes('Stock')||key==='stock'?'在庫':'価格')+'が別の操作で変わりました。最新データを取得してください。');
      n[key]=value;
     }
     return n;
    });
    for(const code of Object.keys(patch.variants))if(!currentVs.some(v=>v.code===code))throw Error('バリエーション構成が変更されました。');
   }
   const next={...current,...updates};
   if(next.eventPrice!=null&&next.eventPrice>=next.price)throw Error('通常価格とキャンペーン価格の組み合わせを確認してください。');
   for(const v of next.variants||[]){const regular=v.price??next.price,special=v.eventPrice??next.eventPrice;if(special!=null&&special>=regular)throw Error((v.name||v.code)+'のキャンペーン価格を確認してください。');}
   tx.update(ref,updates);
  });
  await refresh();message('「'+origin.name+'」を保存しました。価格・表示・在庫の変更は購入者ページに未反映です。「公開操作の画面へ」から反映してください。');
 }catch(error){console.error('quick product update',error);message('保存できませんでした：'+errText(error),true);document.querySelectorAll('#items button, #refresh').forEach(b=>b.disabled=false);}
 finally{busy=false;$('refresh').disabled=false;}
}
async function refresh(){
 const [drafts,pub,stock]=await Promise.all([
  getDocsFromServer(collection(db,'brands',user.uid,'products')),
  getDocFromServer(doc(db,'publishedCatalogs',brand.slug)),
  getDocFromServer(doc(db,'publishedStock',brand.slug))
 ]);
 products=drafts.docs.map(d=>({...d.data(),id:d.id}));publishedExists=pub.exists();published=new Map((pub.data()?.products||[]).map(p=>[p.id,p]));publicStock=stock.exists()?stock.data():null;const initialDelete=new URLSearchParams(location.search).get('delete');if(initialDelete&&products.some(p=>p.id===initialDelete)){selectedProductIds.add(initialDelete);history.replaceState(null,'',location.pathname);$('search').value=initialDelete;}draw();
}
// Deletes are deliberately limited to *unpublished* items.
// First unpublish in products.html and confirm the public catalog was updated.
// Existing customer orders are retained as independent historical snapshots.
function idInOrder(order,id){
 const lines=Array.isArray(order.remainingLines)?order.remainingLines:(Array.isArray(order.items)?order.items:[]);
 return lines.some(item=>item?.id===id||item?.productId===id);
}
function comboReferences(product,ids){
 const combo=Array.isArray(product.combos)?product.combos:[];
 return combo.some(x=>ids.has(x.productId))||(typeof product.comboProductId==='string'&&ids.has(product.comboProductId));
}
function refsInPublic(snapshot,ids){
 const data=snapshot.data()||{};
 return (data.products||[]).some(p=>ids.has(p.id))||
  (data.publishedImageIds||[]).some(id=>ids.has(id))||
  (data.bundles||[]).some(b=>(b.productIds||[]).some(id=>ids.has(id)));
}
function confirmDeleteDialog(){
 return new Promise(resolve=>{
  const dialog=$('confirm-delete-dialog');
  dialog.returnValue='cancel';
  dialog.addEventListener('close',()=>resolve(dialog.returnValue==='delete'),{once:true});
  dialog.showModal();
 });
}
async function deleteSelected(){
 if(busy||!user||!brand)return;
 const ids=[...selectedProductIds].sort();if(!ids.length)return;
 if(ids.length>50){message('一度に削除できる商品は50件までです。選択数を減らしてください。',true);return;}
 const selected=ids.map(id=>products.find(p=>p.id===id));
 if(selected.some(p=>!p)){message('商品一覧が変更されました。最新データを取得してください。',true);return;}
 if(!(await confirmDeleteDialog()))return;
 busy=true;message('削除前の安全確認をしています…');updateDeleteSelection();
 try{
  // Verify *server* state, not stale client cache. No product may still be public.
  const [drafts,publicSnap,orderSnap,settingsSnap]=await Promise.all([
   getDocsFromServer(collection(db,'brands',user.uid,'products')),
   getDocFromServer(doc(db,'publishedCatalogs',brand.slug)),
   getDocsFromServer(query(collection(db,'brands',user.uid,'scannedOrders'),where('status','==','reserved'))),
   getDocFromServer(doc(db,'brandSettings',brand.slug))
  ]);
  if(refsInPublic(publicSnap,new Set(ids)))throw Error('購入者ページに掲載中の商品が含まれています。該当商品を「非表示」にして「お客様ページに反映」を完了してから削除してください。');
  const rows=drafts.docs.map(d=>({id:d.id,...d.data()}));
  for(const id of ids){if(!rows.some(p=>p.id===id))throw Error('商品「'+id+'」が既に削除されています。最新データを取得してください。');}
  // Keep products that refer to deleted products, but clear only the stale combination links.
  const cross=rows.filter(p=>!ids.includes(p.id)&&comboReferences(p,new Set(ids)));
  const active=orderSnap.docs.find(d=>ids.some(id=>idInOrder(d.data(),id)));
  if(active)throw Error('未処理の注文がある商品は削除できません。受注確認で受渡し・取消を完了してください。');
  const currentSettings=settingsSnap.exists()?settingsSnap.data():null;
  if(currentSettings?.banner?.linkMode==='product'&&ids.includes(currentSettings.banner.linkValue))throw Error('ブランド設定のバナーリンク先に指定されています。先にバナーのリンク先を変更してください。');
  const refs=ids.map(id=>doc(db,'brands',user.uid,'products',id));
  const crossRefs=cross.map(p=>doc(db,'brands',user.uid,'products',p.id));
  const catalogRef=doc(db,'publishedCatalogs',brand.slug),stockRef=doc(db,'publishedStock',brand.slug),settingsRef=doc(db,'brandSettings',brand.slug);
  await runTransaction(db,async tx=>{
   // All transaction reads come before writes. Validate current server version,
   // publication and brand references again before removing any document.
   const [pub,stock,settings,...allProductSnapshots]=await Promise.all([
    tx.get(catalogRef),tx.get(stockRef),tx.get(settingsRef),...refs.map(ref=>tx.get(ref)),...crossRefs.map(ref=>tx.get(ref))
   ]);
   const snapshotProducts=allProductSnapshots.slice(0,refs.length);
   const crossSnapshots=allProductSnapshots.slice(refs.length);
   if(refsInPublic(pub,new Set(ids)))throw Error('公開データが更新されました。最新状態で非表示を反映してください。');
   for(let i=0;i<ids.length;i++){
    if(!snapshotProducts[i].exists())throw Error('商品が既に削除されています。');
    const live=snapshotProducts[i].data(),expected=selected[i];
    if(live.updatedAt?.isEqual&&expected.updatedAt?.isEqual&&!live.updatedAt.isEqual(expected.updatedAt))throw Error('商品「'+ids[i]+'」は別の操作で更新されています。一覧を再取得してください。');
   }
   if(settings.exists()&&settings.data().banner?.linkMode==='product'&&ids.includes(settings.data().banner.linkValue))throw Error('バナーの参照先を変更してから削除してください。');
   // Clear references from remaining draft products atomically with the deletion.
   for(let i=0;i<cross.length;i++){
    const snap=crossSnapshots[i];
    if(!snap.exists())throw Error('組合せ元の商品が更新されています。最新の一覧を取得してください。');
    const live=snap.data(),original=cross[i];
    if(live.updatedAt?.isEqual&&original.updatedAt?.isEqual&&!live.updatedAt.isEqual(original.updatedAt))throw Error('組合せ元の商品が変更されました。最新データを取得してください。');
    const oldCombos=Array.isArray(live.combos)?live.combos:(live.comboProductId?[{productId:live.comboProductId,discount:live.comboDiscount||0}]:[]);
    const remaining=oldCombos.filter(entry=>!ids.includes(entry.productId));
    if(remaining.length!==oldCombos.length)tx.update(crossRefs[i],{
     combos:remaining,comboProductId:remaining[0]?.productId||'',comboDiscount:remaining[0]?.discount||0,updatedAt:serverTimestamp()
    });
   }
   for(let i=0;i<ids.length;i++){
    const id=ids[i];tx.delete(refs[i]);
    tx.delete(doc(db,'brands',user.uid,'productImages',id));
    // Remove a possible orphan public photo left by a previous publication.
    tx.delete(doc(db,'publishedCatalogs',brand.slug,'images',id));
   }
   if(stock.exists()){
    const old=stock.data();const quantities={...(old.quantities||{})},variantQuantities={...(old.variantQuantities||{})};
    for(const id of ids){delete quantities[id];for(const key of Object.keys(variantQuantities))if(key.startsWith(id+'::'))delete variantQuantities[key];}
    tx.update(stockRef,{quantities,variantQuantities,updatedAt:serverTimestamp()});
   }
   if(settings.exists()){
    const d=settings.data(),n=d.novelty||{},oldIds=Array.isArray(n.productIds)?n.productIds:(n.productId?[n.productId]:[]),nextIds=oldIds.filter(id=>!ids.includes(id));
    if(nextIds.length!==oldIds.length||ids.includes(n.productId)){
     tx.update(settingsRef,{novelty:{...n,productIds:nextIds,productId:nextIds[0]||'',...(n.mode==='product'&&!nextIds.length?{mode:'none'}:{})},updatedAt:serverTimestamp()});
    }
   }
  });
  selectedProductIds.clear();
  try{await refresh();message(ids.length+'件の商品を削除しました。関連する組合せ設定も解除済みです。注文履歴は保持しています。');}
  catch(reloadError){console.warn('削除後の一覧再取得に失敗',reloadError);message(ids.length+'件の商品削除は完了しました。一覧の再読み込みに失敗したため、ページを更新して最新の状態を確認してください。');}
 }catch(error){console.error('selected product delete',error);message('削除できませんでした：'+errText(error),true);}
 finally{busy=false;updateDeleteSelection();}
}
$('select-visible').addEventListener('change',event=>{
 for(const id of visibleProductIds){if(event.target.checked)selectedProductIds.add(id);else selectedProductIds.delete(id);}updateDeleteSelection();
});
$('delete-selected').addEventListener('click',deleteSelected);
for(const [id,event] of [['search','input'],['category','change'],['filter','change']])$(id).addEventListener(event,()=>{selectedProductIds.clear();draw();});
$('refresh').addEventListener('click',async()=>{if(busy)return;try{selectedProductIds.clear();await refresh();message('最新の商品データを読み込みました。');}catch(error){message('再読込に失敗しました：'+errText(error),true);}});
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof config[k]==='string'&&config[k].trim())){
 $('loading').textContent='Firebase接続設定を確認してください。';document.documentElement.classList.remove('auth-pending');
}else try{
 const app=getApps().length?getApp():initializeApp(config);db=getFirestore(app);
 onAuthStateChanged(getAuth(app),async u=>{
  if(!u){location.replace('./login.html');return;}
  try{
   const b=await getDoc(doc(db,'brands',u.uid));
   if(!b.exists()||b.data().ownerUid!==u.uid||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.data().slug))throw Error('ブランド情報を確認できません。');
   user=u;brand=b.data();$('brand-name').textContent=brand.displayName||brand.slug;
   await refresh();$('loading').hidden=true;$('shell').hidden=false;document.documentElement.classList.remove('auth-pending');
  }catch(e){console.error(e);$('loading').className='status error';$('loading').textContent='商品一覧を読み込めませんでした：'+errText(e);document.documentElement.classList.remove('auth-pending');}
 },error=>{$('loading').className='status error';$('loading').textContent='ログイン確認に失敗しました：'+errText(error);document.documentElement.classList.remove('auth-pending');});
}catch(error){$('loading').className='status error';$('loading').textContent='Firebaseの初期化に失敗しました：'+errText(error);document.documentElement.classList.remove('auth-pending');}
