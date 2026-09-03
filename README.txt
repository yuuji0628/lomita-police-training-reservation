LOMITA POLICE Training Reservation - Version 1.49

修正
- 「受講履歴を見る」で「研修履歴データを読み取れませんでした」となる問題を修正
- 研修履歴APIから環境差の出やすい trainings の補助列参照を削除
- 履歴取得を confirmed_date / completed_at / preferred_date ベースに統一
- API内部エラー時も必ずJSONで返却
- WorkerのHTMLエラー画面が返ってフロントがJSON解析失敗する問題を防止

Version 1.48の修了証デザインを維持
