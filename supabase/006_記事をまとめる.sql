-- =====================================================================
-- mypla. 006：保存済みの記事を1つにまとめる
--   ids の順（アプリが古い順に並べて渡す）に、画像・文章・メモをつなげて ids[1] の記事にまとめ、
--   残りの記事は削除する。途中で失敗したら全部元のまま（1回の処理で行う）。
--   security invoker なので、行ごとの鍵（RLS）がそのまま効く＝自分の記事しかまとめられない
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

create or replace function public.merge_items(ids uuid[], new_title text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target   uuid := ids[1];
  found    integer;
  any_edit boolean;
begin
  if array_length(ids, 1) is null or array_length(ids, 1) < 2 then
    raise exception 'まとめるには2件以上を選んでください';
  end if;

  -- 自分の記事で、ゴミ箱に入っていないものだけ（RLS で他人の記事は見えない）
  select count(*) into found from public.items i where i.id = any(ids) and i.deleted_at is null;
  if found <> array_length(ids, 1) then
    raise exception 'まとめられない記事が含まれています（削除済みなど）';
  end if;

  select bool_or(i.edited_text is not null) into any_edit from public.items i where i.id = any(ids);

  -- 文章・メモを、選んだ順につなげる
  update public.items t set
    title = coalesce(nullif(btrim(new_title), ''), t.title),
    ocr_text = coalesce((
      select string_agg(i.ocr_text, E'\n\n' order by array_position(ids, i.id))
      from public.items i where i.id = any(ids) and btrim(i.ocr_text) <> ''
    ), ''),
    edited_text = case when any_edit then coalesce((
      select string_agg(coalesce(i.edited_text, i.ocr_text), E'\n\n' order by array_position(ids, i.id))
      from public.items i where i.id = any(ids) and btrim(coalesce(i.edited_text, i.ocr_text)) <> ''
    ), '') else null end,
    memo = coalesce((
      select string_agg(i.memo, E'\n' order by array_position(ids, i.id))
      from public.items i where i.id = any(ids) and btrim(i.memo) <> ''
    ), '')
  where t.id = target;

  -- 画像を、選んだ順・それぞれの中の順に並べ直して、まとめ先の記事に移す
  with ordered as (
    select im.id, row_number() over (order by array_position(ids, im.item_id), im.position) - 1 as pos
    from public.item_images im
    where im.item_id = any(ids)
  )
  update public.item_images im set item_id = target, position = o.pos
  from ordered o where im.id = o.id;

  -- まとめ終わった残りの記事を削除（画像は移したので消えない）
  delete from public.items i where i.id = any(ids) and i.id <> target;

  return target;
end;
$$;
revoke all on function public.merge_items(uuid[], text) from public, anon;
grant execute on function public.merge_items(uuid[], text) to authenticated;

select 'mypla. 006 が完了しました' as result;
