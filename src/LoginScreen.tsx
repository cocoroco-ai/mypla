import { useState, type FormEvent } from 'react';
import { supabase, toJapaneseError } from './supabase';

/**
 * メールアドレス＋パスワードでログインする画面。
 * 新規登録はアプリからはできない（利用者は Supabase の管理画面で作る）。
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // 成功したときは App 側がログイン状態の変化を受け取って、ホームに切り替える
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
            disabled={busy}
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
              disabled={busy}
            />
            <button type="button" className="btn-show" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? '隠す' : '表示'}
            </button>
          </div>
        </label>

        <button type="submit" className="btn-primary btn-large" disabled={busy}>
          {busy ? 'ログインしています…' : 'ログイン'}
        </button>
      </form>

      <p className="hint center">
        mypla. は招待した人だけが使えます。
        <br />
        パスワードを忘れたときは、Supabase の管理画面で設定し直せます。
      </p>
    </section>
  );
}
