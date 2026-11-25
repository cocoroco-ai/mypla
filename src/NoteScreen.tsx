import { useEffect, useState } from 'react';
import { listStudyThemes, saveNote, type IdeaStatus, type Shelf, type StudyStatus, type StudyTheme } from './library';
import { StudyStatusPicker, StudyThemePicker } from './StudyNote';
import { IdeaStatusPicker } from './IdeaSeed';
import { ShelfLabel } from './icons';

type Props = {
  onBack: () => void;
  onSaved: (id: string) => void;
  /** 棚から書いたとき：最初からその棚に置く（学びノートなら、テーマと覚えた印も選べる） */
  shelf?: Shelf;
};

/** 思ったことを書くノート（文字だけの記事）。あとから画像やリンクも足せる */
export default function NoteScreen({ onBack, onSaved, shelf }: Props) {
  const isStudy = shelf?.style === 'study';
  const [themes, setThemes] = useState<StudyTheme[]>([]);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [status, setStatus] = useState<StudyStatus>('yet');
  const [memo, setMemo] = useState('');
  const isIdea = shelf?.style === 'idea';
  const [ideaStatus, setIdeaStatus] = useState<IdeaStatus>('seed');
  useEffect(() => {
    if (isStudy) listStudyThemes().then(setThemes).catch(() => setThemes([]));
  }, [isStudy]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = Boolean(title.trim() || text.trim() || url.trim() || memo.trim());

  function back() {
    if (dirty && !window.confirm('書いた内容を保存せずに戻りますか？')) return;
    onBack();
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      const id = await saveNote({
        title,
        text,
        url,
        memo,
        shelfId: shelf?.id ?? null,
        studyThemeId: isStudy ? themeId : null,
        studyStatus: status,
        ideaStatus,
      });
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
      setSaving(false);
    }
  }

  return (
    <section>
      <button className="link-back" onClick={back} disabled={saving}>← {shelf ? shelf.name : 'ホーム'}</button>
      <h1 className="screen-title">{isStudy ? '✎ 学びを書く' : isIdea ? '💡 アイデアを書く' : 'ノートを書く'}</h1>
      {shelf && (
        <p className="hint">
          保存すると「<ShelfLabel shelf={shelf} size={14} />」に入ります（ライブラリーにも並びます）。
        </p>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <div className="card note-card">
        <textarea
          className="note-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isStudy ? '学んだこと、講座や本の内容、やってみたこと…' : isIdea ? '思いついたこと、やってみたいこと、くわしいメモ…' : '思ったこと、気づいたこと、今日のひとこと…'}
          autoFocus
          maxLength={20000}
        />
        <p className="hint">
          話して書きたいときは、iPhone のキーボードの🎤（マイク）ボタンを押すと、声で入力できます。
        </p>
        {isStudy && (
          <label className="field">
            <span className="field-label">
              ひとことメモ（学んだことを1行で） <span className="optional">任意</span>
            </span>
            <input
              className="title-input"
              value={memo}
              maxLength={200}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="例：CLAUDE.md にルールを書けば、毎回説明しなくていい"
            />
          </label>
        )}
        {isStudy ? (
          <p className="hint">本文の1行目が、そのまま記事のタイトルになります（例：1行目に「Claude Code 講座 第3回」）。</p>
        ) : (
          <label className="field">
            <span className="field-label">タイトル <span className="optional">任意</span></span>
            <input className="title-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="空なら1行目から付けます" />
          </label>
        )}
        <label className="field">
          <span className="field-label">リンク <span className="optional">任意</span></span>
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

      {isStudy && (
        <div className="card">
          <h2 className="card-title">テーマ <span className="optional">任意</span></h2>
          <StudyThemePicker
            themes={themes}
            value={themeId}
            onChange={setThemeId}
            onAdded={(t) => setThemes((list) => [...list, t])}
            disabled={saving}
          />
          <h2 className="card-title edit-gap">覚えた？ <span className="optional">任意</span></h2>
          <StudyStatusPicker value={status} onChange={setStatus} disabled={saving} />
          <p className="hint">選ばなければ「まだ」になります。</p>
        </div>
      )}

      {isIdea && (
        <div className="card">
          <h2 className="card-title">育ち具合 <span className="optional">任意</span></h2>
          <IdeaStatusPicker value={ideaStatus} onChange={setIdeaStatus} disabled={saving} />
          <p className="hint">選ばなければ「🌱 種」になります。</p>
        </div>
      )}

      <div className="bottom-action">
        <button className="btn-primary btn-large" onClick={save} disabled={saving || !dirty}>
          {saving ? '保存しています…' : '保存する'}
        </button>
      </div>
    </section>
  );
}
