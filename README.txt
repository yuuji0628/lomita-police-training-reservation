LOMITA POLICE Training Reservation - Version 1.74

プレイヤー名機能
- 新規研修生はDiscord初回ログイン後、プレイヤー名入力が必須
- Discord表示名を自動でプレイヤー名にしない
- 既存研修生は研修生ポータルの「名前変更」から変更可能
- 最大40文字
- Discord IDとの紐づけ、進捗、履歴は維持
- 名前変更時、既存予約の表示名も同じDiscord IDに対して同期

検証
- worker.js 全体構文チェック
- 管理画面JavaScript単体構文チェック
- 研修生ポータルJavaScript単体構文チェック
- 初回登録モーダル
- 既存研修生の名前変更
- 予約表示名同期
