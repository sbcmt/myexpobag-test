# MY EXPO BAG GitHub更新ファイル（Spark + Cloudflare Workers）

GitHubテストリポジトリのルートに次の3ファイルだけを追加してください。
- billing.html
- billing.js
- billing-config.js（Worker URLを設定した後に登録）

管理メニューに「プラン・お支払い」へのリンクを追加したい場合は、最新のadmin.htmlへ以下の1行のみ手動で追記します。

```html
<a class="menu-link" href="./billing.html"><span>プラン・お支払い</span><span aria-hidden="true">›</span></a>
```

A1用POP画像、管理画面アイコン、テキストロゴなど既存素材は更新しません。
