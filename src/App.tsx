import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import ImportScreen from './ImportScreen';
import LoginScreen from './LoginScreen';
import LibraryScreen, { type LibraryFilter } from './LibraryScreen';
import ItemScreen from './ItemScreen';
import TrashScreen from './TrashScreen';
import ShelfManager from './ShelfManager';
import NoteScreen from './NoteScreen';
import BackupScreen from './BackupScreen';
import { AiCardScreen } from './AiZukan';
import ThemeScreen from './ThemeScreen';
import { LineIcon, ShelfIcon } from './icons';
import { placeName } from './themes';
import { isConfigured, supabase } from './supabase';
import { addSampleItems } from './samples';
import {
  countItems,
  cleanupExpiredGuests,
  countByShelf,
  countNoShelf,
  backupReminder,
  listFavorites,
  listShelves,
  pickTodayWord,
  pickTodayStudy,
  type ItemSummary,
  type Shelf,
  type AiCard,
  countTrashExpiringSoon,
  myImageQuota,
  myQuota,
  usageSummary,
  type Usage,
  pickReread,
  purgeExpiredTrash,
  TRASH_WARN_DAYS,
  TRASH_DAYS,
  REREAD_MIN_DAYS,
  BACKUP_REMIND_DAYS,
  type RereadPick,
} from './library';

type Screen =
  | { name: 'home' }
  | { name: 'import'; shelf?: Shelf }
  | { name: 'library'; filter?: LibraryFilter }
  | { name: 'item'; id: string; back?: Screen }
  | { name: 'shelf'; shelf: Shelf }
  | { name: 'aicard'; card: AiCard; shelf: Shelf }
  | { name: 'shelves' }
  | { name: 'note'; shelf?: Shelf }
  | { name: 'trash' }
  | { name: 'backup' }
  | { name: 'theme' };

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
            onNoShelf={() => setScreen({ name: 'library', filter: 'noshelf' })}
            onOpen={(id) => setScreen({ name: 'item', id, back: { name: 'home' } })}
            onShelf={(shelf) => setScreen({ name: 'shelf', shelf })}
            onManageShelves={() => setScreen({ name: 'shelves' })}
            onNote={() => setScreen({ name: 'note' })}
            onFavorites={() => setScreen({ name: 'library', filter: 'fav' })}
            onTrash={() => setScreen({ name: 'trash' })}
            onBackup={() => setScreen({ name: 'backup' })}
            onTheme={() => setScreen({ name: 'theme' })}
          />
        );
      case 'import':
        if (screen.shelf) {
          const shelf = screen.shelf;
          return (
            <ImportScreen
              key={shelf.id}
              initialShelf={shelf}
              backLabel={shelf.name}
              onBack={() => setScreen({ name: 'shelf', shelf })}
            />
          );
        }
        return <ImportScreen onBack={home} />;
      case 'library':
        return (
          <LibraryScreen
            key={screen.filter ?? 'all'}
            initialFilter={screen.filter}
            onBack={home}
            onImport={importShot}
            onOpen={(id) => setScreen({ name: 'item', id, back: screen })}
            onTrash={() => setScreen({ name: 'trash' })}
          />
        );
      case 'shelf':
        return (
          <LibraryScreen
            key={screen.shelf.id}
            shelf={screen.shelf}
            onBack={home}
            onImport={() => setScreen({ name: 'import', shelf: screen.shelf })}
            onOpen={(id) => setScreen({ name: 'item', id, back: screen })}
            onTrash={() => setScreen({ name: 'trash' })}
            onOpenAiCard={(card) => setScreen({ name: 'aicard', card, shelf: screen.shelf })}
            onWrite={() => setScreen({ name: 'note', shelf: screen.shelf })}
          />
        );
      case 'aicard': {
        const toShelf = () => setScreen({ name: 'shelf', shelf: screen.shelf });
        return (
          <AiCardScreen
            key={screen.card.id}
            card={screen.card}
            backLabel={screen.shelf.name}
            onBack={toShelf}
            onOpen={(id) => setScreen({ name: 'item', id, back: screen })}
            onChanged={(card) => (card ? setScreenState({ ...screen, card }) : toShelf())}
          />
        );
      }
      case 'note':
        if (screen.shelf) {
          const shelf = screen.shelf;
          const toShelf = () => setScreen({ name: 'shelf', shelf });
          return (
            <NoteScreen
              shelf={shelf}
              onBack={toShelf}
              onSaved={(id) => setScreen({ name: 'item', id, back: { name: 'shelf', shelf } })}
            />
          );
        }
        return <NoteScreen onBack={home} onSaved={(id) => setScreen({ name: 'item', id, back: { name: 'home' } })} />;
      case 'shelves':
        return <ShelfManager onBack={home} />;
      case 'trash':
        return <TrashScreen onBack={library} />;
      case 'backup':
        return <BackupScreen onBack={home} />;
      case 'theme':
        return <ThemeScreen onBack={home} />;
      case 'item':
        return <ItemScreen id={screen.id} onBack={() => setScreen(screen.back ?? { name: 'library' })} backLabel={backLabel(screen.back)} />;
    }
  }

  return (
    <div className="app">
      {/* Elegant のときだけ見える、背景の抽象的な曲線（押せない・読み上げない） */}
      <svg className="deco-curves" viewBox="0 0 400 900" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        <path d="M-40 120C80 40 210 60 300 130S470 230 460 120" />
        <path d="M-60 170C70 90 220 110 320 175S480 270 470 170" />
        <path d="M-30 760C90 690 230 700 330 770S470 860 450 780" />
      </svg>
      <header className="topbar">
        <button className="brand" onClick={home} aria-label="ホームへ">
          <span className="brand-word">
            mypla<span className="dot">.</span>
          </span>
          {/* Elegant のときだけ見える、ロゴの下の細い曲線 */}
          <svg className="brand-swash" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 7.5C26 1.5 52 1.8 70 5.2S104 9.2 118 2.5" />
          </svg>
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
  if (back.name === 'shelf') return back.shelf.name;
  if (back.name === 'aicard') return back.card.name;
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
  onNoShelf: () => void;
  onOpen: (id: string) => void;
  onShelf: (shelf: Shelf) => void;
  onManageShelves: () => void;
  onNote: () => void;
  onFavorites: () => void;
  onTrash: () => void;
  onBackup: () => void;
  onTheme: () => void;
};

