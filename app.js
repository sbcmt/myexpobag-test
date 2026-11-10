/** MY EXPO BAG — Customer experience v1.0.1 */
(() => {
  'use strict';
  const cfg = window.MEB_CONFIG;
  if (!cfg) { document.body.textContent = '設定ファイルを読み込めませんでした。'; return; }
  const COLORS = {
    natural:   { main:'#315746', sub:'#F2EEE6', text:'#26372F' },
    monotone:  { main:'#252932', sub:'#F0F1F3', text:'#252932' },
    urban:     { main:'#274D82', sub:'#EEF3FA', text:'#1C2D42' },
    soft:      { main:'#A04C67', sub:'#FAF0F3', text:'#432D37' },
    active:    { main:'#A9472B', sub:'#FFF2E2', text:'#3C2E25' },
    lavender: { main:'#765E9A', sub:'#F3EFF9', text:'#33283F' },
    sand:     { main:'#806544', sub:'#F9F4E8', text:'#3D3325' },
    peach:    { main:'#F38FB8', sub:'#FFF3FA', text:'#513447' },
    mint:     { main:'#307C75', sub:'#EAF8F4', text:'#1D4542' },
    slate:    { main:'#385773', sub:'#EDF3F8', text:'#253847' },
  };
  const ICONS = {
    bag: '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    left:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    right:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    plus:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    close:'<svg class="icon-svg" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };
  const $ = sel => document.querySelector(sel);
  const byId = id => cfg.products.find(p => p.id === id);
  const yen = n => '¥' + Math.max(0,Math.round(n)).toLocaleString('ja-JP');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fileSafe = value => /^(\.\/|\/|https:\/\/)[\w.%/?=&#:+-]+$/i.test(value||'') ? value : '';
  const normalPrice = (p,code='') => {
    const variant=selectedVariant(p,code);
    return variant && Number.isFinite(variant.price) ? variant.price : p.price;
  };
  const unitPrice = (p,code='') => {
    const variant=selectedVariant(p,code);
    const normal=normalPrice(p,code);
    const special=variant && Number.isFinite(variant.eventPrice)?variant.eventPrice:p.eventPrice;
    return Number.isFinite(special)&&special>=0&&special<normal?special:normal;
  };
  const fromPrice=(p)=>{
    const codes=variantsOf(p).map(v=>v.code);
    return Math.min(...[...(codes.length?codes:[''])].map(code=>unitPrice(p,code)));
  };
  const variantStock=(p,code)=>selectedVariant(p,code)?.stock??null;
  const allVariantsSoldOut=p=>variantsOf(p).length>0 && variantsOf(p).every(v=>v.stock===0);
  const soldOut=p=>variantsOf(p).length?allVariantsSoldOut(p):p.stock===0;
  const isUnavailable=p=>soldOut(p);
  const soldOutLines=()=>cartLines().filter(line=>variantsOf(line.product).length?variantStock(line.product,line.color)===0:soldOut(line.product));
  const checkoutStockError=()=>{
    if(soldOutLines().length)return 'この商品は完売しました。MY BAGから削除してください。';
    const qty=cartQtyByProduct();
    if(cfg.products.some(p=>!variantsOf(p).length && p.stock!==null && p.stock!==undefined && (qty[p.id]||0)>p.stock))return 'MY BAGの商品は在庫が不足しています。数量を減らしてください。';
    for(const line of cartLines()){
      const available=variantStock(line.product,line.color);
      if(available!==null && line.qty>available)return '選択されたバリエーションの在庫が不足しています。数量を減らしてください。';
    }
    return '';
  };
  const isPreorder=(p,code='')=>{const v=selectedVariant(p,code);return typeof v?.preorder==='boolean'?v.preorder:p.preorder===true;};
  const hasAnyPreorder=p=>variantsOf(p).length?variantsOf(p).some(v=>isPreorder(p,v.code)):isPreorder(p);
  const releaseText=p=>p.releaseMonth&&['上旬','中旬','下旬'].includes(p.releasePeriod)?`${p.releaseMonth}月${p.releasePeriod}予定`:'';
  const imageTag=(p,attr='')=>`<img src="${esc(fileSafe(p.image))}" data-meb-product-image="${esc(p.id)}" alt="${esc(p.name)}" ${attr}/>`;
  const imageCache=new Map();let imageObserver=null;
  function hydrateProductPhotos(){
    imageObserver?.disconnect();imageObserver=null;
    const fetcher=window.MEB_LOAD_PUBLIC_IMAGE;
    if(typeof fetcher!=='function')return;
    const targets=[...document.querySelectorAll('img[data-meb-product-image]')];
    const apply=(id,uri)=>{if(!uri)return;for(const el of document.querySelectorAll('img[data-meb-product-image]')){
      if(el.dataset.mebProductImage===id)el.src=uri;
    }};
    const load=img=>{
      const id=img.dataset.mebProductImage;
      if(imageCache.has(id)){const entry=imageCache.get(id);if(typeof entry==='string')apply(id,entry);return;}
      const task=fetcher(id).then(uri=>{imageCache.set(id,uri);apply(id,uri);return uri;});
      imageCache.set(id,task);
    };
    if('IntersectionObserver' in window){
      imageObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){imageObserver?.unobserve(entry.target);load(entry.target);}}},{rootMargin:'250px'});
      for(const img of targets){
        const cache=imageCache.get(img.dataset.mebProductImage);
        if(typeof cache==='string'&&cache)img.src=cache;
        else imageObserver.observe(img);
      }
    }else targets.forEach(load);
  }
  const cartKey = `meb-cart-${cfg.version}-${cfg.brand.id}-${cfg.event.id}`;
  const shippingPrefKey = `meb-pref-${cfg.version}-${cfg.brand.id}-${cfg.event.id}`;
  const state = { editPrefecture:false, shippingPrefecture:'', category:'all', cart:{}, selectedColors:{}, pendingBundle:'', order:null, checkoutMode:'register', modalOpen:false, previewTheme:null, toastTimer:null };
  // Preserve the first shipping choice when the customer reopens an existing BAG.
  try {
    const previous=localStorage.getItem(shippingPrefKey);
    if(window.MEB_SHIPPING.validPref(previous))state.shippingPrefecture=previous;
  } catch { /* Continue with a new selection when browser storage is unavailable. */ }
  let cancelOrderConfirmation=()=>{};
  let orderExpiryTimer=null;
  let stopLiveStock=()=>{};
  // App updates are checked independently of the visible version (fixed at 1.0.1).
  const currentHashes = window.MEB_ASSET_HASHES || {};
  const hashSource = window.MEB_DIGEST_TEXT;
  const currentEtags = window.MEB_ASSET_ETAGS || {};
  const trackedFiles = window.MEB_ASSET_FILES || ['index.html','styles.css','config.js','qr.js','app.js'];
  let lastReleaseCheck = 0;
  let releaseCheckBusy = false;
  let pendingReleaseBuild = '';
  const releaseCheckIntervalMs = 120_000;

  const variantsOf = p => (Array.isArray(p.variants) ? p.variants : []).filter(v=>v && typeof v.code==='string' && typeof v.name==='string' && v.code);
  const skuKey = (id,color='') => encodeURIComponent(id)+'::'+encodeURIComponent(color);
  const fromSkuKey = key => {
    const pos=key.indexOf('::');
    if(pos<0) return { id:key,color:'' }; // previous bag data stays readable
    try { return {id:decodeURIComponent(key.slice(0,pos)),color:decodeURIComponent(key.slice(pos+2))}; }
    catch { return {id:'',color:''}; }
  };
  const selectedVariant = (p,color) => variantsOf(p).find(v=>v.code===color);
  const cartLines = () => Object.entries(state.cart).map(([key,qty])=>{
    const {id,color}=fromSkuKey(key);
    return {key,id,color,qty,product:byId(id)};
  }).filter(line=>line.product && line.qty>0);
  const cartQtyByProduct = () => {
    const counts={};for(const line of cartLines())counts[line.id]=(counts[line.id]||0)+line.qty;
    return counts;
  };
  const missingColors = () => cartLines().filter(line=>variantsOf(line.product).length && !selectedVariant(line.product,line.color));
  const ensureCart = () => {
    try {
      const raw=JSON.parse(localStorage.getItem(cartKey)||'{}');
      if(!raw || typeof raw!=='object' || Array.isArray(raw))return;
      for(const [key,qty] of Object.entries(raw)){
        const {id,color}=fromSkuKey(key),p=byId(id);
        if(!p || !Number.isInteger(qty) || qty<1 || qty>20)continue;
        if(color && !selectedVariant(p,color))continue;
        const normalized=skuKey(id,color);
        state.cart[normalized]=Math.min(20,(state.cart[normalized]||0)+qty);
      }
    }catch { /* browser storage unavailable -> temporary bag */ }
  };
  const saveCart = () => {try{localStorage.setItem(cartKey,JSON.stringify(state.cart));}catch{ /* use in-memory bag */ }};
  const itemCount = () => cartLines().reduce((n,line)=>n+line.qty,0);
  const colorIsLight = hex => {
    const v = hex.replace('#',''); if(!/^[0-9a-f]{6}$/i.test(v)) return false;
    const rgb = [0,2,4].map(i => parseInt(v.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return (.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])>.38;
  };
  const applyTheme = () => {
    const defaultTheme = COLORS[state.previewTheme||cfg.brand.themePreset] || COLORS.natural;
    const custom = state.previewTheme ? {} : (cfg.brand.customColors || {});
    const palette = { main:custom.main||defaultTheme.main,sub:custom.sub||defaultTheme.sub,text:custom.text||defaultTheme.text };
    if(![palette.main,palette.sub,palette.text].every(s => /^#[0-9a-fA-F]{6}$/.test(s))) return;
    const root = document.documentElement;
    root.style.setProperty('--main',palette.main);root.style.setProperty('--sub',palette.sub);root.style.setProperty('--ink',palette.text);
    root.style.setProperty('--on-main',colorIsLight(palette.main)?'#18231C':'#FFFFFF');
    root.style.setProperty('--badger', palette.sub);
    $('meta[name="theme-color"]').content=palette.main;
  };
  const discountOffer=()=>{const mode=cfg.event?.appPurchaseDiscountMode||'none',value=Number(cfg.event?.appPurchaseDiscountValue)||0,minSpend=Math.max(0,Math.floor(Number(cfg.event?.appPurchaseDiscountMinSpend)||0));return {mode:['percent','amount'].includes(mode)&&value>0?mode:'none',value,minSpend,applyToPreorder:cfg.event?.appDiscountApplyToPreorder!==false};};
  const discountEligible=(subtotal)=>{const offer=discountOffer();return offer.mode!=='none' && subtotal>=offer.minSpend;};
  const discountCondition=()=>{const d=discountOffer();return d.minSpend>0?`（税込${yen(d.minSpend)}以上が対象）`:'';};
  const discountText=()=>{const d=discountOffer();return d.mode==='percent'?`${d.value}%OFF`:d.mode==='amount'?`${yen(d.value)}引き`:'';};
  // Gift thresholds use the tax-included total AFTER combo discounts, BEFORE app discounts.
  const giftFor=(amount,lines=cartLines())=>{const n=cfg.novelty||{};return n.enabled && (n.mode==='all'||n.mode==='minimum'&&amount>=n.minSpend||n.mode==='product'&&lines.some(line=>line.id===n.productId));};
  const giftTag=p=>cfg.novelty?.enabled&&cfg.novelty.mode==='product'&&cfg.novelty.productId===p.id?'<span class="novelty-tag">ノベルティ対象商品</span>':'';
  const giftCaution='ノベルティの数量には限りがあります。なくなり次第終了します';
  const preorderLines=()=>cartLines().filter(line=>isPreorder(line.product,line.color));
  const prefOptions=()=>window.MEB_SHIPPING.prefectures.map(pref=>`<option value="${esc(pref)}" ${state.shippingPrefecture===pref?'selected':''}>${esc(pref)}</option>`).join('');
  const shippingNeedsPref=()=>cfg.shipping?.mode==='prefecture'&&preorderLines().length>0;
  const shippingSelector=(context='bag')=>{
    if(cfg.shipping?.mode!=='prefecture')return '';
    if(context==='bag'){
      // MY BAG only confirms the address chosen on the product page.
      // A second picker could silently change the already-quoted shipping fee.
      if(state.shippingPrefecture)return `<div class="shipping-prefecture-picker" role="status"><strong>予約商品の配送先：${esc(state.shippingPrefecture)}</strong></div>`;
      const first=preorderLines()[0];
      return `<div class="shipping-prefecture-picker" role="alert"><strong>予約商品の配送先が未選択です。</strong><p>商品ページで都道府県を選択してください。</p>${first?`<button type="button" class="outline-btn" data-open-product="${esc(first.id)}">予約商品のページへ →</button>`:''}</div>`;
    }
    if(state.shippingPrefecture&&!state.editPrefecture){
      return `<div class="shipping-prefecture-picker" role="status"><strong>予約商品の配送先：${esc(state.shippingPrefecture)}</strong><p>選択済みの都道府県は、ほかの予約商品にも自動で適用されます。</p><button type="button" class="prefecture-change-btn" data-edit-pref>配送先を変更する</button></div>`;
    }
    return `<div class="shipping-prefecture-picker" role="group" aria-label="配送先都道府県"><strong>お住まいの都道府県を選んでください。</strong>
      <label for="shipping-pref-detail">配送先の都道府県</label><select id="shipping-pref-detail" data-select-pref><option value="">選択してください</option>${prefOptions()}</select>
      <p>一度選ぶと、予約商品のMY BAGにも自動で反映されます。</p></div>`;
  };
  const deliveryFor=(base,items=cartLines())=>window.MEB_SHIPPING.calc(cfg.shipping,base,items.some(x=>isPreorder(x.product,x.color)),state.shippingPrefecture);
  const totalCalc = (registered=false) => {
    const listSubtotal = cartLines().reduce((sum,line)=>sum+line.qty*normalPrice(line.product,line.color),0);
    const eventSubtotal = cartLines().reduce((sum,line)=>sum+line.qty*unitPrice(line.product,line.color),0);
    const remaining = cartQtyByProduct();
    // Each registered pair carries a fixed yen saving. Never apply a pair
    // twice to the same item. Use highest saving first for a predictable total.
    const bundles=(cfg.bundles||[]).filter(b=>Array.isArray(b.productIds) && b.productIds.length===2
      && b.productIds.every(byId) && Number(b.discountAmount)>0)
      .sort((a,b)=>Number(b.discountAmount)-Number(a.discountAmount));
    const details=[];let saving=0;
    for(const bundle of bundles){
      const [a,b]=bundle.productIds;
      const quantity=Math.min(remaining[a]||0,remaining[b]||0);
      if(!quantity)continue;
      // Clamp discounts to the item pair's current (event) prices.
      const lines=cartLines();
      const priceOf=id=>{
        const matching=lines.filter(x=>x.id===id).map(x=>unitPrice(x.product,x.color));
        return matching.length?Math.min(...matching):0;
      };
      const discount=Math.max(0,Math.min(Math.floor(Number(bundle.discountAmount)),priceOf(a)+priceOf(b)));
      if(!discount)continue;
      saving+=quantity*discount;remaining[a]-=quantity;remaining[b]-=quantity;
      details.push({name:bundle.name,count:quantity,saving:quantity*discount});
    }
    const beforeAppDiscount=Math.max(0,eventSubtotal-Math.min(eventSubtotal,saving));
    const offer=discountOffer();
    const normalSubtotal=cartLines().filter(line=>!isPreorder(line.product,line.color)).reduce((sum,line)=>sum+line.qty*unitPrice(line.product,line.color),0);
    // Bundle savings are allocated proportionally; no reservation amount or shipping is discounted when the option is off.
    const discountBase=offer.applyToPreorder?beforeAppDiscount:(eventSubtotal>0?Math.floor(beforeAppDiscount*normalSubtotal/eventSubtotal):0);
    const activeMode=registered&&discountEligible(discountBase)?offer.mode:'none';
    const appDiscountPercent=activeMode==='percent'?offer.value:0;
    const appDiscountAmount=activeMode==='percent'?Math.min(discountBase,Math.round(discountBase*offer.value/100)):
      activeMode==='amount'?Math.min(discountBase,offer.value):0;
    const shippingFee=deliveryFor(beforeAppDiscount)??0;
    const total=beforeAppDiscount-appDiscountAmount+shippingFee;
    return {listSubtotal,eventSubtotal,eventSaving:listSubtotal-eventSubtotal,bundleSaving:Math.min(eventSubtotal,saving),
      bundles:details,beforeAppDiscount,appDiscountMode:activeMode,eligibleAppDiscountPercent:offer.mode==='percent'?offer.value:0,
      appDiscountPercent,appDiscountAmount,shippingFee,total};
  };
  const cardProduct = p => `
    <article class="product-card">
      <button class="product-cover" data-open-product="${esc(p.id)}" aria-label="${esc(p.name)}の商品ページを開く">
        ${soldOut(p)?'<span class="product-tag">SOLD OUT</span>':hasAnyPreorder(p)?'<span class="product-tag">受注予約あり</span>':''}
        ${imageTag(p,'loading="lazy"')}
      </button>
      <div class="product-info">
        <div class="product-subtitle">${esc((cfg.categories.find(c=>c.id===p.categoryId)||{}).name||'')} · ID: ${esc(p.id)}</div>
        <h3 class="product-name">${esc(p.name)}${giftTag(p)}</h3>
        <div class="price-line"><div>
          ${fromPrice(p)<p.price?`<span class="price-original">${yen(p.price)}</span>`:''}
          <div class="price-current">${yen(fromPrice(p))}${variantsOf(p).length?'〜':''}</div>
        </div><button class="add-small" data-add="${esc(p.id)}" ${soldOut(p)?'disabled':''} aria-label="${esc(p.name)}をBAGに追加">${ICONS.plus}</button></div>
        ${hasAnyPreorder(p)?`<div class="price-extra">受注予約あり・${esc(releaseText(p))}</div>`:fromPrice(p)<p.price?'<div class="price-extra">展示会限定価格</div>':''}
      </div>
    </article>`;
  const nav = target => { if(location.hash!==target) location.hash=target; else render(); window.scrollTo({top:0,behavior:'instant'}); };
  const renderHeader = () => {
    const logo = cfg.brand.logoUrl || '';
    const safeLogo = (/^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo) && logo.length <= 70000) ? logo : fileSafe(logo);
    const icon = safeLogo ? `<img src="${esc(safeLogo)}" alt=""/>` : esc(cfg.brand.name.trim().slice(0,1)||'B');
    $('#site-header').innerHTML=`<div class="header-inner"><div class="brand-left"><div class="brand-icon">${icon}</div><div style="min-width:0"><div class="brand-wordmark">${esc(cfg.brand.name)}</div>${String(cfg.event.name||'').trim()?`<div class="brand-caption">${esc(cfg.event.name)}</div>`:''}</div></div><button class="header-action" data-nav="#bag" aria-label="MY BAGを開く" style="position:relative">${ICONS.bag}${itemCount()?`<span class="header-count">${itemCount()}</span>`:''}</button></div>`;
  };
  const renderPreview = () => {
    const q=new URLSearchParams(location.search);if(q.get('preview')!=='1') return '';
    return `<div class="section-pad" style="margin-top:8px"><div style="background:#f7f8f5;padding:12px;border-radius:11px"><div style="font-size:10px;color:#778578;margin-bottom:9px">出展者設定用：カラープレビュー（来場者には非表示）</div><div style="display:flex;flex-wrap:wrap;gap:6px">${Object.keys(COLORS).map(k=>`<button type="button" class="chip ${state.previewTheme===k?'active':''}" data-theme="${k}">${k}</button>`).join('')}</div></div></div>`;
  };
  const renderHome = () => {
    const banner=cfg.event.banner;
    const link=banner?.link||{};
    const bannerHref=link.mode==='product'&&byId(link.value)?'#product/'+encodeURIComponent(link.value):link.mode==='url'&&/^https:\/\/[^\s]+$/i.test(link.value||'')?link.value:'';
    const bannerOpen=!!bannerHref;
    const bannerAttrs=link.mode==='url'?' target="_blank" rel="noopener noreferrer"':'';
    const items=cfg.products.filter(p => state.category==='all'||p.categoryId===state.category);
    const categories = [{id:'all',name:'すべて'},...cfg.categories];
    $('#view').innerHTML=`
      <section class="meb-banner-caption">見つけた「好き」を、ひとつのBAGに。</section>
      ${banner?.enabled&&banner.imageData?`<${bannerOpen?'a':'div'} class="meb-banner-wrap"${bannerOpen?` href="${esc(bannerHref)}"${bannerAttrs} aria-label="バナーのリンク先を開く"`:''}><img src="${esc(banner.imageData)}" class="meb-banner" width="1200" height="400" alt="ブランドの展示会バナー"/></${bannerOpen?'a':'div'}>`:''}
      ${renderPreview()}
      <section><div class="section-pad section-heading"><div><span class="eyebrow">CURATED COLLECTION</span><h2 class="section-title">ITEMS<span style="font-size:13px;color:#bdc5bd"> .</span></h2></div><span class="section-meta">${items.length} ITEMS</span></div>
      <div class="chips" role="group" aria-label="商品カテゴリ">${categories.map(c=>`<button class="chip ${state.category===c.id?'active':''}" data-category="${esc(c.id)}" aria-pressed="${state.category===c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div class="section-pad"><div class="product-grid">${items.length?items.map(cardProduct).join(''):'<p>該当する商品がありません。</p>'}</div></div></section>

      <div class="float-space"></div>`;
  };
  // Only suggest sets that actually include the open product. The comparison baseline
  // is the sum of prices when bought separately at this event (including EXPO prices).
  // A recommended pair is useful even without an additional set discount.
  // Missing, empty or null discountPercent means 0%; never manufacture a discount.
  const eligibleBundles = productId => (cfg.bundles||[]).filter(b=>
    Array.isArray(b.productIds) && b.productIds.length===2 &&
    b.productIds.includes(productId) && b.productIds.every(id=>byId(id)&&!soldOut(byId(id))) &&
    Number.isFinite(Number(b.discountAmount)) && Number(b.discountAmount)>=0
  ).slice(0,3);
  const bundleRequired = b => {
    const req={};b.productIds.forEach(id=>{req[id]=(req[id]||0)+1;});return req;
  };
  const bundleNeed = b => {const counts=cartQtyByProduct();return Object.entries(bundleRequired(b)).filter(([id,qty])=>(counts[id]||0)<qty).map(([id,qty])=>[id,qty-(counts[id]||0)]);};
  const renderRecommendation = (b,p) => {
    const products=b.productIds.map(byId);
    const individualTotal=products.reduce((sum,item)=>sum+unitPrice(item),0);
    const saving=Math.min(individualTotal,Math.max(0,Math.floor(Number(b.discountAmount)||0)));
    const discounted=saving>0;
    const setPrice=individualTotal-saving;
    const missing=bundleNeed(b);
    const allInBag=missing.length===0;
    const buttonText=allInBag?'MY BAGで合計を確認':
      (missing.length < Object.keys(bundleRequired(b)).length?'足りない商品をBAGに追加':'この組み合わせをBAGに追加');
    return `<article class="recommend-card" aria-label="${esc(b.name)} の組み合わせ提案">
      <div class="recommend-topline"><span class="recommend-badge">${discounted?'まとめ買いでお得':'おすすめの組み合わせ'}</span><span class="recommend-title">${esc(b.name)}</span></div>
      <div class="recommend-products">${products.map((item,index)=>`${index?'<span class="recommend-plus" aria-hidden="true">＋</span>':''}<div class="recommend-item"><div class="recommend-thumb">${imageTag(item,'loading="lazy"')}</div><span class="recommend-item-name">${esc(item.name)}</span></div>`).join('')}</div>
      ${discounted ? `<div class="recommend-comparison"><span>別々に買うと <s>${yen(individualTotal)}</s></span><span class="recommend-arrow" aria-hidden="true">→</span><strong>セット価格 ${yen(setPrice)}</strong></div>
      <div class="recommend-savings"><span class="recommend-savings-label">別々に買うより</span><strong>${yen(saving)} お得！</strong></div>` : `<div class="recommend-comparison recommend-comparison-regular"><span>${products.length}点で合計</span><strong>${yen(individualTotal)}</strong></div>`}
      <p class="recommend-note">${esc(b.subtitle||'')}<br/>${discounted?'展示会限定価格がある商品は、その価格を基準に計算しています。':'各商品の展示会限定価格がある場合は、その価格で合計しています。セット追加割引はありません。'}</p>
      ${allInBag?`<button class="recommend-button" data-nav="#bag">${buttonText} →</button>`:`<button class="recommend-button" data-add-bundle="${esc(b.id)}">${buttonText} ＋</button>`}
    </article>`;
  };
  const renderDetail=p=>{
    const suggestions=eligibleBundles(p.id).map(b=>renderRecommendation(b,p)).filter(Boolean).join('');
    const variants=variantsOf(p);
    const color=state.selectedColors[p.id]||'';
    const category=(cfg.categories.find(c=>c.id===p.categoryId)||{}).name||'未分類';
    $('#view').innerHTML=`<div class="page-body"><button class="back-button" data-nav="#home">${ICONS.left} 商品一覧に戻る</button>
      <div class="detail-cover">${imageTag(p)}</div>
      ${p.image2&&fileSafe(p.image2)?`<div class="detail-second"><img src="${esc(fileSafe(p.image2))}" alt="${esc(p.name)} サブ画像" loading="lazy"/></div>`:''}
      <div class="detail-en">${esc(category)}　／　商品ID：${esc(p.id)}</div>
      <h1 class="detail-name">${esc(p.name)}${giftTag(p)}</h1>
      <div class="detail-price">${unitPrice(p,color)<normalPrice(p,color)?`<span class="detail-original">${yen(normalPrice(p,color))}</span>`:''}${yen(unitPrice(p,color))} <span style="font-size:11px;font-weight:500">税込</span></div>
      ${soldOut(p)||variants.length&&color&&variantStock(p,color)===0?'<div class="price-extra" style="color:#c02d30;font-weight:800">SOLD OUT</div>':isPreorder(p,color)?`<div class="price-extra">受注予約・${esc(releaseText(p))}</div>`:unitPrice(p,color)<normalPrice(p,color)?'<div class="price-extra">展示会限定価格</div>':''}
      ${isPreorder(p,color)?shippingSelector('detail')+(cfg.shipping?.mode==='prefecture'&&state.shippingPrefecture?`<p class="shipping-detail-fee">${esc(state.shippingPrefecture)}への送料：${(()=>{const base=preorderLines().length?totalCalc(false).beforeAppDiscount:totalCalc(false).beforeAppDiscount+unitPrice(p,color);const amt=window.MEB_SHIPPING.calc(cfg.shipping,base,true,state.shippingPrefecture);return amt===0?'送料当社負担':yen(amt);})()} <span>（現時点の目安。MY BAGで確定）</span></p>`:''):''}
      ${variants.length?`<section class="variants"><p class="variant-label">バリエーションを選択 <span>（必須）</span></p><div class="variant-options">${variants.map(v=>`<button type="button" class="variant-chip ${v.code===color?'selected':''}" data-product="${esc(p.id)}" data-variant="${esc(v.code)}" aria-pressed="${v.code===color}" ${v.stock===0?'disabled':''}>${esc(v.name)}${v.stock===0?'（SOLD OUT）':''}</button>`).join('')}</div></section>`:''}
      <button class="primary-btn" data-add="${esc(p.id)}" data-go-bag="true" ${soldOut(p)||variants.length&&color&&variantStock(p,color)===0?'disabled':''}>${soldOut(p)||variants.length&&color&&variantStock(p,color)===0?'SOLD OUT':'＋　MY BAGに追加する'}</button>
      ${suggestions?`<section class="recommendations" aria-label="おすすめの組み合わせ"><div class="recommend-section-header"><span class="eyebrow">BETTER TOGETHER</span><h2>この商品と一緒にいかがですか？</h2></div><div class="recommend-list">${suggestions}</div></section>`:''}
      <div class="notice">展示品をご覧になり、必要なバリエーションを選択してください。お支払いは出展者ブースで行います。</div></div>`;
  };
  const renderBag=()=>{
    const totals=totalCalc(false),needColors=missingColors();
    const itemRows=cartLines().map(line=>`<div class="cart-item"><div class="cart-thumbnail">${imageTag(line.product)}</div><div class="cart-main"><div class="cart-title">${esc(line.product.name)}${giftTag(line.product)}</div>
      <div class="cart-english">ID: ${esc(line.id)}${line.color?' · '+esc(selectedVariant(line.product,line.color)?.name||line.color):(variantsOf(line.product).length?' · バリエーション未選択':'')}</div>
      <div class="cart-amount">${yen(unitPrice(line.product,line.color)*line.qty)}</div><div class="qty-row"><button class="remove-btn" data-remove="${esc(line.key)}">削除</button>
      <button class="qty-btn" data-qty="${esc(line.key)}" data-step="-1" aria-label="${esc(line.product.name)}を1つ減らす">−</button><span class="qty-value">${line.qty}</span>
      <button class="qty-btn" data-qty="${esc(line.key)}" data-step="1" aria-label="${esc(line.product.name)}を1つ増やす">+</button></div>
      ${variantsOf(line.product).length&&!line.color?`<button class="pick-color-link" data-open-product="${esc(line.id)}">バリエーションを選ぶ →</button>`:''}</div></div>`).join('');
    $('#view').innerHTML=`<div class="page-body"><button class="back-button" data-nav="#home">${ICONS.left} 商品一覧に戻る</button><h1 class="page-title">MY BAG<span style="color:var(--main)">.</span></h1><p class="page-subtitle">商品とお支払い予定金額をご確認ください。</p>
      ${itemCount()?`${checkoutStockError()?`<p class="color-warning" role="alert">${esc(checkoutStockError())}</p>`:''}${itemRows}${preorderLines().length?shippingSelector('bag'):''}<section class="order-box"><h2 class="order-heading">ご注文内容</h2>
      <div class="order-row"><span class="order-label">通常価格 合計</span><strong>${yen(totals.listSubtotal)}</strong></div>
      ${totals.eventSaving>0?`<div class="order-row"><span class="order-label">展示会限定価格による割引</span><span class="order-positive">−${yen(totals.eventSaving)}</span></div>`:''}
      ${totals.bundles.map(b=>`<div class="order-row"><span class="order-label">セット割引：${esc(b.name)} × ${b.count}</span><span class="order-positive">−${yen(b.saving)}</span></div>`).join('')}
      <div class="order-total"><span>商品合計（税込）</span><strong>${yen(totals.beforeAppDiscount)}</strong></div>
      ${discountOffer().mode!=='none'?(discountEligible(totals.beforeAppDiscount)?`<div class="register-offer">お名前とメール登録で <strong>さらに${discountText()}</strong>${discountCondition()}<br/>登録後 ${yen(totalCalc(true).total)} ／ 登録せず購入も可能</div>`:`<p class="offer-unmet" role="status">アプリ割引は税込${yen(discountOffer().minSpend)}以上で適用されます（現在は対象外です）。</p>`):''}
      ${preorderLines().length?`<div class="order-row"><span>送料（税込）</span><strong>${shippingNeedsPref()&&!state.shippingPrefecture?'都道府県を選択してください':totals.shippingFee>0?yen(totals.shippingFee):'送料当社負担（¥0）'}</strong></div>
      <div class="order-payable-total" role="status" aria-label="送料を含むお支払い予定合計"><span>お支払い予定合計（税込・送料含む${discountOffer().mode!=='none'&&discountEligible(totals.beforeAppDiscount)?'・登録前':''})</span><strong>${shippingNeedsPref()&&!state.shippingPrefecture?'配送先選択後に表示':yen(totals.total)}</strong></div>`:''}
      <div class="tiny-text" style="text-align:right;margin-top:9px">お支払いは会場で</div></section>
      ${cfg.novelty?.enabled&&cfg.novelty.mode==='all'?`<div class="gift-eligible"><strong>✦ ${esc(cfg.novelty.name)}</strong><p>購入者全員が対象です。${esc(giftCaution)}</p></div>`:''}
      <div class="purchase-action">${needColors.length?`<p class="color-warning">バリエーションが未選択の商品があります。該当商品を開いてカラーを選び直してください。</p>`:''}<button class="primary-btn" data-checkout ${needColors.length||checkoutStockError()?'disabled':''}>購入QRを開く　→</button><p class="helptext">予約商品を含む場合は発送先情報が必要です。通常商品だけの場合、登録をスキップできます。</p></div>`:
      `<div class="empty-cart"><span class="empty-cart-emoji">▢</span><h2>MY BAGは空です</h2><p>気になった商品をBAGに追加しましょう。</p><button class="outline-btn" data-nav="#home">商品を探す　→</button></div>`}</div>`;
  };
  // This QR is an unsigned order *preview*, never proof of payment.
  // Identity/email is NOT embedded. The future backend will join the order ID
  // to the consent / customer record after securely saving it.
  // Compact field names keep the QR scannable on phones. Map is in README.
  // QRCodeCore's QR8bitByte writes only the low 8 bits of charCodeAt().
  // Japanese prefecture names (e.g. 広島県) therefore corrupt the QR payload.
  // Encode ALL non-ASCII characters as JSON \uXXXX escape sequences before
  // passing bytes to the QR generator. JSON.parse() restores the original text
  // on the staff scanner without weakening shipping/amount validation.
  const qrAsciiJson = value => JSON.stringify(value).replace(/[^\x20-\x7e]/g,
    char => '\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  const orderQrPayload = order => qrAsciiJson({
    t:'MEB2',o:order.id,b:cfg.brand.id,e:cfg.event.id,
    i:order.items.map(x=>[x.id,x.color,x.qty]),r:order.registered?1:0,
    c:'JPY',s:order.beforeAppDiscount,p:order.appDiscountPercent,
    d:order.appDiscountAmount,h:order.shippingFee||0,a:order.total,f:order.hasPreorder&&cfg.shipping?.mode==='prefecture'?order.prefecture:''
  });
  const renderDeliveryForm=(order)=>{
    if(order.deliverySaved)return `<section class="delivery-success" role="status"><strong>配送情報を受け付けました。</strong><p>予約商品の発送案内は、ご登録いただいたメールアドレスへご連絡します。</p></section>`;
    const chosen=order.prefecture||'';
    const opts=window.MEB_SHIPPING.prefectures.map(x=>`<option value="${esc(x)}" ${chosen===x?'selected':''}>${esc(x)}</option>`).join('');
    const canChoose=cfg.shipping?.mode!=='prefecture'||!chosen;
    return `<section class="delivery-after-scan"><h2>予約受注ありがとうございます。</h2>
      <p class="delivery-headline">こちらに配送情報をご入力ください。</p>
      <p class="tiny-text">購入QRの読み取りが完了しました。配送先の登録が終わるまで、この画面を閉じないでください。発送連絡のためメールアドレスも必要です。</p>
      <form id="delivery-form" class="delivery-form">
        <label class="form-label" for="delivery-name">お届け先のお名前（必須）</label><input class="form-input" id="delivery-name" name="name" autocomplete="name" maxlength="80" required value="${esc(order.name||'')}">
        <label class="form-label" for="delivery-email">発送連絡用メールアドレス（必須）</label><input class="form-input" id="delivery-email" name="email" type="email" autocomplete="email" maxlength="200" required value="${esc(order.email||'')}">
        <label class="form-label" for="delivery-phone">電話番号（数字10～11桁・必須）</label><input class="form-input" id="delivery-phone" name="phone" inputmode="tel" autocomplete="tel" pattern="[0-9]{10,11}" maxlength="11" placeholder="09012345678" required>
        <label class="form-label" for="delivery-postal">郵便番号（数字7桁・必須）</label><div class="postcode-row"><input class="form-input" id="delivery-postal" name="postal" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{7}" maxlength="7" placeholder="7390000" required><button type="button" class="outline-btn" data-lookup-zip>郵便番号から検索</button></div>
        <label class="form-label" for="delivery-prefecture">都道府県（必須）</label><select class="form-input" id="delivery-prefecture" name="prefecture" required ${canChoose?'':'disabled'}><option value="">選択してください</option>${opts}</select>
        <label class="form-label" for="delivery-address">市区町村・町名（必須）</label><input class="form-input" id="delivery-address" name="localAddress" autocomplete="address-level2" maxlength="120" required placeholder="例：東広島市西条町〇〇">
        <label class="form-label" for="delivery-street">番地・号（必須）</label><input class="form-input" id="delivery-street" name="streetAddress" autocomplete="address-line1" maxlength="80" required placeholder="例：1-2-3">
        <label class="form-label" for="delivery-building">建物名・部屋番号（任意）</label><input class="form-input" id="delivery-building" name="building" autocomplete="address-line2" maxlength="100" placeholder="例：〇〇マンション 201号室">
        <p class="tiny-text">${chosen?'送料計算済みの配送先：'+esc(chosen)+'。ほかの都道府県には変更できません。':'住所検索結果に合わせて都道府県を選んでください。'} 郵便番号検索では郵便番号を外部サービスに送信します。</p>
        <p class="tiny-text">郵便番号から市区町村・町名を自動入力できます。番地・号は必須、建物名・部屋番号は任意です。</p>
        <div id="delivery-error" role="alert" class="form-error"></div><button class="primary-btn" type="submit">配送情報を登録する</button>
      </form></section>`;
  };
  const renderQr=()=>{
    // An issued QR belongs to a specific order. The shared inventory count can
    // drop to zero when staff reserve its last item, but that does NOT mean the
    // presenting customer has lost their item. Consult the order acknowledgement.
    if(!state.order){$('#view').innerHTML=`<div class="page-body"><h1 class="page-title">購入QR</h1><p class="page-subtitle">購入QRは再読み込みすると消えます。<br/>MY BAGから再度発行してください。</p><button class="primary-btn" data-nav="#bag">MY BAGを見る</button></div>`;return;}
    const order=state.order;
    if(order.expiresAt&&!order.expired&&Date.now()>=order.expiresAt&&(!order.hasPreorder||order.deliverySaved))expireCustomerPage();
    if(order.expired){$('#view').innerHTML=`<div class="page-body qr-page" role="status" aria-live="polite" style="padding-top:32px;text-align:center"><h1 class="page-title">このページは表示できません</h1><p class="page-subtitle">お渡し完了後のため、このページは自動的に無効化されました。</p><button class="outline-btn" data-nav="#home">商品一覧に戻る</button></div>`;return;}
    if(order.cancelled){
      $('#view').innerHTML=`<div class="page-body qr-page" role="status" aria-live="polite" style="padding-top:32px;text-align:center"><h1 class="page-title">ご注文は取り消されました</h1><p class="page-subtitle">スタッフが確保済みの商品をキャンセルし、在庫を戻しました。お支払い予定額はありません。</p><button class="outline-btn" data-nav="#home">商品一覧に戻る</button></div>`;return;
    }
    if(order.confirmed){
      const deliveryForm=order.hasPreorder?renderDeliveryForm(order):'';
      $('#view').innerHTML=`<div class="page-body qr-page" role="status" aria-live="polite" style="padding-top:32px;text-align:center">
        <div style="font-size:60px;color:#16805a;line-height:1.2" aria-hidden="true">✓</div>
        <h1 class="page-title" style="margin-top:18px">商品を確認しました。</h1>
        <p class="page-subtitle" style="font-size:17px;font-weight:700;line-height:1.7;margin-top:12px">スタッフがご準備いたします。</p>
        <section class="qr-card" style="margin-top:22px"><div class="qr-price-label">確認済み注文番号</div>
          <div class="qr-order-id">${esc(order.id)}</div>${order.adjusted?`<p style="color:#9d3434;font-weight:700">商品取消を反映した金額です</p>`:""}<div class="qr-price-label">お支払い予定額</div>
          <div class="qr-price-base">${yen(order.total)}</div></section>
        ${deliveryForm}
        ${order.handedOff?`<p class="tiny-text" style="margin-top:14px">お渡し完了後、このページは${[1,3,5,10].includes(Number(cfg.checkout?.handoffExpiryMinutes))?Number(cfg.checkout.handoffExpiryMinutes):5}分後に自動で無効になります。</p>`:''}
        ${!order.hasPreorder||order.deliverySaved?'<button class="outline-btn" data-nav="#home" style="margin-top:24px">商品一覧に戻る</button>':''}
      </div>`;
      return;
    }
    $('#view').innerHTML=`<div class="page-body qr-page"><button class="back-button" data-nav="#bag" style="display:flex">${ICONS.left} MY BAGに戻る</button><div class="eyebrow">CHECKOUT QR</div><h1 class="page-title" style="margin-top:9px">購入QR</h1><p class="page-subtitle">この画面を出展者スタッフに見せてください。</p>
      <section class="qr-card"><div class="qr-status">購入QR</div><div class="qr-canvas-wrap"><canvas id="order-qr" width="480" height="480" role="img" aria-label="購入QRコード"></canvas></div>
      <div class="qr-price-box"><div class="qr-price-label">合計金額（税込）</div><div class="qr-price-base">${yen(order.beforeAppDiscount)}</div>
        ${order.shippingFee>0?`<div class="qr-app-discount"><span>送料</span><span>＋${yen(order.shippingFee)}</span></div>`:order.hasPreorder?`<div class="qr-app-discount"><span>送料</span><span>送料当社負担</span></div>`:''}
        ${order.appDiscountAmount>0?`<div class="qr-app-discount"><span>アプリ割引（${order.appDiscountMode==='percent'?order.appDiscountPercent+'%':yen(discountOffer().value)+'引き'}）</span><span>−${yen(order.appDiscountAmount)}</span></div>`:''}
        ${order.appDiscountAmount>0||order.shippingFee>0?`<div class="qr-price-final"><span>お支払い予定金額（税込・送料含む）</span><strong>${yen(order.total)}</strong></div>`:''}
      </div><div class="qr-order-id">${esc(order.id)}</div><div class="qr-instructions">スタッフがQRを読み込み後、<br/>商品をご準備いたします。</div>
      ${checkoutStockError()?'<div role="status" style="margin-top:12px;font-size:12px;color:#945d23">在庫とご注文の状態を確認中です。スタッフへQRをご提示ください。</div>':''}</section>
      <div style="margin-top:18px"><div class="qr-data-row"><span>登録方法</span><strong>${order.registered?'名前・メールを登録':'登録をスキップ'}</strong></div>
        ${order.registered?`<div class="qr-data-row"><span>お名前</span><strong>${esc(order.name)}</strong></div><div class="qr-data-row"><span>メール</span><strong class="email-text">${esc(order.email)}</strong></div>`:''}
        <div class="qr-data-row"><span>ご注文点数</span><strong>${order.count}点</strong></div>
        ${order.items.map(line=>`<div class="qr-data-row"><span>${esc(line.color||line.id)}</span><strong>×${line.qty}</strong></div>`).join('')}
        <div class="qr-data-row"><span>お支払い予定額</span><strong>${yen(order.total)}</strong></div>
        ${order.gift?`${cfg.novelty.mode!=='minimum'?`<div class="qr-data-row"><span>ノベルティ</span><strong>${esc(cfg.novelty.name)} 対象</strong></div>`:''}<div class="gift-qr-caution">${esc(giftCaution)}</div>`:''}</div>
      <button class="outline-btn" data-nav="#home">商品一覧に戻る</button></div>`;
    try{
      const code=new window.QRCodeCore(0,window.QRErrorCorrectLevel.M);code.addData(orderQrPayload(order));code.make();
      const canvas=$('#order-qr'),ctx=canvas.getContext('2d');const count=code.getModuleCount();const quiet=4;const size=canvas.width;const cell=Math.floor(size/(count+quiet*2));const offset=Math.floor((size-cell*(count+quiet*2))/2);
      if(cell<2)throw new Error('QR内の商品数が多すぎます');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#111';
      for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(code.isDark(r,c))ctx.fillRect(offset+(c+quiet)*cell,offset+(r+quiet)*cell,cell,cell);
    }catch(error){console.error('QR生成エラー',error);$('.qr-canvas-wrap').innerHTML='<p>QRを生成できませんでした。商品の点数や内容をご確認ください。</p>';}
  };
  const renderFloating=page=>{
    const el=$('#floating-bag');const count=itemCount();if(page!=='home' && page!=='detail'||count<1){el.hidden=true;el.innerHTML='';return;}
    el.hidden=false;el.innerHTML=`<button class="floating-bag" data-nav="#bag"><span class="floating-left">${ICONS.bag} MY BAGを見る <span class="bag-pill">${count}</span></span><span class="floating-price">${yen(totalCalc().total)}　→</span></button>`;
  };
  function render(){
    applyTheme();renderHeader();
    const hash=decodeURIComponent(location.hash.replace(/^#/,''));
    let page='home';
    if(hash==='bag')page='bag';else if(hash==='qr')page='qr';else if(hash.startsWith('product/'))page='detail';
    if(page==='bag')renderBag();else if(page==='qr')renderQr();else if(page==='detail'){
      const raw=hash.slice(8),question=raw.indexOf('?'),productId=question<0?raw:raw.slice(0,question);
      const p=byId(productId);
      if(p){if(question>=0){const color=new URLSearchParams(raw.slice(question+1)).get('variant');if(color&&variantsOf(p).some(v=>v.code===color))state.selectedColors[p.id]=color;}renderDetail(p);}else{page='home';renderHome()}
    }else renderHome();
    renderFloating(page);hydrateProductPhotos();document.title=`${cfg.brand.name} | MY EXPO BAG v${cfg.version}`;
  }
  function toast(message){const box=$('#toast');box.textContent=message;box.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>box.classList.remove('show'),1800);}
  function editCart(key,delta){
    const {id,color}=fromSkuKey(key);if(!byId(id)||!Number.isInteger(delta))return;
    const old=state.cart[key]||0;
    if(delta>0 && old>=20){toast('1商品・カラーあたり20点までです');return;}
    const prod=byId(id);if(delta>0 && prod && !variantsOf(prod).length && prod.stock!==null && prod.stock!==undefined && (cartQtyByProduct()[id]||0)>=prod.stock){toast('在庫数を超えるため追加できません');return;}
    if(delta>0 && prod && variantStock(prod,color)!==null && old>=variantStock(prod,color)){toast('選択したバリエーションは在庫不足です');return;}
    const next=Math.max(0,Math.min(20,old+delta));
    if(next===0)delete state.cart[key];else state.cart[key]=next;
    saveCart();render();
  }
  function addItem(id,goBag=false){
    const product=byId(id);if(!product||soldOut(product)){if(product)toast('この商品は完売しました');return;}
    if(!variantsOf(product).length && product.stock!==null && product.stock!==undefined && (cartQtyByProduct()[id]||0)>=product.stock){toast('在庫数を超えるため追加できません');return;}
    if(state.pendingBundle){
      const pending=(cfg.bundles||[]).find(b=>b.id===state.pendingBundle);
      if(pending?.productIds.includes(id)){completeBundle();return;}
    }
    const variants=variantsOf(product),color=state.selectedColors[id]||'';
    if(variants.length&&!selectedVariant(product,color)){
      if(location.hash==='#product/'+encodeURIComponent(id))toast('バリエーションを選択してください');
      else{nav('#product/'+encodeURIComponent(id));toast('バリエーションを選択してください');}
      return;
    }
    // A preorder cannot enter the BAG until its shipping destination is chosen.
    if(cfg.shipping?.mode==='prefecture'&&isPreorder(product,color)&&!state.shippingPrefecture){
      if(location.hash!=='#product/'+encodeURIComponent(id))nav('#product/'+encodeURIComponent(id));
      toast('予約商品の配送先都道府県を先に選んでください。');return;
    }
    const key=skuKey(id,color);
    if((state.cart[key]||0)>=20){toast('1商品・カラーあたり20点までです');return;}
    if(variantStock(product,color)===0){toast('このバリエーションは完売しました');return;}
    editCart(key,1);toast('MY BAGに追加しました');if(goBag)nav('#bag');
  }
  function completeBundle(){
    const id=state.pendingBundle;
    const bundle=(cfg.bundles||[]).slice(0,3).find(b=>b.id===id);
    if(!bundle){state.pendingBundle='';return;}
    const missing=bundleNeed(bundle);
    const needsColor=missing.find(([pid])=>variantsOf(byId(pid)).length && !selectedVariant(byId(pid),state.selectedColors[pid]||''));
    if(needsColor){
      nav('#product/'+encodeURIComponent(needsColor[0]));
      toast('この組み合わせのバリエーションを選択してください');
      return;
    }
    if(cfg.shipping?.mode==='prefecture'&&!state.shippingPrefecture){
      const pendingPreorder=missing.find(([pid])=>isPreorder(byId(pid),state.selectedColors[pid]||''));
      if(pendingPreorder){nav('#product/'+encodeURIComponent(pendingPreorder[0]));toast('予約商品の配送先都道府県を先に選んでください。');return;}
    }
    for(const [pid,qty] of missing){
      const key=skuKey(pid,state.selectedColors[pid]||'');
      if((state.cart[key]||0)+qty>20 || (!variantsOf(byId(pid)).length && byId(pid).stock!==null && byId(pid).stock!==undefined && (cartQtyByProduct()[pid]||0)+qty>byId(pid).stock) || (variantStock(byId(pid),state.selectedColors[pid]||'')!==null && (state.cart[key]||0)+qty>variantStock(byId(pid),state.selectedColors[pid]||''))){state.pendingBundle='';toast('在庫数を超えるため追加できません');return;}
    }
    for(const [pid,qty] of missing){
      const key=skuKey(pid,state.selectedColors[pid]||'');
      state.cart[key]=(state.cart[key]||0)+qty;
    }
    state.pendingBundle='';saveCart();nav('#bag');toast('組み合わせをMY BAGに追加しました');
  }
  function addBundle(id){
    const bundle=(cfg.bundles||[]).slice(0,3).find(b=>b.id===id);
    if(!bundle||!Array.isArray(bundle.productIds)||!bundle.productIds.every(pid=>byId(pid)&&!soldOut(byId(pid)))){toast('組合せの商品が完売しました');return;}
    state.pendingBundle=id;
    completeBundle();
  }
  function showCheckout(){
    if(!cfg.brand.operatorName){toast('運営者情報が未登録のため購入QRを発行できません。スタッフにお知らせください。');return;}
    if(!itemCount()||missingColors().length)return;if(shippingNeedsPref()&&!state.shippingPrefecture){toast('予約商品の配送先都道府県を選んでください。');return;}const stockError=checkoutStockError();if(stockError){toast(stockError);return;}
    state.modalOpen=true;state.checkoutMode='register';
    const offer=totalCalc(true),original=totalCalc(false);
    $('#modal-root').innerHTML=`<div class="modal-backdrop" id="checkout-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div class="modal-heading"><h2 id="checkout-title" class="modal-title">購入QRを開く</h2><button type="button" class="icon-button" data-close-modal aria-label="閉じる">${ICONS.close}</button></div>
      ${discountOffer().mode!=='none'?(offer.appDiscountAmount>0?`<div class="checkout-offer">お名前とメールを登録すると <strong>${discountText()}</strong>${discountCondition()}<br/><span>登録なら ${yen(offer.total)} ／ スキップなら ${yen(original.total)}</span></div>`:`<p class="offer-unmet" role="status">アプリ割引は税込${yen(discountOffer().minSpend)}以上で適用されます（現在は対象外です）。</p>`):''}
      <p class="modal-desc">${preorderLines().length?'予約商品が入っているため、お名前とメールアドレスの入力が必須です。':'登録するか、入力せずに購入QRを表示するか選べます。'}</p>
      ${preorderLines().length?'':'<button class="auth-tab" style="width:100%;margin:12px 0" data-checkout-mode="skip" type="button" aria-pressed="false">入力をスキップ → QR表示</button>'}
      <form id="checkout-form"><div id="registration-fields">
        <label class="form-label" for="buyer-name">お名前 <span style="color:#ae5d51">*</span></label><input class="form-input" id="buyer-name" name="name" autocomplete="name" required maxlength="80" placeholder="山田 太郎"/>
        <label class="form-label" for="buyer-email">メールアドレス <span style="color:#ae5d51">*</span></label><input class="form-input" id="buyer-email" name="email" type="email" autocomplete="email" required maxlength="200" placeholder="sample@example.com"/>
        <label class="form-check"><input type="checkbox" name="news"/><span>新商品やイベントのお知らせをメールで受け取る（任意）</span></label>
        <p class="tiny-text">お名前・メールは購入内容の照合に使用します。お知らせメールの同意は別です（初期OFF）。</p></div>
        ${preorderLines().length?`<p class="meb-delivery-prompt">予約商品の配送先（氏名・住所・電話番号・発送通知メール）は、スタッフが購入QRを読み取ったあとに入力します。QR画面を閉じずにお待ちください。</p>`:''}
        <div id="skip-description" class="skip-description" hidden>登録なしでQRを発行します。${discountOffer().mode!=='none'?'アプリ購入割引は適用されません。':'商品・セット割引はそのまま適用されます。'}</div>
        <div class="checkout-price-preview" id="checkout-price-preview">${discountOffer().mode!=='none'&&offer.appDiscountAmount>0?`<span>登録後のお支払い金額</span><strong>${yen(offer.total)}</strong>`:`<span>お支払い予定額</span><strong>${yen(offer.total)}</strong>`}</div>
        <p class="tiny-text">個人情報の取り扱いは<a href="./privacy.html?brand=${encodeURIComponent(cfg.brand.id)}" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a>をご確認ください。</p>
        <div class="form-error" id="checkout-error" role="alert"></div><button class="primary-btn" type="submit">購入QRを表示する →</button></form></section></div>`;
    $('#buyer-name').focus();
  }
  function setCheckoutMode(mode){
    if(!state.modalOpen||!['register','skip'].includes(mode))return;
    if(preorderLines().length&&mode==='skip')return;
    state.checkoutMode=mode;
    const register=mode==='register';
    $('#registration-fields').hidden=!register;$('#skip-description').hidden=register;
    $('#buyer-name').required=register;$('#buyer-email').required=register;
    document.querySelectorAll('[data-checkout-mode]').forEach(btn=>{const active=btn.dataset.checkoutMode===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    const totals=totalCalc(register);
    $('#checkout-price-preview').innerHTML=`<span>${register&&totals.appDiscountAmount>0?'割引後の': ''}お支払い予定額</span><strong>${yen(totals.total)}</strong>`;
    $('#checkout-error').textContent='';
  }
  function clearOrderExpiryTimer(){if(orderExpiryTimer){clearTimeout(orderExpiryTimer);orderExpiryTimer=null;}}
  function expireCustomerPage(){
    if(state.order?.hasPreorder&&!state.order.deliverySaved)return;
    clearOrderExpiryTimer();cancelOrderConfirmation();cancelOrderConfirmation=()=>{};
    try{stopLiveStock();}catch{} stopLiveStock=()=>{};
    try{window.MEB_STOP_PUBLIC_LIVE?.();}catch{}
    if(state.order){state.order.expired=true;state.order.handedOff=true;}
    if(location.hash==='#qr')render();
  }
  function scheduleOrderExpiry(handoffAt, configuredMinutes){
    clearOrderExpiryTimer();
    const minutes=[1,3,5,10].includes(Number(configuredMinutes))?Number(configuredMinutes):5;
    const handoffMs=handoffAt instanceof Date?handoffAt.getTime():(handoffAt?.toDate?handoffAt.toDate().getTime():Date.now());
    const expiresAt=handoffMs+minutes*60*1000;
    if(state.order){state.order.expiresAt=expiresAt;state.order.handoffExpiryMinutes=minutes;}
    // Reservations require the buyer to finish their delivery information first.
    if(state.order?.hasPreorder&&!state.order.deliverySaved)return;
    const remain=expiresAt-Date.now();
    if(remain<=0){expireCustomerPage();return;}
    orderExpiryTimer=setTimeout(expireCustomerPage,remain);
  }
  function closeModal(){state.modalOpen=false;$('#modal-root').innerHTML='';}
  async function submitCheckout(form){
    const registered=preorderLines().length?true:state.checkoutMode==='register';
    if(registered&&!form.reportValidity())return;if(checkoutStockError()){toast(checkoutStockError());return;}
    const fd=new FormData(form),name=registered?String(fd.get('name')||'').trim():'',email=registered?String(fd.get('email')||'').trim():'';
    if(registered&&(!name||!email)){$('#checkout-error').textContent='お名前とメールアドレスを入力してください。';return;}
    if(form.dataset.sending==='1')return;form.dataset.sending='1';const submit=form.querySelector('[type=submit]');submit.disabled=true;$('#checkout-error').textContent='登録内容を安全に保存しています…';
    if(!window.crypto?.getRandomValues){$('#checkout-error').textContent='安全な注文番号を作成できません。HTTPSで開いてください。';delete form.dataset.sending;submit.disabled=false;return;}
    const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);
    const id='MEB-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const totals=totalCalc(registered);
    const items=cartLines().map(line=>({id:line.id,color:line.color?line.id+'_'+line.color:'',qty:line.qty}));
    try{
      // Ordinary skipped orders have no personal-data record. Reservations and registered buyers do.
      if(registered||preorderLines().length){
        if(typeof window.MEB_SAVE_PRIVATE_CHECKOUT!=='function')throw Error('顧客データ保存機能を読み込めません。最新版を表示してください。');
        await window.MEB_SAVE_PRIVATE_CHECKOUT({slug:cfg.brand.id,brandId:cfg.ownerBrandId||'',orderId:id,registered,buyerName:name,buyerEmail:email,marketingConsent:registered&&fd.get('news')==='on',hasPreorder:preorderLines().length>0,prefecture:state.shippingPrefecture});
      }
    }catch(error){console.error('checkout save',error);$('#checkout-error').textContent='購入情報を安全に保存できませんでした。'+(error.code==='auth/operation-not-allowed'?'Firebase Authenticationで「匿名」を有効にしてください。':'通信環境・認証設定をご確認ください。')+' QRはまだ発行していません。';delete form.dataset.sending;submit.disabled=false;return;}
    delete form.dataset.sending;
    clearOrderExpiryTimer();
    state.order={id,registered,name,email,prefecture:state.shippingPrefecture,deliverySaved:false,newsletterConsent:registered&&fd.get('news')==='on',createdAt:new Date().toISOString(),
      items,count:itemCount(),listSubtotal:totals.listSubtotal,eventSubtotal:totals.eventSubtotal,bundleSaving:totals.bundleSaving,
      beforeAppDiscount:totals.beforeAppDiscount,appDiscountPercent:totals.appDiscountPercent,appDiscountMode:totals.appDiscountMode,
      appDiscountAmount:totals.appDiscountAmount,shippingFee:totals.shippingFee,hasPreorder:preorderLines().length>0,total:totals.total,
      gift:giftFor(totals.beforeAppDiscount)};
    cancelOrderConfirmation();cancelOrderConfirmation=()=>{};
    const watchedId=id;
    if(typeof window.MEB_WATCH_ORDER_CONFIRMATION==='function'){
      try{
        cancelOrderConfirmation=window.MEB_WATCH_ORDER_CONFIRMATION(watchedId,data=>{
          if(!state.order||state.order.id!==watchedId)return;
          if(!state.order.confirmed){
            // Clear the original bag once only; partial cancellations do not
            // remove unrelated items that were added afterwards.
            for(const line of state.order.items){
              const itemKey=skuKey(line.id,line.color?line.color.slice(line.id.length+1):'');
              const current=state.cart[itemKey]||0;
              if(current<=line.qty)delete state.cart[itemKey];
              else state.cart[itemKey]=current-line.qty;
            }
            saveCart();
          }
          state.order.confirmed=true;
          state.order.cancelled=data.status==='cancelled';
          state.order.adjusted=data.modified===true;
          state.order.handedOff=data.status==='handedOff';
          if(data.status==='expired'){state.order.expired=true;clearOrderExpiryTimer();cancelOrderConfirmation();cancelOrderConfirmation=()=>{};}
          if(typeof data.hasPreorder==='boolean')state.order.hasPreorder=data.hasPreorder;
          if(Number.isInteger(data.amount)&&data.amount>=0)state.order.total=data.amount;
          if(data.status==='handedOff'){
            state.order.handoffAt=data.handedOffAt||new Date();
            const configuredMinutes=data.expiresInMinutes;
            scheduleOrderExpiry(state.order.handoffAt,configuredMinutes);
            // After handoff the order status no longer requires active listening.
            cancelOrderConfirmation();cancelOrderConfirmation=()=>{};
          }
          if(location.hash==='#qr')render();
        },()=>{
          if(state.order?.id===watchedId && location.hash==='#qr')toast('確認状況を取得できません。通信環境をご確認ください。');
        });
      }catch(error){console.warn('注文確認の監視を開始できませんでした',error);}
    }
    closeModal();nav('#qr');
  }
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-select-pref]')){
      state.shippingPrefecture=window.MEB_SHIPPING.validPref(event.target.value)?event.target.value:'';
      state.editPrefecture=false;
      try { if(state.shippingPrefecture)localStorage.setItem(shippingPrefKey,state.shippingPrefecture);else localStorage.removeItem(shippingPrefKey); } catch { /* In-memory selection still works. */ }
      render();
    }
  });
  document.addEventListener('click', event=>{
    if(event.target.closest('[data-lookup-zip]')){void lookupPostal();return;}
    if(event.target.id==='checkout-overlay'){closeModal();return;}
    const clickable=event.target.closest('[data-nav],[data-open-product],[data-add],[data-qty],[data-remove],[data-add-bundle],[data-category],[data-checkout],[data-close-modal],[data-theme],[data-variant],[data-checkout-mode],[data-edit-pref]');
    if(!clickable)return;
    if(clickable.hasAttribute('data-nav')){state.pendingBundle='';nav(clickable.dataset.nav);}
    else if(clickable.hasAttribute('data-open-product'))nav('#product/'+encodeURIComponent(clickable.dataset.openProduct));
    else if(clickable.hasAttribute('data-add'))addItem(clickable.dataset.add,clickable.dataset.goBag==='true');
    else if(clickable.hasAttribute('data-qty'))editCart(clickable.dataset.qty,Number(clickable.dataset.step));
    else if(clickable.hasAttribute('data-remove')){delete state.cart[clickable.dataset.remove];saveCart();render();}
    else if(clickable.hasAttribute('data-add-bundle'))addBundle(clickable.dataset.addBundle);
    else if(clickable.hasAttribute('data-category')){state.category=clickable.dataset.category;render();}
    else if(clickable.hasAttribute('data-checkout'))showCheckout();
    else if(clickable.hasAttribute('data-close-modal'))closeModal();
    else if(clickable.hasAttribute('data-theme')){state.previewTheme=clickable.dataset.theme;render();}
    else if(clickable.hasAttribute('data-variant')){state.selectedColors[clickable.dataset.product]=clickable.dataset.variant;render();}
    else if(clickable.hasAttribute('data-edit-pref')){state.editPrefecture=true;render();}
    else if(clickable.hasAttribute('data-checkout-mode')){
      const mode=clickable.dataset.checkoutMode;
      setCheckoutMode(mode);
      // "Skip" is an action, not a second form step: issue the unregistered QR immediately.
      if(mode==='skip')submitCheckout($('#checkout-form'));
    }
  });
  async function lookupPostal(){
    const input=$('#delivery-postal'),postcode=String(input?.value||'').replace(/[^0-9]/g,'');
    const el=$('#delivery-error');if(!el)return;
    if(!/^[0-9]{7}$/.test(postcode)){el.textContent='郵便番号7桁を入力してください。';return;}
    el.textContent='郵便番号を検索しています…';
    try{
      const response=await fetch('https://zipcloud.ibsnet.co.jp/api/search?zipcode='+encodeURIComponent(postcode),{cache:'no-store'});
      if(!response.ok)throw Error('郵便番号検索サービスに接続できません。');
      const json=await response.json();const results=json.results;
      if(!Array.isArray(results)||!results.length)throw Error('住所候補が見つかりません。');
      const first=results[0];const pref=first.address1||'';
      if(!window.MEB_SHIPPING.validPref(pref))throw Error('都道府県を確認できません。');
      if(state.order?.prefecture&&cfg.shipping?.mode==='prefecture'&&state.order.prefecture!==pref){throw Error('この郵便番号は送料計算時に選んだ'+state.order.prefecture+'と異なります。スタッフにご相談ください。');}
      $('#delivery-prefecture').value=pref;
      $('#delivery-address').value=String(first.address2||'')+String(first.address3||'');
      el.textContent='市区町村・町名を入力しました。番地・号を入力してください。';
    }catch(error){el.textContent=error.message||'住所検索ができません。手入力してください。';}
  }
  async function submitDelivery(form){
    if(!state.order?.confirmed||!state.order.hasPreorder||state.order.deliverySaved)return;
    if(!form.reportValidity())return;
    const el=$('#delivery-error'),fd=new FormData(form);
    const prefecture=state.order.prefecture&&cfg.shipping?.mode==='prefecture'?state.order.prefecture:String(fd.get('prefecture')||'');
    const local=String(fd.get('localAddress')||'').trim();
    const street=String(fd.get('streetAddress')||'').trim();
    const building=String(fd.get('building')||'').trim();
    if(!window.MEB_SHIPPING.validPref(prefecture)||!local||!street||window.MEB_SHIPPING.prefectures.some(x=>x!==prefecture&&local.startsWith(x))){el.textContent='配送先の都道府県と住所を確認してください。';return;}
    const shipping={prefecture,postal:String(fd.get('postal')||'').replace(/[^0-9]/g,''),address:prefecture+local+' '+street+(building?' '+building:''),
      name:String(fd.get('name')||'').trim(),phone:String(fd.get('phone')||'').replace(/[^0-9]/g,''),email:String(fd.get('email')||'').trim()};
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;
    el.textContent='配送情報を安全に登録しています…';
    try{
      if(typeof window.MEB_SAVE_DELIVERY!=='function')throw Error('配送情報保存機能を読み込めません。最新版を表示してください。');
      await window.MEB_SAVE_DELIVERY({slug:cfg.brand.id,orderId:state.order.id,shipping});
      state.order.deliverySaved=true;
      if(state.order.handedOff)scheduleOrderExpiry(state.order.handoffAt||new Date(),state.order.handoffExpiryMinutes||5);
      render();
    }catch(error){console.error('delivery save',error);el.textContent='保存に失敗しました。'+(error.message||'通信環境をご確認ください。');submit.disabled=false;}
  }
  document.addEventListener('submit',event=>{
    if(event.target.id==='checkout-form'){event.preventDefault();void submitCheckout(event.target);}
    else if(event.target.id==='delivery-form'){event.preventDefault();void submitDelivery(event.target);}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.modalOpen)closeModal();});
  window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'});});
  window.MEB_CATALOG_REFRESH=()=>{
    // NEVER redirect automatically on a Firestore snapshot: initial snapshots,
    // active settings changes and CDN propagation could otherwise create a loop.
    pendingReleaseBuild='catalog';
    showReleaseNotice();
  };
  // A Home Screen PWA can retain its old document while in the background.
  // On focus / visibility / periodic checks, compare actual live files with the
  // exact ones used at boot. No manual release.json update needed.
  const showReleaseNotice = () => {
    let notice = $('#release-notice');
    if (!notice) {
      notice=document.createElement('div');
      notice.id='release-notice';
      notice.className='release-notice';
      notice.setAttribute('role','status');
      notice.innerHTML='<span>新しい商品・設定が公開されました</span><button type="button" data-apply-release>最新版を表示</button>';
      document.body.appendChild(notice);
    }
    notice.hidden=false;
  };
  const applyRelease = () => {
    if (!pendingReleaseBuild) return;
    const nextUrl=new URL(location.href);
    // Unique navigation URL prevents WebKit's document/BFCache from
    // restoring a permanently stale installed-app document.
    nextUrl.searchParams.set('meb_refresh',Date.now().toString(36));
    window.location.replace(nextUrl.href);
  };
  const checkRelease = async (force=false) => {
    if (releaseCheckBusy || document.visibilityState==='hidden' || !navigator.onLine || !hashSource) return;
    if (!force && Date.now()-lastReleaseCheck<releaseCheckIntervalMs) return;
    // Even forced foreground checks should not fire dozens of requests rapidly.
    if (Date.now()-lastReleaseCheck<3000) return;
    lastReleaseCheck=Date.now();
    releaseCheckBusy=true;
    try {
      const results=await Promise.all(trackedFiles.map(async filename=>{
        const url='./'+filename+'?meb_check='+Date.now();
        // Most static hosts (including GitHub Pages) return ETag. First check
        // the small headers, avoiding repeated JS/image data downloads.
        if(currentEtags[filename]){
          try{
            const head=await fetch(url,{method:'HEAD',cache:'no-store'});
            if(head.ok && head.headers.get('ETag')===currentEtags[filename]){
              return [filename,currentHashes[filename]];
            }
          }catch(_) { /* HEAD unavailable: check exact file contents */ }
        }
        const response=await fetch(url,{cache:'no-store'});
        if (!response.ok) throw new Error('更新確認 '+filename+': '+response.status);
        return [filename,hashSource(await response.text())];
      }));
      if (results.some(([name,hash])=>hash!==currentHashes[name])){
        pendingReleaseBuild='changed';
        // Preserve unsent form contents and the provisional checkout QR.
        // New assets are advisory only. An explicit tap is required even on
        // the home screen, so a customer never loses their product/cart view.
        showReleaseNotice();
      }
    } catch (error) {
      console.debug('更新確認ができませんでした',error);
    } finally {releaseCheckBusy=false;}
  };
  document.addEventListener('click', event=>{
    if(event.target.closest('[data-apply-release]')) applyRelease();
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(state.order?.expiresAt&&(!state.order.hasPreorder||state.order.deliverySaved)&&Date.now()>=state.order.expiresAt)expireCustomerPage();else checkRelease(true);}});
  window.addEventListener('pageshow',()=>checkRelease(true));
  window.addEventListener('focus',()=>checkRelease(true));
  window.addEventListener('online',()=>checkRelease(true));
  setInterval(()=>{if(!state.order?.expired)checkRelease();},120_000);
  ensureCart();render();
  if(typeof window.MEB_WATCH_PUBLIC_STOCK==='function')stopLiveStock=window.MEB_WATCH_PUBLIC_STOCK(data=>{
    const quantities=data.quantities||data;
    const variantQuantities=data.variantQuantities||{};
    const hadError=!!checkoutStockError();
    for(const p of cfg.products){
      if(Object.prototype.hasOwnProperty.call(quantities,p.id)){
        const now=quantities[p.id];
        if(now===null||(Number.isInteger(now)&&now>=0))p.stock=now;
      }
      for(const v of variantsOf(p)){
        const key=p.id+'::'+v.code;
        if(Object.prototype.hasOwnProperty.call(variantQuantities,key)){
          const now=variantQuantities[key];
          if(now===null||(Number.isInteger(now)&&now>=0))v.stock=now;
        }
      }
    }
    if(!hadError && checkoutStockError() && !state.order)toast('MY BAGの商品が完売・在庫不足になりました。内容をご確認ください。');
    render();
  });
  if(window.MEB_CATALOG_REFRESH_PENDING){window.MEB_CATALOG_REFRESH_PENDING=false;window.MEB_CATALOG_REFRESH();}
})();
