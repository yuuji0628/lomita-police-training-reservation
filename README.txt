LOMITA POLICE Training Reservation - Version 2.17

テスト研修生機能を追加。

管理メニュー:
- 「🧪 テスト研修生」カード
- 1タップでテスト研修生を作成
- ログイン名と初回パスワードを表示
- パスワード再発行
- 予約/進捗リセット
- テスト研修生削除
- 既存テストアカウントがあれば重複作成しない

テストアカウント:
- プレイヤー名: テスト研修生
- affiliation/rank: TEST
- admin_memo: [TEST]
- 実在DiscordユーザーIDを設定しない
- テスト専用discord_idを使用

安全性:
- リセット/削除は admin_memo に [TEST] が付いたアカウントだけ実行可能
- 本番研修生を誤削除しない条件付き処理
- TESTアカウントの予約だけ削除して初期状態へ戻す

Version 2.16までの機能を維持。
