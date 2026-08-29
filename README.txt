Lomita Police 研修予約システム v2

追加内容:
- 警察向けデザイン
- 研修種別
- Discord ID
- 参加申請 → 管理者承認
- 承認待ち / 予約確定 / 受講済み / 欠席 / キャンセル管理

更新手順:
1. Cloudflare D1 の lomita-police-training-db を開く
2. コンソールで migration.sql を1回だけ実行
3. GitHub のルート直下へ worker.js と wrangler.jsonc をアップロード（既存を上書き）
4. Cloudflareの自動ビルド成功を確認
5. / と /admin を確認

管理パスワード:
ADMIN_PASSWORD を設定していなければ game1234
