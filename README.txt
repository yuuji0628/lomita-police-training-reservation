LOMITA POLICE Training Reservation - Version 2.06 Recovery

v2.05でも「予約一覧の復旧取得にも失敗しました」となる問題への再修正版です。

v2.06の変更:
- 復旧処理から PRAGMA を完全に削除
- 管理者確認を /api/admin/check のみに変更
- reservations を r.* で直接読み取り
- trainings は LEFT JOIN
- 予約一覧取得時の復旧経路では
  DELETE / UPDATE / ALTER TABLE / 期限超過処理を一切実行しない
- 新しいカラムが無い場合は画面用の既定値を補完

安全性:
- 予約データを削除しません
- 受講履歴を初期化しません
- 研修生進捗を変更しません
- 通常ルートは既存 worker.js にそのまま委譲します

配置:
- worker-hotfix.js
- wrangler.jsonc
- README.txt

既存の worker.js は残したまま使います。
