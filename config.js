/**
 * MY EXPO BAG v1.0.1 — temporary exhibitor settings for the customer site.
 * Later these values will come from the exhibitor's admin screen.
 * No real brand or customer data is included here.
 */
window.MEB_CONFIG = {
  version: '1.0.1',
  brand: {
    id: 'fieldnote-demo',
    name: 'FIELDNOTE',
    description: '日々の暮らしと、週末の外遊びに。',
    logoUrl: '', // Example: './assets/brand-logo.png'
    themePreset: 'natural',
    customColors: { main: '', sub: '', text: '' },
  },
  event: {
    id: 'expo-demo-001',
    name: 'POP-UP EXHIBITION',
    accentLabel: 'EVENT EXCLUSIVE',
    appPurchaseDiscountPercent: 10, // デモ確認用：登録者だけ合計から10%OFF。無効にする場合は 0
    banner: {
      enabled: true,
      eyebrow: 'PICK UP ITEM',
      title: 'この出会いが、次のお気に入りに。',
      body: '会場だけの特別なアイテムをチェック。',
      productId: 'lantern',
      imageUrl: '',
    },
  },
  categories: [
    { id: 'lights', name: 'ライト' },
    { id: 'furniture', name: 'ファニチャー' },
    { id: 'tableware', name: 'テーブルウェア' },
    { id: 'accessories', name: 'アクセサリー' },
  ],
  // Product registration will be managed through the exhibitor admin screen.
  // Up to 2 images per PRODUCT, not per color. Color choices are text/code only.
  products: [
    { id:'lantern', categoryId:'lights', name:'ポータブルランタン', price:4800, eventPrice:4200, image:'./assets/lantern.svg', image2:'', tag:'人気商品', variants:[{code:'BK',name:'ブラック'},{code:'KH',name:'カーキ'},{code:'BE',name:'ベージュ'}] },
    { id:'table', categoryId:'furniture', name:'フォールディングテーブル', price:6500, eventPrice:5900, image:'./assets/table.svg', variants:[{code:'BK',name:'ブラック'},{code:'NT',name:'ナチュラル'}] },
    { id:'mug', categoryId:'tableware', name:'ステンレスマグ', price:2400, eventPrice:null, image:'./assets/mug.svg', variants:[] },
    { id:'chair', categoryId:'furniture', name:'コンパクトチェア', price:9800, eventPrice:8800, image:'./assets/chair.svg', variants:[{code:'BK',name:'ブラック'},{code:'GY',name:'グレー'}] },
    { id:'tote', categoryId:'accessories', name:'キャンバストート', price:3600, eventPrice:3200, image:'./assets/tote.svg', variants:[] },
    { id:'bottle', categoryId:'tableware', name:'スリムボトル', price:3100, eventPrice:2800, image:'./assets/bottle.svg', variants:[] },
  ],
  bundles: [
    { id: 'outdoor-duo', name: 'LIGHT & TABLE', subtitle: '灯りとテーブルを一緒に。', productIds: ['lantern', 'table'], discountPercent: 10 },
    { id: 'relax-kit', name: 'RELAX KIT', subtitle: 'チェアとマグで、くつろぎの時間。', productIds: ['chair', 'mug'], discountPercent: 8 },
    { id: 'day-trip', name: 'DAY TRIP SET', subtitle: 'お出かけをスマートに。', productIds: ['tote', 'bottle'], discountPercent: 0 }, // 割引なしの組み合わせ表示テスト
  ],
  novelty: {
    enabled: true,
    name: 'オリジナルステッカー',
    minSpend: 8000,
    note: '会計時にスタッフがお渡しします。数量には限りがあります。',
  },
  line: {
    enabled: false, // LINE login will require business-managed authentication.
  },
};
