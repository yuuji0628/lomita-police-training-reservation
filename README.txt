LOMITA POLICE Training Reservation - Version 1.61

修正
- Version 1.60の「希望日時超過」がCron時だけ反映される問題を改善
- 管理画面の予約一覧を開いた時にも即時チェック
- 研修生ポータルの進捗を開いた時にも即時チェック
- 最後の希望日時を過ぎていれば、その場で status=expired に更新
- 次の毎時Cronを待たなくてよい
- 本人DM / 教官Discord通知も従来どおり送信
- 第2・第3希望が未来の場合は期限切れにしない

Version 1.60までの既存機能を維持
