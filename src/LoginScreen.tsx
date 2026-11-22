import { useState, type FormEvent } from 'react';
import { supabase, toJapaneseError } from './supabase';

/**
 * メールアドレス＋パスワードでログインする画面。
 * 新規登録はアプリからはできない（利用者は Supabase の管理画面で作る）。
 * 受講生などは「お試しで使ってみる」で、登録なしで入れる（Supabase の匿名ログイン）。
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<false | 'login' | 'guest'>(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setBusy('login');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // 成功したときは App 側がログイン状態の変化を受け取って、ホームに切り替える
    if (error) setError(toJapaneseError(error.message));
  }

  async function tryAsGuest() {
    setError('');
    setBusy('guest');
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) setError(toJapaneseError(error.message));
  }

  return (
    <section className="login">
      <p className="tagline">集める知識、広がる私。</p>
      <h1 className="screen-title">ログイン</h1>

      <form className="card login-form" onSubmit={submit} noValidate>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span className="field-label">メールアドレス</span>
          <input
            className="text-input"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy !== false}
          />
        </label>

        <label className="field">
          <span className="field-label">パスワード</span>
          <div className="password-row">
            <input
              className="text-input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy !== false}
            />
            <button type="button" className="btn-show" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? '隠す' : '表示'}
            </button>
          </div>
        </label>

        <button type="submit" className="btn-primary btn-large" disabled={busy !== false}>
          {busy === 'login' ? 'ログインしています…' : 'ログイン'}
        </button>
      </form>

      <div className="card guest-card">
        <h2 className="guest-title">はじめての方へ</h2>
        <p className="hint">
          登録なしで、すぐに試せます。保存できるのは30件まで。データはあなただけのもので、ほかの人からは見えません。
        </p>
        <p className="hint">
          ※ 続きは<strong>この端末のこのブラウザでだけ</strong>使えます。ログアウトや閲覧履歴の消去をすると、保存した内容には戻れません。
        </p>
        <button type="button" className="btn-secondary btn-large" onClick={tryAsGuest} disabled={busy !== false}>
          {busy === 'guest' ? '準備しています…' : 'お試しで使ってみる'}
        </button>
      </div>

      <p className="hint center">
        アカウントをお持ちの方は、上からログインしてください。
      </p>
    </section>
  );
}
