import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import ImportScreen from './ImportScreen';
import LoginScreen from './LoginScreen';
import LibraryScreen from './LibraryScreen';
import ItemScreen from './ItemScreen';
import TrashScreen from './TrashScreen';
import { isConfigured, supabase } from './supabase';
import { countItems, purgeExpiredTrash } from './library';

type Screen =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'library' }
  | { name: 'item'; id: string }
  | { name: 'trash' };

export default function App() {
  const [screen, setScreenState] = useState<Screen>({ name: 'home' });
  // undefined = 確認中、null = ログインしていない
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const setScreen = (s: Screen) => {
    setScreenState(s);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!isConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // ログイン・ログアウトしたら、画面を自動で切り替える
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // ログインしたら、ゴミ箱に入れて30日を過ぎたものを完全に削除する（自動実行の仕組みを使わない無料プラン向け）
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    purgeExpiredTrash().catch((e) => console.warn('期限切れのゴミ箱の削除に失敗しました', e));
  }, [userId]);

  async function logout() {
    if (!window.confirm('ログアウトしますか？')) return;
    await supabase.auth.signOut();
    setScreen({ name: 'home' });
  }

  const home = () => setScreen({ name: 'home' });
  const library = () => setScreen({ name: 'library' });
  const importShot = () => setScreen({ name: 'import' });

  function renderScreen() {
    switch (screen.name) {
      case 'home':
        return <Home onImport={importShot} onLibrary={library} />;
      case 'import':
        return <ImportScreen onBack={home} />;
      case 'library':
        return (
          <LibraryScreen
            onBack={home}
            onImport={importShot}
            onOpen={(id) => setScreen({ name: 'item', id })}
            onTrash={() => setScreen({ name: 'trash' })}
          />
        );
      case 'trash':
        return <TrashScreen onBack={library} />;
      case 'item':
        return <ItemScreen id={screen.id} onBack={library} />;
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={home} aria-label="ホームへ">
          mypla<span className="dot">.</span>
        </button>
        {session && (
          <button className="btn-logout" onClick={logout}>
            ログアウト
          </button>
        )}
      </header>

      <main className="content">
        {!isConfigured ? (
          <p className="error">接続設定（.env.local）が見つかりません。開発者に連絡してください。</p>
        ) : session === undefined ? (
          <p className="hint center">確認しています…</p>
        ) : session === null ? (
          <LoginScreen />
        ) : (
          renderScreen()
        )}
      </main>
    </div>
  );
}

function Home({ onImport, onLibrary }: { onImport: () => void; onLibrary: () => void }) {
  // 保存件数
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    countItems().then(setCount).catch(() => setCount(null));
  }, []);

  const soon = [
    { name: 'AI図鑑', note: '各AIの特徴と自分のメモ' },
    { name: '学びノート', note: '学んだことのまとめ' },
    { name: 'アイデア帳', note: 'ひらめきの置き場所' },
  ];
  return (
    <section>
      <p className="tagline">集める知識、広がる私。</p>

      <div className="tiles">
        <button className="tile is-ready" onClick={onLibrary}>
          <span className="tile-name">ライブラリー</span>
          <span className="tile-note">保存した情報の一覧</span>
          <span className="badge">{count === null ? '開く' : `${count}件`}</span>
        </button>
        {soon.map((t) => (
          <div key={t.name} className="tile is-soon">
            <span className="tile-name">{t.name}</span>
            <span className="tile-note">{t.note}</span>
            <span className="badge">準備中</span>
          </div>
        ))}
      </div>

      <div className="bottom-action">
        <button className="btn-primary btn-large" onClick={onImport}>
          ＋ スクショを取り込む
        </button>
      </div>
    </section>
  );
}
