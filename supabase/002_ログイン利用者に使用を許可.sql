-- =====================================================================
-- mypla. 追加設定（002）ログインした利用者に、表を使う許可を出す
-- 実行場所: Supabase の管理画面 → SQL Editor → このファイルの中身を全部貼る → Run
-- なぜ必要か:
--   このプロジェクトでは、新しく作った表に「アプリから使ってよい」という許可が
--   自動では付かない設定になっていた（接続テストで permission denied になった）。
--   ログインした人（authenticated）だけに許可を出す。ログインしていない人（anon）には出さない。
--   どの行を触れるかは、001 で作った「行ごとの鍵（RLS）」がこれまでどおり本人の行だけに絞る。
-- ※ 何回実行しても大丈夫（同じ許可を重ねて出しても変わらない）
-- =====================================================================

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.item_images to authenticated;

-- 確認：許可の一覧（authenticated に4種類ずつ出ていれば成功。anon は出てこないのが正しい）
select table_name as "表", grantee as "利用者", string_agg(privilege_type, ', ' order by privilege_type) as "許可"
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('items', 'item_images')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;
