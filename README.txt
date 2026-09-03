LOMITA POLICE Training Reservation - Version 1.63

緊急修正
- Version 1.62で管理画面が開けなくなる問題を修正
- 原因: 期限切れカード表示部分のJavaScript文字列の引用符ミス
- 管理者ログインを復旧
- 「希望日時超過」の読み取り専用カード仕様は維持
- 研修生の再申請導線も維持

検証
- worker.js 構文チェック
- ADMIN_SCRIPT（管理画面JavaScript）を抽出して個別構文チェック
を実施済み
