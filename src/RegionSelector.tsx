import { useRef, useState, type PointerEvent } from 'react';
import type { Region } from './ocr';

type Props = {
  src: string;
  regions: Region[];
  selecting: boolean;
  onAdd: (r: Region) => void;
  onRemove: (r: Region) => void;
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * プレビュー画像の上を指（またはマウス）でなぞって、読み取る範囲を四角で囲む。
 * 範囲は画像に対する割合（0〜1）で記録するので、画面の大きさが変わってもずれない。
 */
export default function RegionSelector({ src, regions, selecting, onAdd, onRemove }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  // 素早くなぞっても取りこぼさないよう、なぞり中の値は ref で即時に持つ（state は表示用）
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<Region | null>(null);
  const [draft, setDraftState] = useState<Region | null>(null);
  const setDraft = (r: Region | null) => {
    draftRef.current = r;
    setDraftState(r);
  };

  function point(e: PointerEvent) {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - rect.left) / rect.width), y: clamp((e.clientY - rect.top) / rect.height) };
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (!selecting) return;
    e.preventDefault();
    try {
      // 指が枠の外に出ても、なぞり続けられるようにする
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 非対応の環境では無視 */
    }
    const p = point(e);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    if (!start) return;
    const p = point(e);
    setDraft({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  }

  function up() {
    // 小さすぎる四角（指が少し触れただけ・画面をなでただけ）は無視する
    const d = draftRef.current;
    if (d && d.w > 0.08 && d.h > 0.025) onAdd(d);
    startRef.current = null;
    setDraft(null);
  }

  const toStyle = (r: Region) => ({
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  });

  const sorted = [...regions].sort((a, b) => a.y - b.y);

  return (
    <div
      ref={boxRef}
      className={`region-box ${selecting ? 'is-selecting' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <img className="region-img" src={src} alt="選んだ画像のプレビュー" draggable={false} />
      {sorted.map((r, i) => (
        <div key={`${r.x}-${r.y}`} className="region-rect" style={toStyle(r)}>
          <span className="region-no">{i + 1}</span>
          {selecting && (
            <button
              type="button"
              className="region-remove"
              aria-label={`${i + 1}番の範囲を消す`}
              // 押したときに、新しい四角を描き始めないようにする
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onRemove(r)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {draft && <div className="region-rect is-draft" style={toStyle(draft)} />}
    </div>
  );
}
