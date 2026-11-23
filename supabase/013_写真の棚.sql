-- =====================================================================
-- mypla. 013：写真の棚
--   1. 棚の見た目に「写真」（photos：正方形の写真を3列に並べる）を加える
--   2. 記事の種類に「写真」（photo：文字にする前提ではない。整理待ちに数えない）を加える
--   3. 「📷 写真」の棚を、一人1回だけ自動で用意する（今使っている人にも。消したら作り直さない）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. 棚の見た目
alter table public.shelves drop constraint if exists shelves_style_check;
alter table public.shelves add constraint shelves_style_check
  check (style in ('list', 'cards', 'photos'));

-- 2. 記事の種類
alter table public.items drop constraint if exists items_source_type_check;
alter table public.items add constraint items_source_type_check
  check (source_type in ('screenshot', 'note', 'photo'));

-- 3. 写真の棚を用意したかどうかの記録
alter table public.shelf_setup add column if not exists photos_added boolean not null default false;

-- 009 の関数を作り直す：最初の4棚（初回だけ）＋ 写真の棚（一人1回だけ）
create or replace function public.ensure_default_shelves()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  insert into public.shelf_setup (user_id) values (uid) on conflict (user_id) do nothing;
  if found then
    insert into public.shelves (user_id, name, icon, style, sort_order, legacy_key) values
      (uid, 'ことばの宝箱', '💎', 'cards', 1, 'kotoba'),
      (uid, 'AI図鑑',       '🤖', 'list',  2, 'ai'),
      (uid, '学びノート',   '📘', 'list',  3, 'learn'),
      (uid, 'アイデア帳',   '💡', 'list',  4, 'idea');

    -- 008 の棚に置いてあった記事を、新しい棚に移す
    update public.items i set shelf_id = s.id
    from public.shelves s
    where i.user_id = uid and s.user_id = uid and i.shelf = s.legacy_key and i.shelf_id is null;
  end if;

  -- 写真の棚（まだ用意していない人だけ。棚が20個に達していたら作らない）
  update public.shelf_setup set photos_added = true where user_id = uid and not photos_added;
  if found
     and not exists (select 1 from public.shelves s where s.user_id = uid and s.style = 'photos')
     and (select count(*) from public.shelves s where s.user_id = uid) < 20 then
    insert into public.shelves (user_id, name, icon, style, sort_order)
    values (uid, '写真', '📷', 'photos',
            coalesce((select max(s.sort_order) from public.shelves s where s.user_id = uid), 0) + 1);
  end if;
end;
$$;
revoke all on function public.ensure_default_shelves() from public, anon;
grant execute on function public.ensure_default_shelves() to authenticated;

select 'mypla. 013 が完了しました' as result,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'shelf_setup' and column_name = 'photos_added') as new_column;
