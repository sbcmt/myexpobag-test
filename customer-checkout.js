/** MY EXPO BAG v1.0.1 — private buyer details, never inside QR. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,setDoc,getDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
const cfg=window.MEB_FIREBASE_CONFIG||{};
const app=getApps().length?getApp():initializeApp(cfg);
const auth=getAuth(app),db=getFirestore(app);
const orderPattern=/^(?:MEB|DEMO)-[A-F0-9]{20}$/;
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
async function signed(){if(!auth.currentUser)await signInAnonymously(auth);if(!auth.currentUser)throw Error('購入者の認証を確認できません。');return auth.currentUser;}
function requireIds(payload){if(!slugPattern.test(payload.slug)||!orderPattern.test(payload.orderId))throw Error('注文番号が正しくありません。');}
const blank=()=>({prefecture:'',postal:'',address:'',name:'',phone:'',email:''});
window.MEB_SAVE_PRIVATE_CHECKOUT=async function(payload){
 requireIds(payload);const user=await signed();
 const data={slug:payload.slug,brandId:payload.brandId,orderId:payload.orderId,registered:payload.registered===true,
  buyerName:payload.registered?String(payload.buyerName||''):'',buyerEmail:payload.registered?String(payload.buyerEmail||''):'',
  marketingConsent:payload.registered&&payload.marketingConsent===true,hasPreorder:payload.hasPreorder===true,
  shipping:{...blank(),prefecture:String(payload.prefecture||'')},deliverySubmitted:false,
  creatorUid:user.uid,createdAt:serverTimestamp()};
 if(!data.registered&&!data.hasPreorder)return false;
 await setDoc(doc(db,'customerOrders',payload.slug,'orders',payload.orderId),data);
 return true;
};
// Called only AFTER the brand owner scans the QR. Firestore rules independently
// require a confirmed order and the same original anonymous buyer identity.
window.MEB_SAVE_DELIVERY=async function(payload){
 requireIds(payload);const user=await signed();
 const ref=doc(db,'customerOrders',payload.slug,'orders',payload.orderId);
 const snap=await getDoc(ref);
 if(!snap.exists()||snap.data().creatorUid!==user.uid)throw Error('この注文の配送情報を登録できません。同じ端末・ブラウザでお試しください。');
 if(snap.data().deliverySubmitted===true)return true;
 const sh=payload.shipping||{};
 const prefecture=String(sh.prefecture||'');const postal=String(sh.postal||'');
 const address=String(sh.address||'').trim();const name=String(sh.name||'').trim();
 const phone=String(sh.phone||'');const email=String(sh.email||'').trim();
 if(!window.MEB_SHIPPING?.validPref(prefecture)||!/^[0-9]{7}$/.test(postal)||!address.startsWith(prefecture)||address.length>200||address.length<prefecture.length+3||!name||name.length>80||!/^[0-9]{10,11}$/.test(phone)||email.length>200||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('発送先情報を確認してください。');
 if(snap.data().shipping?.prefecture&&snap.data().shipping.prefecture!==prefecture)throw Error('送料計算時に選択した都道府県と一致しません。');
 await updateDoc(ref,{shipping:{prefecture,postal,address,name,phone,email},deliverySubmitted:true,deliverySubmittedAt:serverTimestamp()});
 return true;
};
