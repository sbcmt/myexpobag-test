# MY EXPO BAG — テスト環境セットアップ（GitHub Pages + Firebase）

## 絶対に守るルール
- **本番GitHubリポジトリと本番Firebase `my-expo-bag` は変更しません。**
- `assets/` 以下は、元ZIPからすべて同じバイト列でコピーしています。特にA1印刷用 `assets/pop-template-print-a1.jpg` は**圧縮・リサイズ・再エンコード・変更禁止**です。
- POP用背景だけでなく、現行の `pop-download.js` とA1/A2/A3/A4/A5の出力設定も変更していません。
- テスト版で使用するのは**架空の商品・顧客データ**のみです。GitHub Pagesは公開サイトです。
- ZIPをGitHubへそのままアップロードしても自動展開されません。**解凍して中身をアップロード**してください。

## 1. GitHubに新しいリポジトリを作る
1. GitHubで **New repository** → 名前は `myexpobag-test` など（既存本番と別名）にする。
2. GitHub FreeでPagesを使うなら **Public** を選択。README自動作成はオフで構いません。
3. 本ZIPをPCで解凍し、`MY_EXPO_BAG_TEST_GITHUB` フォルダ**の中身すべて**（HTML, JS, CSS, assetsフォルダを含む）を、新しいリポジトリの直下にアップロードする。
   GitHub: **Add file → Upload files**。ZIPファイル自体をアップロードしない。
4. リポジトリ **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**。
5. 公開URLは通常 `https://<GitHubユーザー名>.github.io/myexpobag-test/`。

## 2. Firebaseでテスト専用プロジェクトを作る
1. Firebaseコンソールで**新規プロジェクト**を作る（例 `my-expo-bag-staging`。IDは重複不可）。本番プロジェクトに別のWebアプリを増やすだけではデータが分離されないので避ける。
2. テスト用の**Webアプリ**を登録し、表示されるWeb構成オブジェクトから `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` の値を控える。秘密鍵は不要。
3. **Authentication → Sign-in method** で **メール/パスワード**、**匿名**を有効にする（現行コードに双方必要）。
4. **Authentication → Settings → Authorized domains** に自分のGitHub Pagesドメイン `<GitHubユーザー名>.github.io` を追加する（URLの`https://`や`/myexpobag-test/`は入れない）。
5. **Firestore Database** を新規作成。最初はテスト用の適切なリージョンを選び、本ZIPの `firestore.rules` をFirestoreの「ルール」に貼り付けて公開。初期作成時のテストモードの広い許可ルールを残さないこと。
6. この段階では **Storage / Realtime Database / Functions / Stripe** の作成は不要。現行コードの商品画像はFirestore文書として保存される。

## 3. テストサイトだけのFirebase接続を設定
1. 新しいGitHubリポジトリ内の `firebase-config.js` を編集する。
2. `TEST_...` で始まるプレースホルダーを、手順2の**テスト専用Firebase Webアプリの構成値**にすべて置き換える。
3. **本番Firebaseの projectId=`my-expo-bag` を指定すると、テスト版は接続を拒否**する安全ガードが入っている。
4. コミットし、GitHub Pagesに反映されたらテスト版を再読み込みする。未設定ならテストサイト上部に警告が出る。

## 4. 最初の動作確認
- `signup.html` で**新規テストアカウント**を作成してログインできること。
- テストブランド（本番のデータは移動しない）を登録して、Firestoreの**新しいプロジェクト**側にデータが作成されること。
- `products.html` から商品を登録・編集できること。
- `index.html?brand=<テストブランドのslug>` でテスト用商品を見られること。
- 架空の顧客情報でQRを作り、`scan.html` でスタッフの受注操作まで動くこと。
- POPはプレビューとA1〜A5 PDF出力を確認。**POP素材は絶対に作り直さない**。

## 5. 大規模改修の次の段階
- 現状の商品登録は1商品1画像、バリエーションは1軸中心です。ここから5タブ化、カラー×サイズ2軸、予約商品別の年/月/上旬・中旬・下旬、Free/Pro制限へ進みます。
- 現在のFirestoreルールでは商品データの `releaseMonth` と `releasePeriod` はありますが、**予約年の独立フィールドがありません**。予約の年まで保存するには、画面・顧客側表示・受注・Firestoreルールを整合させる必要があります。
- Stripe決済は今回の初期テスト環境には導入していません。あとからStripe**テストモード**で導入します。
- `README.md`, `README_DEPLOY.txt` は**元ZIPの旧版説明**であり、必ずしも現在の機能と一致していません。設定手順はこのファイルを優先してください。
- `firestore.rules` はユーザー提供の原文をそのまま同梱しています。実際のFirebaseでのルールコンパイル・動作試験は未実施です。
- Firebase Storageに画像を移すかどうかは、後の画像2枚化に合わせて安全性と容量を評価します。初期構築では現状を維持します。

## テスト環境用の変更点
- `firebase-config.js`：本番設定を削除、別プロジェクト専用の入力欄と接続ガード、TEST表示を追加
- `*.html`：テスト環境のみ `noindex` メタタグを追加（検索インデックス抑制。アクセス制限ではありません）
- `firestore.rules`：提供されたFirestoreルールを追加
- `POP_IMAGES_SHA256.txt`：POP画像のハッシュを追加
- `.nojekyll`, `README_TEST_SETUP.md`：GitHub Pages用と手順書
- 上記以外の**元ファイルは変更していません**。元の `assets/` と `pop-download.js` は同一です。
