import { useEffect, useState } from 'react';
import {
  AI_CARD_MAX,
  createAiCard,
  deleteAiCard,
  formatDate,
  imageUrls,
  listItems,
  normalizeUrl,
  updateAiCard,
  type AiCard,
  type ItemSummary,
} from './library';

// AI図鑑：AIごとのカード（名前・公式リンク・得意なこと）と、カードを開いた画面

const COLORS = ['#1f5a4e', '#3a78a0', '#8a5a9e', '#b4643c', '#4f7d2f', '#a0466a', '#5a6aa8', '#7a6a2e'];

/** カードの丸い印（名前の1文字目。色は名前で決まる） */
export function AiAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const first = [...name.trim()][0] ?? '?';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return (
    <span className={`ai-avatar ${large ? 'is-large' : ''}`} style={{ background: COLORS[hash % COLORS.length] }} aria-hidden="true">
      {first.toUpperCase()}
    </span>
  );
}

/** 公式リンクの見出し（https:// と末尾の / を取る） */
function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

type FormProps = {
  initial?: AiCard;
  onCancel: () => void;
  onSave: (value: { name: string; url: string; strength: string }) => Promise<void>;
};

/** カードを追加・直すときの入力欄 */
export function AiCardForm({ initial, onCancel, onSave }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [strength, setStrength] = useState(initial?.strength ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!name.trim()) {
      setError('AIの名前を入れてください。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({ name, url, strength });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
      setBusy(false);
    }
  }

  return (
    <div className="card ai-form">
      <h2 className="card-title">{initial ? `「${initial.name}」を直す` : 'AIを追加'}</h2>
      <label className="field">
        <span className="field-label">名前</span>
        <input className="title-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="例：NotebookLM" />
      </label>
      <label className="field">
        <span className="field-label">
          公式リンク <span className="optional">任意</span>
        </span>
        <input
          className="title-input"
          type="url"
          inputMode="url"
          value={url}
          maxLength={2000}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </label>
      <label className="field">
        <span className="field-label">
          得意なこと <span className="optional">任意</span>
        </span>
        <textarea
          className="memo-input"
          value={strength}
          maxLength={300}
          onChange={(e) => setStrength(e.target.value)}
          placeholder="例：資料を読ませて、質問に答えてもらう"
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="button-row">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? '保存しています…' : initial ? '保存する' : '追加する'}
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          やめる
        </button>
      </div>
    </div>
  );
}

type GridProps = {
  cards: AiCard[] | null;
  counts: Record<string, number>;
  onOpen: (card: AiCard) => void;
  onChanged: () => void;
};

/** AI図鑑の棚の上に出す、AIカードの一覧（2列） */
export function AiCardGrid({ cards, counts, onOpen, onChanged }: GridProps) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  if (cards === null) return <p className="hint">AIカードを読み込んでいます…</p>;
  const full = cards.length >= AI_CARD_MAX;

  return (
    <div className="ai-zukan">
      <h2 className="ai-zukan-title">AIカード</h2>
      {notice && <p className="notice" role="status">{notice}</p>}
      {cards.length === 0 && <p className="hint">まだAIカードがありません。「＋ AIを追加」で作れます。</p>}
      <ul className="ai-grid">
        {cards.map((c) => (
          <li key={c.id}>
            <button className="ai-card" onClick={() => onOpen(c)}>
              <span className="ai-card-head">
                <AiAvatar name={c.name} />
                <span className="ai-card-name">{c.name}</span>
              </span>
              {c.strength && <span className="ai-card-strength">{c.strength}</span>}
              <span className="ai-card-count">{counts[c.id] ? `記事 ${counts[c.id]}件` : '記事なし'}</span>
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <AiCardForm
          onCancel={() => setAdding(false)}
          onSave={async (v) => {
            await createAiCard(v, cards.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1);
            setAdding(false);
            setNotice(`「${v.name.trim()}」を追加しました。`);
            onChanged();
          }}
        />
      ) : (
        <button className="btn-small ai-add" onClick={() => { setAdding(true); setNotice(''); }} disabled={full}>
          {full ? `AIカードは${AI_CARD_MAX}枚までです` : '＋ AIを追加'}
        </button>
      )}
      <p className="hint">
        記事を「どのAIの話か」でカードにひもづけると、カードを開いたときに並びます（記事を開いて、下の「棚を変える・どのAIの話か選ぶ」から）。
      </p>
    </div>
  );
}

