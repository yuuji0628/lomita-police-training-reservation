LOMITA POLICE 研修管理システム Version 2.41

今回の修正
- 管理画面を開いた直後から「空き時間を登録」を表示
- 管理者セッション復元が遅い場合も自動再試行し、ページ更新なしで表示
- 教官 講師回数ランキングを修正
  - 修了(completed)を集計
  - 実際に受講して再受講(retake)になった研修も講師実績として集計
  - 既修了認定・欠席・承認待ち・予約中は除外
- 「受講済み履歴はありません。」のHTMLが文字として表示される不具合を修正
- 希望日時超過履歴の空表示も同様に修正

重要
- Cloudflare の main は worker-hotfix.js のままです
- 既存D1・Secrets・Variablesの変更は不要です

元README
----------------
LOMITA POLICE Training Reservation - Version 2.40

ログイン直後にD1ステータスが表示されない問題を修正。

- 管理者認証後にD1ステータスを再マウント
- 500ms間隔で最大20秒再試行
- DOM差し替えを監視
- pageshow / click 後も再確認
- JST欄生成後に自動挿入
- Version 2.39までの機能を維持

