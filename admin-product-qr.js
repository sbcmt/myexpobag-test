/** Read only the signed-in brand's actual product documents; never fall back to demo configuration. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const cfg=window.MEB_FIREBASE_CONFIG||{};
let loadedProducts=[],currentSlug='';
if(['apiKey','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k].trim())){
 const app=getApps().length?getApp():initializeApp(cfg),db=getFirestore(app);
 onAuthStateChanged(getAuth(app),async user=>{
  if(!user)return;
  try{
   const b=await getDoc(doc(db,'brands',user.uid));
   if(!b.exists()||b.data().ownerUid!==user.uid)throw Error('ログインしたブランド情報がありません。');
   const slug=b.data().slug;currentSlug=slug;
   const [drafts,published]=await Promise.all([
    getDocs(collection(db,'brands',user.uid,'products')),
    getDoc(doc(db,'publishedCatalogs',slug))
   ]);
   const publishedIds=new Set((published.data()?.products||[]).map(p=>p.id));
   const items=drafts.docs.map(d=>d.data()).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string')
     .sort((a,b)=>String(a.id).localeCompare(String(b.id),'ja'))
     .map(p=>({...p,published:publishedIds.has(p.id)}));
   loadedProducts=items;
   if(typeof window.MEB_SET_PRODUCT_QR_LIST==='function')window.MEB_SET_PRODUCT_QR_LIST(items);
  }catch(err){console.error('商品QR登録リスト',err);window.MEB_PRODUCT_QR_ERROR?.(err.message||'通信エラー');}
 });
}

// Export one public product QR per product ID, not the old demonstration URLs.
const exportButton=document.getElementById('download-product-qr');
const status=document.getElementById('product-qr-export-status');
const safeName=s=>String(s||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,80);
function itemUrl(id,variant=''){
 const u=new URL('./index.html',location.href);u.searchParams.set('brand',currentSlug);
 u.hash='#product/'+encodeURIComponent(id)+(variant?'?variant='+encodeURIComponent(variant):'');
 return u.href;
}
function qrCanvas(url,logo){
 const q=new window.QRCodeCore(0,window.QRErrorCorrectLevel.H);q.addData(url);q.make();
 const n=q.getModuleCount(),quiet=4,total=n+quiet*2,size=1080,cell=Math.floor(size/total);
 if(cell<2)throw Error('URLが長すぎます。');
 const c=document.createElement('canvas');c.width=c.height=size;
 const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
 const pad=Math.floor((size-cell*total)/2)+cell*quiet;
 ctx.fillStyle='#111';for(let r=0;r<n;r++)for(let x=0;x<n;x++)if(q.isDark(r,x))ctx.fillRect(pad+x*cell,pad+r*cell,cell,cell);
 const box=Math.round(size*.18),left=(size-box)/2,top=(size-box)/2;
 ctx.fillStyle='#fff';ctx.fillRect(left,top,box,box);
 if(logo)ctx.drawImage(logo,left+box*.06,top+box*.06,box*.88,box*.88);
 return c;
}
function getImage(path){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('ロゴ画像の読み込みに失敗しました'));img.src=path;});}
function toBlob(c){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG生成に失敗しました')),'image/png'));}
function save(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}
exportButton?.addEventListener('click',async()=>{
 const selected=new Set([...document.querySelectorAll('#products-selection-list input[data-id]:checked')].map(e=>e.dataset.id));
 if(!selected.size||!currentSlug)return;
 exportButton.disabled=true;
 try{
  if(typeof window.JSZip!=='function')throw Error('ZIPライブラリを読み込めません。通信環境をご確認ください。');
  status.textContent='登録済みの商品QRを作成しています…';
  const logo=await getImage('./assets/pop-qr-logo.png');
  const zip=new window.JSZip();let done=0;
  for(const p of loadedProducts.filter(x=>selected.has(x.id))){
   const canvas=qrCanvas(itemUrl(p.id),logo);
   zip.file('item_'+safeName(p.id)+'.png',await toBlob(canvas));
   canvas.width=0;canvas.height=0;
   status.textContent=`商品QR作成中：${++done}件`;
  }
  if(!done)throw Error('選択した商品のQRがありません。');
  save(await zip.generateAsync({type:'blob'}),'MY_EXPO_BAG_'+safeName(currentSlug)+'_product_QR.zip');
  status.textContent=`商品QRを${done}件保存しました。未公開の商品は「お客様ページに反映」後に掲示してください。`;
 }catch(e){console.error('商品QR生成',e);status.textContent='エラー：'+(e.message||'出力に失敗しました');}
 finally{exportButton.disabled=![...document.querySelectorAll('#products-selection-list input[data-id]:checked')].length;}
});
