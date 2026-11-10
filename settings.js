/** MY EXPO BAG v1.0.1 — owner-authenticated settings (no customer PII). */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const presets={natural:{label:'フォレスト',main:'#315746',sub:'#F2EEE6',text:'#26372F'},monotone:{label:'モノトーン',main:'#252932',sub:'#F0F1F3',text:'#252932'},urban:{label:'ネイビー',main:'#274D82',sub:'#EEF3FA',text:'#1C2D42'},soft:{label:'ローズ',main:'#A04C67',sub:'#FAF0F3',text:'#432D37'},active:{label:'テラコッタ',main:'#A9472B',sub:'#FFF2E2',text:'#3C2E25'},lavender:{label:'ラベンダー',main:'#765E9A',sub:'#F3EFF9',text:'#33283F'},sand:{label:'サンド',main:'#806544',sub:'#F9F4E8',text:'#3D3325'},peach:{label:'ピーチミルク',main:'#F38FB8',sub:'#FFF3FA',text:'#513447'},mint:{label:'ミント',main:'#307C75',sub:'#EAF8F4',text:'#1D4542'},slate:{label:'スレートブルー',main:'#385773',sub:'#EDF3F8',text:'#253847'}};
let db,owner,slug='',bannerData='',preset='natural',busy=false,settingsExists=false;
function status(s,error=false){$('status').textContent=s;$('status').className='status '+(error?'error':'good');}
function previewTheme(){const c=presets[preset],head=$('theme-preview-head'),button=$('theme-preview-button');head.style.color=c.text;head.style.background=c.sub;button.style.color='#fff';button.style.background=c.main;[...$('swatches').children].forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===preset)));}
for(const [key,c] of Object.entries(presets)){const b=document.createElement('button');b.type='button';b.className='swatch';b.dataset.preset=key;b.innerHTML='<span class="swatch-dot" style="background:'+c.main+'"></span><span>'+c.label+'</span>';b.onclick=()=>{preset=key;previewTheme()};$('swatches').append(b)}previewTheme();
const radio=(name)=>document.querySelector('input[name="'+name+'"]:checked')?.value||'none';
const setRadio=(name,value)=>{const el=document.querySelector('input[name="'+name+'"][value="'+value+'"]');if(el)el.checked=true};
function fields(){const mode=radio('discount-mode');$('discount-fields').hidden=mode==='none';$('discount-label').textContent=mode==='percent'?'割引率（％・必須）':'割引額（円・必須）';$('discount-value').max=mode==='percent'?'100':'100000000';const enabled=$('novelty-enabled').checked;const noveltyMode=radio('novelty-mode');$('novelty-fields').hidden=!enabled;$('minimum-fields').hidden=!enabled||noveltyMode!=='minimum';$('product-fields').hidden=!enabled||noveltyMode!=='product'}
function bannerFields(){const mode=$('banner-link-mode').value;$('banner-product-wrap').hidden=mode!=='product';$('banner-url-wrap').hidden=mode!=='url';}
$('banner-enabled').checked=true;
$('banner-link-mode').addEventListener('change',bannerFields);bannerFields();
document.querySelectorAll('input[type=radio]').forEach(el=>el.addEventListener('change',fields));$('novelty-enabled').addEventListener('change',fields);fields();
function noveltySummary(n){
 const mode=n?.mode||'none';
 const label={all:'購入者全員',minimum:'金額条件',product:'商品ID条件',none:'OFF'}[mode]||'不明';
 return mode==='none'?'ノベルティ設定：OFF':`ノベルティ設定：ON（${label}）`;
}
function updateNoveltyStatus(n){const el=$('novelty-saved-state');if(el)el.textContent=noveltySummary(n);}
const defaultBanner='./assets/myexpobag-default-banner.webp';
function previewBanner(){
 $('banner-preview').hidden=false;
 $('banner-preview').src=bannerData||defaultBanner;
 $('image-status').textContent=bannerData?'登録バナー：約'+Math.ceil(bannerData.length*3/4/1024)+'KB・1200×400px':'デフォルトバナーを使用（1200×400px・軽量WebP）。差し替え可能です。';
}
$('banner-remove').onclick=()=>{bannerData='';$('banner-file').value='';$('banner-enabled').checked=true;previewBanner()};
$('banner-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 $('image-status').textContent='画像を最適化しています…';
 try{
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('JPEG・PNG・WebPを選択してください。');
  if(file.size>15*1024*1024)throw Error('元画像は15MB以下にしてください。');
  const image=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,400);
  const ratio=Math.max(1200/image.width,400/image.height),w=image.width*ratio,h=image.height*ratio;ctx.drawImage(image,(1200-w)/2,(400-h)/2,w,h);image.close?.();
  const blob=(mime,quality)=>new Promise(resolve=>canvas.toBlob(resolve,mime,quality));let selected;
  for(const mime of ['image/webp','image/jpeg']){for(const quality of [.84,.75,.65,.55,.45,.35]){const b=await blob(mime,quality);if(b&&b.size<=150*1024){selected=b;break;}}if(selected)break;}
  if(!selected)throw Error('150KB以下にできませんでした。よりシンプルな画像をご用意ください。');
  bannerData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('読み込みに失敗しました'));r.readAsDataURL(selected)});
  $('banner-enabled').checked=true;previewBanner();
 }catch(error){$('image-status').textContent=error.message;e.target.value='';}
});
const positive=(id)=>{const raw=$(id).value;if(!/^\d+$/.test(raw)||Number(raw)<1||!Number.isSafeInteger(Number(raw)))throw Error('入力した数値をご確認ください。');return Number(raw)};
$('save').onclick=async()=>{
 if(!owner||!slug||busy)return;
 try{
  const mode=radio('discount-mode');const value=mode==='none'?0:positive('discount-value');const discountMinSpend=mode==='none'?0:positive('discount-minimum');if(mode==='percent'&&value>100)throw Error('割引率は1〜100％です。');if(value>100000000)throw Error('割引額の上限は1億円です。');
  const novMode=$('novelty-enabled').checked?radio('novelty-mode'):'none';const name=novMode==='none'?'':$('novelty-name').value.trim();if(novMode!=='none'&&!name)throw Error('ノベルティ名を入力してください。');if([...name].length>50)throw Error('ノベルティ名は50文字以内です。');
  const minSpend=novMode==='minimum'?positive('novelty-minimum'):0;const productId=novMode==='product'?$('novelty-product').value:'';if(novMode==='product'&&!productId)throw Error('ノベルティ対象商品を選択してください。');
  // A brand may use the built-in default banner without uploading any image.
  const linkMode=$('banner-link-mode').value;let linkValue='';
  if(linkMode==='product'){
   linkValue=$('banner-product').value;
   if(!linkValue)throw Error('バナーのリンク先商品を選択してください。');
  }else if(linkMode==='url'){
   linkValue=$('banner-url').value.trim();
   let parsed;
   try{parsed=new URL(linkValue);}catch{throw Error('有効なリンク先URLを入力してください。');}
   if(parsed.protocol!=='https:'||parsed.username||parsed.password||!parsed.hostname||linkValue.length>2048||/\s/.test(linkValue))throw Error('外部リンクはhttps://で始まるURLを入力してください。');
   linkValue=parsed.href;
  }
  if(!['none','product','url'].includes(linkMode))throw Error('リンク先の種類が不正です。');
  if(discountMinSpend>100000000)throw Error('割引の下限金額の上限は1億円です。');
  if(bannerData && (!/^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(bannerData)||bannerData.length>210000))throw Error('バナー画像の保存形式が現在の仕様と異なります。画像を再登録してください。');
  busy=true;$('save').disabled=true;status('保存しています…');
  const savedNovelty={mode:novMode,name,minSpend,productId};
  const handoffExpiryMinutes=Number($('handoff-expiry').value||5);
  await setDoc(doc(db,'brandSettings',slug),{brandId:owner.uid,slug,theme:{preset},banner:{enabled:$('banner-enabled').checked,hiddenDefault:!$('banner-enabled').checked&&!bannerData,imageData:bannerData,linkMode,linkValue},discount:{mode,value,minSpend:discountMinSpend,applyToPreorder:$('discount-preorder').checked},checkout:{handoffExpiryMinutes:[1,3,5,10].includes(handoffExpiryMinutes)?handoffExpiryMinutes:5},novelty:savedNovelty,...(!settingsExists?{shipping:{mode:'all',threshold:0,charge:0,rates:{}}}:{}),updatedAt:serverTimestamp()},{merge:true});
  settingsExists=true;
  // Verify the state on the server, not Firestore's local cache.
  const verified=await getDocFromServer(doc(db,'brandSettings',slug));
  const stored=verified.data()?.novelty;
  if(!verified.exists()||stored?.mode!==novMode||stored?.name!==name||stored?.minSpend!==minSpend||stored?.productId!==productId){
   throw Error('保存結果を確認できませんでした。画面を閉じずに再度保存内容をご確認ください。');
  }
  updateNoveltyStatus(stored);
  status('サーバーに保存を確認しました。'+noveltySummary(stored)+'。お客様ページの更新通知から最新版を表示してください。');
 }catch(error){console.error(error);status(error.code==='permission-denied'?'Firebaseが設定の保存を拒否しました。ZIP同梱のFirestoreルールが公開済みか確認してください。続く場合はバナー画像を再登録し、再度保存してください。':error.message||'保存に失敗しました。',true);}finally{busy=false;$('save').disabled=false;}
};
const cfg=window.MEB_FIREBASE_CONFIG||{};
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k]))$('loading').textContent='Firebase設定をご確認ください。';
else{
 try{const app=getApps().length?getApp():initializeApp(cfg);db=getFirestore(app);onAuthStateChanged(getAuth(app),async user=>{
  if(!user){location.replace('./login.html');return;}
  try{
   const b=await getDoc(doc(db,'brands',user.uid));if(!b.exists()||b.data().ownerUid!==user.uid)throw Error('ブランド情報がありません。');
   slug=b.data().slug;const h=await getDoc(doc(db,'brandHandles',slug));if(!h.exists()||h.data().brandId!==user.uid)throw Error('ブランド認証に失敗しました。');owner=user;
   const products=await getDoc(doc(db,'publishedCatalogs',slug));const list=Array.isArray(products.data()?.products)?products.data().products:[];
   for(const p of list){for(const target of ['novelty-product','banner-product']){const option=document.createElement('option');option.value=p.id;option.textContent=p.id+'｜'+p.name;$(target).append(option)}}
   const snap=await getDocFromServer(doc(db,'brandSettings',slug));settingsExists=snap.exists();if(snap.exists()){
    const d=snap.data();preset=presets[d.theme?.preset]?d.theme.preset:'natural';bannerData=d.banner?.imageData||'';$('banner-enabled').checked=d.banner?.hiddenDefault!==true&&(!!bannerData?d.banner?.enabled!==false:true);$('banner-link-mode').value=['none','product','url'].includes(d.banner?.linkMode)?d.banner.linkMode:'none';if(d.banner?.linkMode==='product')$('banner-product').value=d.banner.linkValue||'';if(d.banner?.linkMode==='url')$('banner-url').value=d.banner.linkValue||'';setRadio('discount-mode',d.discount?.mode||'none');$('discount-value').value=d.discount?.value||'';$('discount-minimum').value=d.discount?.minSpend||'';$('discount-preorder').checked=d.discount?.applyToPreorder!==false;$('handoff-expiry').value=String([1,3,5,10].includes(Number(d.checkout?.handoffExpiryMinutes))?Number(d.checkout?.handoffExpiryMinutes):5);
    const n=d.novelty||{};$('novelty-enabled').checked=!!n.mode&&n.mode!=='none';setRadio('novelty-mode',n.mode==='none'?'all':n.mode||'all');$('novelty-name').value=n.name||'';$('novelty-minimum').value=n.minSpend||'';$('novelty-product').value=n.productId||'';updateNoveltyStatus(n);
   }else{$('handoff-expiry').value='5';updateNoveltyStatus({mode:'none'});}
   previewTheme();previewBanner();fields();bannerFields();$('loading').hidden=true;$('shell').hidden=false;$('save').disabled=false;
  }catch(err){console.error(err);$('loading').textContent='設定情報を読み込めませんでした。通信環境とFirestoreルールをご確認ください。';}
 });}catch(err){$('loading').textContent='Firebaseを初期化できませんでした。';}
}
