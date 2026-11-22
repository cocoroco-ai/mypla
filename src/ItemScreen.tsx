import { useEffect, useState } from 'react';
import { TRASH_DAYS, formatDate, getItem, imageUrls, setReadText, trashItem, updateItem, type ItemDetail } from './library';
import { recognize, type OcrProgress } from './ocr';
import { suggestTitle } from './ImportScreen';

/**
 * 保存した情報の詳細画面。
 * 読む・コピーする・ひとことメモを書く・タイトルと文章を書き換える。
 * 削除は「ゴミ箱に入れる」（30日間は元に戻せる）。
 */
export default function ItemScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
        if (detail.imagePath) {
          const map = await imageUrls([detail.imagePath]);
          setImageUrl(map[detail.imagePath] ?? null);
        }
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

  /** 画像だけで保存した記事の文字を、あとから読み取る（画像全体を読む） */
  async function readImageText() {
    if (!item || !imageUrl) return;
    setError('');
    setReading({ label: '準備中', ratio: 0 });
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error('画像を取り出せませんでした');
      const blob = await res.blob();
      const file = new File([blob], 'image', { type: blob.type || 'image/jpeg' });
      const r = await recognize(file, setReading, []);
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

          {imageUrl && (
            <div className="card">
              <h2 className="card-title">元の画像</h2>
              <a href={imageUrl} target="_blank" rel="noreferrer">
                <img className="item-image" src={imageUrl} alt="保存した元の画像" />
              </a>
              <p className="hint">画像を押すと、大きく表示できます。</p>
            </div>
          )}

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
