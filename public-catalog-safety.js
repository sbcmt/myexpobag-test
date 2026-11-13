import {stockAuditFields,STOCK_AUDIT_BATCH_LIMIT} from './stock-audit.js';
/**
 * MY EXPO BAG TEST — safely remove one product from the public-only snapshot.
 * Private product data and order history are never deleted by this function.
 * The catalog, stock index and public photo pointer are changed atomically.
 */
import {doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

export async function unpublishOneProduct({db,uid,slug,productId,allowActiveDraft=false}) {
  if (!db || !uid || !slug || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(productId)) {
    throw Error('公開解除に必要な商品情報を確認できません。');
  }
  const draftRef=doc(db,'brands',uid,'products',productId);
  const catalogRef=doc(db,'publishedCatalogs',slug);
  const stockRef=doc(db,'publishedStock',slug);
  const publicImageRef=doc(db,'publishedCatalogs',slug,'images',productId);
  const outcome=await runTransaction(db,async tx=>{
    // The draft read ties the action to the saved active state and prevents
    // accidentally unpublishing a different product after a stale UI update.
    const [draft,catalog,stock]=await Promise.all([
      tx.get(draftRef),tx.get(catalogRef),tx.get(stockRef)
    ]);
    if(!draft.exists())throw Error('商品が存在しません。商品一覧を更新してください。');
    if(!allowActiveDraft && draft.data().active!==false) {
      throw Error('非表示設定が保存されていません。商品を保存してから再試行してください。');
    }
    if(!catalog.exists())return {removed:false};
    const data=catalog.data();
    if(data.brandId!==uid || data.slug!==slug)throw Error('公開カタログの所有者情報が一致しません。');
    const oldProducts=Array.isArray(data.products)?data.products:[];
    const oldImages=Array.isArray(data.publishedImageIds)?data.publishedImageIds:[];
    const oldBundles=Array.isArray(data.bundles)?data.bundles:[];
    const products=oldProducts.filter(item=>item.id!==productId);
    const images=oldImages.filter(id=>id!==productId);
    const bundles=oldBundles.filter(item=>!Array.isArray(item.productIds)||!item.productIds.includes(productId));
    const changed=products.length!==oldProducts.length||images.length!==oldImages.length||bundles.length!==oldBundles.length;
    if(!changed){
      // A stale stock entry is not visible as a product. It will be removed
      // the next time the catalog is published.
      return {removed:false};
    }
    tx.update(catalogRef,{products,publishedImageIds:images,bundles,updatedAt:serverTimestamp()});
    if(stock.exists()){
      const old=stock.data();
      const quantities={...(old.quantities||{})};
      const variantQuantities={...(old.variantQuantities||{})};
      delete quantities[productId];
      const stale=Object.keys(variantQuantities).filter(key=>key.startsWith(productId+'::'));
      for(const key of stale.slice(0,STOCK_AUDIT_BATCH_LIMIT))delete variantQuantities[key];
      tx.update(stockRef,{quantities,variantQuantities,...stockAuditFields(old,quantities,variantQuantities),updatedAt:serverTimestamp()});
    }
    // Removing the public image in the same transaction ensures its access
    // is not left enabled after the catalog stops referencing this product.
    tx.delete(publicImageRef);
    return {removed:true};
  });
  // For products with >24 variants, keep the catalog/image unlink atomic,
  // and clean up the remaining (now invisible) stock entries in audited chunks.
  if(outcome.removed){
    for(let part=0;part<500;part++){
      const again=await runTransaction(db,async tx=>{
        const snapshot=await tx.get(stockRef);
        if(!snapshot.exists())return false;
        const old=snapshot.data();
        const quantities={...(old.quantities||{})};
        const variantQuantities={...(old.variantQuantities||{})};
        const dangling=Object.keys(variantQuantities).filter(key=>key.startsWith(productId+'::'));
        if(!dangling.length)return false;
        for(const key of dangling.slice(0,STOCK_AUDIT_BATCH_LIMIT))delete variantQuantities[key];
        tx.update(stockRef,{
          quantities,variantQuantities,
          ...stockAuditFields(old,quantities,variantQuantities),
          updatedAt:serverTimestamp()
        });
        return true;
      });
      if(!again)return outcome;
    }
    throw Error('公開在庫の不要なバリエーションの削除が完了しませんでした。再同期してください。');
  }
  return outcome;
}
