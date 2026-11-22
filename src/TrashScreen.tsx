import { useEffect, useState } from 'react';
import { TRASH_DAYS, deleteForever, formatDate, listTrash, restoreItem, type TrashItem } from './library';

/** ゴミ箱：元に戻す／完全に削除する */
export default function TrashScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(await listTrash());
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function restore(item: TrashItem) {
    setBusyId(item.id);
    setError('');
    try {
      await restoreItem(item.id);
      setItems((list) => list.filter((i) => i.id !== item.id));
      setNotice(`「${item.title}」をライブラリーに戻しました。`);
    } catch (e) {
      setError(`元に戻せませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: TrashItem) {
    if (!window.confirm(`「${item.title}」を完全に削除しますか？\n文章も元の画像も消え、元に戻せません。`)) return;
    setBusyId(item.id);
    setError('');
    try {
      await deleteForever([item.id]);
      setItems((list) => list.filter((i) => i.id !== item.id));
      setNotice(`「${item.title}」を完全に削除しました。`);
    } catch (e) {
      setError(`削除できませんでした。${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <button className="link-back" onClick={onBack}>← ライブラリー</button>
      <h1 className="screen-title">ゴミ箱</h1>
      <p className="hint">
        ゴミ箱に入れてから{TRASH_DAYS}日たつと、文章も画像も自動で完全に削除されます（アプリを開いたときに行います）。
      </p>

      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="hint center">読み込んでいます…</p>}

      {!loading && !error && items.length === 0 && (
        <div className="card empty">
          <p>ゴミ箱は空です。</p>
        </div>
      )}

      <ul className="item-list">
        {items.map((item) => (
          <li key={item.id} className="trash-row">
            <span className="item-main">
              <span className="item-title">{item.title}</span>
              <span className="item-meta">
                {formatDate(item.deletedAt)} にゴミ箱へ・
                <span className="days-left">あと{item.daysLeft}日で完全に削除</span>
              </span>
            </span>
            <span className="trash-actions">
              <button className="btn-secondary" onClick={() => restore(item)} disabled={busyId !== null}>
                元に戻す
              </button>
              <button className="btn-danger-small" onClick={() => remove(item)} disabled={busyId !== null}>
                完全に削除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
