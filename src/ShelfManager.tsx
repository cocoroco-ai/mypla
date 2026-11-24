import { useEffect, useState } from 'react';
import { SHELF_MAX, createShelf, deleteShelf, listShelves, updateShelf, type Shelf } from './library';

/** よく使いそうなアイコン（自分で好きな絵文字を入れることもできる） */
const ICONS = ['📁', '💎', '🤖', '📘', '💡', '🍳', '📷', '✈️', '💰', '🏠', '❤️', '🎵', '📚', '🌱', '⭐', '🛒'];

/** 棚の追加・名前やアイコンの変更・並び替え・削除 */
export default function ShelfManager({ onBack }: { onBack: () => void }) {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Shelf | 'new' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [style, setStyle] = useState<Shelf['style']>('list');

  async function load() {
    try {
      setShelves(await listShelves());
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(target: Shelf | 'new') {
    setEditing(target);
    setNotice('');
    setError('');
    if (target === 'new') {
      setName('');
      setIcon('📁');
      setStyle('list');
    } else {
      setName(target.name);
      setIcon(target.icon);
      setStyle(target.style);
    }
    window.scrollTo({ top: 0 });
  }

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
      setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!name.trim()) {
      setError('棚の名前を入れてください。');
      return;
    }
    const target = editing;
    if (target === 'new') {
      const last = shelves.reduce((m, s) => Math.max(m, s.sortOrder), 0);
      await run(() => createShelf({ name, icon, style }, last + 1), `「${name.trim()}」を追加しました。`);
    } else if (target) {
      await run(() => updateShelf(target.id, { name, icon, style }), `「${name.trim()}」を保存しました。`);
    }
    setEditing(null);
  }

  async function remove(shelf: Shelf) {
    if (
      !window.confirm(
        `「${shelf.name}」の棚を削除しますか？\n中の記事は消えずに、ライブラリーだけに戻ります。`,
      )
    )
      return;
    await run(() => deleteShelf(shelf.id), `「${shelf.name}」を削除しました（記事はライブラリーに残っています）。`);
  }

  /** 1つ上（-1）または下（+1）と入れ替える */
  async function move(index: number, dir: -1 | 1) {
    const other = shelves[index + dir];
    const me = shelves[index];
    if (!other || !me) return;
    const next = [...shelves];
    next[index] = other;
    next[index + dir] = me;
    await run(async () => {
      // 並び順を 1,2,3… と付け直す（変わったものだけ保存する）
      for (const [i, sh] of next.entries()) {
        if (sh.sortOrder !== i + 1) await updateShelf(sh.id, { sortOrder: i + 1 });
      }
    }, '並び順を変えました。');
  }

  return (
    <section>
      <button className="link-back" onClick={onBack} disabled={busy}>← ホーム</button>
      <h1 className="screen-title">棚の追加・編集</h1>
      <p className="hint">
        自分の使い方に合わせて、棚を作れます（{SHELF_MAX}個まで）。棚を削除しても、中の記事は消えずにライブラリーに戻ります。
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {editing && (
        <div className="card shelf-edit">
          <h2 className="card-title">{editing === 'new' ? '新しい棚' : '棚を編集'}</h2>
          <label className="field">
            <span className="field-label">名前（30文字まで）</span>
            <input
              className="title-input"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：レシピ、旅の記録、仕事のヒント"
              enterKeyHint="done"
            />
          </label>
          <div className="field">
            <span className="field-label">アイコン</span>
            <div className="icon-choices">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={`icon-choice ${icon === ic ? 'is-on' : ''}`}
                  onClick={() => setIcon(ic)}
                  aria-pressed={icon === ic}
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              className="title-input icon-input"
              value={icon}
              maxLength={8}
              onChange={(e) => setIcon(e.target.value)}
              aria-label="アイコン（好きな絵文字を入れることもできます）"
            />
          </div>
          <div className="field">
            <span className="field-label">見た目</span>
            <div className="segmented" role="group" aria-label="見た目">
              <button type="button" className={style === 'list' ? 'is-on' : ''} onClick={() => setStyle('list')}>
                一覧（画像つき）
              </button>
              <button type="button" className={style === 'cards' ? 'is-on' : ''} onClick={() => setStyle('cards')}>
                言葉のカード
              </button>
              <button type="button" className={style === 'photos' ? 'is-on' : ''} onClick={() => setStyle('photos')}>
                写真
              </button>
              <button type="button" className={style === 'ai' ? 'is-on' : ''} onClick={() => setStyle('ai')}>
                AI図鑑
              </button>
              <button type="button" className={style === 'study' ? 'is-on' : ''} onClick={() => setStyle('study')}>
                学びノート
              </button>
            </div>
            <p className="hint">
              「言葉のカード」は、ことばの宝箱のように文章を大きく見せます。この見た目の棚からは、ホームの「今日のことば」も選ばれます。「写真」は、正方形の写真を3列に並べ、棚から直接写真を入れられます。「AI図鑑」は、AIごとのカード（名前・公式リンク・得意なこと）を上に並べ、記事を「どのAIの話か」でカードにひもづけられます。「学びノート」は、テーマ（講座・本など）ごとにまとめ、覚えた印（まだ・復習中・身についた）を付けられます。ひとことメモが大きく出て、ホームの「今日の復習」もこの棚から選ばれます。
            </p>
          </div>
          <div className="button-row">
            <button className="btn-primary" onClick={saveEdit} disabled={busy}>
              {busy ? '保存しています…' : editing === 'new' ? '追加する' : '保存する'}
            </button>
            <button className="btn-secondary" onClick={() => setEditing(null)} disabled={busy}>
              やめる
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="hint center">読み込んでいます…</p>
      ) : (
        <ul className="shelf-list">
          {shelves.map((sh, i) => (
            <li key={sh.id} className="shelf-row">
              <span className="shelf-row-name">
                {sh.icon} {sh.name}
                {sh.style === 'cards' && <span className="shelf-row-style">カード</span>}
                {sh.style === 'photos' && <span className="shelf-row-style">写真</span>}
                {sh.style === 'ai' && <span className="shelf-row-style">AI図鑑</span>}
                {sh.style === 'study' && <span className="shelf-row-style">学びノート</span>}
              </span>
              <span className="shelf-row-actions">
                <button className="btn-small" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="上へ">
                  ↑
                </button>
                <button
                  className="btn-small"
                  onClick={() => move(i, 1)}
                  disabled={busy || i === shelves.length - 1}
                  aria-label="下へ"
                >
                  ↓
                </button>
                <button className="btn-small" onClick={() => startEdit(sh)} disabled={busy}>
                  編集
                </button>
                <button className="btn-danger-small" onClick={() => remove(sh)} disabled={busy}>
                  削除
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!editing && (
        <div className="bottom-action">
          <button className="btn-primary btn-large" onClick={() => startEdit('new')} disabled={busy || shelves.length >= SHELF_MAX}>
            {shelves.length >= SHELF_MAX ? `棚は${SHELF_MAX}個までです` : '＋ 新しい棚を作る'}
          </button>
        </div>
      )}
    </section>
  );
}
