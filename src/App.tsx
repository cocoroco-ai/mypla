import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import ImportScreen from './ImportScreen';
import LoginScreen from './LoginScreen';
import LibraryScreen from './LibraryScreen';
import ItemScreen from './ItemScreen';
import TrashScreen from './TrashScreen';
import BackupScreen from './BackupScreen';
import { isConfigured, supabase } from './supabase';
import {
  countItems,
  countTrashExpiringSoon,
  pickReread,
  purgeExpiredTrash,
  TRASH_WARN_DAYS,
  type RereadPick,
} from './library';

type Screen =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'library' }
  | { name: 'item'; id: string }
  | { name: 'trash' }
  | { name: 'backup' };

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
  // 消した件数はホームのお知らせに出す（null = まだ終わっていない）
  const userId = session?.user.id;
  const [purged, setPurged] = useState<number | null>(null);
  useEffect(() => {
    if (!userId) return;
    setPurged(null);
    purgeExpiredTrash()
      .then(setPurged)
      .catch((e) => {
        console.warn('期限切れのゴミ箱の削除に失敗しました', e);
        setPurged(0);
      });
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
        return (
          <Home
            purged={purged}
            onImport={importShot}
            onLibrary={library}
            onOpen={(id) => setScreen({ name: 'item', id })}
            onTrash={() => setScreen({ name: 'trash' })}
            onBackup={() => setScreen({ name: 'backup' })}
          />
        );
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
      case 'backup':
        return <BackupScreen onBack={home} />;
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

type HomeProps = {
  purged: number | null;
  onImport: () => void;
  onLibrary: () => void;
  onOpen: (id: string) => void;
  onTrash: () => void;
  onBackup: () => void;
};

function Home({ purged, onImport, onLibrary, onOpen, onTrash, onBackup }: HomeProps) {
  // 保存件数
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    countItems().then(setCount).catch(() => setCount(null));
  }, []);

  // お知らせ（ゴミ箱の自動削除が終わってから調べる）
  const [reread, setReread] = useState<RereadPick | null>(null);
  const [expiring, setExpiring] = useState(0);
  const [noticesReady, setNoticesReady] = useState(false);
  useEffect(() => {
    if (purged === null) return;
    Promise.all([
      pickReread().catch(() => null),
      countTrashExpiringSoon().catch(() => 0),
    ]).then(([pick, soonCount]) => {
      setReread(pick);
      setExpiring(soonCount);
      setNoticesReady(true);
    });
  }, [purged]);
  const hasNotice = reread !== null || expiring > 0 || (purged ?? 0) > 0;

  const soon = [
    { name: 'AI図鑑', note: '各AIの特徴と自分のメモ' },
    { name: '学びノート', note: '学んだことのまとめ' },
    { name: 'アイデア帳', note: 'ひらめきの置き場所' },
  ];
  return (
    <section>
      <p className="tagline">集める知識、広がる私。</p>

      <div className="notices" aria-live="polite">
        <h2 className="notices-title">お知らせ</h2>
        {!noticesReady ? (
          <p className="hint">確認しています…</p>
        ) : !hasNotice ? (
          <p className="hint">いまはお知らせはありません。</p>
        ) : (
          <ul className="notice-list">
            {reread && (
              <li>
                <button className="notice-item" onClick={() => onOpen(reread.id)}>
                  <span className="notice-kind">読み返し</span>
                  <span className="notice-text">
                    {reread.daysAgo}日前に保存した「{reread.title}」を読み返してみませんか？
                  </span>
                </button>
              </li>
            )}
            {expiring > 0 && (
              <li>
                <button className="notice-item is-warn" onClick={onTrash}>
                  <span className="notice-kind">ゴミ箱</span>
                  <span className="notice-text">
                    あと{TRASH_WARN_DAYS}日以内に完全に削除されるものが{expiring}件あります。必要なら元に戻してください。
                  </span>
                </button>
              </li>
            )}
            {(purged ?? 0) > 0 && (
              <li>
                <div className="notice-item is-static">
                  <span className="notice-kind">ゴミ箱</span>
                  <span className="notice-text">ゴミ箱に入れて30日たった{purged}件を、完全に削除しました。</span>
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

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

      <button className="home-link" onClick={onBackup}>
        データの書き出し・読み込み（バックアップ）
      </button>

      <div className="bottom-action">
        <button className="btn-primary btn-large" onClick={onImport}>
          ＋ スクショを取り込む
        </button>
      </div>
    </section>
  );
}
