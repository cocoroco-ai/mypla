import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import ImportScreen from './ImportScreen';
import LoginScreen from './LoginScreen';
import LibraryScreen from './LibraryScreen';
import ItemScreen from './ItemScreen';
import TrashScreen from './TrashScreen';
import BackupScreen from './BackupScreen';
import { isConfigured, supabase } from './supabase';
import { addSampleItems } from './samples';
import {
  countItems,
  cleanupExpiredGuests,
  countByShelf,
  pickTodayWord,
  SHELVES,
  type ItemSummary,
  type ShelfId,
  countTrashExpiringSoon,
  myImageQuota,
  myQuota,
  usageSummary,
  type Usage,
  pickReread,
  purgeExpiredTrash,
  TRASH_WARN_DAYS,
  type RereadPick,
} from './library';

type Screen =
  | { name: 'home' }
  | { name: 'import' }
  | { name: 'library' }
  | { name: 'item'; id: string; back?: Screen }
  | { name: 'shelf'; shelf: ShelfId }
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

  const isGuest = session?.user.is_anonymous === true;

  // お試しで入ったばかりの人には、見本を3件入れる（入れ終わったらホームの数を読み直す）
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    if (!userId || !isGuest) return;
    const key = `mypla-samples-${userId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return; // 記録できない端末では、何度も入らないよう見本を入れない
    }
    countItems()
      .then((n) => (n === 0 ? addSampleItems() : 0))
      .then((added) => {
        if (added > 0) setDataVersion((v) => v + 1);
      })
      .catch((e) => console.warn('見本を入れられませんでした', e));
  }, [userId, isGuest]);

  // 管理者のときだけ：30日使われていないお試しアカウントを片付ける（管理者以外は0人で終わる）
  const [guestsCleaned, setGuestsCleaned] = useState(0);
  useEffect(() => {
    if (!userId || isGuest) return;
    cleanupExpiredGuests()
      .then(setGuestsCleaned)
      .catch((e) => console.warn('お試しアカウントの片付けに失敗しました', e));
  }, [userId, isGuest]);

  async function logout() {
    const message = isGuest
      ? 'お試し利用を終了しますか？\n終了すると、保存した内容にはもう戻れません（必要なら先に「データの書き出し」をしてください）。'
      : 'ログアウトしますか？';
    if (!window.confirm(message)) return;
    // この端末だけログアウトする（iPhone でログアウトしても、パソコンはログインしたまま）
    await supabase.auth.signOut({ scope: 'local' });
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
            isGuest={isGuest}
            userId={userId ?? ''}
            guestsCleaned={guestsCleaned}
            dataVersion={dataVersion}
            onImport={importShot}
            onLibrary={library}
            onOpen={(id) => setScreen({ name: 'item', id, back: { name: 'home' } })}
            onShelf={(shelf) => setScreen({ name: 'shelf', shelf })}
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
      case 'shelf':
        return (
          <LibraryScreen
            key={screen.shelf}
            shelf={screen.shelf}
            onBack={home}
            onImport={importShot}
            onOpen={(id) => setScreen({ name: 'item', id, back: screen })}
            onTrash={() => setScreen({ name: 'trash' })}
          />
        );
      case 'trash':
        return <TrashScreen onBack={library} />;
      case 'backup':
        return <BackupScreen onBack={home} />;
      case 'item':
        return <ItemScreen id={screen.id} onBack={() => setScreen(screen.back ?? { name: 'library' })} backLabel={backLabel(screen.back)} />;
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
            {isGuest ? 'お試しを終了' : 'ログアウト'}
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

function backLabel(back?: Screen): string {
  if (!back || back.name === 'library') return 'ライブラリー';
  if (back.name === 'home') return 'ホーム';
  if (back.name === 'shelf') return SHELVES.find((s) => s.id === back.shelf)?.name ?? 'ライブラリー';
  return '戻る';
}

type HomeProps = {
  purged: number | null;
  isGuest: boolean;
  userId: string;
  guestsCleaned: number;
  dataVersion: number;
  onImport: () => void;
  onLibrary: () => void;
  onOpen: (id: string) => void;
  onShelf: (shelf: ShelfId) => void;
  onTrash: () => void;
  onBackup: () => void;
};

function Home({ purged, isGuest, userId, guestsCleaned, dataVersion, onImport, onLibrary, onOpen, onShelf, onTrash, onBackup }: HomeProps) {
  // 保存件数
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    countItems().then(setCount).catch(() => setCount(null));
  }, [dataVersion]);

  // お知らせ（ゴミ箱の自動削除が終わってから調べる）
  const [reread, setReread] = useState<RereadPick | null>(null);
  const [todayWord, setTodayWord] = useState<ItemSummary | null>(null);
  const [shelfCounts, setShelfCounts] = useState<Record<ShelfId, number> | null>(null);
  useEffect(() => {
    countByShelf().then(setShelfCounts).catch(() => setShelfCounts(null));
  }, [dataVersion]);
  const [expiring, setExpiring] = useState(0);
  const [noticesReady, setNoticesReady] = useState(false);
  useEffect(() => {
    if (purged === null) return;
    Promise.all([
      pickReread().catch(() => null),
      countTrashExpiringSoon().catch(() => 0),
      pickTodayWord().catch(() => null),
    ]).then(([pick, soonCount, word]) => {
      setReread(pick);
      setTodayWord(word);
      setExpiring(soonCount);
      setNoticesReady(true);
    });
  }, [purged]);
  // 保存数の上限（上限のある人だけ表示）
  const [quota, setQuota] = useState<{ limit: number; used: number } | null>(null);
  const [imageQuota, setImageQuota] = useState<{ limit: number; used: number } | null>(null);
  useEffect(() => {
    myQuota().then(setQuota).catch(() => setQuota(null));
    myImageQuota().then(setImageQuota).catch(() => setImageQuota(null));
  }, [dataVersion]);

  // 管理者だけ：無料枠の使用量
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    if (isGuest) return;
    usageSummary().then(setUsage).catch(() => setUsage(null));
  }, [isGuest]);

  const hasNotice = todayWord !== null || reread !== null || expiring > 0 || (purged ?? 0) > 0 || guestsCleaned > 0;

  // はじめてガイド（お試しの人だけ。「閉じる」を押したら、その端末では出さない）
  const guideKey = `mypla-guide-closed-${userId}`;
  const [guideClosed, setGuideClosed] = useState(() => {
    try {
      return localStorage.getItem(guideKey) === '1';
    } catch {
      return false;
    }
  });
  function closeGuide() {
    setGuideClosed(true);
    try {
      localStorage.setItem(guideKey, '1');
    } catch {
      // 保存できなくても、この画面の間は閉じたままにする
    }
  }

  return (
    <section>
      <p className="tagline">集める知識、広がる私。</p>

      {(isGuest || quota) && (
        <div className="guest-banner">
          {isGuest && <strong>お試し中です。</strong>}
          {quota && (
            <span>
              保存できるのは{quota.limit}件まで（あと{Math.max(0, quota.limit - quota.used)}件。ゴミ箱の中も数えます）。
              {imageQuota && `画像は${imageQuota.limit}枚まで（あと${Math.max(0, imageQuota.limit - imageQuota.used)}枚）。`}
            </span>
          )}
          {isGuest && (
            <span className="guest-banner-note">
              続きはこの端末のこのブラウザでだけ使えます。iPhone でホーム画面に追加して使う場合は、追加したアイコンから開き直して、もう一度「お試しで使ってみる」から始めてください。
            </span>
          )}
          {isGuest && (
            <details className="guest-upgrade">
              <summary>本格的に使いたい方へ</summary>
              <p>お試しのデータを引き継いで、スマホとパソコンの両方で使えるアカウント（300件まで）に移れます。</p>
              <ol>
                <li>下の「データの書き出し・読み込み」で、ファイルを作って端末に保存します。</li>
                <li>講座の中で、mypla. の作者に「本格的に使いたい」と連絡してください。アカウント（メールアドレスとパスワード）をお送りします。</li>
                <li>「お試しを終了」してから、届いたアカウントでログインし、「データの書き出し・読み込み」で保存したファイルを読み込みます。</li>
              </ol>
            </details>
          )}
        </div>
      )}

      {isGuest && !guideClosed && (
        <div className="card guide-card">
          <h2 className="guide-title">mypla. の使い方（3ステップ）</h2>
          <ol className="guide-steps">
            <li>
              <strong>取り込む</strong>：下の「＋ スクショを取り込む」で画像を選ぶと、文字を読み取って保存できます（読み取りは端末の中だけで行います）。
            </li>
            <li>
              <strong>探す</strong>：「ライブラリー」の検索で、画像の中の文字からも探せます。見本が3件入っているので、「レシピ」などで試してみてください。
            </li>
            <li>
              <strong>使う</strong>：開いた記事の文章をコピーしたり、ひとことメモを書き足したりできます。
            </li>
          </ol>
          <button className="btn-text" onClick={closeGuide}>閉じる</button>
        </div>
      )}

      <div className="notices" aria-live="polite">
        <h2 className="notices-title">お知らせ</h2>
        {!noticesReady ? (
          <p className="hint">確認しています…</p>
        ) : !hasNotice ? (
          <p className="hint">いまはお知らせはありません。</p>
        ) : (
          <ul className="notice-list">
            {todayWord && (
              <li>
                <button className="notice-item is-word" onClick={() => onOpen(todayWord.id)}>
                  <span className="notice-kind">💎 今日のことば</span>
                  <span className="notice-word">{wordPreview(todayWord.body || todayWord.title)}</span>
                  {todayWord.source && <span className="notice-source">— {todayWord.source}</span>}
                </button>
              </li>
            )}
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
            {guestsCleaned > 0 && (
              <li>
                <div className="notice-item is-static">
                  <span className="notice-kind">管理</span>
                  <span className="notice-text">30日使われていないお試しアカウント{guestsCleaned}人分を、データごと片付けました。</span>
                </div>
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
        {SHELVES.map((t) => (
          <button key={t.id} className={`tile is-ready shelf-${t.id}`} onClick={() => onShelf(t.id)}>
            <span className="tile-name">
              {t.icon} {t.name}
            </span>
            <span className="tile-note">{t.note}</span>
            <span className="badge">{shelfCounts ? `${shelfCounts[t.id]}件` : '開く'}</span>
          </button>
        ))}
      </div>

      {usage && (
        <div className="card usage-card">
          <h2 className="usage-title">無料枠の使用量（管理者だけに表示）</h2>
          <UsageBar label="画像の保管場所" used={usage.storageMB} max={1024} />
          <UsageBar label="データベース" used={usage.databaseMB} max={500} />
          <p className="hint">
            利用者 {usage.users}人（うちお試し {usage.guests}人）・画像 {usage.images}枚。どちらかが8割を超えたら、整理や上限の見直しを考えましょう。
          </p>
        </div>
      )}

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

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const ratio = Math.min(1, used / max);
  const level = ratio >= 0.8 ? 'is-danger' : ratio >= 0.6 ? 'is-warn' : '';
  return (
    <div className="usage-row">
      <div className="usage-label">
        <span>{label}</span>
        <span>
          {used} MB / {max} MB（{Math.round(ratio * 100)}%）
        </span>
      </div>
      <div className={`usage-bar ${level}`}>
        <div style={{ width: `${Math.max(1, Math.round(ratio * 100))}%` }} />
      </div>
    </div>
  );
}

/** 今日のことばに出す長さ（長い文章は先頭だけ） */
function wordPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length > 80 ? `${chars.slice(0, 80).join('')}…` : flat;
}
