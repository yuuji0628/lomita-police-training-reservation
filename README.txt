LOMITA POLICE Training Reservation - Version 2.07

表示バージョン同期修正

原因:
- Cloudflare の main は worker-hotfix.js
- 画面HTMLは既存 worker.js が生成
- worker.js の APP_VERSION が 2.04 のため、復旧版を入れても画面は 2.04 のままだった

v2.07:
- worker-hotfix.js を表示バージョンの最終ラッパーに変更
- HTML内の Version 2.04 / 2.05 / 2.06 を Version 2.07 に統一
- JSON/APIレスポンスは変更しない
- 既存の予約復旧処理 v2.06 を維持
- 予約データの削除・初期化はしない

wrangler.jsonc:
- main は worker-hotfix.js のまま
