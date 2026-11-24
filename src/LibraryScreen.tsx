import { useEffect, useRef, useState, type ReactNode } from 'react';
import ImageViewer from './ImageViewer';
import { AiCardGrid } from './AiZukan';
import { countTrash, countUnsorted, formatDate, imageUrls, listItems, mergeItems, mergedTitle, savePhotos, searchWords, listShelves, listAiCards, countByAiCard, type AiCard, type ItemSummary, type Shelf } from './library';

const PAGE = 20;

type Props = {
  onBack: () => void;
  onOpen: (id: string) => void;
  onImport: () => void;
  onTrash: () => void;
  shelf?: Shelf; // 棚を開いたとき（その棚の記事だけを並べる）
  initialFilter?: 'all' | 'fav' | 'unsorted';
  onOpenAiCard?: (card: AiCard) => void; // AI図鑑の棚で、カードを開く
};

/** ライブラリー一覧：保存した情報を新しい順に並べる。上の検索欄で絞り込める */
export default function LibraryScreen({ onBack, onOpen, onImport, onTrash, shelf, initialFilter, onOpenAiCard }: Props) {
  const shelfInfo = shelf ?? null;
  const isWords = shelf?.style === 'cards';
  const isPhotos = shelf?.style === 'photos';
  const isAi = shelf?.style === 'ai';
  // AI図鑑の棚：上にAIカードを並べ、記事にはどのAIの話かの印を付ける
  const [aiCards, setAiCards] = useState<AiCard[] | null>(null);
  const [aiCounts, setAiCounts] = useState<Record<string, number>>({});
  function loadAiCards() {
    Promise.all([listAiCards(), countByAiCard()])
      .then(([list, counts]) => {
        setAiCards(list);
        setAiCounts(counts);
      })
      .catch(() => setAiCards([]));
  }
  useEffect(() => {
    if (isAi) loadAiCards();
  }, [isAi]);
  const aiCardMap = Object.fromEntries((aiCards ?? []).map((c) => [c.id, c]));
  // 写真の棚：棚から直接、写真を入れる（文字は読まない）
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoProgress, setPhotoProgress] = useState<{ done: number; total: number } | null>(null);
  const [photoNotice, setPhotoNotice] = useState('');
  async function addPhotos(list: FileList | null) {
    if (!shelf) return;
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setError('');
    setPhotoNotice('');
    try {
      const r = await savePhotos(files, shelf.id, (done, total) => setPhotoProgress({ done, total }));
      if (r.stoppedReason) setError(`${r.saved}枚まで入れたところで止まりました。${r.stoppedReason}`);
      else setPhotoNotice(`${r.saved}枚の写真を入れました。`);
    } finally {
      setPhotoProgress(null);
      setInput('');
      setQuery('');
      load(0, '');
    }
  }
  // ライブラリーで、記事に棚の印を付けるため
  const [shelfMap, setShelfMap] = useState<Record<string, Shelf>>({});
  useEffect(() => {
    if (shelf) return;
    listShelves()
      .then((list) => setShelfMap(Object.fromEntries(list.map((x) => [x.id, x]))))
      .catch(() => setShelfMap({}));
  }, [shelf]);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState(''); // 実際に検索した言葉
  const [trashCount, setTrashCount] = useState(0);
  // 整理待ち（画像だけで保存して、まだ文字にしていないもの）だけを表示するか
  // 表示の絞り込み：すべて／★お気に入り／整理待ち
  const [filter, setFilter] = useState<'all' | 'fav' | 'unsorted'>(initialFilter ?? 'all');
  const unsorted = filter === 'unsorted';
  const [unsortedCount, setUnsortedCount] = useState(0);
  // まとめるモード：チェックを付けた記事を1つにまとめる
  const [merging, setMerging] = useState(false);
  const [picked, setPicked] = useState<ItemSummary[]>([]);
  const [mergeBusy, setMergeBusy] = useState(false);
  // まとめる前の確認画面（画像を大きく見て、関係ないものを外せる）
  const [reviewing, setReviewing] = useState(false);
  const [viewing, setViewing] = useState<ItemSummary | null>(null);
  const [mergeTitle, setMergeTitle] = useState('');

  function togglePick(item: ItemSummary) {
    setPicked((list) => (list.some((x) => x.id === item.id) ? list.filter((x) => x.id !== item.id) : [...list, item]));
  }

  function stopMerging() {
    setMerging(false);
    setReviewing(false);
    setPicked([]);
  }

  function unpick(item: ItemSummary) {
    setPicked((list) => list.filter((x) => x.id !== item.id));
    setViewing(null);
  }

  async function runMerge() {
    if (picked.length < 2) return;
    const message =
      `${picked.length}件を1つの記事にまとめます。よろしいですか？\n` +
      '（まとめた後でも、記事の画面で画像を1枚ずつ外せます）';
    if (!window.confirm(message)) return;
    setMergeBusy(true);
    setError('');
    try {
      const id = await mergeItems(picked, mergeTitle);
      stopMerging();
      onOpen(id);
    } catch (e) {
      setError(`まとめられませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setMergeBusy(false);
    }
  }
  const requestNo = useRef(0); // 速く打ったときに、古い検索結果で上書きしないための番号

  async function load(offset: number, q: string) {
    const no = ++requestNo.current;
    setLoading(true);
    setError('');
    try {
      const page = await listItems(offset, PAGE, q, unsorted, shelf?.id ?? null, filter === 'fav');
      if (no !== requestNo.current) return;
      setItems((list) => (offset === 0 ? page.items : [...list, ...page.items]));
      setTotal(page.total);
      const paths = page.items.map((i) => i.imagePath).filter((p): p is string => Boolean(p));
      const map = await imageUrls(paths);
      setUrls((u) => ({ ...u, ...map }));
    } catch (e) {
      if (no === requestNo.current) setError(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      if (no === requestNo.current) setLoading(false);
    }
  }

  // 入力が止まって0.4秒たったら検索する
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 400);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    load(0, query);
  }, [query, filter]);

  useEffect(() => {
    countTrash().then(setTrashCount).catch(() => setTrashCount(0));
    countUnsorted().then(setUnsortedCount).catch(() => setUnsortedCount(0));
  }, []);

  const words = searchWords(query);
  const searching = words.length > 0;

  if (reviewing) {
    const ordered = [...picked].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return (
      <section>
        <button className="link-back" onClick={() => setReviewing(false)} disabled={mergeBusy}>← 選び直す</button>
        <h1 className="screen-title">まとめる前の確認</h1>
        <p className="hint">
          この順番（古い順）で1つの記事になります。画像を押すと大きく見られます。関係ないものは「外す」で除いてください。
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <ul className="review-list">
          {ordered.map((item, i) => (
            <li key={item.id} className="review-item">
              <button className="review-thumb" onClick={() => setViewing(item)} aria-label={`${item.title} を大きく見る`}>
                {item.imagePath && urls[item.imagePath] ? (
                  <img src={urls[item.imagePath]} alt="" />
                ) : (
                  <span className="thumb-empty" aria-hidden="true">{item.isNote ? '✎' : '🖼️'}</span>
                )}
                <span className="review-no">{i + 1}</span>
              </button>
              <div className="review-main">
                <span className="item-title">{item.title}</span>
                <span className="item-meta">
                  {formatDate(item.createdAt)}
                  {item.imageCount > 1 && `・画像${item.imageCount}枚`}
                </span>
                <button className="btn-small" onClick={() => unpick(item)} disabled={mergeBusy}>
                  外す
                </button>
              </div>
            </li>
          ))}
        </ul>
        <label className="field merge-title">
          <span className="field-label">まとめた記事のタイトル（あとからでも直せます）</span>
          <input
            className="title-input"
            value={mergeTitle}
            maxLength={100}
            onChange={(e) => setMergeTitle(e.target.value)}
            placeholder={`空のままなら「${mergedTitle(picked)}」`}
            enterKeyHint="done"
          />
        </label>
        {viewing && viewing.imagePath && urls[viewing.imagePath] && (
          <ImageViewer
            src={urls[viewing.imagePath]}
            caption={viewing.title}
            onClose={() => setViewing(null)}
            actions={
              <>
                <button className="btn-secondary" onClick={() => unpick(viewing)}>これは外す</button>
                <button className="btn-primary" onClick={() => setViewing(null)}>このまま（戻る）</button>
              </>
            }
          />
        )}
        <div className="bottom-action">
          <button className="btn-primary btn-large" onClick={runMerge} disabled={picked.length < 2 || mergeBusy}>
            {mergeBusy ? 'まとめています…' : picked.length < 2 ? '2件以上必要です（選び直してください）' : `この${picked.length}件を1つにまとめる`}
          </button>
          <button className="btn-text" onClick={stopMerging} disabled={mergeBusy}>まとめるのをやめる</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <button className="link-back" onClick={onBack}>← ホーム</button>
      <h1 className="screen-title">{shelfInfo ? `${shelfInfo.icon} ${shelfInfo.name}` : 'ライブラリー'}</h1>
      {shelfInfo && !isPhotos && (
        <p className="hint">
          ライブラリーの記事を開いて、下の「📂 棚に移す」で、ここに集められます（ライブラリーにも残ります）。
        </p>
      )}
      {isPhotos && (
        <p className="hint">
          下の「＋ 写真を入れる」で、何枚でもまとめて入れられます（文字は読みません。ライブラリーにも並びます）。
        </p>
      )}
      {photoNotice && <p className="notice" role="status">{photoNotice}</p>}

      {isAi && !merging && (
        <AiCardGrid cards={aiCards} counts={aiCounts} onOpen={(c) => onOpenAiCard?.(c)} onChanged={loadAiCards} />
      )}
      {isAi && <h2 className="ai-zukan-title">この棚の記事</h2>}

      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur(); // スマホのキーボードを閉じる
          setQuery(input.trim());
        }}
      >
        <span className="search-icon" aria-hidden="true">🔍</span>
        <input
          className="search-input"
          type="search"
          enterKeyHint="search"
          placeholder="言葉で探す（タイトル・文章・メモ・誰の言葉）"
          aria-label="ライブラリーを検索"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {input && (
          <button type="button" className="search-clear" onClick={() => setInput('')} aria-label="検索をやめる">
            ×
          </button>
        )}
      </form>

      <div className="library-tools">
        {merging ? (
          <p className="hint">まとめたい記事を、2件以上タップして選んでください。画像を押すと大きく見られます。</p>
        ) : (
          <button className="btn-small" onClick={() => setMerging(true)} disabled={total < 2}>
            記事をまとめる
          </button>
        )}
      </div>

      {!shelf && (
        <div className="segmented library-filter" role="group" aria-label="表示する記事">
          <button className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>すべて</button>
          <button className={filter === 'fav' ? 'is-on' : ''} onClick={() => setFilter('fav')}>★ お気に入り</button>
          {(unsortedCount > 0 || unsorted) && (
            <button className={unsorted ? 'is-on' : ''} onClick={() => setFilter('unsorted')}>
              整理待ち {unsortedCount}
            </button>
          )}
        </div>
      )}
      {filter === 'fav' && (
        <p className="hint">★を付けた記事です。記事を開いて、タイトル横の☆を押すと付けられます。</p>
      )}
      {unsorted && (
        <p className="hint">
          画像だけで保存したものです。開いて「画像の文字を読み取る」を押すと文字になり、ここから外れます。
        </p>
      )}

      {!loading && !error && (
        <p className="meta result-count">
          {searching ? `「${words.join(' ')}」を含むもの：${total}件` : `全部で ${total}件`}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
          <button className="btn-inline" onClick={() => load(0, query)}>もう一度読み込む</button>
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="card empty">
          {searching ? (
            <>
              <p>見つかりませんでした。</p>
              <p className="hint">
                言葉を短くするか、別の言い方で試してください。読み取りの間違いで、文字が少し違っている場合もあります。
              </p>
            </>
          ) : (
            <>
              {isPhotos ? (
                <>
                  <p>まだ写真がありません。</p>
                  <p className="hint">下の「＋ 写真を入れる」を押して、写真を選んでください。</p>
                </>
              ) : shelfInfo ? (
                <>
                  <p>まだ「{shelfInfo.name}」に記事がありません。</p>
                  <p className="hint">ライブラリーで記事を開き、下の「📂 棚に移す」から「{shelfInfo.name}」を選ぶと、ここに並びます。</p>
                </>
              ) : (
                <>
                  <p>まだ保存した情報がありません。</p>
                  <p className="hint">スクショを取り込んで「保存する」を押すと、ここに並びます。</p>
                </>
              )}
            </>
          )}
        </div>
      )}

      {isWords && !merging && (
        <ul className="word-list">
          {items.map((item) => (
            <li key={item.id}>
              <button className="word-card" onClick={() => onOpen(item.id)}>
                <span className="word-text">{highlight(wordText(item), words)}</span>
                {item.source && <span className="word-source">— {highlight(item.source, words)}</span>}
                <span className="word-foot">
                  {item.imagePath && urls[item.imagePath] && <img src={urls[item.imagePath]} alt="" loading="lazy" />}
                  <span className="item-meta">{formatDate(item.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isPhotos && !merging && (
        <ul className="photo-grid">
          {items.map((item) => (
            <li key={item.id}>
              <button className="photo-cell" onClick={() => onOpen(item.id)} aria-label={`${item.title} を開く`}>
                {item.imagePath && urls[item.imagePath] ? (
                  <img src={urls[item.imagePath]} alt="" loading="lazy" />
                ) : (
                  <span className="thumb-empty" aria-hidden="true">{item.isNote ? '✎' : '🖼️'}</span>
                )}
                {item.favorite && <span className="photo-fav" aria-hidden="true">★</span>}
                {item.imageCount > 1 && <span className="photo-count" aria-hidden="true">{item.imageCount}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!(isWords && !merging) && !(isPhotos && !merging) && (
      <ul className="item-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className={`item-row ${merging ? 'is-picking' : ''} ${picked.some((x) => x.id === item.id) ? 'is-picked' : ''}`}
              onClick={() => (merging ? togglePick(item) : onOpen(item.id))}
              aria-pressed={merging ? picked.some((x) => x.id === item.id) : undefined}
            >
              {merging && (
                <span className="pick-mark" aria-hidden="true">
                  {picked.some((x) => x.id === item.id) ? '✓' : ''}
                </span>
              )}
              <span
                className={`item-thumb ${merging ? 'is-zoomable' : ''}`}
                onClick={
                  merging
                    ? (e) => {
                        e.stopPropagation(); // 選ぶ状態のときは、画像を押すと拡大（選ぶ・外すは画像の外を押す）
                        setViewing(item);
                      }
                    : undefined
                }
              >
                {item.imagePath && urls[item.imagePath] ? (
                  <img src={urls[item.imagePath]} alt="" loading="lazy" />
                ) : (
                  <span className="thumb-empty" aria-hidden="true">{item.isNote ? '✎' : '🖼️'}</span>
                )}
              </span>
              <span className="item-main">
                <span className="item-title">
                  {item.favorite && <span className="fav-mark">★</span>}
                  {highlight(item.title, words)}
                </span>
                <span className="item-body">{highlight(snippet(item, words), words)}</span>
                <span className="item-meta">
                  {formatDate(item.createdAt)}
                  {item.edited && <span className="state-badge is-edited">手直しあり</span>}
                  {item.isNote && <span className="note-badge">ノート</span>}
                  {item.url && <span className="note-badge">🔗</span>}
                  {isAi && item.aiCardId && aiCardMap[item.aiCardId] && (
                    <span className="shelf-badge">{aiCardMap[item.aiCardId].name}</span>
                  )}
                  {!shelf && item.shelfId && shelfMap[item.shelfId] && (
                    <span className="shelf-badge">
                      {shelfMap[item.shelfId].icon} {shelfMap[item.shelfId].name}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      )}

      {loading && <p className="hint center">{searching ? '探しています…' : '読み込んでいます…'}</p>}

      {!loading && items.length < total && (
        <button className="btn-secondary" onClick={() => load(items.length, query)}>
          もっと見る（残り {total - items.length}件）
        </button>
      )}

      {!reviewing && viewing && viewing.imagePath && urls[viewing.imagePath] && (
        <ImageViewer
          src={urls[viewing.imagePath]}
          caption={viewing.title}
          onClose={() => setViewing(null)}
          actions={
            <>
              <button
                className="btn-primary"
                onClick={() => {
                  togglePick(viewing);
                  setViewing(null);
                }}
              >
                {picked.some((x) => x.id === viewing.id) ? '選ぶのをやめる' : 'これを選ぶ'}
              </button>
              <button className="btn-secondary" onClick={() => setViewing(null)}>戻る</button>
            </>
          }
        />
      )}

      <button className="trash-link" onClick={onTrash}>
        ゴミ箱{trashCount > 0 ? `（${trashCount}件）` : ''}を見る
      </button>

      {isPhotos && (
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
        />
      )}
      <div className="bottom-action">
        {merging ? (
          <>
            <button
              className="btn-primary btn-large"
              onClick={() => {
                const t = mergedTitle(picked);
                setMergeTitle(t.startsWith('画像のみ（') ? '' : t);
                setReviewing(true);
                window.scrollTo({ top: 0 });
              }}
              disabled={picked.length < 2}
            >
              {picked.length < 2 ? '2件以上選んでください' : `選んだ${picked.length}件を確認してまとめる`}
            </button>
            <button className="btn-text" onClick={stopMerging} disabled={mergeBusy}>やめる</button>
          </>
        ) : isPhotos ? (
          <button className="btn-primary btn-large" onClick={() => photoRef.current?.click()} disabled={photoProgress !== null}>
            {photoProgress ? `入れています…（${photoProgress.done} / ${photoProgress.total}枚）` : '＋ 写真を入れる'}
          </button>
        ) : (
          <button className="btn-primary btn-large" onClick={onImport}>
            ＋ スクショを取り込む
          </button>
        )}
      </div>
    </section>
  );
}

const SNIPPET = 60;

/**
 * 一覧に出す本文。検索中は、見つかった言葉の少し前から表示する（メモで見つかったらメモを表示）。
 */
function snippet(item: ItemSummary, words: string[]): string {
  const flat = (t: string) => t.replace(/\s+/g, ' ').trim();
  const cut = (t: string, start: number) => {
    const chars = [...t];
    const s = Math.max(0, start);
    const body = chars.slice(s, s + SNIPPET).join('');
    return `${s > 0 ? '…' : ''}${body}${s + SNIPPET < chars.length ? '…' : ''}`;
  };

  const body = flat(item.body);
  if (words.length === 0) return cut(body, 0);

  for (const text of [body, flat(item.memo)]) {
    const lower = text.toLowerCase();
    const hit = words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0);
    if (hit.length) {
      const pos = [...text.slice(0, Math.min(...hit))].length;
      return (text === body ? '' : 'メモ：') + cut(text, pos - 15);
    }
  }
  return cut(body, 0);
}

/** 見つかった言葉に色を付ける */
function highlight(text: string, words: string[]): ReactNode {
  if (words.length === 0) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
}

/** ことばの宝箱のカードに出す言葉（手直しした文章 → 読み取った文章 → タイトルの順に使う） */
function wordText(item: ItemSummary): string {
  const text = (item.body || item.title).trim();
  const chars = [...text];
  return chars.length > 140 ? `${chars.slice(0, 140).join('')}…` : text;
}
