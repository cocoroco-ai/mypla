-- =====================================================================
-- mypla. 初期設定（001）
-- 実行場所: Supabase の管理画面 → SQL Editor → このファイルの中身を全部貼る → Run
-- 何をするか:
--   1. 保存情報の表（items）と、元画像の表（item_images）を作る
--   2. RLS（行ごとの鍵）で「ログインした本人の行だけ」読み書きできるようにする
--   3. 元画像の保管庫（Storage の item-images、非公開）を作り、本人のフォルダだけ使えるようにする
-- ※ 一度実行したら、このファイルは書き換えない。変更は 002_… の新しいファイルで行う
-- =====================================================================

-- 文字の部分一致検索を速くする拡張機能（日本語のキーワード検索用）
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- 1. 保存情報の表
-- ---------------------------------------------------------------------
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title          text not null default '',
  ocr_text       text not null default '',          -- 読み取ったままの文章（OCR結果）
  edited_text    text,                              -- 手直しした文章（直していなければ空 = null）
  memo           text not null default '',          -- ひとことメモ
  ai_allowed     boolean not null default false,    -- 外部AIへの送信を許可するか（初期値: 送らない）
  source_type    text not null default 'screenshot',
  ocr_engine     text,                              -- 例: tesseract.js
  ocr_confidence integer,                           -- 読み取りの確からしさ（0〜100）
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz                        -- ゴミ箱に入れた日時（null = ゴミ箱ではない）
);

comment on table public.items is 'mypla. の保存情報（1行 = 1件）';

-- 一覧表示（新しい順・ゴミ箱以外）を速くする
create index items_user_created_idx on public.items (user_id, created_at desc) where deleted_at is null;

-- キーワード検索を速くする（タイトル・文章・メモをまとめて部分一致）
create index items_search_idx on public.items
  using gin ((title || ' ' || ocr_text || ' ' || coalesce(edited_text, '') || ' ' || memo) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 2. 元画像の表（1件に複数枚を付けられる）
-- ---------------------------------------------------------------------
create table public.item_images (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position     integer not null default 0,          -- 並び順
  storage_path text not null,                       -- 保管庫の中の場所（例: <user_id>/<item_id>/1.webp）
  mime         text,
  bytes        integer,
  width        integer,
  height       integer,
  regions      jsonb,                               -- 指で囲んだ範囲（割合 0〜1）。全体を読んだときは null
  created_at   timestamptz not null default now()
);

create index item_images_item_idx on public.item_images (item_id, position);

-- ---------------------------------------------------------------------
-- 3. 更新日時を自動で入れる
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. RLS（行ごとの鍵）: ログインした本人の行だけ
-- ---------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.item_images enable row level security;

create policy "本人だけ見られる" on public.items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "本人だけ追加できる" on public.items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "本人だけ変更できる" on public.items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "本人だけ削除できる" on public.items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "本人だけ見られる" on public.item_images
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "本人だけ追加できる" on public.item_images
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
  );
create policy "本人だけ変更できる" on public.item_images
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "本人だけ削除できる" on public.item_images
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 5. 元画像の保管庫（非公開）。「自分の user_id のフォルダ」だけ使える
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-images', 'item-images', false, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "本人のフォルダだけ見られる" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "本人のフォルダだけ追加できる" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "本人のフォルダだけ変更できる" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "本人のフォルダだけ削除できる" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 完了の目印（Run の結果欄にこの1行が出れば成功）
select 'mypla. 初期設定 001 が完了しました' as result;
