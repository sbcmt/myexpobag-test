/* MY EXPO BAG v1.0.1 — shared Japanese shipping calculation. No personal data. */
(() => {
'use strict';
const prefectures='北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
const validPref = value => prefectures.includes(value);
const calc = (shipping, base, hasPreorder, prefecture='') => {
 const sh=shipping||{};
 if(!hasPreorder || sh.mode==='all')return 0;
 const limit=Number(sh.threshold)||0;
 if(limit>0 && base>=limit)return 0;
 if(sh.mode==='prefecture'){
   if(!validPref(prefecture))return null; // No price quote without region.
   const n=sh.rates?.[prefecture];
   return Number.isInteger(n)&&n>=0&&n<=100000?n:null;
 }
 if(sh.mode==='threshold')return Number(sh.charge)||0;
 return 0;
};
window.MEB_SHIPPING={prefectures,validPref,calc};
})();
