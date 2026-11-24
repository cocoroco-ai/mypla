import { useState } from 'react';
import {
  STUDY_STATUS_LABEL,
  STUDY_THEME_MAX,
  createStudyTheme,
  deleteStudyTheme,
  renameStudyTheme,
  type StudyCounts,
  type StudyStatus,
  type StudyTheme,
} from './library';

// 学びノート：テーマ（講座・本など）と、覚えた印（まだ／復習中／身についた）

const STATUSES: StudyStatus[] = ['yet', 'review', 'done'];

/** 覚えた印のバッジ（一覧用） */
export function StudyBadge({ status }: { status: StudyStatus }) {
  return <span className={`study-badge is-${status}`}>{STUDY_STATUS_LABEL[status]}</span>;
}

/** 覚えた？：押すだけで変わる3つのボタン */
export function StudyStatusPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: StudyStatus;
  onChange: (v: StudyStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="study-status" role="radiogroup" aria-label="覚えた？">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          className={value === s ? 'is-on' : ''}
          onClick={() => onChange(s)}
          disabled={disabled}
        >
          {STUDY_STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** テーマを選ぶ（押すだけ）。その場で新しいテーマも作れる */
export function StudyThemePicker({
  themes,
  value,
  onChange,
  onAdded,
  disabled = false,
}: {
  themes: StudyTheme[];
  value: string | null;
  onChange: (id: string | null) => void;
  onAdded: (theme: StudyTheme) => void;
  disabled?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const sortOrder = themes.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1;
      const id = await createStudyTheme(name, sortOrder);
      onAdded({ id, name: name.trim(), sortOrder });
      onChange(id);
      setName('');
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="chip-list" role="radiogroup" aria-label="テーマ">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            className={`chip ${value === t.id ? 'is-on' : ''}`}
            onClick={() => onChange(t.id)}
            disabled={disabled || busy}
          >
            {t.name}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          className={`chip ${value === null ? 'is-on' : ''}`}
          onClick={() => onChange(null)}
          disabled={disabled || busy}
        >
          なし
        </button>
        {!adding && themes.length < STUDY_THEME_MAX && (
          <button type="button" className="chip is-add" onClick={() => setAdding(true)} disabled={disabled}>
            ＋ 新しいテーマ
          </button>
        )}
      </div>
      {adding && (
        <div className="theme-add-row">
          <input
            className="title-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：Claude Code 講座、本：伝え方の教科書"
            autoFocus
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className="button-row">
            <button type="button" className="btn-small is-primary" onClick={add} disabled={busy || !name.trim()}>
              {busy ? '追加しています…' : '追加する'}
            </button>
            <button type="button" className="btn-small" onClick={() => { setAdding(false); setName(''); setError(''); }} disabled={busy}>
              やめる
            </button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** 学びノートの棚の上：テーマのカード（何件中何件 身についた）。押すとそのテーマだけ表示 */
export function StudyThemeGrid({
  themes,
  counts,
  selected,
  onSelect,
  onChanged,
}: {
  themes: StudyTheme[] | null;
  counts: StudyCounts | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (themes === null) return <p className="hint">テーマを読み込んでいます…</p>;

  async function run(job: () => Promise<void>, done: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await job();
      setNotice(done);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'うまくいきませんでした。');
    } finally {
      setBusy(false);
    }
  }

  function add() {
    if (!name.trim()) return;
    const n = name.trim();
    run(async () => {
      await createStudyTheme(n, themes!.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1);
      setName('');
      setAdding(false);
    }, `テーマ「${n}」を追加しました。`);
  }

  function rename(t: StudyTheme) {
    const n = window.prompt('テーマの新しい名前', t.name);
    if (n === null || !n.trim() || n.trim() === t.name) return;
    run(() => renameStudyTheme(t.id, n), '名前を変えました。');
  }

  function remove(t: StudyTheme) {
    if (!window.confirm(`テーマ「${t.name}」を削除しますか？\n記事は消えません（テーマのひもづけだけ外れます）。`)) return;
    if (selected === t.id) onSelect(null);
    run(() => deleteStudyTheme(t.id), `テーマ「${t.name}」を削除しました。`);
  }

  return (
    <div className="study-themes">
      <div className="study-themes-head">
        <h2 className="ai-zukan-title">テーマ</h2>
        {themes.length > 0 && (
          <button className="btn-inline" onClick={() => { setEditing((v) => !v); setNotice(''); }}>
            {editing ? '直すのをやめる' : '✎ テーマを直す'}
          </button>
        )}
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {themes.length === 0 && !adding && (
        <p className="hint">「Claude Code 講座」「本：○○」のようなテーマを作ると、記事をテーマごとにまとめられます。</p>
      )}

      {editing ? (
        <ul className="theme-edit-list">
          {themes.map((t) => (
            <li key={t.id}>
              <span className="theme-edit-name">{t.name}</span>
              <button className="btn-small" onClick={() => rename(t)} disabled={busy}>名前を変える</button>
              <button className="btn-danger-small" onClick={() => remove(t)} disabled={busy}>削除</button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="study-theme-grid">
          {themes.map((t) => {
            const c = counts?.themes[t.id] ?? { total: 0, done: 0 };
            const on = selected === t.id;
            return (
              <li key={t.id}>
                <button
                  className={`study-theme ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onSelect(on ? null : t.id)}
                >
                  <span className="study-theme-name">{t.name}</span>
                  <span className="study-bar" aria-hidden="true">
                    <i style={{ width: c.total ? `${Math.round((c.done / c.total) * 100)}%` : '0%' }} />
                  </span>
                  <span className="study-theme-count">
                    {c.total ? `${c.total}件中 ${c.done}件 身についた` : '記事なし'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="theme-add-row">
          <input
            className="title-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：Claude Code 講座、本：伝え方の教科書"
            autoFocus
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className="button-row">
            <button className="btn-small is-primary" onClick={add} disabled={busy || !name.trim()}>
              {busy ? '追加しています…' : '追加する'}
            </button>
            <button className="btn-small" onClick={() => { setAdding(false); setName(''); }} disabled={busy}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        !editing && (
          <button className="study-theme-add" onClick={() => { setAdding(true); setNotice(''); }} disabled={themes.length >= STUDY_THEME_MAX}>
            {themes.length >= STUDY_THEME_MAX ? `テーマは${STUDY_THEME_MAX}個までです` : '＋ テーマを追加'}
          </button>
        )
      )}
    </div>
  );
}
