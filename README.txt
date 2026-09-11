LOMITA POLICE Training Reservation - Version 2.16

v2.15のCloudflare Wranglerビルドエラーを修正。

原因:
worker-hotfix.js 内で、HTML/JSを埋め込む外側のテンプレート文字列の中に
さらにバッククォート形式のテンプレート文字列を入れていたため、
Wranglerが worker-hotfix.js:197 付近で構文エラーになっていました。

修正:
- 予約ページャーのHTML生成
- Cookie更新
- 今日の対応パネル
- GitHub保存表示
- 障害ログ表示
- Discordまとめ通知文字列
を通常の文字列連結へ変更。

Version 2.15の機能は維持。
