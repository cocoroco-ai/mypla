-- =====================================================================
-- mypla. 011：お気に入り（★）
--   favorite：★を付けた記事（ホームの「★ お気に入り」とライブラリーの絞り込みで使う）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

alter table public.items add column if not exists favorite boolean not null default false;

create index if not exists items_user_favorite_idx on public.items (user_id, updated_at desc)
  where deleted_at is null and favorite;

select 'mypla. 011 が完了しました' as result,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'items' and column_name = 'favorite') as favorite_column;
