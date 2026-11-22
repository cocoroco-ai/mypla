-- 001_初期設定 がすべて作られているかを確認する（読むだけ。何も変更しない）
-- 実行場所: SQL Editor に貼って Run。何回実行しても大丈夫
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('items', 'item_images'))
    as "表_2なら正常",
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('items', 'item_images') and rowsecurity)
    as "鍵ありの表_2なら正常",
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('items', 'item_images'))
    as "表の鍵ルール_8なら正常",
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '本人のフォルダだけ%')
    as "保管庫の鍵ルール_4なら正常",
  (select count(*) from storage.buckets where id = 'item-images')
    as "保管庫_1なら正常",
  (select count(*) from pg_trigger where tgname = 'items_set_updated_at')
    as "更新日時_1なら正常",
  (select count(*) from pg_indexes where schemaname = 'public'
     and indexname in ('items_user_created_idx', 'items_search_idx', 'item_images_item_idx'))
    as "索引_3なら正常";
