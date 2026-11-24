-- =====================================================================
-- mypla. 014：AI図鑑
--   1. AIごとのカード（ai_cards）：名前・公式リンク・得意なこと。1人50枚まで
--   2. 記事を「どのAIの話か」でカードにひもづける（items.ai_card_id）
--      カードを消しても記事は消えない（ひもづけだけ外れる）
--   3. 棚の見た目に「AI図鑑」（ai）を加え、最初からある「AI図鑑」の棚をこの見た目にする
--   4. 主要AI 5枚のカードを、一人1回だけ用意する（消したら作り直さない）
-- 何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. AIカードの表 ---------------------------------------------------------------
create table if not exists public.ai_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  url        text not null default '' check (url = '' or (url ~* '^https?://' and char_length(url) <= 2000)),
  strength   text not null default '' check (char_length(strength) <= 300),  -- 得意なこと
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists ai_cards_user_idx on public.ai_cards (user_id, sort_order);

alter table public.ai_cards enable row level security;
drop policy if exists "本人だけ見られる" on public.ai_cards;
create policy "本人だけ見られる" on public.ai_cards for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "本人だけ追加できる" on public.ai_cards;
create policy "本人だけ追加できる" on public.ai_cards for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ変更できる" on public.ai_cards;
create policy "本人だけ変更できる" on public.ai_cards for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ削除できる" on public.ai_cards;
create policy "本人だけ削除できる" on public.ai_cards for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.ai_cards to authenticated;

-- 1人50枚まで
create or replace function public.check_ai_card_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('ai_card:' || new.user_id::text));
  if (select count(*) from public.ai_cards c where c.user_id = new.user_id) >= 50 then
    raise exception 'MYPLA_AI_CARD_LIMIT: AIカードは50枚までです';
  end if;
  return new;
end;
$$;
drop trigger if exists ai_cards_check_limit on public.ai_cards;
create trigger ai_cards_check_limit before insert on public.ai_cards
  for each row execute function public.check_ai_card_limit();

-- 2. 記事のひもづけ -------------------------------------------------------------
alter table public.items add column if not exists ai_card_id uuid;
alter table public.items drop constraint if exists items_ai_card_fk;
alter table public.items add constraint items_ai_card_fk
  foreign key (ai_card_id, user_id) references public.ai_cards (id, user_id) on delete set null (ai_card_id);
create index if not exists items_user_ai_card_idx on public.items (user_id, ai_card_id, created_at desc)
  where deleted_at is null and ai_card_id is not null;

-- 3. 棚の見た目 -----------------------------------------------------------------
alter table public.shelves drop constraint if exists shelves_style_check;
alter table public.shelves add constraint shelves_style_check
  check (style in ('list', 'cards', 'photos', 'ai'));
update public.shelves set style = 'ai' where legacy_key = 'ai' and style = 'list';

-- 4. 主要AIのカードを用意したかどうか ---------------------------------------------
alter table public.shelf_setup add column if not exists ai_cards_added boolean not null default false;

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
      (uid, 'AI図鑑',       '🤖', 'ai',    2, 'ai'),
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

select 'mypla. 014 が完了しました' as result,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'ai_cards') as new_table,
       (select count(*) from public.shelves where style = 'ai') as ai_shelves;
