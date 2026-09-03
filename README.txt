Version 1.32

追加機能
- 研修申請が成功するとDiscordへ自動通知
- 通知内容: 研修名、研修生名、第1〜第3希望日時、備考、通知時刻
- Discord通知が失敗しても申請自体は保存されます
- Webhook URLはCloudflare Secretで管理

Cloudflare Secret
DISCORD_TRAINING_WEBHOOK_URL

Webhook URLはworker.jsやGitHubへ書かないでください。
このチャットにも貼り付けず、Cloudflareへ直接登録してください。

既存の管理ログイン、予約管理、受講済み履歴、教官ランキング、
進捗表、修了印、Discord OAuth、GitHub ZIP更新機能を維持。
