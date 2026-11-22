-- =====================================================================
-- mypla. 003：お試し利用（登録なし）と、保存数の上限
--   ・上限なしで使える人（管理者）の表 unlimited_users を作り、管理者を1人登録
--   ・それ以外の人（お試しの人・招待した人）は、1人30件まで（ゴミ箱の中も数える）
--   ・画像の保管庫も、1人40枚まで・1枚5MBまで
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. 上限なしで使える人の表 ------------------------------------------------
create table if not exists public.unlimited_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.unlimited_users enable row level security;
-- アプリからは読み書きさせない（管理画面の SQL からだけ変更する）

-- 管理者（mypla. を作った本人）を登録
insert into public.unlimited_users (user_id, note)
values ('5a2650e6-4c05-44aa-b619-9a7f174fdd42', '管理者')
on conflict (user_id) do nothing;

-- 2. 上限の数 --------------------------------------------------------------
-- 自分の保存上限を返す（上限なしの人は null）。アプリの「残り○件」の表示に使う
create or replace function public.my_item_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.unlimited_users u where u.user_id = auth.uid()) then null
    else 30
  end;
$$;
revoke all on function public.my_item_limit() from public, anon;
grant execute on function public.my_item_limit() to authenticated;

-- 3. 保存するときに上限を確かめる -----------------------------------------
create or replace function public.check_item_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_items integer;
  used      integer;
begin
  if exists (select 1 from public.unlimited_users u where u.user_id = new.user_id) then
    return new;
  end if;
  max_items := 30;
  -- 同じ人が同時に保存しても上限を超えないよう、その人の分だけ順番待ちにする
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  select count(*) into used from public.items i where i.user_id = new.user_id;
  if used >= max_items then
    raise exception 'MYPLA_LIMIT: 保存できるのは % 件までです', max_items;
  end if;
  return new;
end;
$$;

drop trigger if exists items_check_limit on public.items;
create trigger items_check_limit
  before insert on public.items
  for each row execute function public.check_item_limit();

-- 4. 画像の保管庫：1人40枚まで・1枚5MBまで ---------------------------------
create or replace function public.can_upload_image()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.unlimited_users u where u.user_id = auth.uid())
      or (
        select count(*) from storage.objects o
        where o.bucket_id = 'item-images'
          and (storage.foldername(o.name))[1] = auth.uid()::text
      ) < 40;
$$;
revoke all on function public.can_upload_image() from public, anon;
grant execute on function public.can_upload_image() to authenticated;

drop policy if exists "本人のフォルダだけ追加できる" on storage.objects;
create policy "本人のフォルダだけ追加できる" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can_upload_image())
  );

update storage.buckets set file_size_limit = 5242880 where id = 'item-images';

-- 完了の目印（下の結果欄に 1行出れば成功。admin_count が 1 なら管理者の登録もできている）
select 'mypla. 003 が完了しました' as result,
       (select count(*) from public.unlimited_users) as admin_count,
       (select file_size_limit from storage.buckets where id = 'item-images') as file_size_limit;
