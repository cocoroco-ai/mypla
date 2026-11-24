import { useEffect, useRef, useState } from 'react';
import ImageViewer from './ImageViewer';
import { StudyStatusPicker, StudyThemePicker } from './StudyNote';
import AiHandoff from './AiHandoff';
import CropEditor from './CropEditor';
import { TRASH_DAYS, addImagesToItem, appendReadText, deleteImage, formatDate, getItem, listShelves, listAiCards, listStudyThemes, type AiCard, type StudyStatus, type StudyTheme, type Shelf, imageUrls, replaceImage, setReadText, splitImage, trashItem, updateItem, type ItemDetail } from './library';
import { recognize, type OcrProgress } from './ocr';
import { suggestTitle } from './ImportScreen';

/**
 * 保存した情報の詳細画面。
 * 読む・コピーする・ひとことメモを書く・タイトルと文章を書き換える。
 * 削除は「ゴミ箱に入れる」（30日間は元に戻せる）。
 */
export default function ItemScreen({ id, onBack, backLabel = 'ライブラリー' }: { id: string; onBack: () => void; backLabel?: string }) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [imageUrlList, setImageUrlList] = useState<string[]>([]);
  const imageUrl = imageUrlList[0] ?? null;
  const addRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  // 開いたときは「見る画面」（画像が先）。直すときだけ「✎ 編集する」で今までの画面にする
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  useEffect(() => {
    setMode('view');
  }, [id]);
  const [imageBusy, setImageBusy] = useState(false);
  const [notice, setNotice] = useState('');
  // タイトルだけをその場で直す
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // ひとことメモ
  const [memo, setMemo] = useState('');
  const [memoState, setMemoState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 書き換え
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reading, setReading] = useState<OcrProgress | null>(null);

  async function loadImages(detail: ItemDetail) {
    if (detail.imagePaths.length === 0) return setImageUrlList([]);
    const map = await imageUrls(detail.imagePaths);
    setImageUrlList(detail.imagePaths.map((p) => map[p]).filter(Boolean));
  }

  async function readFiles(urls: string[]) {
    const texts: string[] = [];
    let confidence = 0;
    for (const [i, url] of urls.entries()) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('画像を取り出せませんでした');
      const blob = await res.blob();
      const file = new File([blob], 'image', { type: blob.type || 'image/jpeg' });
      const r = await recognize(
        file,
        (p) => setReading(urls.length > 1 ? { label: `${i + 1}/${urls.length}枚目：${p.label}`, ratio: (i + p.ratio) / urls.length } : p),
        [],
      );
      if (r.text.trim()) texts.push(r.text);
      confidence += r.confidence;
    }
    return { text: texts.join('\n\n'), confidence: urls.length ? confidence / urls.length : 0 };
  }

  /** 続きの画像を足す。文字にしてある記事なら、足した画像も読み取って文章の最後につなげる */
  async function addImages(list: FileList | null) {
    if (!item) return;
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setError('');
    setAdding(true);
    try {
      const before = item.imagePaths.length;
      await addImagesToItem(id, files);
      const detail = await reload();
      const map = await imageUrls(detail.imagePaths);
      const urls = detail.imagePaths.map((p) => map[p]).filter(Boolean);
      setImageUrlList(urls);
      if (!imageOnly && !item.isNote) {
        setReading({ label: '準備中', ratio: 0 });
        const r = await readFiles(urls.slice(before));
        await appendReadText(detail, r.text);
        await reload();
      }
    } catch (e) {
      setError(`画像を足せませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setReading(null);
      setAdding(false);
    }
  }

  /** 1枚を別の記事（整理待ち）として切り離す、または削除する */
  async function removeImage(index: number, how: 'split' | 'delete') {
    if (!item) return;
    const image = item.images[index];
    if (!image) return;
    const ok =
      how === 'split'
        ? window.confirm(`${index + 1}枚目を、この記事から外して別の記事（整理待ち）にしますか？
画像は消えません。`)
        : window.confirm(`${index + 1}枚目の画像を完全に削除しますか？
元に戻せません。`);
    if (!ok) return;
    setError('');
    setNotice('');
    setImageBusy(true);
    try {
      if (how === 'split') await splitImage(image.id);
      else await deleteImage(image.id, image.path);
      setViewIndex(null);
      const detail = await reload();
      await loadImages(detail);
      setNotice(
        (how === 'split' ? '画像を外して、別の記事（整理待ち）にしました。' : '画像を削除しました。') +
          (detail.body ? '文章はそのまま残っています。必要なら「全部の画像から文字を読み取り直す」で作り直せます。' : ''),
      );
    } catch (e) {
      setError(`うまくいきませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setImageBusy(false);
    }
  }

  // あとから切り抜く（何枚目を切り抜いているか）
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  useEffect(() => {
    setCropIndex(null);
  }, [id, mode]);

  /** 1枚を、切り抜いた画像に置き換える。選んでいれば、全部の画像から文字を読み取り直す */
  async function cropImage(index: number, file: File, reread: boolean) {
    if (!item) return;
    const image = item.images[index];
    if (!image) return;
    setError('');
    setNotice('');
    setImageBusy(true);
    try {
      await replaceImage(image.id, id, image.path, file);
      const detail = await reload();
      const map = await imageUrls(detail.imagePaths);
      const urls = detail.imagePaths.map((p) => map[p]).filter(Boolean);
      setImageUrlList(urls);
      setCropIndex(null);
      if (reread) {
        setReading({ label: '準備中', ratio: 0 });
        const r = await readFiles(urls);
        await setReadText(id, r.text, r.confidence);
        await reload();
        setNotice('切り抜いて、文字も読み取り直しました。');
      } else {
        setNotice(
          '画像を切り抜きました。' +
            (detail.body && !item.isNote ? '文章はそのまま残っています。必要なら「全部の画像から文字を読み取り直す」で作り直せます。' : ''),
        );
      }
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(`切り抜けませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setReading(null);
      setImageBusy(false);
    }
  }

  // リンク
  const [linkEditing, setLinkEditing] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  async function saveLink() {
    setError('');
    setLinkSaving(true);
    try {
      await updateItem(id, { url: linkDraft });
      await reload();
      setLinkEditing(false);
    } catch (e) {
      setError(`リンクを保存できませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setLinkSaving(false);
    }
  }

  // ★お気に入り
  const [favBusy, setFavBusy] = useState(false);
  async function toggleFavorite() {
    if (!item) return;
    setFavBusy(true);
    setError('');
    try {
      await updateItem(id, { favorite: !item.favorite });
      await reload();
    } catch (e) {
      setError(`お気に入りを変えられませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setFavBusy(false);
    }
  }

  async function saveTitle() {
    setError('');
    setTitleSaving(true);
    try {
      await updateItem(id, { title: titleDraft });
      await reload();
      setTitleEditing(false);
    } catch (e) {
      setError(`タイトルを保存できませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setTitleSaving(false);
    }
  }

  async function reload() {
    const detail = await getItem(id);
    setItem(detail);
    setMemo(detail.memo);
    return detail;
  }

  useEffect(() => {
    (async () => {
      try {
        const detail = await reload();
        await loadImages(detail);
      } catch (e) {
        setError(e instanceof Error ? e.message : '読み込めませんでした。');
      }
    })();
  }, [id]);

  const memoDirty = item !== null && memo.trim() !== item.memo;

  // 棚（ことばの宝箱など）と「誰の言葉・どこで見たか」
  const [source, setSource] = useState('');
  const [sourceState, setSourceState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [shelfBusy, setShelfBusy] = useState(false);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  useEffect(() => {
    listShelves().then(setShelves).catch(() => setShelves([]));
  }, []);
  const currentShelf = shelves.find((x) => x.id === item?.shelfId) ?? null;
  // AI図鑑：どのAIの話か（AI図鑑の見た目の棚に置いたとき、またはひもづけ済みのときだけ読む）
  const isAiShelf = currentShelf?.style === 'ai';
  const [aiCards, setAiCards] = useState<AiCard[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const needAiCards = isAiShelf || Boolean(item?.aiCardId);
  useEffect(() => {
    if (!needAiCards || aiCards !== null) return;
    listAiCards().then(setAiCards).catch(() => setAiCards([]));
  }, [needAiCards, aiCards]);
  const currentAiCard = aiCards?.find((c) => c.id === item?.aiCardId) ?? null;
  // 学びノート：テーマと覚えた印（学びノートの見た目の棚に置いたときだけ）
  const isStudyShelf = currentShelf?.style === 'study';
  const [studyThemes, setStudyThemes] = useState<StudyTheme[] | null>(null);
  const [studyBusy, setStudyBusy] = useState(false);
  const needStudy = isStudyShelf || Boolean(item?.studyThemeId);
  useEffect(() => {
    if (!needStudy || studyThemes !== null) return;
    listStudyThemes().then(setStudyThemes).catch(() => setStudyThemes([]));
  }, [needStudy, studyThemes]);
  const currentStudyTheme = studyThemes?.find((t) => t.id === item?.studyThemeId) ?? null;

  async function changeStudy(patch: { studyThemeId?: string | null; studyStatus?: StudyStatus }) {
    if (!item) return;
    setError('');
    setStudyBusy(true);
    try {
      await updateItem(id, patch);
      setItem({
        ...item,
        ...(patch.studyThemeId !== undefined ? { studyThemeId: patch.studyThemeId } : {}),
        ...(patch.studyStatus !== undefined ? { studyStatus: patch.studyStatus } : {}),
      });
    } catch (e) {
      setError(`変えられませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setStudyBusy(false);
    }
  }

  async function pickAiCard(next: AiCard | null) {
    if (!item || (next?.id ?? null) === item.aiCardId) return;
    setError('');
    setAiBusy(true);
    try {
      await updateItem(id, { aiCardId: next?.id ?? null });
      await reload();
      setNotice(next ? `「${next.name}」の記事にしました。` : 'AIのひもづけを外しました。');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(`変えられませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setAiBusy(false);
    }
  }
  useEffect(() => {
    if (item) setSource(item.source);
  }, [item?.id, item?.source]);
  const sourceDirty = item !== null && source.trim() !== item.source;

  async function moveToShelf(next: Shelf | null) {
    if (!item || (next?.id ?? null) === item.shelfId) return;
    setError('');
    setShelfBusy(true);
    try {
      await updateItem(id, { shelfId: next?.id ?? null });
      await reload();
      setNotice(next ? `「${next.name}」に移しました（ライブラリーにも残っています）。` : '棚から外しました（ライブラリーには残っています）。');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(`移せませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setShelfBusy(false);
    }
  }

  async function saveSource() {
    setError('');
    setSourceState('saving');
    try {
      await updateItem(id, { source });
      await reload();
      setSourceState('saved');
      setTimeout(() => setSourceState('idle'), 1500);
    } catch (e) {
      setSourceState('idle');
      setError(`保存できませんでした。${e instanceof Error ? e.message : ''}`);
    }
  }
  const editDirty = editing && item !== null && (draftTitle !== item.title || draftText !== item.body);

  function back() {
    if ((memoDirty || editDirty) && !window.confirm('保存していない変更があります。保存せずに戻りますか？')) return;
    onBack();
  }

  async function copy() {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('コピーできませんでした。文章を長押しして選択してください。');
    }
  }

  async function saveMemo() {
    setError('');
    setMemoState('saving');
    try {
      await updateItem(id, { memo });
      await reload();
      setMemoState('saved');
      setTimeout(() => setMemoState('idle'), 1500);
    } catch (e) {
      setMemoState('idle');
      setError(`メモを保存できませんでした。${e instanceof Error ? e.message : ''}`);
    }
  }

  function startEdit() {
    if (!item) return;
    setDraftTitle(item.title);
    setDraftText(item.body);
    setShowOcr(false);
    setEditing(true);
    window.scrollTo({ top: 0 });
  }

  function cancelEdit() {
    if (editDirty && !window.confirm('書き換えた内容を取り消しますか？')) return;
    setEditing(false);
    window.scrollTo({ top: 0 });
  }

  async function saveEdit() {
    if (!item) return;
    setError('');
    setSavingEdit(true);
    try {
      await updateItem(
        id,
        item.isNote
          ? { title: draftTitle, noteText: draftText }
          : { title: draftTitle, text: { value: draftText, ocrText: item.ocrText } },
      );
      await reload();
      setEditing(false);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(`保存できませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setSavingEdit(false);
    }
  }

  /** 画像だけで保存した記事の文字を、あとから読み取る（画像全体を読む）。文字のある記事では「読み取り直し」 */
  async function readImageText() {
    if (!item || imageUrlList.length === 0) return;
    if (
      !imageOnly &&
      !window.confirm(
        `全部の画像（${imageUrlList.length}枚）から文字を読み取り直しますか？
今の文章は、読み取り直した文章に置き換わります${item.edited ? '（手直しした内容も消えます）' : ''}。`,
      )
    )
      return;
    setError('');
    setReading({ label: '準備中', ratio: 0 });
    try {
      const r = await readFiles(imageUrlList);
      // タイトルが自動で付けた「画像のみ（…）」のままなら、読み取った文章から付け直す
      const newTitle = item.title.startsWith('画像のみ（') && r.text.trim() ? suggestTitle(r.text) : undefined;
      await setReadText(id, r.text, r.confidence, newTitle);
      await reload();
      if (!r.text.trim()) setError('文字が見つかりませんでした。文字の無い画像かもしれません。');
    } catch (e) {
      setError(`文字を読み取れませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setReading(null);
    }
  }

  async function moveToTrash() {
    if (!window.confirm(`「${item?.title ?? ''}」をゴミ箱に入れますか？
${TRASH_DAYS}日間はゴミ箱から元に戻せます。`)) return;
    setError('');
    try {
      await trashItem(id);
      onBack();
    } catch (e) {
      setError(`ゴミ箱に入れられませんでした。${e instanceof Error ? e.message : ''}`);
    }
  }

  const draftEdited = item !== null && draftText !== item.ocrText;
  // 画像だけで保存した記事（読み取った文章も手直しした文章も無い）
  const imageOnly = item !== null && !item.isNote && !item.ocrText && !item.edited;

  return (
    <section>
      <button className="link-back" onClick={back}>← {backLabel}</button>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {!item && !error && <p className="hint center">読み込んでいます…</p>}

      {item && !editing && mode === 'view' && (
        <div className="item-view">
          <div className="title-row">
            <h1 className="screen-title">{item.title}</h1>
            <button
              className={`fav-toggle ${item.favorite ? 'is-on' : ''}`}
              onClick={toggleFavorite}
              disabled={favBusy}
              aria-pressed={item.favorite}
              aria-label={item.favorite ? 'お気に入りから外す' : 'お気に入りにする'}
            >
              {item.favorite ? '★' : '☆'}
            </button>
            <button
              className="btn-small is-primary"
              onClick={() => {
                setMode('edit');
                setNotice('');
                window.scrollTo({ top: 0 });
              }}
            >
              ✎ 編集する
            </button>
          </div>
          <p className="meta">
            {formatDate(item.createdAt)} に保存
            {currentShelf && (
              <span className="shelf-badge">
                {currentShelf.icon} {currentShelf.name}
              </span>
            )}
            {currentAiCard && <span className="shelf-badge">{currentAiCard.name}</span>}
            {isStudyShelf && currentStudyTheme && <span className="shelf-badge">{currentStudyTheme.name}</span>}
          </p>

          {isStudyShelf && item.memo && <p className="study-memo-big">{item.memo}</p>}

          {imageUrlList.length > 0 && (
            <div className="view-images">
              {imageUrlList.map((url, i) => (
                <button key={url} className="item-image-link" onClick={() => setViewIndex(i)} aria-label={`${i + 1}枚目を大きく見る`}>
                  {imageUrlList.length > 1 && <span className="item-image-no">{i + 1}枚目</span>}
                  <img className="item-image" src={url} alt={`保存した画像（${i + 1}枚目）`} />
                </button>
              ))}
              <p className="hint">画像を押すと、大きく表示できます（指で広げて拡大もできます）。</p>
            </div>
          )}

          {imageOnly && !item.isPhoto && (
            <div className="card image-only">
              <p className="hint">まだ文字にしていない記事です。文字にすると、検索やコピーができるようになります。</p>
              {reading ? (
                <>
                  <p className="progress-label">{reading.label}…</p>
                  <div className="progress"><div style={{ width: `${Math.round(reading.ratio * 100)}%` }} /></div>
                </>
              ) : (
                <button className="btn-primary" onClick={readImageText} disabled={!imageUrl}>
                  画像の文字を読み取る
                </button>
              )}
            </div>
          )}

          {!imageOnly && item.body && (
            <div className="card">
              <div className="item-text">{item.body}</div>
              {item.source && <p className="item-source">— {item.source}</p>}
              <div className="button-row">
                <button className="btn-secondary" onClick={copy}>
                  {copied ? 'コピーしました' : '文章をコピー'}
                </button>
              </div>
              <div className="ai-row">
                <AiHandoff title={item.title} body={item.body} url={item.url} source={item.source} />
              </div>
            </div>
          )}

          {(item.url || (item.memo && !isStudyShelf)) && (
            <div className="card view-extra">
              {item.url && (
                <a className="item-link" href={item.url} target="_blank" rel="noopener noreferrer">
                  🔗 {linkLabel(item.url)}
                </a>
              )}
              {item.memo && !isStudyShelf && <p className="view-memo">💬 {item.memo}</p>}
            </div>
          )}

          {isStudyShelf && (
            <div className="card study-card">
              <h2 className="card-title">覚えた？</h2>
              <StudyStatusPicker value={item.studyStatus} onChange={(v) => changeStudy({ studyStatus: v })} disabled={studyBusy} />
              <h2 className="card-title edit-gap">テーマ</h2>
              {studyThemes === null ? (
                <p className="hint">読み込んでいます…</p>
              ) : (
                <StudyThemePicker
                  themes={studyThemes}
                  value={item.studyThemeId}
                  onChange={(v) => v !== item.studyThemeId && changeStudy({ studyThemeId: v })}
                  onAdded={(t) => setStudyThemes((list) => [...(list ?? []), t])}
                  disabled={studyBusy}
                />
              )}
              {!item.memo && (
                <p className="hint">「✎ 編集する」のひとことメモに、学んだことを1行で書くと、ここと学びノートの一覧に大きく出ます。</p>
              )}
            </div>
          )}

          <button
            className="btn-secondary view-shelf-button"
            onClick={() => {
              setMode('edit');
              setNotice('');
              // 編集画面の「棚に移す」の欄まで動かす
              setTimeout(() => document.querySelector('.shelf-card')?.scrollIntoView({ block: 'start' }), 50);
            }}
          >
            {currentShelf ? `${currentShelf.icon} 棚を変える${isAiShelf ? '・どのAIの話か選ぶ' : ''}` : '📂 棚に移す'}
          </button>

          {viewIndex !== null && imageUrlList[viewIndex] && (
            <ImageViewer
              src={imageUrlList[viewIndex]}
              caption={imageUrlList.length > 1 ? `${viewIndex + 1} / ${imageUrlList.length}枚目` : item.title}
              onClose={() => setViewIndex(null)}
              actions={
                <>
                  {imageUrlList.length > 1 && (
                    <>
                      <button className="btn-secondary" onClick={() => setViewIndex(Math.max(0, viewIndex - 1))} disabled={viewIndex === 0}>
                        ← 前
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setViewIndex(Math.min(imageUrlList.length - 1, viewIndex + 1))}
                        disabled={viewIndex === imageUrlList.length - 1}
                      >
                        次 →
                      </button>
                    </>
                  )}
                  <button className="btn-primary" onClick={() => setViewIndex(null)}>
                    戻る
                  </button>
                </>
              }
            />
          )}
        </div>
      )}

      {item && !editing && mode === 'edit' && (
        <>
          <button className="btn-small view-back" onClick={() => { setMode('view'); window.scrollTo({ top: 0 }); }}>
            ← 見る画面に戻る
          </button>
          {titleEditing ? (
            <form
              className="title-edit"
              onSubmit={(e) => {
                e.preventDefault();
                saveTitle();
              }}
            >
              <input
                className="title-input"
                value={titleDraft}
                maxLength={100}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                aria-label="タイトル"
                enterKeyHint="done"
              />
              <div className="title-edit-actions">
                <button type="submit" className="btn-small is-primary" disabled={titleSaving}>
                  {titleSaving ? '保存しています…' : '保存'}
                </button>
                <button type="button" className="btn-small" onClick={() => setTitleEditing(false)} disabled={titleSaving}>
                  やめる
                </button>
              </div>
            </form>
          ) : (
            <div className="title-row">
              <h1 className="screen-title">{item.title}</h1>
              <button
                className="btn-small"
                onClick={() => {
                  setTitleDraft(item.title.startsWith('画像のみ（') ? '' : item.title);
                  setTitleEditing(true);
                }}
              >
                ✎ タイトル
              </button>
            </div>
          )}
          <p className="meta">
            {formatDate(item.createdAt)} に保存
            {item.updatedAt !== item.createdAt && formatDate(item.updatedAt) !== formatDate(item.createdAt) && (
              <>・{formatDate(item.updatedAt)} に更新</>
            )}
            {item.edited && <span className="state-badge is-edited">手直しあり</span>}
          </p>

          <div className="card">
            {imageOnly ? (
              <div className="image-only">
                <p className="hint">この記事は、文字を読まずに画像だけで保存しています。文字にすると、検索やコピーができるようになります。</p>
                {reading ? (
                  <>
                    <p className="progress-label">{reading.label}…</p>
                    <div className="progress"><div style={{ width: `${Math.round(reading.ratio * 100)}%` }} /></div>
                  </>
                ) : (
                  <button className="btn-primary" onClick={readImageText} disabled={!imageUrl}>
                    画像の文字を読み取る
                  </button>
                )}
              </div>
            ) : (
              <div className="item-text">{showOcr ? item.ocrText : item.body}</div>
            )}
            {item.source && !imageOnly && (
              <p className="item-source">— {item.source}</p>
            )}
            {item.edited && (
              <button className="btn-inline" onClick={() => setShowOcr((v) => !v)}>
                {showOcr ? '手直しした文章を表示する' : '読み取ったままの文章を表示する'}
              </button>
            )}
            <div className="button-row">
              <button className="btn-secondary" onClick={copy} disabled={!item.body}>
                {copied ? 'コピーしました' : '文章をコピー'}
              </button>
              <button className="btn-secondary" onClick={startEdit}>
                タイトル・文章を直す
              </button>
            </div>
          </div>

          <div className="card link-card">
            <h2 className="card-title">リンク</h2>
            {item.url && !linkEditing && (
              <a className="item-link" href={item.url} target="_blank" rel="noopener noreferrer">
                🔗 {linkLabel(item.url)}
              </a>
            )}
            {linkEditing ? (
              <div className="link-edit">
                <input
                  className="title-input"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  placeholder="https://…（公式サイト、元のページなど）"
                  autoFocus
                />
                <div className="title-edit-actions">
                  <button className="btn-small is-primary" onClick={saveLink} disabled={linkSaving}>
                    {linkSaving ? '保存しています…' : '保存'}
                  </button>
                  <button className="btn-small" onClick={() => setLinkEditing(false)} disabled={linkSaving}>
                    やめる
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn-small"
                onClick={() => {
                  setLinkDraft(item.url);
                  setLinkEditing(true);
                }}
              >
                {item.url ? 'リンクを変える' : '＋ リンクを付ける'}
              </button>
            )}
          </div>

          <div className="card shelf-card">
            <h2 className="card-title">棚に移す</h2>
            <p className="hint">特に分けたいときに選びます。どの棚に移しても、ライブラリーにも残ります。</p>
            <div className="shelf-choices" role="group" aria-label="置く棚">
              {shelves.map((sh) => (
                <button
                  key={sh.id}
                  className={`shelf-choice ${item.shelfId === sh.id ? 'is-on' : ''}`}
                  onClick={() => moveToShelf(sh)}
                  disabled={shelfBusy}
                  aria-pressed={item.shelfId === sh.id}
                >
                  {sh.icon} {sh.name}
                </button>
              ))}
            </div>
            {shelves.length === 0 && <p className="hint">棚がありません。ホームの「＋ 棚を追加・編集」で作れます。</p>}
            {item.shelfId && (
              <button className="btn-text" onClick={() => moveToShelf(null)} disabled={shelfBusy}>
                棚から外す（ライブラリーだけにする）
              </button>
            )}
            {(isAiShelf || currentAiCard) && (
              <div className="source-field">
                <h3 className="source-title">どのAIの話？</h3>
                <p className="hint">選ぶと、AI図鑑でそのAIのカードを開いたときに、この記事が並びます。</p>
                {aiCards === null ? (
                  <p className="hint">読み込んでいます…</p>
                ) : aiCards.length === 0 ? (
                  <p className="hint">AIカードがありません。AI図鑑の棚の「＋ AIを追加」で作れます。</p>
                ) : (
                  <div className="shelf-choices" role="group" aria-label="どのAIの話か">
                    {aiCards.map((c) => (
                      <button
                        key={c.id}
                        className={`shelf-choice ${item.aiCardId === c.id ? 'is-on' : ''}`}
                        onClick={() => pickAiCard(c)}
                        disabled={aiBusy}
                        aria-pressed={item.aiCardId === c.id}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {item.aiCardId && (
                  <button className="btn-text" onClick={() => pickAiCard(null)} disabled={aiBusy}>
                    どのAIでもない（ひもづけを外す）
                  </button>
                )}
              </div>
            )}
            {(currentShelf?.style === 'cards' || item.source) && (
              <div className="source-field">
                <h3 className="source-title">
                  誰の言葉・どこで見たか <span className="optional">任意</span>
                </h3>
                <p className="hint">分からなければ空欄のままで大丈夫です。棚への移動は、もう保存されています。</p>
                <input
                  className="title-input"
                  value={source}
                  maxLength={200}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="例：〇〇さんの本『△△』より、セミナーで聞いた言葉 など"
                  enterKeyHint="done"
                />
                {(sourceDirty || sourceState !== 'idle') && (
                  <button className="btn-small is-primary" onClick={saveSource} disabled={!sourceDirty || sourceState === 'saving'}>
                    {sourceState === 'saving' ? '保存しています…' : sourceState === 'saved' ? '保存しました' : '保存'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card-title">ひとことメモ</h2>
            <textarea
              className="memo-input"
              value={memo}
              maxLength={2000}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="なぜ保存したか、何に使うかなど（検索の対象になります）"
            />
            <button className="btn-primary memo-save" onClick={saveMemo} disabled={!memoDirty || memoState === 'saving'}>
              {memoState === 'saving' ? '保存しています…' : memoState === 'saved' ? '保存しました' : 'メモを保存'}
            </button>
          </div>

          <div className="card">
            <h2 className="card-title">
              {item.isNote ? '写真・画像' : '元の画像'}
              {imageUrlList.length > 1 ? `（${imageUrlList.length}枚）` : ''}
            </h2>
            {imageUrlList.map((url, i) =>
              cropIndex === i ? (
                <CropEditor
                  key={url}
                  src={url}
                  no={i + 1}
                  canReread={!imageOnly && !item.isNote}
                  busy={imageBusy}
                  onCancel={() => setCropIndex(null)}
                  onDone={(file, reread) => cropImage(i, file, reread)}
                />
              ) : (
                <div key={url} className="item-image-block">
                  <button className="item-image-link" onClick={() => setViewIndex(i)} aria-label={`${i + 1}枚目を大きく見る`}>
                    {imageUrlList.length > 1 && <span className="item-image-no">{i + 1}枚目</span>}
                    <img className="item-image" src={url} alt={`保存した元の画像（${i + 1}枚目）`} />
                  </button>
                  <div className="image-actions">
                    <button className="btn-small" onClick={() => setCropIndex(i)} disabled={imageBusy || cropIndex !== null || reading !== null}>
                      ✂ 切り抜く
                    </button>
                    {imageUrlList.length > 1 && (
                      <>
                        <button className="btn-small" onClick={() => removeImage(i, 'split')} disabled={imageBusy}>
                          この画像を外す（別の記事に）
                        </button>
                        <button className="btn-danger-small" onClick={() => removeImage(i, 'delete')} disabled={imageBusy}>
                          削除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ),
            )}
            {viewIndex !== null && imageUrlList[viewIndex] && (
              <ImageViewer
                src={imageUrlList[viewIndex]}
                caption={imageUrlList.length > 1 ? `${viewIndex + 1} / ${imageUrlList.length}枚目` : item.title}
                onClose={() => setViewIndex(null)}
                actions={
                  imageUrlList.length > 1 ? (
                    <>
                      <button className="btn-secondary" onClick={() => setViewIndex(Math.max(0, viewIndex - 1))} disabled={viewIndex === 0}>
                        ← 前
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setViewIndex(Math.min(imageUrlList.length - 1, viewIndex + 1))}
                        disabled={viewIndex === imageUrlList.length - 1}
                      >
                        次 →
                      </button>
                      <button className="btn-secondary" onClick={() => removeImage(viewIndex, 'split')} disabled={imageBusy}>
                        この画像を外す
                      </button>
                      <button className="btn-primary" onClick={() => setViewIndex(null)}>
                        戻る
                      </button>
                    </>
                  ) : (
                    <button className="btn-primary" onClick={() => setViewIndex(null)}>
                      戻る
                    </button>
                  )
                }
              />
            )}
            {imageUrlList.length > 0 && <p className="hint">画像を押すと、大きく表示できます。</p>}
            <input
              ref={addRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => { addImages(e.target.files); e.target.value = ''; }}
            />
            <button className="btn-secondary" onClick={() => addRef.current?.click()} disabled={adding || reading !== null}>
              {adding ? '画像を足しています…' : item.isNote ? '＋ 写真・画像を添える' : '＋ 続きの画像を足す'}
            </button>
            <p className="hint">
              {item.isNote
                ? '添えた写真・画像は、このノートの下に並びます（文字にはしません）。'
                : imageOnly
                  ? '足した画像は、この記事の後ろに並びます。'
                  : '足した画像も文字を読み取って、文章の最後につなげます。'}
            </p>
            {!imageOnly && !item.isNote && imageUrlList.length > 0 && (
              reading ? (
                <p className="progress-label">{reading.label}…</p>
              ) : (
                <button className="btn-text" onClick={readImageText} disabled={adding}>
                  全部の画像から文字を読み取り直す
                </button>
              )
            )}
          </div>

          <button className="btn-danger" onClick={moveToTrash}>
            ゴミ箱に入れる
          </button>
        </>
      )}

      {item && editing && (
        <>
          <h1 className="screen-title">タイトル・文章を直す</h1>
          <div className="card">
            <h2 className="card-title">タイトル</h2>
            <input
              className="title-input"
              type="text"
              value={draftTitle}
              maxLength={100}
              onChange={(e) => setDraftTitle(e.target.value)}
              enterKeyHint="done"
            />

            <h2 className="card-title edit-gap">
              文章
              <span className={`state-badge ${draftEdited ? 'is-edited' : ''}`}>
                {draftEdited ? '手直しあり' : '読み取ったまま'}
              </span>
            </h2>
            <textarea className="ocr-text" value={draftText} onChange={(e) => setDraftText(e.target.value)} />
            <p className="hint">
              読み取ったままの文章は別に残るので、いつでも戻せます。
              {draftEdited && !item.isNote && (
                <button
                  className="btn-inline"
                  onClick={() => {
                    if (window.confirm('読み取ったときの文章に戻しますか？')) setDraftText(item.ocrText);
                  }}
                >
                  読み取ったときの文章に戻す
                </button>
              )}
            </p>
            <button className="btn-text" onClick={cancelEdit} disabled={savingEdit}>
              やめる
            </button>
          </div>

          <div className="bottom-action">
            <button className="btn-primary btn-large" onClick={saveEdit} disabled={savingEdit || !editDirty}>
              {savingEdit ? '保存しています…' : '直した内容を保存'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** リンクの見せ方：長い住所は、サイト名＋先頭だけにする */
function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const rest = decodeURIComponent(u.pathname + u.search).replace(/\/$/, '');
    const short = rest.length > 30 ? `${rest.slice(0, 30)}…` : rest;
    return `${u.hostname}${short}`;
  } catch {
    return url;
  }
}
