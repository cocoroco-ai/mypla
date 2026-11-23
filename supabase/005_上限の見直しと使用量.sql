-- =====================================================================
-- mypla. 005：上限の見直し（無料枠の前提）と、無料枠の使用量の確認
--   ・記事の上限：お試し 30件／招待した人 300件／unlimited_users の人 なし（変更：100件 → 300件）
--   ・画像の上限（1件に複数枚を付けられるようにするため、件数とは別に決める）：
--       お試し 60枚／招待した人 400枚／unlimited_users の人 なし
--   ・管理者だけ：画像の保管場所とデータベースの使用量を見られる（ホームに表示）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

create or replace function public.item_limit_for(uid uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.unlimited_users u where u.user_id = uid) then null
    when coalesce((select a.is_anonymous from auth.users a where a.id = uid), true) then 30
    else 300
  end;
$$;
revoke all on function public.item_limit_for(uuid) from public, anon, authenticated;

create or replace function public.image_limit_for(uid uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select case
    when exists (select 1 from public.unlimited_users u where u.user_id = uid) then null
    when coalesce((select a.is_anonymous from auth.users a where a.id = uid), true) then 60
    else 400
  end;
$$;
revoke all on function public.image_limit_for(uuid) from public, anon, authenticated;

create or replace function public.can_upload_image()
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.image_limit_for(auth.uid()) is null
      or (
        select count(*) from storage.objects o
        where o.bucket_id = 'item-images'
          and (storage.foldername(o.name))[1] = auth.uid()::text
      ) < public.image_limit_for(auth.uid());
$$;

-- 自分の画像の上限と使っている枚数（上限なしなら limit は null）
create or replace function public.my_image_quota()
returns table (image_limit integer, images_used bigint)
language sql stable security definer set search_path = ''
as $$
  select public.image_limit_for(auth.uid()),
         (select count(*) from storage.objects o
          where o.bucket_id = 'item-images'
            and (storage.foldername(o.name))[1] = auth.uid()::text);
$$;
revoke all on function public.my_image_quota() from public, anon;
grant execute on function public.my_image_quota() to authenticated;

-- 管理者だけ：無料枠の使用量（画像の保管場所の合計バイト数・データベースの大きさ・利用者数）
create or replace function public.usage_summary()
returns table (storage_bytes bigint, database_bytes bigint, users_total bigint, guests_total bigint, images_total bigint)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o), 0),
    pg_database_size(current_database()),
    (select count(*) from auth.users),
    (select count(*) from auth.users where is_anonymous),
    (select count(*) from storage.objects o where o.bucket_id = 'item-images')
  where public.is_admin();
$$;
revoke all on function public.usage_summary() from public, anon;
grant execute on function public.usage_summary() to authenticated;

-- 完了の目印
select 'mypla. 005 が完了しました' as result,
       (select storage_bytes from public.usage_summary()) as storage_bytes_if_admin;
