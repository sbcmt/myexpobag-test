'use strict';
const fs=require('node:fs');const assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const snippet=source.match(/const qrAsciiJson = value => JSON\.stringify\(value\)\.replace\([^;]+;/s);
assert.ok(snippet,'QR ASCII normalization must exist');
const qrAsciiJson=Function(snippet[0]+';return qrAsciiJson')();
const prefs=('北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県').split(' ');
const base={t:'MEB2',o:'DEMO-00112233445566778899',b:'sbcmt',e:'sbcmt',i:[['LT-001','LT-001_BK',2]],r:1,c:'JPY',s:4200,p:10,d:420,h:700,a:4480};
assert.equal(prefs.length,47);
for(const pref of prefs){
 const original={...base,f:pref};
 const encoded=qrAsciiJson(original);
 assert.match(encoded,/^[\x20-\x7e]+$/);
 assert.deepEqual(JSON.parse(encoded),original);
 // Simulate the existing QRCodeCore QR8bitByte writer: low 8 bits only
 const out=Array.from(encoded,ch=>String.fromCharCode(ch.charCodeAt(0)&255)).join('');
 assert.deepEqual(JSON.parse(out),original);
}
const old=JSON.stringify({...base,f:'広島県'});
const damaged=Array.from(old,ch=>String.fromCharCode(ch.charCodeAt(0)&255)).join('');
assert.throws(()=>JSON.parse(damaged));
console.log('PASS: 47都道府県 QR ASCII互換・読み戻し正常 / 旧方式「広島県」の破損を再現');
