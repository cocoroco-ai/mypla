-- =====================================================================
-- mypla. 010：記事にリンク（URL）を付けられるようにする
--   ・url：元のページや公式サイトなど（空 = なし）。http:// か https:// で始まるものだけ
--   ・ノート（文字だけの記事）は source_type = 'note' で区別する（列は 001 からある）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

alter table public.items add column if not exists url text not null default '';

alter table public.items drop constraint if exists items_url_check;
alter table public.items add constraint items_url_check
  check (url = '' or (char_length(url) <= 2000 and url ~* '^https?://'));

alter table public.items drop constraint if exists items_source_type_check;
alter table public.items add constraint items_source_type_check
  check (source_type in ('screenshot', 'note'));

select 'mypla. 010 が完了しました' as result,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'items' and column_name = 'url') as url_column;
