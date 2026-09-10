LOMITA POLICE Training Reservation - Version 2.08 Diagnostic

予約一覧APIの原因特定用・読み取り専用診断版。

診断順:
1. DB binding
2. 管理者認証
3. reservations 単体読み取り
4. trainings LEFT JOIN
5. JOIN失敗時は reservations 単体で一覧返却

画面表示:
エラー時は既存UIの赤枠に
【診断:STAGE】 実際のエラー内容
を表示します。

例:
【診断:DB_BINDING】 ...
【診断:ADMIN_AUTH】 ...
【診断:RESERVATIONS_READ】 ...
【診断:TRAININGS_JOIN】 ...
【診断:UNHANDLED】 ...

安全性:
- DELETEなし
- UPDATEなし
- ALTER TABLEなし
- 期限超過処理なし
- 予約/履歴/進捗を変更しない
- HTML表示バージョンを 2.08 に同期

wrangler.jsonc の main は worker-hotfix.js のままです。
