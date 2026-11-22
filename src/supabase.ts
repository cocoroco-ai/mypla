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
  if (m.includes('invalid login credentials')) return 'メールアドレスかパスワードが違います。';
  if (m.includes('email not confirmed')) return 'このメールアドレスは確認が済んでいません。Supabase の管理画面で利用者を確認済みにしてください。';
  if (m.includes('failed to fetch') || m.includes('network')) return 'インターネットにつながっていないか、Supabase が一時停止している可能性があります。';
  if (m.includes('rate limit') || m.includes('too many')) return '短い時間に何度も試したため、少し待つ必要があります。数分後にもう一度お試しください。';
  return `うまくいきませんでした（${message}）`;
}
