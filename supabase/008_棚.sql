-- =====================================================================
-- mypla. 008：棚（ことばの宝箱・AI図鑑・学びノート・アイデア帳）
--   ・shelf：記事を置く棚（null = ライブラリーだけ）。ライブラリーには棚の記事も全部出る
--   ・source：誰の言葉・どこで見たか（主に、ことばの宝箱で使う）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

alter table public.items add column if not exists shelf text;
alter table public.items add column if not exists source text not null default '';

alter table public.items drop constraint if exists items_shelf_check;
alter table public.items add constraint items_shelf_check
  check (shelf is null or shelf in ('kotoba', 'ai', 'learn', 'idea'));

-- 棚ごとの一覧を速くする
create index if not exists items_user_shelf_idx on public.items (user_id, shelf, created_at desc)
  where deleted_at is null and shelf is not null;

select 'mypla. 008 が完了しました' as result,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'items' and column_name in ('shelf', 'source')) as new_columns;
