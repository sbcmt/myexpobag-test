# MY EXPO BAG TEST — Free / Pro. / Tester 導入手順

**対象:** GitHub `sbcmt/myexpobag-test` と Firebase `my-expo-bag-test` のみ。
本番 `my-expo-bag` / Check-In / Stripeには変更しないでください。

## 1. GitHub
このZIPを解凍し、README_SETUP.txt 以外の `*.html` (12ファイル) と `meb-plan.js` を、GitHubのテスト用リポジトリの**ルート**にアップロードして同名ファイルを更新してください。
HTMLは既存の内容を維持し、`meb-plan.js` の読み込みURLに付けたバージョン番号だけ更新しています。
`firestore.rules` はGitHubに置いても動作は変わらないので、次のFirebase Consoleで全文を貼り付けてください。

## 2. Firestoreルール
Firebase Consoleで `my-expo-bag-test` を選択 → Firestore Database → ルール → ZIP内の firestore.rules **全文**を貼り付けて「公開」。
このルールを本番Firebaseに入れないこと。

## 3. Tester権限（Firestore Consoleで管理者操作）
Firestore Database → データ → 「コレクションを開始」
コレクションID：planEntitlements
ドキュメントID：対象テストユーザーの「Authentication > ユーザー」のUID
フィールド1：plan    文字列(string) tester
フィールド2：status  文字列(string) active
※ ドキュメントIDを自動生成しない。UIDは本番/公開GitHubのコードに書かない。

## 4. 別のテスト用ユーザー
・Free：権限ドキュメントを作らない（自動的にFree）
・Stripe試験用：まずドキュメントを作らずFreeで開始。Stripeテスト決済のWebhook完成後に Pro. に変える。
・決済なしでPro.の権限を事前に試す場合：plan(string) pro, status(string) active を管理者が手動登録。ただし決済テストでは、この手動権限を先に消してFreeから試すこと。

## 5. 確認
GitHub Pagesに更新が反映後、該当アカウントでログアウト→再ログイン、または再読み込み。
・Freeの画面ラベルは Free
・Pro.の画面ラベルは Pro.
・Testerの画面ラベルも Pro.（内部planは tester）
・Testerは Pro.限定の予約、CSV、アクセントプライスカード等を操作できる。
・Firestoreの planEntitlements ドキュメントは本人のみ読み取り可。一般ユーザーから作成・更新・削除はできない。

## 注意点と次の工程
・これはFirebase権限区分と画面表示に対応したものです。StripeのCheckout / Webhook / 返金・解約・支払失敗との同期は**未実装**です。
・Freeのサーバー側の商品登録数制限、各バリエーションの予約制限、同時ログイン管理、全Pro機能の不正操作防止は、前段階から未完了の箇所があります。決済導入前にすべて検証・補強してください。
・本番移行時は本番用アカウントのUIDを管理者がFirestoreに登録し直す必要があります。本テスト用のUIDは本番環境に自動移行しません。
・POP背景画像、管理画面アイコン、テキストロゴには一切触れていません。
