MY EXPO BAG TEST / 商品登録画面起動エラー対策（2026-11-10）

推定原因：新しいproducts.htmlが従来のproducts.js?asset=20261019-expand-fields-02を指定していたため、ブラウザに残る旧products.jsがロードされ得る。旧JSは5タブ版に存在しない #release-month / #product-preorder を参照する。

修正：products.html のJS読み込みURLを ?asset=20261110-ui-5tabs-hotfix1 に更新。エラー時は例外の説明も表示。products.jsは前回UI改修版と同一。

アップロード：GitHub sbcmt/myexpobag-test のルートに products.html と products.js を両方アップロードして既存同名ファイルを置換。
Firebaseルールは変更不要。firebase-config.js、assets、POP、ロゴ、アイコンの変更なし。本番環境には適用しない。

アップロード後は https://sbcmt.github.io/myexpobag-test/products.html?reload=20261110h1 を開く。旧画面が残るときは Ctrl+Shift+R で再読み込み。
エラーが残ったら表示された「詳細：...（ファイル...行）」のメッセージを伝えてください。
