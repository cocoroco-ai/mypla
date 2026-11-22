-- =====================================================================
-- mypla. 004：保存上限の段階分け と お試しアカウントの自動片付け
--   ・上限：管理者など unlimited_users の人 = なし／招待した人 = 100件／お試しの人 = 30件
--     （画像は「上限 + 10枚」まで）
--   ・30日使われていないお試しアカウントは、管理者がアプリを開いたときに画像ごと削除する
--     （画像の削除は Storage の窓口経由が必須なので、管理者のアプリから行う。秘密の鍵は使わない）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. 管理者の印 -------------------------------------------------------------
alter table public.unlimited_users add column if not exists is_admin boolean not null default false;
update public.unlimited_users set is_admin = true where user_id = '5a2650e6-4c05-44aa-b619-9a7f174fdd42';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.unlimited_users u where u.user_id = auth.uid() and u.is_admin);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2. 上限の数（人によって変える） --------------------------------------------
create or replace function public.item_limit_for(uid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.unlimited_users u where u.user_id = uid) then null
    when coalesce((select a.is_anonymous from auth.users a where a.id = uid), true) then 30
    else 100
  end;
$$;
revoke all on function public.item_limit_for(uuid) from public, anon, authenticated;

create or replace function public.my_item_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.item_limit_for(auth.uid());
$$;
revoke all on function public.my_item_limit() from public, anon;
grant execute on function public.my_item_limit() to authenticated;

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
  max_items := public.item_limit_for(new.user_id);
  if max_items is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  select count(*) into used from public.items i where i.user_id = new.user_id;
  if used >= max_items then
    raise exception 'MYPLA_LIMIT: 保存できるのは % 件までです', max_items;
  end if;
  return new;
end;
$$;

create or replace function public.can_upload_image()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.item_limit_for(auth.uid()) is null
      or (
        select count(*) from storage.objects o
        where o.bucket_id = 'item-images'
          and (storage.foldername(o.name))[1] = auth.uid()::text
      ) < public.item_limit_for(auth.uid()) + 10;
$$;

-- 3. 30日使われていないお試しアカウント --------------------------------------
create or replace function public.expired_guest_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous
    and greatest(
          u.created_at,
          coalesce(u.last_sign_in_at, u.created_at),
          coalesce(u.updated_at, u.created_at),
          coalesce((select max(s.updated_at) from auth.sessions s where s.user_id = u.id), u.created_at),
          coalesce((select max(i.updated_at) from public.items i where i.user_id = u.id), u.created_at)
        ) < now() - interval '30 days';
$$;
revoke all on function public.expired_guest_ids() from public, anon, authenticated;

create or replace function public.is_expired_guest_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.expired_guest_ids() g where g::text = folder);
$$;
revoke all on function public.is_expired_guest_folder(text) from public, anon;
grant execute on function public.is_expired_guest_folder(text) to authenticated;

-- 管理者だけ：片付け対象の画像の場所（一度に最大500件）
create or replace function public.expired_guest_files()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where public.is_admin()
    and o.bucket_id = 'item-images'
    and (storage.foldername(o.name))[1] in (select g::text from public.expired_guest_ids() g)
  limit 500;
$$;
revoke all on function public.expired_guest_files() from public, anon;
grant execute on function public.expired_guest_files() to authenticated;

-- 管理者だけ：画像が残っていない期限切れのお試しアカウントを削除（文章などは一緒に消える）。消した人数を返す
create or replace function public.delete_expired_guests()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not public.is_admin() then
    return 0;
  end if;
  with targets as (
    select g as id from public.expired_guest_ids() g
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'item-images' and (storage.foldername(o.name))[1] = g::text
    )
  ), deleted as (
    delete from auth.users u using targets t where u.id = t.id and u.is_anonymous returning u.id
  )
  select count(*) into removed from deleted;
  return removed;
end;
$$;
revoke all on function public.delete_expired_guests() from public, anon;
grant execute on function public.delete_expired_guests() to authenticated;

-- 管理者は、期限切れのお試しアカウントの画像だけ見て消せる
drop policy if exists "管理者は期限切れのお試しの画像を見られる" on storage.objects;
create policy "管理者は期限切れのお試しの画像を見られる" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'item-images'
    and (select public.is_admin())
    and public.is_expired_guest_folder((storage.foldername(name))[1])
  );
drop policy if exists "管理者は期限切れのお試しの画像を消せる" on storage.objects;
create policy "管理者は期限切れのお試しの画像を消せる" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'item-images'
    and (select public.is_admin())
    and public.is_expired_guest_folder((storage.foldername(name))[1])
  );

-- 完了の目印
select 'mypla. 004 が完了しました' as result,
       (select count(*) from public.unlimited_users where is_admin) as admin_count,
       (select count(*) from public.expired_guest_ids()) as expired_guests_now;
