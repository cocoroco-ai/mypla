-- =====================================================================
-- mypla. 012：最後に書き出し（バックアップ）した日時を、人ごとに覚えておく
--   ホームのお知らせ欄で「そろそろ書き出しを」と声をかけるために使う。
--   端末ではなく Supabase に記録するので、iPhone で書き出せばパソコンでも声かけが止まる
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

create table if not exists public.user_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  last_backup_at timestamptz,
  updated_at     timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists "本人だけ見られる" on public.user_settings;
create policy "本人だけ見られる" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "本人だけ追加できる" on public.user_settings;
create policy "本人だけ追加できる" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ変更できる" on public.user_settings;
create policy "本人だけ変更できる" on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.user_settings to authenticated;

select 'mypla. 012 が完了しました' as result,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'user_settings') as new_table;
