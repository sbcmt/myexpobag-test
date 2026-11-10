/** MY EXPO BAG v1.0.1 — initial brand identity and unique public routing slug.
 * Brand displayName may later be any language, while slug/ownerUid are immutable.
 */
import { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export function brandSlug(value){
  // ASCII punctuation and spaces are allowed in the registration label, but URLs
  // use lowercase, hyphen-delimited ASCII segments to avoid special URL chars.
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/,'');
}
export function validateBrand(value){
  const name=value.trim();
  if(name.length<2||name.length>60) return 'ブランド名は2〜60文字で入力してください。';
  if(!/^[\x20-\x7E]+$/.test(name)) return '初回登録のブランド名は半角英数字・半角記号・半角スペースで入力してください。';
  if(!brandSlug(name)) return 'URL用の識別子を作るため、英字または数字を1文字以上含めてください。';
  return '';
}
export function explainBrandError(e){
  if(e?.message==='brand-taken') return 'このURL識別子は別のブランドが使用中です。ブランド名に英数字を追加してください。';
  if(e?.message==='brand-already-exists') return 'このアカウントはすでにブランド登録済みです。管理画面へ進んでください。';
  switch(e?.code){
    case 'permission-denied':return 'Firestoreのルールで登録が許可されていません。配布した firestore.rules が公開済みか確認してください。';
    case 'unavailable':return 'Firestoreに接続できません。通信状態とFirestoreの作成状況をご確認ください。';
    case 'failed-precondition':return 'Firestoreの初期設定またはルールを確認してください。';
    default:return 'ブランドを登録できませんでした。通信状態とFirebaseの設定をご確認ください。';
  }
}
export async function isBrandSlugTaken(input){
  const slug=brandSlug(input);
  if(!slug)throw new Error('URL用識別子が作れません。');
  const db=getFirestore();
  return (await getDoc(doc(db,'brandHandles',slug))).exists();
}
export async function createBrand(user,input,operatorDetails={}){
  const original=input.trim();
  const invalid=validateBrand(original);
  if(invalid) throw new Error(invalid);
  const operatorName=String(operatorDetails.operatorName||'').trim();
  if(!operatorName||operatorName.length>120)throw new Error('運営者名は1〜120文字で入力してください。');
  const slug=brandSlug(original);
  const uid=user?.uid;
  if(!uid)throw new Error('ログインしてからブランドを登録してください。');
  const db=getFirestore();
  const brandRef=doc(db,'brands',uid);
  const routeRef=doc(db,'brandHandles',slug);
  await runTransaction(db,async transaction=>{
    // Read all docs before writing, and make the public handle unique.
    const [existingBrand,existingHandle]=await Promise.all([transaction.get(brandRef),transaction.get(routeRef)]);
    if(existingBrand.exists())throw new Error('brand-already-exists');
    if(existingHandle.exists())throw new Error('brand-taken');
    transaction.set(brandRef,{
      ownerUid:uid,
      slug,
      registrationName:original,
      displayName:original,
      logoUrl:'',operatorName,
      createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
    transaction.set(routeRef,{brandId:uid,ownerUid:uid,slug,displayName:original,logoUrl:'',operatorName});
  });
  return {slug,displayName:original,brandId:uid};
}
