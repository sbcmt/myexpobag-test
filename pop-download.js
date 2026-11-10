import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocFromServer} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const $=id=>document.getElementById(id);
const cfg=window.MEB_FIREBASE_CONFIG||{};
const pageSizes={A1:[594,841],A2:[420,594],A3:[297,420],A4:[210,297],A5:[148,210]};
const state={db:null,user:null,brand:null,slug:'',brandName:'',customerUrl:'',template:null,logo:null,qrCanvas:null};
const templatePath='./assets/pop-template-no-qr.png?v=20261016-clean-v110';
const printTemplatePath='./assets/pop-template-print-a1.jpg?v=20261016-clean-v110';
const logoPath='./assets/pop-qr-logo.png?v=20261017-v120-master';
function setStatus(msg,error=false,target='status'){const el=$(target); if(el){el.textContent=msg; el.className='status '+(error?'error':'good');}}
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('画像を読み込めません: '+src));img.src=src;});}
function customerUrlFor(slug){const url=new URL('./index.html',location.href);url.searchParams.set('brand',slug);return url.href;}
function makeQrCore(text){const qr=new window.QRCodeCore(0,window.QRErrorCorrectLevel.H);qr.addData(text);qr.make();return qr;}
// Deliver exactly 1080x1080 raster images, with intact QR modules and a proper quiet zone.
function renderQrCanvas(text,size=1080){
 const qr=makeQrCore(text), count=qr.getModuleCount(), quiet=4;
 const totalModules=count+quiet*2,cell=Math.floor(size/totalModules);
 if(cell<2)throw Error('URLが長すぎてQRを生成できません。');
 const canvas=document.createElement('canvas'); canvas.width=size;canvas.height=size;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
 const origin=Math.floor((size-cell*totalModules)/2)+quiet*cell;
 ctx.fillStyle='#111';
 for(let row=0;row<count;row++)for(let col=0;col<count;col++)
  if(qr.isDark(row,col))ctx.fillRect(origin+col*cell,origin+row*cell,cell,cell);
 return canvas;
}
function addLogoToQr(baseCanvas,logoImage){const c=document.createElement('canvas'); c.width=baseCanvas.width; c.height=baseCanvas.height; const ctx=c.getContext('2d'); ctx.drawImage(baseCanvas,0,0); const s=Math.round(c.width*0.18); const x=(c.width-s)/2, y=(c.height-s)/2; const radius=Math.round(s*0.18); ctx.fillStyle='#fff'; roundRect(ctx,x,y,s,s,radius); ctx.fill(); ctx.save(); roundRect(ctx,x,y,s,s,radius); ctx.clip(); ctx.drawImage(logoImage,x+Math.round(s*0.07),y+Math.round(s*0.07),Math.round(s*0.86),Math.round(s*0.86)); ctx.restore(); return c; }
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// Place the visible ink, not the outer QR bitmap, at the center of the
// central QR area after removing the old rounded frame. No extra white box.
const POSTER_BASE_W=1054,POSTER_BASE_H=1492;
const QR_TARGET={centerX:511.5,centerY:822}; // v108: exactly 16 native pixels lower (half-character) than old centerY=806
const QR_INK_SIZE=280;
let cachedInkBounds=null;
function findQrInkBounds(qrCanvas){
 if(cachedInkBounds?.canvas===qrCanvas)return cachedInkBounds;
 const {width,height}=qrCanvas;
 const data=qrCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
 let minX=width,minY=height,maxX=-1,maxY=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4;
  if(data[p]<55&&data[p+1]<55&&data[p+2]<55&&data[p+3]>245){
   if(x<minX)minX=x;if(x>maxX)maxX=x;
   if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
 }
 if(maxX<minX||maxY<minY)throw Error('QRの位置を確認できませんでした。');
 cachedInkBounds={canvas:qrCanvas,minX,minY,maxX,maxY};
 return cachedInkBounds;
}
function posterQrGeometry(w,h,qrCanvas){
 const b=findQrInkBounds(qrCanvas);
 const inkWidth=b.maxX-b.minX+1,inkHeight=b.maxY-b.minY+1;
 const scale=QR_INK_SIZE/Math.max(inkWidth,inkHeight);
 const centerX=QR_TARGET.centerX;
 const centerY=QR_TARGET.centerY;
 const inkCenterX=(b.minX+b.maxX+1)/2;
 const inkCenterY=(b.minY+b.maxY+1)/2;
 return {x:(centerX-inkCenterX*scale)*w/POSTER_BASE_W,
         y:(centerY-inkCenterY*scale)*h/POSTER_BASE_H,
         w:qrCanvas.width*scale*w/POSTER_BASE_W,
         h:qrCanvas.height*scale*h/POSTER_BASE_H};
}
function composePoster(targetCanvas,template,qrCanvas){
 const ctx=targetCanvas.getContext('2d'),w=targetCanvas.width,h=targetCanvas.height;
 ctx.clearRect(0,0,w,h);
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(template,0,0,w,h);
 const pos=posterQrGeometry(w,h,qrCanvas);
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.drawImage(qrCanvas,pos.x,pos.y,pos.w,pos.h);
 ctx.restore();
}
function buildQrSvg(text){
 const qr=makeQrCore(text),count=qr.getModuleCount(),quiet=4,total=count+quiet*2;
 // Monochrome, completely vector: each module is four straight cubic-Bezier
 // segments with collinear control points. No embedded bitmap or colored logo.
 const shapes=[];
 for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c)){
  const x=c+quiet,y=r+quiet;
  shapes.push(`M${x} ${y} C${x+1/3} ${y} ${x+2/3} ${y} ${x+1} ${y} C${x+1} ${y+1/3} ${x+1} ${y+2/3} ${x+1} ${y+1} C${x+2/3} ${y+1} ${x+1/3} ${y+1} ${x} ${y+1} C${x} ${y+2/3} ${x} ${y+1/3} ${x} ${y} Z`);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 ${total} ${total}"><rect width="${total}" height="${total}" fill="#fff"/><path fill="#111" d="${shapes.join(' ')}"/></svg>`;
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function canvasBlob(canvas,type,quality){return await new Promise(resolve=>canvas.toBlob(resolve,type,quality));}
function selectedSizes(){return [...document.querySelectorAll('.size-check:checked')].map(el=>el.value);}
function selectedFormats(){return [...document.querySelectorAll('.qr-format:checked')].map(el=>el.value);}
async function ensureAssets(){if(!state.template)state.template=await loadImage(templatePath); if(!state.logo)state.logo=await loadImage(logoPath); if(!state.qrCanvas){const base=renderQrCanvas(state.customerUrl,1080); state.qrCanvas=addLogoToQr(base,state.logo);} return true;}
async function drawPreview(){try{await ensureAssets(); composePoster($('preview-canvas'),state.template,state.qrCanvas); setStatus('プレビューを更新しました。',false,'preview-status');}catch(err){console.error(err);setStatus(err.message||'プレビューの描画に失敗しました。',true,'preview-status');}}
async function downloadQrFiles(){const formats=selectedFormats(); if(!formats.length){setStatus('QRの保存形式を1つ以上選択してください。',true);return;} try{setStatus('QRを生成しています…'); await ensureAssets(); const zip=(formats.length>1)?new window.JSZip():null; for(const fmt of formats){ if(fmt==='svg'){ const svg=buildQrSvg(state.customerUrl); const blob=new Blob([svg],{type:'image/svg+xml'}); if(zip)zip.file(`MY_EXPO_BAG_${state.slug}_customer_qr.svg`,blob); else downloadBlob(blob,`MY_EXPO_BAG_${state.slug}_customer_qr.svg`); } else { const mime=fmt==='jpg'?'image/jpeg':'image/png'; const blob=await canvasBlob(state.qrCanvas,mime,fmt==='jpg'?0.96:undefined); const ext=fmt==='jpg'?'jpg':'png'; if(zip)zip.file(`MY_EXPO_BAG_${state.slug}_customer_qr.${ext}`,blob); else downloadBlob(blob,`MY_EXPO_BAG_${state.slug}_customer_qr.${ext}`); } } if(zip){const blob=await zip.generateAsync({type:'blob'}); downloadBlob(blob,`MY_EXPO_BAG_${state.slug}_customer_qr.zip`);} setStatus('QRを保存しました。'); }catch(err){console.error(err);setStatus(err.message||'QRの保存に失敗しました。',true);} }
// Fetch the press-size 7016x9933 300dpi JPEG once on demand, rather than
// rasterizing the original ~1k pixel source every time the user prints.
let printJpegBytesPromise=null;
function fetchPrintJpeg(){
 if(!printJpegBytesPromise)printJpegBytesPromise=fetch(printTemplatePath)
   .then(async r=>{if(!r.ok)throw Error('印刷用の高解像度原版を読み込めません（HTTP '+r.status+'）。assets/pop-template-print-a1.jpg をアップロードしてください。'); return new Uint8Array(await r.arrayBuffer());})
   .catch(err=>{printJpegBytesPromise=null;throw err;});
 return printJpegBytesPromise;
}
// Draw the true customer page URL as PDF vector paths. The raster preview is
// for layout only. The printed QR modules stay crisp at any paper size.
function drawVectorQrOnPdf(pdf,pageW,pageH){
 const raw=makeQrCore(state.customerUrl), count=raw.getModuleCount(),quiet=4;
 const totalModules=count+quiet*2;
 const cell=Math.floor(1080/totalModules);
 const origin=Math.floor((1080-cell*totalModules)/2)+quiet*cell;
 const pos=posterQrGeometry(pageW,pageH,state.qrCanvas);
 const fx=pos.w/1080,fy=pos.h/1080;
 // White is limited to the QR image itself: no extra frame or shadow.
 pdf.setFillColor(255,255,255);
 pdf.rect(pos.x,pos.y,pos.w,pos.h,'F');
 pdf.setFillColor(17,17,17);
 for(let row=0;row<count;row++)for(let col=0;col<count;col++){
  if(raw.isDark(row,col)) pdf.rect(pos.x+(origin+col*cell)*fx,pos.y+(origin+row*cell)*fy,cell*fx+.002,cell*fy+.002,'F');
 }
 const s=1080*0.18;const x=(1080-s)/2,y=(1080-s)/2,r=s*.18;
 pdf.setFillColor(255,255,255);
 pdf.roundedRect(pos.x+x*fx,pos.y+y*fy,s*fx,s*fy,r*fx,r*fy,'F');
 const logoInner=.86,logoPad=(1-logoInner)/2;
 pdf.addImage(state.logo,'PNG',pos.x+(x+s*logoPad)*fx,pos.y+(y+s*logoPad)*fy,s*logoInner*fx,s*logoInner*fy,undefined,'FAST');
}
async function makePdfForSize(size){
 await ensureAssets();
 const [w,h]=pageSizes[size];
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:[w,h],compress:true});
 const highRes=await fetchPrintJpeg();
 // The embedded image is already A1 300dpi; addImage reuses native JPEG bytes.
 doc.addImage(highRes,'JPEG',0,0,w,h,undefined,'FAST');
 drawVectorQrOnPdf(doc,w,h);
 return doc.output('blob');
}
async function downloadPopFiles(){const sizes=selectedSizes(); if(!sizes.length){setStatus('POPサイズを1つ以上選択してください。',true);return;} try{setStatus('POP PDFを生成しています…選択数が多い場合は少し時間がかかります。'); await ensureAssets(); const zip=sizes.length>1?new window.JSZip():null; for(const size of sizes){const blob=await makePdfForSize(size); const name=`MY_EXPO_BAG_${state.slug}_POP_${size}.pdf`; if(zip)zip.file(name,blob); else downloadBlob(blob,name);} if(zip){const blob=await zip.generateAsync({type:'blob'}); downloadBlob(blob,`MY_EXPO_BAG_${state.slug}_POP_bundle.zip`);} setStatus('POPを保存しました。'); }catch(err){console.error(err);setStatus(err.message||'POPの生成に失敗しました。',true);} }
function bindUi(){ $('download-qr').addEventListener('click',()=>downloadQrFiles()); $('download-pop').addEventListener('click',()=>downloadPopFiles()); $('copy-url').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.customerUrl); setStatus('URLをコピーしました。');}catch{setStatus('URLのコピーに失敗しました。',true);}}); $('size-all').addEventListener('change',e=>{document.querySelectorAll('.size-check').forEach(el=>el.checked=e.target.checked);}); document.querySelectorAll('.size-check').forEach(el=>el.addEventListener('change',()=>{const all=[...document.querySelectorAll('.size-check')]; const checked=all.filter(x=>x.checked).length; $('size-all').checked=checked===all.length; $('size-all').indeterminate=checked>0&&checked<all.length;}));}
async function init(){ if(!['apiKey','authDomain','projectId','appId'].every(k=>typeof cfg[k]==='string'&&cfg[k])){$('loading').textContent='Firebase設定をご確認ください。';return;} try{const app=getApps().length?getApp():initializeApp(cfg); state.db=getFirestore(app); onAuthStateChanged(getAuth(app),async user=>{ if(!user){location.replace('./login.html');return;} try{ const brandSnap=await getDoc(doc(state.db,'brands',user.uid)); if(!brandSnap.exists()||brandSnap.data().ownerUid!==user.uid)throw new Error('ブランド情報を確認できません。'); const brand=brandSnap.data(); state.user=user; state.brand=brand; state.slug=brand.slug; const handle=await getDocFromServer(doc(state.db,'brandHandles',state.slug)); state.brandName=handle.exists()?String(handle.data().displayName||state.slug):state.slug; state.customerUrl=customerUrlFor(state.slug);  $('loading').hidden=true; $('shell').hidden=false; bindUi(); await drawPreview(); }catch(err){console.error(err); $('loading').textContent='ブランド情報を読み込めませんでした。'; }});}catch(err){console.error(err); $('loading').textContent='画面を初期化できませんでした。'; }}
init();
