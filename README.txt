LOMITA POLICE Training Reservation - Version 1.52

修正
- 「研修が見つかりません」で申請できない問題を修正
- 原因: training_programs.training_id に、削除済み/存在しない trainings.id が残るケースがあった
- training_id がNULLだけでなく、存在しないIDを指している場合も自動修復
- 同名のtrainingがあれば再利用し、なければ自動生成して再リンク
- 研修進捗APIは実在する trainings とJOINできる項目だけ返す
- 万一古い画面から無効IDが送られた場合は、再読み込みを促す安全なエラーに変更

Version 1.51までの機能を維持
