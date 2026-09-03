LOMITA POLICE Training Reservation - Version 1.39

追加機能
- 研修当日の自動リマインドDM
  研修開始の2時間以内になったら研修生本人へ1回だけ送信
- 担当教官への事前DM
  同じタイミングで担当教官本人へ1回だけ送信
- 教官管理にDiscordユーザーID欄を追加
  各教官のDiscordユーザーIDを登録すると教官DMが有効

継続機能
- 前日20:00頃のリマインド
- 予約確定DM
- 受講済みDM
- 欠席DM
- 受講日表示
- Discord研修申請通知
- GitHub ZIP更新

Cloudflare Cron
0 * * * *
毎時チェックし、送信済みフラグで重複送信を防止します。

Bot Tokenは既存の DISCORD_BOT_TOKEN をそのまま使用します。
