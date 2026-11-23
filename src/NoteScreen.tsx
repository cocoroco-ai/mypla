import { useState } from 'react';
import { saveNote } from './library';

/** 思ったことを書くノート（文字だけの記事）。あとから画像やリンクも足せる */
export default function NoteScreen({ onBack, onSaved }: { onBack: () => void; onSaved: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = Boolean(title.trim() || text.trim() || url.trim());

  function back() {
    if (dirty && !window.confirm('書いた内容を保存せずに戻りますか？')) return;
    onBack();
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      const id = await saveNote({ title, text, url });
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
      setSaving(false);
    }
  }

  return (
    <section>
      <button className="link-back" onClick={back} disabled={saving}>← ホーム</button>
      <h1 className="screen-title">ノートを書く</h1>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="card note-card">
        <textarea
          className="note-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="思ったこと、気づいたこと、今日のひとこと…"
          autoFocus
          maxLength={20000}
        />
        <p className="hint">
          話して書きたいときは、iPhone のキーボードの🎤（マイク）ボタンを押すと、声で入力できます。
        </p>
        <label className="field">
          <span className="field-label">タイトル（空なら1行目から付けます）</span>
          <input className="title-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">リンク（あれば）</span>
          <input
            className="title-input"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>

      <div className="bottom-action">
        <button className="btn-primary btn-large" onClick={save} disabled={saving || !dirty}>
          {saving ? '保存しています…' : '保存する'}
        </button>
      </div>
    </section>
  );
}
