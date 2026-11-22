import { useEffect, useRef, useState } from 'react';
import { recognize, type OcrProgress, type OcrResult, type Region, type RemovedLine } from './ocr';
import RegionSelector from './RegionSelector';
import { saveItem } from './library';

type Result = OcrResult;

export default function ImportScreen({ onBack }: { onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
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
    setFile(null);
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

  async function save() {
    if (!file || !result) return;
    setError(null);
    setSaving(true);
    try {
      await saveItem({ title, ocrText, text, confidence: result.confidence, file, regions: usedRegions });
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
      await saveItem({ title: autoTitle, ocrText: '', text: '', confidence: null, file, regions: null });
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
      const r = await recognize(file, setProgress, used);
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
              読み取りたい文章を、指でなぞって四角で囲んでください。何か所でも囲めます（上から順につなげます）。間違えて囲んだ四角は、左上の「×」で消せます。
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

export function suggestTitle(text: string): string {
  const line = text
    .split('\n')
    // 行頭の記号と「1.」「２、」のような番号だけを外す（「1泊2日」の数字は残す）
    .map((l) => l.replace(/^[\s・●■◆▶>\-]+/, '').replace(/^[\d０-９]+[.．、)）]\s*/, '').trim())
    // 時刻や電池などのステータスバー（例「10:24 =1」）を避けるため、ひらがな・カタカナ・漢字・英字が2文字以上ある行を選ぶ
    .find((l) => (l.match(/[ぁ-んァ-ヶ一-龠々a-zA-Z]/g) ?? []).length >= 2);
  if (!line) return '';
  const chars = [...line];
  return chars.length > 30 ? `${chars.slice(0, 30).join('')}…` : line;
}
