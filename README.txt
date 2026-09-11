LOMITA POLICE Training Reservation - Version 2.09 D1 Saver

目的:
Cloudflare D1 Free Tier の daily row read limit 超過を起こしにくくする。

主な変更:
- /api/admin/reservation-control は既存coreの重い処理を通さず直接取得
- 対応が必要な予約は最大80件
- 受講済み履歴は直近20件のみ
- reservations(status,id) インデックスを自動作成
- reservations(training_id) インデックスを自動作成
- /api/admin/stats / trainees / surveys は60秒短期キャッシュ
- 同じ画面で更新を連打してもD1再読込を減らす
- 予約一覧取得時に期限超過処理・ensure系の連続処理を実行しない
- HTML表示バージョンを2.09に同期

重要:
D1の日次上限をすでに使い切っている日は、リセットされるまでD1読み取り自体は失敗します。
この版は「次のリセット以降、再び上限を使い切りにくくする」ための節約版です。

データ:
- 予約削除なし
- 履歴削除なし
- 研修生進捗削除なし