function Home({ purged, isGuest, userId, guestsCleaned, dataVersion, onImport, onLibrary, onNoShelf, onOpen, onShelf, onManageShelves, onNote, onFavorites, onTrash, onBackup, onTheme }: HomeProps) {
  // 保存件数
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    countItems().then(setCount).catch(() => setCount(null));
  }, [dataVersion]);

  // お知らせ（ゴミ箱の自動削除が終わってから調べる）
  const [reread, setReread] = useState<RereadPick | null>(null);
  const [todayWord, setTodayWord] = useState<ItemSummary | null>(null);
  const [todayStudy, setTodayStudy] = useState<ItemSummary | null>(null);
  const [myName] = useState(() => placeName()); // My Place, My Name.（未設定なら mypla.）
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [shelfCounts, setShelfCounts] = useState<Record<string, number> | null>(null);
  const [noShelfCount, setNoShelfCount] = useState<number | null>(null);
  // バックアップの声かけ（null = 不要、-1 = まだ一度も、数字 = 前回からの日数）
  const [backupDays, setBackupDays] = useState<number | null>(null);
  useEffect(() => {
    if (count === null) return;
    backupReminder(count).then(setBackupDays).catch(() => setBackupDays(null));
  }, [count]);
  const [favorites, setFavorites] = useState<{ items: ItemSummary[]; total: number }>({ items: [], total: 0 });
  useEffect(() => {
    listFavorites(5).then(setFavorites).catch(() => setFavorites({ items: [], total: 0 }));
  }, [dataVersion]);
  useEffect(() => {
    listShelves()
      .then((list) => {
        setShelves(list);
        return countByShelf(list);
      })
      .then(setShelfCounts)
      .catch(() => setShelves([]));
    countNoShelf().then(setNoShelfCount).catch(() => setNoShelfCount(null));
  }, [dataVersion]);
  const [expiring, setExpiring] = useState(0);
  const [noticesReady, setNoticesReady] = useState(false);
  useEffect(() => {
    if (purged === null || shelves === null) return;
    Promise.all([
      pickReread().catch(() => null),
      countTrashExpiringSoon().catch(() => 0),
      pickTodayWord(shelves).catch(() => null),
      pickTodayStudy(shelves).catch(() => null),
    ]).then(([pick, soonCount, word, study]) => {
      setReread(pick);
      setTodayWord(word);
      setTodayStudy(study);
      setExpiring(soonCount);
      setNoticesReady(true);
    });
  }, [purged, shelves]);
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

  const hasNotice = backupDays !== null || todayWord !== null || todayStudy !== null || reread !== null || expiring > 0 || (purged ?? 0) > 0 || guestsCleaned > 0;

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
      <div className="home-hero">
        {/* ロゴの下のブランド表記：My Platform（わたしの居場所）＋ 音の響きで My Plus（わたしにプラス） */}
        <p className="brand-sub" aria-label="My Platform プラス My Plus">
          <span>My Platform</span>
          <span className="brand-sub-plus" aria-hidden="true">＋</span>
          <span>My Plus</span>
        </p>
        {/* 利用者が付けた名前（未設定なら出さない） */}
        {myName && <h1 className="home-name is-custom">{myName}</h1>}
        <p className="tagline">集める知識、広がる私。</p>
      </div>

      {/* ライブラリー（ホームを開いたらすぐ見えるよう一番上に）：すべての保存情報。カテゴリーはその中で、テーマ別に見るための入り口 */}
      <section className="lib-panel" aria-label="ライブラリー">
        <button className="lib-head" onClick={onLibrary}>
          <span className="lib-head-icon">
            <LineIcon name="library" size={28} />
          </span>
          <span className="lib-head-name">ライブラリー</span>
          <span className="lib-head-count">
            {count === null ? '' : (
              <>
                <strong>{count}</strong>件
              </>
            )}
          </span>
        </button>
        <button className="lib-search" onClick={onLibrary}>
          <span className="lib-search-icon"><LineIcon name="search" size={18} /></span>
          <span className="lib-search-text">すべての情報を検索・閲覧</span>
          <span className="lib-search-arrow"><LineIcon name="chevronRight" size={18} /></span>
        </button>
        <div className="lib-grid">
          <button className="lib-cat" onClick={onNoShelf}>
            <span className="lib-cat-icon"><LineIcon name="inbox" size={24} /></span>
            <span className="lib-cat-name">未分類</span>
            <span className="lib-cat-count">{noShelfCount === null ? '' : `${noShelfCount}件`}</span>
          </button>
          {(shelves ?? []).map((t) => (
            <button key={t.id} className={`lib-cat ${t.style === 'cards' ? 'is-cards' : ''}`} onClick={() => onShelf(t)}>
              <span className="lib-cat-icon"><ShelfIcon emoji={t.icon} size={24} /></span>
              <span className="lib-cat-name">{t.name}</span>
              <span className="lib-cat-count">{shelfCounts ? `${shelfCounts[t.id] ?? 0}件` : ''}</span>
            </button>
          ))}
        </div>
        <button className="lib-add" onClick={onManageShelves}>
          ＋ カテゴリーの追加・編集
        </button>
      </section>

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
            {backupDays !== null && (
              <li>
                <button className="notice-item is-backup" onClick={onBackup}>
                  <span className="notice-kind">💾 バックアップ</span>
                  <span className="notice-text">
                    {backupDays < 0
                      ? 'まだ一度も書き出していません。万一に備えて、書き出し（バックアップ）をしておきましょう。'
                      : `最後の書き出しから${backupDays}日たちました。そろそろ書き出し（バックアップ）をしておきましょう。`}
                  </span>
                </button>
              </li>
            )}
            {todayStudy && (
              <li>
                <button className="notice-item is-study" onClick={() => onOpen(todayStudy.id)}>
                  <span className="notice-kind"><span className="notice-icon"><LineIcon name="bookOpen" size={14} /></span>今日の復習</span>
                  <span className="notice-study">{wordPreview(todayStudy.memo || todayStudy.title)}</span>
                  {todayStudy.memo && todayStudy.memo !== todayStudy.title && <span className="notice-text">{todayStudy.title}</span>}
                </button>
              </li>
            )}
            {todayWord && (
              <li>
                <button className="notice-item is-word" onClick={() => onOpen(todayWord.id)}>
                  <span className="notice-kind"><span className="notice-icon"><LineIcon name="gem" size={14} /></span>今日のことば</span>
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

      {favorites.items.length > 0 && (
        <div className="card fav-card">
          <h2 className="notices-title">★ お気に入り</h2>
          <ul className="fav-list">
            {favorites.items.map((f) => (
              <li key={f.id}>
                <button className="fav-item" onClick={() => onOpen(f.id)}>
                  <span className="fav-mark">★</span>
                  <span className="fav-item-title">{f.title}</span>
                </button>
              </li>
            ))}
          </ul>
          {favorites.total > favorites.items.length && (
            <button className="btn-text fav-more" onClick={onFavorites}>
              すべて見る（{favorites.total}件）
            </button>
          )}
        </div>
      )}

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

      <button className="home-theme" onClick={onTheme}>
        <span className="home-theme-icon">
          <LineIcon name="palette" size={22} />
        </span>
        <span className="home-theme-text">
          <span className="home-theme-name">mypla.を彩る</span>
          <span className="home-theme-sub">名前と色を、私らしく。</span>
        </span>
        <span className="home-theme-dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      </button>

      <button className="home-link" onClick={onBackup}>
        データの書き出し・読み込み（バックアップ）
      </button>

      {/* お知らせの説明（いつ・何が出るか）。ふだんは畳んでおく */}
      <details className="notice-help">
        <summary>お知らせが出るとき（説明）</summary>
        <dl>
          <dt>今日の復習</dt>
          <dd>
            学びノートに、覚えた？が「まだ」「復習中」の記事があると出ます。1日に1件、古く保存した順に毎日替わります。
            「身についた」にした記事は出なくなります。
          </dd>
          <dt>今日のことば</dt>
          <dd>
            ことばの宝箱（言葉のカードの見た目のカテゴリー）に記事があると出ます。1日に1件、毎日替わります。
            「誰の言葉」を入れてあれば、名前も出ます。
          </dd>
          <dt>読み返し</dt>
          <dd>保存して{REREAD_MIN_DAYS}日以上たった記事から、1日に1件出ます。</dd>
          <dt>バックアップ</dt>
          <dd>
            記事が5件以上あって、まだ一度も書き出していないか、最後の書き出しから{BACKUP_REMIND_DAYS}日たつと出ます。書き出すと消えます。
          </dd>
          <dt>ゴミ箱</dt>
          <dd>
            ゴミ箱の記事は{TRASH_DAYS}日で完全に消えます。残り{TRASH_WARN_DAYS}日以内のものがあると知らせます。
          </dd>
        </dl>
        <p className="hint">どれも同じ日なら、何回ホームを開いても同じ記事が出ます。押すと、その記事や画面が開きます。</p>
      </details>

      <div className="bottom-action home-actions">
        <button className="btn-primary btn-large" onClick={onImport}>
          ＋ スクショ
        </button>
        <button className="btn-secondary btn-large" onClick={onNote}>
          ✎ ノート
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
