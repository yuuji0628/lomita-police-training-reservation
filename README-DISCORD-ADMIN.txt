Discordログイン＋手動承認版 管理者認証

【初期設定】
1. Cloudflare Worker の Secret に DISCORD_CLIENT_SECRET を設定。既存のDiscordログインで設定済みなら再設定不要。
2. DISCORD_CLIENT_ID は wrangler.jsonc に設定済み（使用するDiscordアプリのIDと一致すること）。
3. Discord Developer Portal → OAuth2 → Redirects に、公開URLの /admin/discord/callback を登録。
   例: https://<Workerの公開ホスト>/admin/discord/callback
4. 現在のD1データベースをバックアップしてからデプロイ。テーブルは初回利用時に追加されます。

【初回システム管理者】
Discordでログイン → 従来の共通管理パスワードを一度だけ入力 → 管理者として登録 → Discordで再ログイン。
※すでに有効なシステム管理者がいる場合は、初回登録できません。既存の管理者IDでログインし、Discordログイン後の承認待ちアカウントを有効化してください。

【一般管理者】
Discordでログイン → 承認待ち → システム管理者が「管理者アカウント管理」で「承認・有効化」を押す → Discordで再ログイン。
退職時は「利用停止」で既存セッションも即時無効化されます。

【注意】
DiscordユーザーIDを基準に紐付けるため、表示名変更では別アカウントになりません。
Discordアプリ設定・実際のCloudflare環境での動作確認は未実施です。
既存のID/パスワード認証は移行用として残しています。
