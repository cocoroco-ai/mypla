import { createClient } from '@supabase/supabase-js';

// 接続先と「公開してよい鍵」は .env.local から読み込む（secret の鍵はアプリに入れない）
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: {
    persistSession: true, // 一度ログインしたら、ホーム画面から開き直してもログインしたまま
    autoRefreshToken: true,
  },
});

/** Supabase の英語のエラーを、分かりやすい日本語にする */
export function toJapaneseError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('mypla_limit')) {
    const n = message.match(/(\d+)\s*件/)?.[1];
    return `保存できる上限${n ? `（${n}件）` : ''}に達しました。ゴミ箱の中も数に入るので、要らないものを「完全に削除」すると、また保存できます。`;
  }
  if (m.includes('mypla_shelf_limit')) return 'カテゴリーは20個までです。使っていないカテゴリーを削除してから追加してください。';
  if (m.includes('shelves_name_check')) return 'カテゴリーの名前は1〜30文字で入れてください。';
  if (m.includes('signups not allowed') || m.includes('anonymous sign-ins are disabled')) return 'いまはお試し利用を受け付けていません。';
  if (m.includes('exceeded the maximum allowed size') || m.includes('payload too large')) return '画像が大きすぎます（5MBまで）。';
  if (m.includes('row-level security') && m.includes('objects')) return '保存できる画像の上限に達しました。要らないものを「完全に削除」してからお試しください。';
  if (m.includes('invalid login credentials')) return 'メールアドレスかパスワードが違います。';
  if (m.includes('email not confirmed')) return 'このメールアドレスは確認が済んでいません。Supabase の管理画面で利用者を確認済みにしてください。';
  if (m.includes('failed to fetch') || m.includes('network')) return 'インターネットにつながっていないか、Supabase が一時停止している可能性があります。';
  if (m.includes('rate limit') || m.includes('too many')) return '短い時間に何度も試したため、少し待つ必要があります。数分後にもう一度お試しください。';
  return `うまくいきませんでした（${message}）`;
}
