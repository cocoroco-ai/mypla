-- =====================================================================
-- mypla. 009：棚を自分で作れるようにする
--   ・shelves 表：人ごとの棚（名前・アイコン・見た目・並び順）。1人20個まで
--   ・items.shelf_id：置いてある棚（1つの記事は1つの棚だけ。null = ライブラリーだけ）
--     棚を削除すると、中の記事はライブラリーだけに戻る（記事は消えない）
--   ・最初の1回だけ、今までの4つの棚（ことばの宝箱など）を作り、008 の shelf の値を移す
--     （ensure_default_shelves をアプリが開いたときに呼ぶ）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. 棚の表 -------------------------------------------------------------------
create table if not exists public.shelves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  icon       text not null default '📁' check (char_length(icon) between 1 and 8),
  style      text not null default 'list' check (style in ('list', 'cards')),  -- 一覧 / 言葉のカード
  sort_order integer not null default 0,
  legacy_key text,                                                           -- 008 の棚から移したもの
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists shelves_user_idx on public.shelves (user_id, sort_order);

alter table public.shelves enable row level security;
drop policy if exists "本人だけ見られる" on public.shelves;
create policy "本人だけ見られる" on public.shelves for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "本人だけ追加できる" on public.shelves;
create policy "本人だけ追加できる" on public.shelves for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ変更できる" on public.shelves;
create policy "本人だけ変更できる" on public.shelves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ削除できる" on public.shelves;
create policy "本人だけ削除できる" on public.shelves for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.shelves to authenticated;

-- 1人20個まで
create or replace function public.check_shelf_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('shelf:' || new.user_id::text));
  if (select count(*) from public.shelves s where s.user_id = new.user_id) >= 20 then
    raise exception 'MYPLA_SHELF_LIMIT: 棚は20個までです';
  end if;
  return new;
end;
$$;
drop trigger if exists shelves_check_limit on public.shelves;
create trigger shelves_check_limit before insert on public.shelves
  for each row execute function public.check_shelf_limit();

-- 2. 記事の棚 -----------------------------------------------------------------
alter table public.items add column if not exists shelf_id uuid;
alter table public.items drop constraint if exists items_shelf_fk;
-- 自分の棚にしか置けない。棚を消したら shelf_id だけ空に戻す（記事は消えない）
alter table public.items add constraint items_shelf_fk
  foreign key (shelf_id, user_id) references public.shelves (id, user_id) on delete set null (shelf_id);
create index if not exists items_user_shelf_id_idx on public.items (user_id, shelf_id, created_at desc)
  where deleted_at is null and shelf_id is not null;

-- 3. 最初の4つの棚（1人1回だけ） ----------------------------------------------
create table if not exists public.shelf_setup (
  user_id uuid primary key references auth.users (id) on delete cascade,
  done_at timestamptz not null default now()
);
alter table public.shelf_setup enable row level security;  -- アプリからは直接さわらない

create or replace function public.ensure_default_shelves()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  insert into public.shelf_setup (user_id) values (uid) on conflict (user_id) do nothing;
  if not found then return; end if;  -- もう済んでいる

  insert into public.shelves (user_id, name, icon, style, sort_order, legacy_key) values
    (uid, 'ことばの宝箱', '💎', 'cards', 1, 'kotoba'),
    (uid, 'AI図鑑',       '🤖', 'list',  2, 'ai'),
    (uid, '学びノート',   '📘', 'list',  3, 'learn'),
    (uid, 'アイデア帳',   '💡', 'list',  4, 'idea');

  -- 008 の棚に置いてあった記事を、新しい棚に移す
  update public.items i set shelf_id = s.id
  from public.shelves s
  where i.user_id = uid and s.user_id = uid and i.shelf = s.legacy_key and i.shelf_id is null;
end;
$$;
revoke all on function public.ensure_default_shelves() from public, anon;
grant execute on function public.ensure_default_shelves() to authenticated;

select 'mypla. 009 が完了しました' as result,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('shelves', 'shelf_setup')) as new_tables;
