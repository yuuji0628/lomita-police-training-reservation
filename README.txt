LOMITA POLICE Training Reservation - Version 1.34

追加機能
- 研修申請Discord通知で「@学科講師」を自動メンション
- DiscordロールIDはCloudflare変数 DISCORD_TRAINING_ROLE_ID で管理
- Webhook URLは従来どおり DISCORD_TRAINING_WEBHOOK_URL
- 管理メニューでWebhook設定とロール設定を確認可能
- テスト通知でもロール設定済みなら自動メンション

Cloudflareへ追加する変数
Name: DISCORD_TRAINING_ROLE_ID
Type: Text
Value: Discordの「学科講師」ロールID

ロールIDは秘密情報ではありませんが、コードへ固定せずCloudflare変数で管理します。

Version 1.33までの
- Discord通知テスト
- 受講済み履歴
- 教官ランキング
- 管理ログイン
- ステータスボタン
- 研修進捗表 / 修了印
- Discord OAuth
- GitHub ZIP更新
を維持。
