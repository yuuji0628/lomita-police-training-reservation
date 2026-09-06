LOMITA POLICE Training Reservation - Version 1.79

管理画面 予約一覧・履歴表示修正

原因
- Version 1.77で受講済み取消を種類別表示にした際、
  管理画面JavaScriptからサーバー専用の isOrientationTitle() を呼んでいた
- ブラウザ側では未定義のため、
  件数表示後にJavaScriptが停止していた
- 結果:
  ・予約一覧が「読み込み中」のまま
  ・受講済み件数だけ表示される
  ・希望日時超過件数だけ表示される
  ・中身は「ありません」のまま

修正
- 管理画面専用 isOrientationHistoryName() を追加
- 受講済み履歴のオリエンテーション判定を修正
- loadReservationControl() 全体にエラー保護を追加
- 今後表示エラーが起きても「読み込み中」のまま固まらず、エラーメッセージを表示

維持
- Version 1.78の処理待ち
- Version 1.77の受講済み/既修了/オリエンテーション取消
- Discord通知
- プレイヤー名変更
- 研修生管理カード簡略化
