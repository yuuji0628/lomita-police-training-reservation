LOMITA POLICE Training Reservation - Version 1.36

追加機能
- 予約を「予約確定」にして保存した瞬間、対象研修生へDiscord DMを自動送信
- DM内容: 研修名 / 確定日時 / 担当教官
- DM送信失敗でも予約確定処理は成功
- すでに予約確定済みの予約を再保存しただけではDMを再送しない

Cloudflare Secret
DISCORD_BOT_TOKEN

Discord Bot TokenをこのSecretへ登録してください。
Bot TokenはGitHub、worker.js、チャットには貼らず、Cloudflareへ直接登録してください。

管理メニューで「確定DM Bot：設定済み / 未設定」を確認できます。

Version 1.35までの既存機能を維持。
