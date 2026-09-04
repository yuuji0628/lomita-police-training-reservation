LOMITA POLICE Training Reservation - Version 1.68

修正：管理ダッシュボードが全て0になる問題

原因
- Version 1.66で「研修管理 / adminList」を削除
- Version 1.67の loadAdmin() が旧 adminList を render() しようとしてJavaScriptエラー
- そのため /api/admin/stats の取得前に処理が停止していた

修正
- loadAdmin() から旧「研修管理」読み込み・render()を完全に除外
- 管理ダッシュボード集計を直接取得
- 念のため旧 render() にnullガード追加
- statsが401ならログアウト、その他エラーはconsoleへ記録

維持
- 研修プログラム管理のみ
- 教官管理
- 研修生管理
- 予約一覧
- 今日/今週の予定
- 対応が必要
- 教官未決定
- 希望日時超過
- 再受講
- 研修生進捗
- 1時間ごとのDiscord承認待ち通知
- 希望日時超過と再申請

検証
- worker.js全体構文チェック
- 管理画面JavaScript単体構文チェック
- loadAdminが旧adminListを参照しないこと
- ダッシュボードstats取得が実行されること
- 管理者ログイン
- 予約一覧/研修生管理の回帰チェック
