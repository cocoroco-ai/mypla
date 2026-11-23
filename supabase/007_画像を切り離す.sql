-- =====================================================================
-- mypla. 007：記事の中の1枚を、別の記事として切り離す
--   画像1枚を新しい記事（文章なし＝整理待ち）に移す。元の記事の画像は並び順を詰め直す。
--   security invoker なので、行ごとの鍵（RLS）がそのまま効く＝自分の画像しか動かせない。
--   新しい記事を作るので、保存数の上限にも数えられる
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

create or replace function public.split_image(image_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_item uuid;
  new_item uuid;
begin
  select im.item_id into old_item from public.item_images im where im.id = image_id;
  if old_item is null then
    raise exception '画像が見つかりません';
  end if;
  if (select count(*) from public.item_images im where im.item_id = old_item) < 2 then
    raise exception '画像が1枚だけの記事からは切り離せません';
  end if;

  insert into public.items (title, ocr_text)
  values ('画像のみ（切り離した画像）', '')
  returning id into new_item;

  update public.item_images set item_id = new_item, position = 0 where id = image_id;

  -- 元の記事の画像を 0,1,2… に詰め直す
  with ordered as (
    select im.id, row_number() over (order by im.position) - 1 as pos
    from public.item_images im where im.item_id = old_item
  )
  update public.item_images im set position = o.pos from ordered o where im.id = o.id;

  return new_item;
end;
$$;
revoke all on function public.split_image(uuid) from public, anon;
grant execute on function public.split_image(uuid) to authenticated;

select 'mypla. 007 が完了しました' as result;
