LOMITA POLICE Training Reservation - Version 2.05 Recovery

予約一覧の取得失敗を復旧するための安全ラッパーです。

構成:
- worker-hotfix.js
- wrangler.jsonc
- README.txt

動作:
1. 通常は既存 worker.js (Version 2.04) をそのまま使用します。
2. /api/admin/reservation-control は既存処理を最初に実行します。
3. 既存処理が 5xx で失敗した場合だけ、安全な読み取り専用フォールバックで予約一覧を取得します。
4. フォールバックでは予約データの削除・初期化・期限超過更新を行いません。
5. 管理者認証は既存 worker.js 側で確認してから一覧を返します。

重要:
- worker.js 自体は上書きしません。
- wrangler.jsonc の main を worker-hotfix.js に変更します。
- 問題解消後も通常ルートはすべて既存 worker.js に委譲されます。
