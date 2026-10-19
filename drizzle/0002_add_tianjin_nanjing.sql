INSERT INTO records (id, owner_id, city_code, date, title, flower, meaning, story, deleted_at, created_at, updated_at, version, write_token)
SELECT '7d06e499-3101-4626-9c24-d9e72e8dffac', value, '120000', '2026-09-27', '天津', '', '', '', NULL, '2026-09-27T12:00:00.000Z', '2026-09-27T12:00:00.000Z', 1, 'b1dcea33-b6e8-4318-9f8e-41550ad25d54'
FROM journal_settings WHERE key = 'owner_id'
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
INSERT INTO records (id, owner_id, city_code, date, title, flower, meaning, story, deleted_at, created_at, updated_at, version, write_token)
SELECT '3b4af4a4-4f31-45d5-b593-ac16cceca8f0', value, '320100', '2026-10-17', '南京', '', '', '', NULL, '2026-10-17T12:00:00.000Z', '2026-10-17T12:00:00.000Z', 1, 'ef2b9f3c-3411-4b2a-9223-e1feb883a7d1'
FROM journal_settings WHERE key = 'owner_id'
ON CONFLICT(id) DO NOTHING;
