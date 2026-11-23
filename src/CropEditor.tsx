import { useEffect, useState } from 'react';
import RegionSelector from './RegionSelector';
import { cropToRegions, joinRegionList } from './crop';
import type { Region } from './ocr';

type Props = {
  src: string;
  /** 何枚目か（表示用、1から） */
  no: number;
  /** 文字を読み取り直す選択肢を出すか（文字にしてある記事だけ） */
  canReread: boolean;
  busy: boolean;
  onCancel: () => void;
  onDone: (file: File, reread: boolean) => Promise<void>;
};

/**
 * 保存済みの画像を、あとから切り抜く。取り込み時と同じく指でなぞって囲み、
 * 「この部分だけにする」で、囲んだ部分だけの画像を作って渡す
 */
export default function CropEditor({ src, no, canReread, busy, onCancel, onDone }: Props) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [reread, setReread] = useState(false);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState('');
  const [making, setMaking] = useState(false);

  // 範囲が変わったら、仕上がりの見本を作り直す
  useEffect(() => {
    setPreview(null);
    if (regions.length === 0) return;
    let cancelled = false;
    let made: string | null = null;
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('画像を取り出せませんでした');
        const file = await cropToRegions(await res.blob(), regions);
        if (cancelled) return;
        made = URL.createObjectURL(file);
        setPreview({ url: made, file });
      } catch (e) {
        if (!cancelled) setError(`切り抜けませんでした。${e instanceof Error ? e.message : ''}`);
      }
    })();
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, regions]);

  async function confirm() {
    if (!preview) return;
    const ok = window.confirm(
      `${no}枚目の画像を、囲んだ部分だけにしますか？
元の画像は消えて、元に戻せません。`,
    );
    if (!ok) return;
    setMaking(true);
    try {
      await onDone(preview.file, reread);
    } finally {
      setMaking(false);
    }
  }

  const working = busy || making;

  return (
    <div className="crop-editor">
      <h3 className="crop-editor-title">✂ {no}枚目を切り抜く</h3>
      <p className="hint">
        残したい部分を、指でなぞって四角で囲んでください。何か所でも囲めます（上から順に縦につなげた1枚になります）。間違えた四角は「×」で消せます。
      </p>
      <RegionSelector
        src={src}
        regions={regions}
        selecting={!working}
        onAdd={(r) => setRegions((l) => [...l, r])}
        onRemove={(r) => setRegions((l) => l.filter((x) => x !== r))}
      />
      {regions.length > 0 && (
        <div className="region-actions">
          <span className="meta">{regions.length}か所を囲んでいます</span>
          {regions.length >= 2 && (
            <button className="btn-small" onClick={() => setRegions((l) => joinRegionList(l))} disabled={working}>
              1つにつなげる
            </button>
          )}
          <button className="btn-small" onClick={() => setRegions([])} disabled={working}>
            すべて消す
          </button>
        </div>
      )}
      {preview && (
        <>
          <p className="crop-editor-label">仕上がり</p>
          <img className="crop-preview" src={preview.url} alt="切り抜いたあとの画像" />
        </>
      )}
      {canReread && (
        <label className="crop-check">
          <input type="checkbox" checked={reread} onChange={(e) => setReread(e.target.checked)} disabled={working} />
          <span>切り抜いたあと、文字も読み取り直す（今の文章は置き換わります）</span>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="crop-editor-actions">
        <button className="btn-primary" onClick={confirm} disabled={!preview || working}>
          {working ? '置き換えています…' : 'この部分だけにする'}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={working}>
          やめる
        </button>
      </div>
    </div>
  );
}
