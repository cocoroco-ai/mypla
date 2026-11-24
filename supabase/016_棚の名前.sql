-- =====================================================================
-- mypla. 016：最初からある棚の名前を新しくする（2026-11-26 提出版）
--   AI図鑑 → AIラボ ／ アイデア帳 → アイデアの種 ／ 写真 → フォトギャラリー
--   ・名前を最初のまま使っている棚だけ変える（自分で名前を変えた棚はそのまま）
--   ・棚の中の記事・並び順・アイコン・見た目（内部の識別子）は変えない
--   ・これから始める人にも、新しい名前で棚を用意する
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 同じ名前の棚をすでに自分で作っている人は、重ならないよう変えない
update public.shelves s set name = 'AIラボ'
 where s.legacy_key = 'ai' and s.name = 'AI図鑑'
   and not exists (select 1 from public.shelves x where x.user_id = s.user_id and x.name = 'AIラボ');
update public.shelves s set name = 'アイデアの種'
 where s.legacy_key = 'idea' and s.name = 'アイデア帳'
   and not exists (select 1 from public.shelves x where x.user_id = s.user_id and x.name = 'アイデアの種');
update public.shelves s set name = 'フォトギャラリー'
 where s.style = 'photos' and s.name = '写真' and s.icon = '📷'
   and not exists (select 1 from public.shelves x where x.user_id = s.user_id and x.name = 'フォトギャラリー');

-- これから始める人の最初の棚（名前だけ 015 から変更）
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
      (uid, 'アイデアの種', '💡', 'list',  4, 'idea');

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

select 'mypla. 016 が完了しました' as result,
       (select count(*) from public.shelves where name = 'AIラボ')           as ai_lab,
       (select count(*) from public.shelves where name = 'アイデアの種')     as idea_seed,
       (select count(*) from public.shelves where name = 'フォトギャラリー') as photo_gallery;
