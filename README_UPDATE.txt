MY EXPO BAG TEST — Free 3色／プライスカード非表示 2026-11-10

対象: GitHub sbcmt/myexpobag-test、Firebase my-expo-bag-test のみ（本番変更禁止）

[GitHub 更新]
settings.html / settings.js / pricecards.html / pricecards-live.js / meb-plan.js の5ファイルを、
GitHubテストリポジトリのルートにアップロードし同名ファイルを置き換えます。
ファイルはアップロード前にZIPから解凍してください。

[Firebase 更新]
firestore.rules はGitHubに置くだけでは反映されません。
Firebase Console > テスト用 my-expo-bag-test > Firestore Database > ルールに全文を貼り付けて公開。
この更新により、Freeが3色以外を直接保存しようとしても拒否します。

[操作確認]
1. Freeログイン: 設定画面で「モノトーン・ネイビー・テラコッタ」の3色しか見えない。
2. Freeログイン: プライスカードはホワイトのみで、アクセントボタン・ブランドカラー案内は見えない。
3. Pro.／Testerログイン: カラー10色、ホワイトとアクセント、ブランドカラー案内を利用可能。
4. 以前のFreeアカウントで他の色が保存されている場合は、モノトーンが選択中となります。
   「設定を保存」でサーバー側にも切り替えます（自動的なデータ削除はしません）。
5. 古いキャッシュが残る場合はCtrl+Shift+Rで再読み込み。

注意: Stripe連携・同時ログイン強制・すべてのPro.権限のサーバー保護は別工程です。
今回A1 POP、アイコン、テキストロゴ、商品登録、注文、価格計算は変更していません。
