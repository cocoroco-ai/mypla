import { useState } from 'react';
import { IDEA_STATUSES, IDEA_STATUS_EMOJI, IDEA_STATUS_LABEL, IDEA_STATUS_NOTE, saveNote, type IdeaStatus } from './library';

// アイデアの種：育ち具合（🌱 種 → 🌿 芽 → 🌷 花）と、思いつきをすぐ書く欄

/** 育ち具合のバッジ（一覧用） */
export function IdeaBadge({ status }: { status: IdeaStatus }) {
  return (
    <span className={`idea-badge is-${status}`}>
      {IDEA_STATUS_EMOJI[status]} {IDEA_STATUS_LABEL[status]}
    </span>
  );
}

/** 育ち具合：押すだけで変わる3つのボタン */
export function IdeaStatusPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: IdeaStatus;
  onChange: (v: IdeaStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="idea-status" role="radiogroup" aria-label="育ち具合">
      {IDEA_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          className={`is-${s} ${value === s ? 'is-on' : ''}`}
          onClick={() => onChange(s)}
          disabled={disabled}
        >
          <span className="idea-status-main">
            {IDEA_STATUS_EMOJI[s]} {IDEA_STATUS_LABEL[s]}
          </span>
          <span className="idea-status-note">{IDEA_STATUS_NOTE[s]}</span>
        </button>
      ))}
    </div>
  );
}

/** 💡 ひらめきを書く：ひとこと書いて、すぐ棚に保存（育ち具合は「種」から） */
export function IdeaQuickWrite({
  shelfId,
  onSaved,
  onDetail,
}: {
  shelfId: string;
  onSaved: () => void;
  onDetail?: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveNote({ title: '', text, url: '', shelfId, ideaStatus: 'seed' });
      setText('');
      setNotice('🌱 種をまきました。');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card idea-write">
      <label className="idea-write-label" htmlFor="idea-quick">💡 ひらめきを書く</label>
      <textarea
        id="idea-quick"
        className="idea-write-input"
        value={text}
        rows={2}
        onChange={(e) => {
          setText(e.target.value);
          setNotice('');
        }}
        placeholder="思いついたことを、ひとことで"
        disabled={busy}
      />
      <div className="button-row">
        <button className="btn-small is-primary" onClick={save} disabled={busy || !text.trim()}>
          {busy ? '保存しています…' : '種をまく（保存）'}
        </button>
        {onDetail && (
          <button className="btn-small" onClick={onDetail} disabled={busy}>
            くわしく書く
          </button>
        )}
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
