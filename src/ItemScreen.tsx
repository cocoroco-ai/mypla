import { useEffect, useRef, useState } from 'react';
import { TRASH_DAYS, addImagesToItem, appendReadText, formatDate, getItem, imageUrls, setReadText, trashItem, updateItem, type ItemDetail } from './library';
import { recognize, type OcrProgress } from './ocr';
import { suggestTitle } from './ImportScreen';

/**
 * 保存した情報の詳細画面。
 * 読む・コピーする・ひとことメモを書く・タイトルと文章を書き換える。
 * 削除は「ゴミ箱に入れる」（30日間は元に戻せる）。
 */
export default function ItemScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [imageUrlList, setImageUrlList] = useState<string[]>([]);
  const imageUrl = imageUrlList[0] ?? null;
  const addRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
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
      if (!imageOnly) {
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
      await updateItem(id, { title: draftTitle, text: { value: draftText, ocrText: item.ocrText } });
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
  const imageOnly = item !== null && !item.ocrText && !item.edited;

  return (
    <section>
      <button className="link-back" onClick={back}>← ライブラリー</button>

      {error && <p className="error" role="alert">{error}</p>}
      {!item && !error && <p className="hint center">読み込んでいます…</p>}

      {item && !editing && (
        <>
          <h1 className="screen-title">{item.title}</h1>
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
            <h2 className="card-title">元の画像{imageUrlList.length > 1 ? `（${imageUrlList.length}枚）` : ''}</h2>
            {imageUrlList.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="item-image-link">
                {imageUrlList.length > 1 && <span className="item-image-no">{i + 1}枚目</span>}
                <img className="item-image" src={url} alt={`保存した元の画像（${i + 1}枚目）`} />
              </a>
            ))}
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
              {adding ? '画像を足しています…' : '＋ 続きの画像を足す'}
            </button>
            <p className="hint">
              {imageOnly
                ? '足した画像は、この記事の後ろに並びます。'
                : '足した画像も文字を読み取って、文章の最後につなげます。'}
            </p>
            {!imageOnly && imageUrlList.length > 0 && (
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
              {draftEdited && (
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
