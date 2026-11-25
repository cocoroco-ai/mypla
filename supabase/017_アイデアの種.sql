-- =====================================================================
-- mypla. 017：アイデアの種
--   1. 育ち具合（items.idea_status）：seed＝種（思いついた）/ sprout＝芽（考え中）/ flower＝花（やってみた）
--   2. 棚の見た目に「アイデアの種」（idea）を加え、最初からある「アイデアの種」の棚をこの見た目にする
--      （名前を自分で変えた棚も、最初からあったアイデアの棚なら見た目だけ変える。名前・中身は変えない）
-- 今ある記事・棚の中身は消さない。何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. 育ち具合（初めは「種」） --------------------------------------------------
alter table public.items add column if not exists idea_status text not null default 'seed';
alter table public.items drop constraint if exists items_idea_status_check;
alter table public.items add constraint items_idea_status_check check (idea_status in ('seed', 'sprout', 'flower'));

-- 2. 棚の見た目 -----------------------------------------------------------------
alter table public.shelves drop constraint if exists shelves_style_check;
alter table public.shelves add constraint shelves_style_check
  check (style in ('list', 'cards', 'photos', 'ai', 'study', 'idea'));
update public.shelves set style = 'idea' where legacy_key = 'idea' and style = 'list';

-- これから始める人の「アイデアの種」の棚も、最初からこの見た目にする（ほかは 016 と同じ）
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
      (uid, 'AIラボ',       '🤖', 'ai',    2, 'ai'),
      (uid, '学びノート',   '📘', 'study', 3, 'learn'),
      (uid, 'アイデアの種', '💡', 'idea',  4, 'idea');

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
    values (uid, 'フォトギャラリー', '📷', 'photos',
            coalesce((select max(s.sort_order) from public.shelves s where s.user_id = uid), 0) + 1);
  end if;

  -- 主要AIのカード（一人1回だけ。すでにカードがある人には足さない）
  update public.shelf_setup set ai_cards_added = true where user_id = uid and not ai_cards_added;
  if found and not exists (select 1 from public.ai_cards c where c.user_id = uid) then
    insert into public.ai_cards (user_id, name, url, strength, sort_order) values
      (uid, 'ChatGPT',    'https://chatgpt.com',            '文章づくり・相談・アイデア出し・画像づくりまで、幅広くこなす', 1),
      (uid, 'Claude',     'https://claude.ai',              '長い文章を読む・書く・要約する。ていねいな文章やプログラミング', 2),
      (uid, 'Gemini',     'https://gemini.google.com',      'Google のサービス（検索・Gmail など）と連携した調べもの。画像づくり', 3),
      (uid, 'Copilot',    'https://copilot.microsoft.com',  'Word・Excel など Microsoft の製品と一緒に使う。Web検索', 4),
      (uid, 'Perplexity', 'https://www.perplexity.ai',      '出典（どこに書いてあったか）つきの調べもの', 5);
  end if;
end;
$$;
revoke all on function public.ensure_default_shelves() from public, anon;
grant execute on function public.ensure_default_shelves() to authenticated;

select 'mypla. 017 が完了しました' as result,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = 'idea_status') as new_column,
       (select count(*) from public.shelves where style = 'idea') as idea_shelves;
