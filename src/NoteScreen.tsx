import { useEffect, useState } from 'react';
import { listStudyThemes, saveNote, type IdeaStatus, type Shelf, type StudyStatus, type StudyTheme } from './library';
import { StudyStatusPicker, StudyThemePicker } from './StudyNote';
import { IdeaStatusPicker } from './IdeaSeed';
import { ShelfLabel } from './icons';
import { getStudyTheme } from './studyMemory';

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
  // 学びノートで選んでいたテーマを、最初から選んでおく
  const [themeId, setThemeId] = useState<string | null>(() => (shelf?.style === 'study' ? getStudyTheme(shelf.id) : null));
  const [status, setStatus] = useState<StudyStatus>('yet');
  const [memo, setMemo] = useState('');
  const isIdea = shelf?.style === 'idea';
  const isWords = shelf?.style === 'cards';
  const [source, setSource] = useState(''); // 誰の言葉（ことばの宝箱）
  const [ideaStatus, setIdeaStatus] = useState<IdeaStatus>('seed');
  useEffect(() => {
    if (isStudy)
      listStudyThemes()
        .then((list) => {
          setThemes(list);
          setThemeId((cur) => (cur && !list.some((t) => t.id === cur) ? null : cur));
        })
        .catch(() => setThemes([]));
  }, [isStudy]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = Boolean(title.trim() || text.trim() || url.trim() || memo.trim() || source.trim());

  function back() {
    if (dirty && !window.confirm('書いた内容を保存せずに戻りますか？')) return;
    onBack();
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      const id = await saveNote({
        // 学びノート：ひとこと（必須）がそのまま記事のタイトル
        title: isStudy ? memo.trim().slice(0, 100) : title,
        text,
        url,
        memo,
        shelfId: shelf?.id ?? null,
        source: isWords ? source : '',
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

  const saveLabel = saving ? '保存しています…' : '保存する';
  // 学びノートは「ひとこと（タイトル）」が必須
  const canSave = isStudy ? Boolean(memo.trim()) : dirty;

  // 学びを書く：テーマ → ひとことメモ（タイトル） → 本文 → リンク → 覚えた？ の順。保存ボタンは上と下に（下に固定しない）
  if (isStudy) {
    return (
      <section className="study-note">
        <button className="link-back" onClick={back} disabled={saving}>← {shelf ? shelf.name : 'ホーム'}</button>
        <div className="note-head">
          <h1 className="screen-title">✎ 学びを書く</h1>
          <button className="btn-small is-primary note-head-save" onClick={save} disabled={saving || !canSave}>
            {saveLabel}
          </button>
        </div>
        {shelf && (
          <p className="hint">
            保存すると「<ShelfLabel shelf={shelf} size={14} />」に入ります（ライブラリーにも並びます）。
          </p>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="card">
          <h2 className="card-title">テーマ <span className="optional">任意</span></h2>
          <StudyThemePicker
            themes={themes}
            value={themeId}
            onChange={setThemeId}
            onAdded={(t) => setThemes((list) => [...list, t])}
            disabled={saving}
          />
        </div>

        <div className="card note-card">
          <label className="field study-memo-field">
            <span className="field-label">
              ひとこと（タイトル） <span className="required">必須</span>
            </span>
            <input
              className="title-input"
              value={memo}
              maxLength={100}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="例：まず相手の話を聞く。AIは後から"
            />
            <span className="hint">記事のいちばん上に大きく出ます。あとで見分けがつくように、ひとことで。</span>
          </label>
          <label className="field">
            <span className="field-label">本文 <span className="optional">任意</span></span>
            <textarea
              className="note-input study-note-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="学んだこと、講座や本の内容、やってみたこと…"
              maxLength={20000}
            />
          </label>
          <p className="hint">
            話して書きたいときは、iPhone のキーボードの🎤（マイク）ボタンを押すと、声で入力できます。
          </p>
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

        <div className="card">
          <h2 className="card-title">覚えた？ <span className="optional">任意</span></h2>
          <StudyStatusPicker value={status} onChange={setStatus} disabled={saving} />
          <p className="hint">選ばなければ「まだ」になります。</p>
        </div>

        {!memo.trim() && <p className="hint center">「ひとこと（タイトル）」を書くと保存できます。本文はあとから書き足せます。</p>}
        <button className="btn-primary btn-large note-end-save" onClick={save} disabled={saving || !canSave}>
          {saveLabel}
        </button>
      </section>
    );
  }

  // ことばを書く（ことばの宝箱）：ことば（必須）と誰の言葉（任意）だけ
  if (isWords) {
    const canSaveWord = Boolean(text.trim());
    return (
      <section>
        <button className="link-back" onClick={back} disabled={saving}>← {shelf ? shelf.name : 'ホーム'}</button>
        <div className="note-head">
          <h1 className="screen-title">✎ ことばを書く</h1>
          <button className="btn-small is-primary note-head-save" onClick={save} disabled={saving || !canSaveWord}>
            {saveLabel}
          </button>
        </div>
        {shelf && (
          <p className="hint">
            保存すると「<ShelfLabel shelf={shelf} size={14} />」に入ります（ライブラリーにも並び、ホームの「今日のことば」にも出ます）。
          </p>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="card note-card">
          <label className="field">
            <span className="field-label">ことば <span className="required">必須</span></span>
            <textarea
              className="note-input study-note-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="心に残った言葉、好きな一文…"
              maxLength={20000}
            />
          </label>
          <label className="field">
            <span className="field-label">誰の言葉 <span className="optional">任意</span></span>
            <input
              className="title-input"
              value={source}
              maxLength={200}
              onChange={(e) => setSource(e.target.value)}
              placeholder="例：本の題名、話した人、出典"
            />
          </label>
        </div>

        {!canSaveWord && <p className="hint center">「ことば」を書くと保存できます。</p>}
        <button className="btn-primary btn-large note-end-save" onClick={save} disabled={saving || !canSaveWord}>
          {saveLabel}
        </button>
      </section>
    );
  }

  return (
    <section>
      <button className="link-back" onClick={back} disabled={saving}>← {shelf ? shelf.name : 'ホーム'}</button>
      <div className="note-head">
        <h1 className="screen-title">{isIdea ? '💡 アイデアを書く' : 'ノートを書く'}</h1>
        <button className="btn-small is-primary note-head-save" onClick={save} disabled={saving || !dirty}>
          {saveLabel}
        </button>
      </div>
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
          placeholder={isIdea ? '思いついたこと、やってみたいこと、くわしいメモ…' : '思ったこと、気づいたこと、今日のひとこと…'}
          autoFocus
          maxLength={20000}
        />
        <p className="hint">
          話して書きたいときは、iPhone のキーボードの🎤（マイク）ボタンを押すと、声で入力できます。
        </p>
        <label className="field">
          <span className="field-label">タイトル <span className="optional">任意</span></span>
          <input className="title-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="空なら1行目から付けます" />
        </label>
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

      {isIdea && (
        <div className="card">
          <h2 className="card-title">育ち具合 <span className="optional">任意</span></h2>
          <IdeaStatusPicker value={ideaStatus} onChange={setIdeaStatus} disabled={saving} />
          <p className="hint">選ばなければ「🌱 種」になります。</p>
        </div>
      )}

      {/* 保存ボタンは見出しの横と、いちばん下（画面の下に固定しない） */}
      <button className="btn-primary btn-large note-end-save" onClick={save} disabled={saving || !dirty}>
        {saveLabel}
      </button>
    </section>
  );
}
