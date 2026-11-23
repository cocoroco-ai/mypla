import { useEffect, type ReactNode } from 'react';

type Props = {
  src: string;
  caption?: string;
  onClose: () => void;
  /** 画像の下に並べるボタンなど（任意） */
  actions?: ReactNode;
};

/** 画像を画面いっぱいに表示する（小さいサムネイルでは見分けにくいときに使う）。指で拡大もできる */
export default function ImageViewer({ src, caption, onClose, actions }: Props) {
  // 開いている間は、後ろの画面がスクロールしないようにする。Esc キーでも閉じられる
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="画像の拡大表示" onClick={onClose}>
      <div className="viewer-top" onClick={(e) => e.stopPropagation()}>
        <span className="viewer-caption">{caption}</span>
        <button className="viewer-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      <div className="viewer-body" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={caption ?? '拡大した画像'} />
      </div>
      {actions && (
        <div className="viewer-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
