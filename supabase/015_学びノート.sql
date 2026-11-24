-- =====================================================================
-- mypla. 015：学びノート
--   1. 学びのテーマ（study_themes）：「Claude Code 講座」「本：○○」など。1人50個まで
--   2. 記事を テーマ にひもづける（items.study_theme_id）
--      テーマを消しても記事は消えない（ひもづけだけ外れる）
--   3. 覚えた印（items.study_status）：yet＝まだ / review＝復習中 / done＝身についた
--   4. 棚の見た目に「学びノート」（study）を加え、最初からある「学びノート」の棚をこの見た目にする
-- 今ある記事・棚の中身は消さない。何度実行しても同じ結果になる（やり直し可）
-- =====================================================================

-- 1. 学びのテーマの表 -----------------------------------------------------------
create table if not exists public.study_themes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists study_themes_user_idx on public.study_themes (user_id, sort_order);

alter table public.study_themes enable row level security;
drop policy if exists "本人だけ見られる" on public.study_themes;
create policy "本人だけ見られる" on public.study_themes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "本人だけ追加できる" on public.study_themes;
create policy "本人だけ追加できる" on public.study_themes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ変更できる" on public.study_themes;
create policy "本人だけ変更できる" on public.study_themes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "本人だけ削除できる" on public.study_themes;
create policy "本人だけ削除できる" on public.study_themes for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.study_themes to authenticated;

-- 1人50個まで
create or replace function public.check_study_theme_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('study_theme:' || new.user_id::text));
  if (select count(*) from public.study_themes t where t.user_id = new.user_id) >= 50 then
    raise exception 'MYPLA_STUDY_THEME_LIMIT: テーマは50個までです';
  end if;
  return new;
end;
$$;
drop trigger if exists study_themes_check_limit on public.study_themes;
create trigger study_themes_check_limit before insert on public.study_themes
  for each row execute function public.check_study_theme_limit();

-- 2. 記事のテーマ -----------------------------------------------------------------
alter table public.items add column if not exists study_theme_id uuid;
alter table public.items drop constraint if exists items_study_theme_fk;
alter table public.items add constraint items_study_theme_fk
  foreign key (study_theme_id, user_id) references public.study_themes (id, user_id) on delete set null (study_theme_id);
create index if not exists items_user_study_theme_idx on public.items (user_id, study_theme_id, created_at desc)
  where deleted_at is null and study_theme_id is not null;

-- 3. 覚えた印（初めは「まだ」） ----------------------------------------------------
alter table public.items add column if not exists study_status text not null default 'yet';
alter table public.items drop constraint if exists items_study_status_check;
alter table public.items add constraint items_study_status_check check (study_status in ('yet', 'review', 'done'));

-- 4. 棚の見た目 -----------------------------------------------------------------
alter table public.shelves drop constraint if exists shelves_style_check;
alter table public.shelves add constraint shelves_style_check
  check (style in ('list', 'cards', 'photos', 'ai', 'study'));
update public.shelves set style = 'study' where legacy_key = 'learn' and style = 'list';

-- これから始める人の「学びノート」の棚も、最初から学びノートの見た目にする（ほかは 014 と同じ）
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
      (uid, '学びノート',   '📘', 'study', 3, 'learn'),
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

select 'mypla. 015 が完了しました' as result,
       (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'study_themes') as new_table,
       (select count(*) from public.shelves where style = 'study') as study_shelves;
