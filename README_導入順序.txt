MY EXPO BAG TEST  No.5 商品10点制限（Firestore側） 修正パッケージ
2026-11-11 / 対象：my-expo-bag-test のみ

【変更ファイル】
GitHubルートへアップロード：
  products.js, products.html, catalog.js, catalog.html, brand-registration.js
Firebase Console > Firestore Database > ルールへ貼り付け：
  firestore.rules  （GitHubへのアップロードだけでは有効になりません）

【最重要：データ破損を防ぐため、必ず下記の順番で作業】
0. テスト環境であることを確認。既存のFirestoreルールはバックアップ（別名で保存）する。
1. 既存の「ブランド」を持つすべてのテストアカウントについて、Firestoreのデータタブで
   brands/{UID}/products にある商品ドキュメントの「実数」を数える。
   ※ 商品画像、公開用商品、バリエーションの数は含めない。親商品1点=1カウント。
2. brands/{UID}/productQuota/state というドキュメントをFirebase Consoleから
   管理者として作成する。フィールドは次の4つ（型も確認）：
     count         integer（数値） 実際の「products」ドキュメント数
     lastProductId string         空文字
     action        string         init
     updatedAt     timestamp      現在日時（入力例：2026-11-11T11:00:00+09:00）
   ※ フィールド名に大文字小文字の違いを作らない。既存ブランド全件で行う。
   ※ 管理者がFirebase Consoleで作成し、アプリユーザーは新規作成不可。
3. GitHubのテスト用リポジトリルートに上記HTML/JS 5ファイルを展開して上書き。
   ZIPそのものはアップロードしない。POP背景画像・アプリアイコン・ロゴは触らない。
4. Firebase TESTの「ルール」画面で firestore.rules 全文を置き換えて「公開」。
   ※ Firestore rulesは元の501行等も含む全文です。部分貼り付けしないでください。
5. 商品一覧・編集と新規登録を試し、quota.countが変化することを確認。
   同一商品の更新：カウント不変 / 新規登録：+1 / 未公開の商品削除：-1
6. Free：10商品なら11点目拒否。Pro.：11点目許可（最大300）。
   必ずFirestoreのproductsコレクションに11点目が保存されないことも確認。

【注意】
- quotaが未作成・数が不一致の場合、商品作成・削除を止める安全設計です。
- CSVは商品を1点ずつトランザクションで保存します。通信障害時は途中までの
  保存済み商品が残る場合があるため、画面の件数表示を確認して再実行してください。
- 複数商品削除も1点ずつ安全にトランザクション処理します。途中失敗時は最新一覧で確認。
- 既存2アカウントを本番でtester登録する作業は、今回のテスト修正とは別です。
- Spark無料プラン、Stripe設定、Cloudflare Worker、既存画像ファイルは変更しません。
- このパッケージはコード・ルールの静的確認済みであり、Firebase実環境の合格判定前です。
