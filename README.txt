LOMITA POLICE Training Reservation - Version 1.92

アンケート回答不能のランタイム不具合を修正

原因
- アンケートAPIが存在しない requireTrainee() を呼んでいた
- Worker内で実際に使っているログイン判定は getTraineeSession(request, env)
- そのためアンケートの取得・送信だけサーバーエラーになっていた

修正
- GET /api/trainee/surveys/pending を getTraineeSession(request, env) に統一
- POST /api/trainee/surveys を getTraineeSession(request, env) に統一
- API読み込み失敗時に「0件」と誤表示せずエラー表示
- 保存失敗時に原因を確認できるdetailを返す
- 1研修1回答、既修了認定除外、管理画面アンケート結果は維持

Version 1.91までの現在研修判定修正・コンパクトUI・Discord通知なども維持
