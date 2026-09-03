LOMITA POLICE Training Reservation - Version 1.64

変更
- 承認待ち・担当教官未決定のDiscord定期通知
  3時間ごと → 1時間ごと に変更

動作
- Cloudflare Cronは既存の毎時実行を使用
- 承認待ち + 担当教官未決定の申請がある場合、
  前回通知から1時間以上経過していれば再通知
- @学科講師ロールの自動メンション維持
- 希望日時超過処理・再申請導線・既存DM通知も維持

検証
- worker.js 構文チェック
- 管理画面JavaScript単体構文チェック
- 既存主要機能の回帰チェック
