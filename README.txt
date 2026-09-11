LOMITA POLICE Training Reservation - Version 2.26

緊急修正:
研修生ポータルで
- 「進捗を取得できませんでした」
- 「研修進捗を取得できませんでした」
が出る問題を修正。

原因:
Version 2.21で追加した期限延長用D1ラッパーで、
D1 PreparedStatement.bind() の戻り値を保持していなかったため、
期限計算用SELECTが未バインド状態で実行される場合がありました。

修正:
- bind() 後のPreparedStatementを activeStmt として保持
- first/all/run/raw は必ずバインド済みStatementを使用
- 期限延長機能は維持
- 研修生画面の管理者専用ツール非表示も維持
- 教官空き時間登録 / 優先枠表示も維持

Version 2.25の機能を維持したまま、進捗取得エラーのみ修正。
