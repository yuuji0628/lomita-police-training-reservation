-- 既存データを残したまま追加します
ALTER TABLE trainings ADD COLUMN category TEXT DEFAULT '基礎研修';
ALTER TABLE reservations ADD COLUMN discord_id TEXT DEFAULT '';

-- 既存の予約済みデータはそのまま reserved で維持されます。
