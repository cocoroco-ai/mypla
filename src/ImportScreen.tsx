import { useEffect, useRef, useState } from 'react';
import { recognize, type OcrProgress, type OcrResult, type Region, type RemovedLine } from './ocr';
import RegionSelector from './RegionSelector';
import ImageViewer from './ImageViewer';
import { saveImagesOnly, saveItem } from './library';

type Result = OcrResult;

export default function ImportScreen({ onBack }: { onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // 続きのスクショ（2枚目以降）。1件にまとめて保存する
  const [extraFiles, setExtraFiles] = useState<{ file: File; url: string }[]>([]);
  // まとめて取り込み（画像だけ・1枚ずつ別の記事）
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [viewExtra, setViewExtra] = useState<number | null>(null);
  const [bulkResult, setBulkResult] = useState<{ saved: number; stoppedReason: string | null } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removed, setRemoved] = useState<RemovedLine[]>([]);
  // 読み取ったままの文章（OCR結果）。手直しした文章 text と区別して持つ
  const [ocrText, setOcrText] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  // 範囲指定モード：指で囲んだ部分だけを読み取る
  const [selecting, setSelecting] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  // 読み取りに使った範囲（保存時に一緒に記録する）。全体を読んだときは null
  const [usedRegions, setUsedRegions] = useState<Region[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // 囲んだ部分だけの画像で保存する（初めはオフ＝元の画像を全部残す）
  const [cropOnly, setCropOnly] = useState(false);
  const [cropPreview, setCropPreview] = useState<string | null>(null);

  const edited = result !== null && text !== ocrText;

  /** 外した行を文章の最後に戻す（読み取り結果の一部として扱う） */
  function restore(index: number) {
    const line = removed[index];
    const add = (t: string) => (t ? `${t}\n${line.text}` : line.text);
    setText(add);
    setOcrText(add);
    setRemoved((list) => list.filter((_, i) => i !== index));
  }

  function revertText() {
    if (window.confirm('手直しした内容を取り消して、読み取ったときの文章に戻しますか？')) setText(ocrText);
  }

  // プレビュー用URLは、画像を差し替えたときに解放する（メモリ節約）
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('画像ファイルを選んでください。');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setExtraFiles([]);
    setCropOnly(false);
    setResult(null);
    setText('');
    setOcrText('');
    setRemoved([]);
    setTitle('');
    setTitleTouched(false);
    setRegions([]);
    setUsedRegions(null);
    setSaved(false);
    setError(null);
  }

  /** 続けて別のスクショを取り込むために、最初の状態に戻す */
  function reset() {
    setCropOnly(false);
    setFile(null);
    setExtraFiles([]);
    setBulkResult(null);
    setPreviewUrl(null);
    setResult(null);
    setText('');
    setOcrText('');
    setRemoved([]);
    setTitle('');
    setTitleTouched(false);
    setSelecting(false);
    setRegions([]);
    setUsedRegions(null);
    setSaved(false);
    setError(null);
  }

  /** 続きの画像を足す（読み取り済みなら、読み直しが必要になる） */
  function addMore(list: FileList | null) {
    const images = [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setExtraFiles((cur) => [...cur, ...images.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
    clearResult();
  }

  function removeExtra(index: number) {
    setExtraFiles((cur) => cur.filter((_, i) => i !== index));
    clearResult();
  }

  function clearResult() {
    setResult(null);
    setText('');
    setOcrText('');
    setRemoved([]);
    setUsedRegions(null);
  }

  /** 何枚かを一度に選んで、文字を読まずに1枚ずつ保存する */
  async function bulkSave(list: FileList | null) {
    const images = [...(list ?? [])].filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setError(null);
    setBulk({ done: 0, total: images.length });
    try {
      const r = await saveImagesOnly(images, (done, total) => setBulk({ done, total }));
      setBulkResult(r);
      window.scrollTo({ top: 0 });
    } finally {
      setBulk(null);
    }
  }

  const allFiles = file ? [file, ...extraFiles.map((x) => x.file)] : [];

  async function save() {
    if (!file || !result) return;
    setError(null);
    setSaving(true);
    try {
      // 「囲んだ部分だけ」なら、1枚目を切り抜いた画像に差し替える（範囲はもう画像そのものなので記録しない）
      const useCrop = cropOnly && usedRegions && usedRegions.length > 0;
      const files = useCrop ? [await cropToRegions(file, usedRegions), ...allFiles.slice(1)] : allFiles;
      await saveItem({
        title,
        ocrText,
        text,
        confidence: result.confidence,
        files,
        regions: useCrop ? null : usedRegions,
      });
      setSaved(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error(e);
      setError(`保存できませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  /** 文字を読まずに、画像だけすぐ保存する（あとで記事の画面から読み取れる） */
  async function saveImageOnly() {
    if (!file) return;
    setError(null);
    setSaving(true);
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const autoTitle = `画像のみ（${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}）`;
    try {
      await saveItem({ title: autoTitle, ocrText: '', text: '', confidence: null, files: allFiles, regions: null });
      setTitle(autoTitle);
      setSaved(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error(e);
      setError(`保存できませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setSaving(false);
    }
  }

  async function runOcr() {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress({ label: '準備中', ratio: 0 });
    try {
      const used = selecting ? regions : [];
      // 1枚目は（囲んだ範囲があれば）その範囲、2枚目以降は全体を読み、上から順につなげる
      const total = allFiles.length;
      const label = (i: number) => (p: OcrProgress) =>
        setProgress(total > 1 ? { label: `${i + 1}/${total}枚目：${p.label}`, ratio: (i + p.ratio) / total } : p);
      const parts: OcrResult[] = [];
      for (const [i, f] of allFiles.entries()) parts.push(await recognize(f, label(i), i === 0 ? used : []));
      const r: OcrResult = {
        ...parts[0],
        text: parts.map((x) => x.text).filter(Boolean).join('\n\n'),
        removed: parts.flatMap((x) => x.removed),
        confidence: Math.round(parts.reduce((sum, x) => sum + x.confidence, 0) / parts.length),
        seconds: Math.round(parts.reduce((sum, x) => sum + x.seconds, 0) * 10) / 10,
      };
      setResult(r);
      setUsedRegions(used.length ? used : null);
      setText(r.text);
      setOcrText(r.text);
      setRemoved(r.removed);
      if (!titleTouched) setTitle(suggestTitle(r.text));
    } catch (e) {
      console.error(e);
      setError('文字の読み取りに失敗しました。通信状態を確認して、もう一度お試しください（初回は辞書データの読み込みが必要です）。');
    } finally {
      setProgress(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('コピーできませんでした。文章を長押しして選択してください。');
    }
  }

  // 手元に良いスクショが無い人のための見本（public/samples/ にある）
  async function pickSample(src: string, name: string) {
    setError(null);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      pick(new File([blob], name, { type: 'image/jpeg' }));
    } catch {
      setError('見本の画像を読み込めませんでした。通信状態を確認してください。');
    }
  }

  const busy = progress !== null || saving;

  // チェックしたら、切り抜いた仕上がりを小さく見せる
  useEffect(() => {
    if (!cropOnly || !file || !usedRegions || usedRegions.length === 0) {
      setCropPreview(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    cropToRegions(file, usedRegions).then((f) => {
      if (cancelled) return;
      url = URL.createObjectURL(f);
      setCropPreview(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cropOnly, file, usedRegions]);

  // 「範囲を指で囲む」にしたら、画像全体が見える位置までスクロールする（途中でスクロールしなくて済むように）
  useEffect(() => {
    if (!selecting) return;
    const t = setTimeout(() => {
      const box = document.querySelector('.region-box');
      if (!box) return;
      const top = box.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(t);
  }, [selecting]);

  /** 分かれてしまった範囲を、全部を囲む1つの範囲にまとめる */
  function joinRegions() {
    if (regions.length < 2) return;
    const x1 = Math.min(...regions.map((r) => r.x));
    const y1 = Math.min(...regions.map((r) => r.y));
    const x2 = Math.max(...regions.map((r) => r.x + r.w));
    const y2 = Math.max(...regions.map((r) => r.y + r.h));
    setRegions([{ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }]);
  }

  if (bulkResult) {
    return (
      <section>
        <h1 className="screen-title">まとめて保存しました</h1>
        <div className="card saved-card">
          <p className="saved-icon" aria-hidden="true">✓</p>
          <p className="saved-title">{bulkResult.saved}件を画像だけで保存しました</p>
          {bulkResult.stoppedReason && (
            <p className="error" role="alert">途中で止まりました：{bulkResult.stoppedReason}</p>
          )}
          <p className="hint center">
            ライブラリーの「整理待ち」にまとまっています。時間のあるときに開いて、「画像の文字を読み取る」で文字にできます。
          </p>
        </div>
        <div className="bottom-action">
          <button className="btn-primary btn-large" onClick={reset}>＋ 続けて取り込む</button>
          <button className="btn-text" onClick={onBack}>ホームに戻る</button>
        </div>
      </section>
    );
  }

  if (saved) {
    return (
      <section>
        <h1 className="screen-title">保存しました</h1>
        <div className="card saved-card">
          <p className="saved-icon" aria-hidden="true">✓</p>
          <p className="saved-title">{title.trim() || 'タイトルなし'}</p>
          <p className="hint center">
            {result
              ? '文章と元の画像を保存しました。ホームの「ライブラリー」から見られます。'
              : '画像を保存しました。あとでライブラリーから開いて「画像の文字を読み取る」を押すと、文字にして検索できるようになります。'}
          </p>
        </div>
        <div className="bottom-action">
          <button className="btn-primary btn-large" onClick={reset}>＋ 続けて取り込む</button>
          <button className="btn-text" onClick={onBack}>ホームに戻る</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <button className="link-back" onClick={onBack}>← ホーム</button>
      <h1 className="screen-title">スクショを取り込む</h1>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
      />

      {!previewUrl ? (
        <button className="dropzone" onClick={() => inputRef.current?.click()}>
          <span className="dropzone-icon">🖼️</span>
          <span>タップして画像を選ぶ</span>
          <span className="sub">写真アプリのスクリーンショットから選べます</span>
        </button>
      ) : null}

      {!previewUrl && (
        <div className="card bulk-card">
          <h2 className="bulk-title">まとめて取り込む（あとで整理）</h2>
          <p className="hint">
            何枚かを一度に選んで、文字を読まずに画像だけで保存します。1枚ずつ別の記事になり、ライブラリーの「整理待ち」に入ります。
          </p>
          <input
            ref={bulkRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { bulkSave(e.target.files); e.target.value = ''; }}
          />
          {bulk ? (
            <>
              <p className="progress-label">保存しています… {bulk.done} / {bulk.total} 枚</p>
              <div className="progress"><div style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }} /></div>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => bulkRef.current?.click()}>
              画像をまとめて選ぶ
            </button>
          )}
        </div>
      )}

      {!previewUrl && (
        <div className="try-samples">
          <p className="try-title">手元にちょうどいいスクショが無いときは、見本で試せます</p>
          <div className="try-list">
            {TRY_SAMPLES.map((t) => (
              <button key={t.src} className="try-item" onClick={() => pickSample(t.src, t.file)}>
                <img src={t.src} alt="" />
                <span className="try-name">{t.name}</span>
                <span className="try-note">{t.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!previewUrl ? null : (
        <div className="card">
          <div className="segmented" role="group" aria-label="読み取り方">
            <button className={!selecting ? 'is-on' : ''} onClick={() => setSelecting(false)} disabled={busy}>
              画像全体を読む
            </button>
            <button className={selecting ? 'is-on' : ''} onClick={() => setSelecting(true)} disabled={busy}>
              範囲を指で囲む
            </button>
          </div>

          {selecting && (
            <p className="hint">
              読み取りたい文章を、指でなぞって四角で囲んでください。何か所でも囲めます（上から順につなげます）。間違えて囲んだ四角は、左上の「×」で消せます。分かれてしまったときは「1つにつなげる」で1つにできます（そのままでも、上から順につなげて読みます）。
            </p>
          )}

          <RegionSelector
            src={previewUrl}
            regions={selecting ? regions : []}
            selecting={selecting && !busy}
            onAdd={(r) => setRegions((list) => [...list, r])}
            onRemove={(r) => setRegions((list) => list.filter((x) => x !== r))}
          />

          {selecting && regions.length > 0 && (
            <div className="region-actions">
              <span className="meta">{regions.length}か所を囲んでいます</span>
              {regions.length >= 2 && (
                <button className="btn-small" onClick={joinRegions} disabled={busy}>
                  1つにつなげる
                </button>
              )}
              <button className="btn-small" onClick={() => setRegions((l) => l.slice(0, -1))} disabled={busy}>
                1つ取り消す
              </button>
              <button className="btn-small" onClick={() => setRegions([])} disabled={busy}>
                すべて消す
              </button>
            </div>
          )}

          {result && (
            <button className="btn-secondary" onClick={runOcr} disabled={busy || (selecting && regions.length === 0)}>
              {selecting && regions.length ? `囲んだ${regions.length}か所を読み取り直す` : 'もう一度読み取る'}
            </button>
          )}
          <div className="extra-images">
            <p className="extra-title">
              続きのスクショ{extraFiles.length > 0 ? `（${extraFiles.length + 1}枚で1件にまとめます。画像を押すと拡大）` : ''}
            </p>
            {extraFiles.length > 0 && (
              <ul className="extra-list">
                {extraFiles.map((x, i) => (
                  <li key={x.url}>
                    <button className="extra-zoom" onClick={() => setViewExtra(i)} aria-label={`${i + 2}枚目を大きく見る`}>
                      <img src={x.url} alt={`${i + 2}枚目`} />
                    </button>
                    <span className="extra-no">{i + 2}</span>
                    <button className="extra-remove" onClick={() => removeExtra(i)} disabled={busy} aria-label={`${i + 2}枚目を外す`}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {viewExtra !== null && extraFiles[viewExtra] && (
              <ImageViewer
                src={extraFiles[viewExtra].url}
                caption={`${viewExtra + 2}枚目`}
                onClose={() => setViewExtra(null)}
                actions={
                  <>
                    <button className="btn-primary" onClick={() => setViewExtra(null)}>
                      このまま使う（戻る）
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        removeExtra(viewExtra);
                        setViewExtra(null);
                      }}
                    >
                      この画像は外す
                    </button>
                  </>
                }
              />
            )}
            <input
              ref={moreRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => { addMore(e.target.files); e.target.value = ''; }}
            />
            <button className="btn-small" onClick={() => moreRef.current?.click()} disabled={busy}>
              ＋ 続きの画像を追加
            </button>
            {extraFiles.length > 0 && selecting && (
              <p className="hint">範囲を囲めるのは1枚目だけです。2枚目以降は画像全体を読みます。</p>
            )}
          </div>
          <button className="btn-text" onClick={() => inputRef.current?.click()} disabled={busy}>
            別の画像を選ぶ
          </button>
        </div>
      )}

      {progress && (
        <div className="card">
          <p className="progress-label">{progress.label}…</p>
          <div className="progress"><div style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {result && (
        <div className="card">
          <div className="result-head">
            <h2>タイトル</h2>
          </div>
          <input
            className="title-input"
            type="text"
            value={title}
            maxLength={100}
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
            placeholder="タイトルを入力"
            enterKeyHint="done"
          />
          <p className="hint">文章の1行目から自動で候補を入れています。自由に書き換えられます。</p>

          <div className="result-head">
            <h2>
              文章
              <span className={`state-badge ${edited ? 'is-edited' : ''}`}>{edited ? '手直しあり' : '読み取ったまま'}</span>
            </h2>
            <span className="meta">{result.seconds}秒・確からしさ {result.confidence}%</span>
          </div>
          <textarea
            className="ocr-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="文字が見つかりませんでした"
          />
          <p className="hint">
            間違いはここで直せます。読み取ったままの文章も別に残るので、いつでも戻せます。
            {edited && (
              <button className="btn-inline" onClick={revertText}>読み取ったときの文章に戻す</button>
            )}
          </p>
          {removed.length > 0 && (
            <details className="removed">
              <summary>画像などと判断して外した部分（{removed.length}行）</summary>
              <p className="hint">必要な行があれば「戻す」を押すと、文章の最後に追加されます。</p>
              <ul>
                {removed.map((r, i) => (
                  <li key={`${i}-${r.text}`}>
                    <span className="removed-text">{r.text}</span>
                    <span className="removed-reason">{r.reason}</span>
                    <button className="btn-restore" onClick={() => restore(i)}>戻す</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button className="btn-secondary" onClick={copy} disabled={!text}>
            {copied ? 'コピーしました' : '文章をコピー'}
          </button>
        </div>
      )}

      {result && usedRegions && usedRegions.length > 0 && (
        <div className="card crop-card">
          <label className="crop-check">
            <input type="checkbox" checked={cropOnly} onChange={(e) => setCropOnly(e.target.checked)} />
            <span>囲んだ部分だけの画像で保存する</span>
          </label>
          <p className="hint">
            {cropOnly
              ? '囲まなかった部分の画像は保存されません。2か所以上なら、上から順に縦につなげた1枚になります。'
              : 'チェックしなければ、元の画像を全部保存します（あとで読み間違いを確かめられます）。'}
          </p>
          {cropOnly && cropPreview && <img className="crop-preview" src={cropPreview} alt="保存される画像（囲んだ部分）" />}
        </div>
      )}

      {file && progress === null && (
        <div className="bottom-action">
          {result ? (
            <button className="btn-primary btn-large" onClick={save} disabled={saving}>
              {saving ? '保存しています…' : '保存する'}
            </button>
          ) : (
            <button className="btn-primary btn-large" onClick={runOcr} disabled={selecting && regions.length === 0}>
              {selecting
                ? regions.length
                  ? `囲んだ${regions.length}か所を読み取る`
                  : '読み取る範囲を囲んでください'
                : allFiles.length > 1
                  ? `${allFiles.length}枚の文字を読み取る`
                  : '文字を読み取る'}
            </button>
          )}
          {!result && (
            <button className="btn-text" onClick={saveImageOnly} disabled={saving}>
              {saving ? '保存しています…' : '文字を読まずに画像だけ保存'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** タイトル候補：最初の意味のある行を、最大30文字で */
const TRY_SAMPLES = [
  { src: '/samples/try-1.jpg', file: 'mihon-post.jpg', name: '見本A：SNSの投稿', note: '「範囲を指で囲む」で本文だけ読むのがおすすめ' },
  { src: '/samples/try-2.jpg', file: 'mihon-list.jpg', name: '見本B：持ち物リスト', note: '「画像全体を読む」でそのまま読めます' },
];

/**
 * 囲んだ範囲だけを切り抜いた画像を作る。2か所以上なら、上から順に縦につなげた1枚にする（間に少し白い余白）
 */
async function cropToRegions(file: File, regions: Region[]): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const W = bitmap.width;
    const H = bitmap.height;
    const parts = [...regions]
      .sort((a, b) => a.y - b.y)
      .map((r) => ({
        sx: Math.round(r.x * W),
        sy: Math.round(r.y * H),
        sw: Math.max(1, Math.round(r.w * W)),
        sh: Math.max(1, Math.round(r.h * H)),
      }));
    const GAP = parts.length > 1 ? 16 : 0;
    const width = Math.max(...parts.map((p) => p.sw));
    const height = parts.reduce((sum, p) => sum + p.sh, 0) + GAP * (parts.length - 1);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    let y = 0;
    for (const p of parts) {
      ctx.drawImage(bitmap, p.sx, p.sy, p.sw, p.sh, 0, y, p.sw, p.sh);
      y += p.sh + GAP;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('切り抜いた画像を作れませんでした');
    return new File([blob], 'crop.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

export function suggestTitle(text: string): string {
  const line = text
    .split('\n')
    // 行頭の記号と「1.」「２、」のような番号だけを外す（「1泊2日」の数字は残す）
    .map((l) => l.replace(/^[\s・●■◆▶>\-]+/, '').replace(/^[\d０-９]+[.．、)）]\s*/, '').trim())
    // 時刻や電池などのステータスバー（例「10:24 =1」）を避けるため、ひらがな・カタカナ・漢字・英字が2文字以上ある行を選ぶ
    .find(
      (l) =>
        !/^\d{1,2}\s*[:：]\s*\d{2}/.test(l) && // 「10:24」のような時刻で始まる行（ステータスバー）は使わない
        ((l.match(/[ぁ-んァ-ヶ一-龠々]/g) ?? []).length >= 2 || (l.match(/[a-zA-Z]/g) ?? []).length >= 4),
    );
  if (!line) return '';
  const chars = [...line];
  return chars.length > 30 ? `${chars.slice(0, 30).join('')}…` : line;
}
