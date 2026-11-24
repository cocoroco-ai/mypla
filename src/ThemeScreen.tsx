import { useState } from 'react';
import { PLACE_NAME_MAX, THEMES, applyTheme, currentTheme, placeName, savePlaceName, type ThemeId } from './themes';
import { LineIcon } from './icons';

/** mypla.を彩る：自分の場所の名前と、カラーテーマを選ぶ画面。どちらもこの端末に残る（保存した記事には影響しない） */
export default function ThemeScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<ThemeId>(currentTheme());
  const [name, setName] = useState(placeName());
  const [savedName, setSavedName] = useState(placeName());
  const [nameNotice, setNameNotice] = useState('');

  function choose(id: ThemeId) {
    applyTheme(id);
    setSelected(id);
  }

  function saveName() {
    savePlaceName(name);
    const v = placeName();
    setName(v);
    setSavedName(v);
    setNameNotice(v ? `「${v}」にしました。ホームに表示されます。` : '名前を外しました。ホームは「mypla.」の表示に戻ります。');
  }

  const now = THEMES.find((t) => t.id === selected);
  const nameDirty = name.trim() !== savedName;
  const previewName = name.trim();

  return (
    <section className="theme-screen">
      <button className="link-back" onClick={onBack}>← ホーム</button>

      <div className="theme-hero">
        <p className="theme-brand">
          mypla<span className="dot">.</span>
        </p>
        <p className="theme-tagline">集める知識、広がる私。</p>
      </div>

      <hr className="theme-rule" />

      {/* My Place, My Name. */}
      <div className="theme-lead">
        <h1 className="theme-title">My Place, My Name.</h1>
        <p className="theme-sub">私の場所に、私だけの名前を。</p>
      </div>
      <div className="place-name">
        <input
          className="title-input place-name-input"
          value={name}
          maxLength={PLACE_NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            setNameNotice('');
          }}
          placeholder="例：私の小さな書斎、知識のアトリエ"
          aria-label="私の場所の名前"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
              if (nameDirty) saveName();
            }
          }}
        />
        <div className="button-row">
          <button className="btn-small is-primary" onClick={saveName} disabled={!nameDirty}>
            名前を決める
          </button>
          {savedName && (
            <button
              className="btn-small"
              onClick={() => {
                setName('');
                savePlaceName('');
                setSavedName('');
                setNameNotice('名前を外しました。ホームは「mypla.」の表示に戻ります。');
              }}
            >
              名前を外す
            </button>
          )}
        </div>
        {nameNotice && <p className="notice" role="status">{nameNotice}</p>}
        <p className="hint">入れなくても大丈夫です（そのときはホームに「mypla.」と出ます）。{PLACE_NAME_MAX}文字まで。</p>
      </div>

      <hr className="theme-rule" />

      {/* My Color, My Choice. */}
      <div className="theme-lead">
        <h2 className="theme-title">My Color, My Choice.</h2>
        <p className="theme-sub">私の場所だから、色も私らしく。</p>
      </div>

      <ul className="swatch-list" role="radiogroup" aria-label="カラーテーマ">
        {THEMES.map((t) => {
          const on = t.id === selected;
          return (
            <li key={t.id}>
              <button
                className={`swatch ${on ? 'is-on' : ''}`}
                role="radio"
                aria-checked={on}
                onClick={() => choose(t.id)}
                style={{ ['--sw-main' as string]: t.swatch.main, ['--sw-sub' as string]: t.swatch.sub }}
              >
                <span className="swatch-dot">
                  {on && (
                    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="swatch-name">{t.name}</span>
                <span className="swatch-kana">{t.kana}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {now && <p className="theme-note">{now.note}</p>}

      {/* プレビュー：名前と色の組み合わせ */}
      <div className="theme-preview" aria-label="プレビュー">
        <p className="theme-preview-label">プレビュー</p>
        <div className="theme-preview-card">
          <p className={`home-name ${previewName ? 'is-custom' : ''}`}>
            {previewName || (
              <>
                mypla<span className="dot">.</span>
              </>
            )}
          </p>
          <p className="tagline">集める知識、広がる私。</p>
          <div className="theme-preview-library">
            <LineIcon name="library" size={20} />
            <span>ライブラリー</span>
          </div>
          <div className="theme-preview-buttons">
            <span className="theme-preview-main">＋ スクショ</span>
            <span className="theme-preview-sub">✎ ノート</span>
          </div>
        </div>
      </div>

      <p className="theme-message">今日の気分に、今日の色。</p>
      <p className="hint center">
        色を押すと、その場で切り替わります。名前も色も何度でも変えられます（保存した記事には影響しません。この端末に残ります）。
      </p>
    </section>
  );
}
