/**
 * MY EXPO BAG TEST — audited public inventory writes.
 * Only changed keys are submitted to the Firestore Security Rules validator.
 * No stock value is normalized here: invalid data fails closed.
 */
const PRODUCT_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const VARIANT_KEY=/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}::[A-Za-z0-9_-]{1,25}$/;
export const STOCK_AUDIT_BATCH_LIMIT=3; // Below the Firestore Rules' 30-key limit per map.

function changedKeys(oldMap,nextMap){
  const before=oldMap||{},after=nextMap||{};
  return [...new Set([...Object.keys(before),...Object.keys(after)])]
    .filter(key=>!(Object.prototype.hasOwnProperty.call(before,key)&&
                   Object.prototype.hasOwnProperty.call(after,key)&&before[key]===after[key]));
}
export function stockAuditFields(oldStock,quantities,variantQuantities,privateProducts=new Map()){
  if(!quantities||typeof quantities!=='object'||Array.isArray(quantities)||
     !variantQuantities||typeof variantQuantities!=='object'||Array.isArray(variantQuantities))
    throw Error('公開在庫の形式が不正です。');
  const quantityIds=changedKeys(oldStock?.quantities,quantities);
  const variantKeys=changedKeys(oldStock?.variantQuantities,variantQuantities);
  if(quantityIds.length>30||variantKeys.length>30)
    throw Error('公開在庫の一括更新数が上限を超えました。分割更新してください。');
  for(const [keys,re,data] of [[quantityIds,PRODUCT_ID,quantities],[variantKeys,VARIANT_KEY,variantQuantities]]){
    for(const key of keys){
      if(!re.test(key)){
        // An obsolete malformed key may be deleted, but not added/edited.
        if(Object.prototype.hasOwnProperty.call(data,key))throw Error('公開在庫の商品識別子が不正です：'+key);
        continue;
      }
      if(Object.prototype.hasOwnProperty.call(data,key)){
        const value=data[key];
        if(value!==null&&(!Number.isInteger(value)||value<0||value>100000000))
          throw Error('公開在庫の数量が不正です：'+key);
      }
    }
  }
  // A client's audit claims are checked against actual added map keys by Rules.
  // No new identifiers may be trusted without a matching private product.
  const addedQuantityIds=Object.keys(quantities).filter(id=>!Object.prototype.hasOwnProperty.call(oldStock?.quantities||{},id));
  const addedVariantKeys=Object.keys(variantQuantities).filter(key=>!Object.prototype.hasOwnProperty.call(oldStock?.variantQuantities||{},key));
  if(addedQuantityIds.length>3||addedVariantKeys.length>3)
    throw Error('新しい公開在庫は一度に3件まで登録できます。商品公開を分割してください。');
  const newVariantProductIds=[],newVariantIndexes=[];
  for(const id of addedQuantityIds){
    if(privateProducts.get(id)?.active!==true)
      throw Error('追加する公開在庫の元商品が確認できません：'+id);
  }
  for(const key of addedVariantKeys){
    const pos=key.indexOf('::');
    const id=key.slice(0,pos),code=key.slice(pos+2);
    const product=privateProducts.get(id);
    const index=Array.isArray(product?.variants)?product.variants.findIndex(v=>v?.code===code):-1;
    if(product?.active!==true||index<0||index>=100)
      throw Error('追加するバリエーション在庫の元データが確認できません：'+key);
    newVariantProductIds.push(id);
    newVariantIndexes.push(index);
  }
  return {
    auditedQuantityIds:quantityIds,auditedVariantKeys:variantKeys,
    newQuantityIds:addedQuantityIds,newVariantKeys:addedVariantKeys,
    newVariantProductIds,newVariantIndexes
  };
}