const PAGE = 20;

type ScreenProps = {
  card: AiCard;
  backLabel: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  onChanged: (card: AiCard | null) => void;
};

/** AIカードを開いた画面：得意なこと・公式リンク・このAIの記事 */
export function AiCardScreen({ card, backLabel, onBack, onOpen, onChanged }: ScreenProps) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  async function load(offset: number) {
    setLoading(true);
    setError('');
    try {
      const page = await listItems(offset, PAGE, '', false, null, false, card.id);
      setItems((list) => (offset === 0 ? page.items : [...list, ...page.items]));
      setTotal(page.total);
      const map = await imageUrls(page.items.map((i) => i.imagePath).filter((p): p is string => Boolean(p)));
      setUrls((u) => ({ ...u, ...map }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0);
  }, [card.id]);

  async function remove() {
    const ok = window.confirm(
      `「${card.name}」のカードを削除しますか？\nひもづけていた記事は消えません（ひもづけだけ外れます）。`,
    );
    if (!ok) return;
    setDeleting(true);
    setError('');
    try {
      await deleteAiCard(card.id);
      onChanged(null);
    } catch (e) {
      setError(`削除できませんでした。${e instanceof Error ? e.message : ''}`);
      setDeleting(false);
    }
  }

  return (
    <section>
      <button className="link-back" onClick={onBack}>← {backLabel}</button>

      {editing ? (
        <AiCardForm
          initial={card}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            await updateAiCard(card.id, v);
            setEditing(false);
            setNotice('保存しました。');
            onChanged({ ...card, name: v.name.trim(), url: normalizeUrl(v.url), strength: v.strength.trim() });
          }}
        />
      ) : (
        <div className="ai-detail">
          <div className="ai-detail-head">
            <AiAvatar name={card.name} large />
            <h1 className="screen-title">{card.name}</h1>
          </div>
          {notice && <p className="notice" role="status">{notice}</p>}
          <div className="card">
            <h2 className="card-title">得意なこと</h2>
            {card.strength ? (
              <p className="ai-detail-strength">{card.strength}</p>
            ) : (
              <p className="hint">まだ書いていません。「直す」から書けます。</p>
            )}
            {card.url && (
              <a className="btn-primary ai-open" href={card.url} target="_blank" rel="noopener noreferrer">
                {card.name} を開く ↗
                <span className="ai-open-url">{shortUrl(card.url)}</span>
              </a>
            )}
            <div className="button-row">
              <button className="btn-secondary" onClick={() => { setEditing(true); setNotice(''); }} disabled={deleting}>
                ✎ 直す
              </button>
              <button className="btn-danger-small" onClick={remove} disabled={deleting}>
                {deleting ? '削除しています…' : 'カードを削除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <h2 className="ai-zukan-title">{card.name} の記事{!loading && `（${total}件）`}</h2>
      {!loading && items.length === 0 && (
        <div className="card empty">
          <p>まだひもづけた記事がありません。</p>
          <p className="hint">AIラボの棚にある記事を開き、下の「棚を変える・どのAIの話か選ぶ」から「{card.name}」を選ぶと、ここに並びます。</p>
        </div>
      )}
      <ul className="item-list">
        {items.map((item) => (
          <li key={item.id}>
            <button className="item-row" onClick={() => onOpen(item.id)}>
              <span className="item-thumb">
                {item.imagePath && urls[item.imagePath] ? (
                  <img src={urls[item.imagePath]} alt="" loading="lazy" />
                ) : (
                  <span className="thumb-empty" aria-hidden="true">{item.isNote ? '✎' : '🖼️'}</span>
                )}
              </span>
              <span className="item-main">
                <span className="item-title">
                  {item.favorite && <span className="fav-mark">★</span>}
                  {item.title}
                </span>
                <span className="item-body">{preview(item.body)}</span>
                <span className="item-meta">{formatDate(item.createdAt)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {loading && <p className="hint center">読み込んでいます…</p>}
      {!loading && items.length < total && (
        <button className="btn-secondary" onClick={() => load(items.length)}>
          もっと見る（残り {total - items.length}件）
        </button>
      )}
    </section>
  );
}

function preview(text: string): string {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  return chars.length > 60 ? `${chars.slice(0, 60).join('')}…` : chars.join('');
}
