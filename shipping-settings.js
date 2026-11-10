/** MY EXPO BAG v1.0.1 - standalone shipping settings. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocFromServer,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
let db,owner=null,slug='',busy=false,settingsExists=false;
function status(s,error=false){$('shipping-status').textContent=s;$('shipping-status').className='status '+(error?'error':'good');}
const shippingUtils=window.MEB_SHIPPING;
if(!shippingUtils)throw Error('都道府県別送料プログラムを読み込めません。');
for(const pref of shippingUtils.prefectures){const el=document.createElement('div');const lbl=document.createElement('label');lbl.textContent=pref;const inp=document.createElement('input');inp.type='number';inp.min='0';inp.max='100000';inp.step='1';inp.value='0';inp.dataset.shippingPref=pref;lbl.append(inp);el.append(lbl);$('shipping-prefecture-rates').append(el);}
function shippingFields(){
 const flat=$('shipping-flat').checked;
 $('shipping-flat-panel').classList.toggle('is-inactive',!flat);
 $('prefecture-shipping-fields').classList.toggle('is-inactive',flat);
 $('shipping-charge').disabled=!flat;
 $('shipping-csv-file').disabled=flat;
 $('shipping-csv-label').classList.toggle('is-disabled',flat);
 $('shipping-csv-template').disabled=flat;
 document.querySelectorAll('[data-shipping-pref]').forEach(el=>el.disabled=flat);
}
$('shipping-flat').addEventListener('change',shippingFields);shippingFields();
function shippingCsvCell(value){return '"'+String(value).replaceAll('"','""')+'"';}
$('shipping-csv-template').onclick=()=>{
 const content='\uFEFF都道府県,送料\r\n'+[...document.querySelectorAll('[data-shipping-pref]')].map(el=>shippingCsvCell(el.dataset.shippingPref)+','+shippingCsvCell(el.value)).join('\r\n')+'\r\n';
 const u=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='MY_EXPO_BAG_prefecture_shipping.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);
};
function parseShippingCsv(text){
 const lines=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;}else{field+=c;}}
  else if(c==='"'&&field===''){quoted=true;}
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){row.push(field);if(row.some(v=>v.trim()))lines.push(row);row=[];field='';if(c==='\r'&&text[i+1]==='\n')i++;}
  else{field+=c;}
 }
 if(quoted)throw Error('CSVの引用符が閉じられていません。');row.push(field);if(row.some(v=>v.trim()))lines.push(row);
 return lines;
}
$('shipping-csv-file').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>250000)throw Error('CSVファイルは250KB以下にしてください。');
  const bytes=await file.arrayBuffer();let csv=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
  const lines=parseShippingCsv(csv);if(!lines.length)throw Error('CSVにデータがありません。');
  const header=lines[0].map(v=>v.trim());if(header[0]==='都道府県'&&header[1]==='送料')lines.shift();
  const incoming=new Map();for(const [i,line] of lines.entries()){
   if(line.length!==2)throw Error((i+1)+'行目は2列で入力してください。');
   const pref=line[0].trim(),amount=line[1].trim();
   if(!shippingUtils.validPref(pref))throw Error('未対応の都道府県：'+pref);
   if(incoming.has(pref))throw Error('都道府県が重複しています：'+pref);
   if(!/^\d+$/.test(amount)||Number(amount)>100000)throw Error(pref+'の送料は0〜100000円で指定してください。');
   incoming.set(pref,amount);
  }
  if(!incoming.size)throw Error('登録できる送料がありません。');
  for(const el of document.querySelectorAll('[data-shipping-pref]'))if(incoming.has(el.dataset.shippingPref))el.value=incoming.get(el.dataset.shippingPref);
  $('shipping-csv-result').textContent=incoming.size+'件を反映しました。「予約配送料設定を保存」で確定します。';
 }catch(err){$('shipping-csv-result').textContent='CSV読込エラー：'+err.message;}finally{e.target.value='';}
});

function shippingData(){
 const mode=$('shipping-flat').checked?'threshold':'prefecture';
 const thresholdRaw=$('shipping-threshold').value.trim(),chargeRaw=$('shipping-charge').value.trim();
 if(!/^\d*$/.test(thresholdRaw)||Number(thresholdRaw)>100000000||!Number.isSafeInteger(Number(thresholdRaw)))throw Error('送料当社負担の下限金額を確認してください。');
 if(!/^\d*$/.test(chargeRaw)||Number(chargeRaw)>100000||!Number.isSafeInteger(Number(chargeRaw)))throw Error('全国一律送料は0〜100000円で指定してください。');
 const rates={};for(const input of document.querySelectorAll('[data-shipping-pref]')){const v=input.value.trim();if(!/^\d+$/.test(v)||Number(v)>100000)throw Error(input.dataset.shippingPref+'の送料は0〜100000円で指定してください。');rates[input.dataset.shippingPref]=Number(v);}
 return {mode,threshold:thresholdRaw===''?0:Number(thresholdRaw),charge:chargeRaw===''?0:Number(chargeRaw),rates};
}
$('save-shipping').addEventListener('click',async()=>{
 if(!owner||!slug||busy)return;
 try{
  const shipping=shippingData();busy=true;$('save-shipping').disabled=true;status('保存しています…');
  // Existing settings are merged so brand colors/banners/discounts remain untouched.
  // If this brand has never saved any settings, initialize all required fields.
  await setDoc(doc(db,'brandSettings',slug),{brandId:owner.uid,slug,...(!settingsExists?{
   theme:{preset:'natural'},banner:{enabled:true,hiddenDefault:false,imageData:'',linkMode:'none',linkValue:''},
   discount:{mode:'none',value:0,minSpend:0},novelty:{mode:'none',name:'',minSpend:0,productId:''}
  }:{}),shipping,updatedAt:serverTimestamp()},{merge:true});
  settingsExists=true;
  const verified=await getDocFromServer(doc(db,'brandSettings',slug));
  const stored=verified.data()?.shipping;
  if(!verified.exists()||!stored||stored.mode!==shipping.mode||stored.threshold!==shipping.threshold||stored.charge!==shipping.charge||shippingUtils.prefectures.some(pref=>stored.rates?.[pref]!==shipping.rates[pref]))throw Error('保存結果を確認できませんでした。再度確認してください。');
  status('送料設定の保存を確認しました。お客様ページでは最新版を表示してください。');
 }catch(err){console.error(err);status(err.code==='permission-denied'?'Firestoreルールが送料設定の保存を拒否しました。管理権限とルールをご確認ください。':err.message||'保存に失敗しました。',true);}
 finally{busy=false;$('save-shipping').disabled=false;}
});
const cfg=window.MEB_FIREBASE_CONFIG||{};
if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k]))$('loading').textContent='Firebase設定をご確認ください。';
else{
 try{const app=getApps().length?getApp():initializeApp(cfg);db=getFirestore(app);onAuthStateChanged(getAuth(app),async user=>{
  if(!user){location.replace('./login.html');return;}
  try{
   const b=await getDoc(doc(db,'brands',user.uid));if(!b.exists()||b.data().ownerUid!==user.uid)throw Error('ブランド管理権限を確認できません。');
   slug=b.data().slug;const h=await getDoc(doc(db,'brandHandles',slug));if(!h.exists()||h.data().brandId!==user.uid)throw Error('ブランド認証に失敗しました。');owner=user;
   const snap=await getDocFromServer(doc(db,'brandSettings',slug));settingsExists=snap.exists();const shipping=snap.data()?.shipping||{};
   $('shipping-flat').checked=shipping.mode==='threshold'||shipping.mode==='all';
   $('shipping-threshold').value=shipping.threshold||'';
   $('shipping-charge').value=shipping.mode==='all'?0:(shipping.charge??0);
   for(const inp of document.querySelectorAll('[data-shipping-pref]'))inp.value=Number.isInteger(shipping.rates?.[inp.dataset.shippingPref])?shipping.rates[inp.dataset.shippingPref]:0;
   shippingFields();$('loading').hidden=true;$('shell').hidden=false;$('save-shipping').disabled=false;
  }catch(err){console.error(err);$('loading').textContent='送料設定を読み込めませんでした。通信とFirestoreルールをご確認ください。';}
 });}catch(err){console.error(err);$('loading').textContent='Firebase初期化に失敗しました。';}
}
