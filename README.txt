LOMITA POLICE Training Reservation - Version 1.37

追加機能
1. 「受講済み」に変更・保存
   → 研修生本人へ「研修修了」Discord DM
2. 「欠席」に変更・保存
   → 研修生本人へ「欠席登録」Discord DM
3. 研修前日リマインド
   → 毎日20:00頃（日本時間）に翌日分の予約確定者へDiscord DM
   → 同じ予約には1回だけ送信
4. 予約確定DMはVersion 1.36のまま継続

Cloudflare Secret
- DISCORD_BOT_TOKEN（既存のままでOK）

Cloudflare Cron
- 0 11 * * *
- UTC 11:00 = 日本時間 20:00

安全設計
- DM送信失敗でも予約ステータス変更は成功
- リマインド送信成功時のみ reminder_sent_at を記録
- 既存の予約/研修/Discordログイン/GitHub更新機能は維持
