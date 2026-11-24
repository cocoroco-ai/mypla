import { useState } from 'react';
import { THEMES, applyTheme, currentTheme, type ThemeId } from './themes';

/** mypla.を彩る：カラーテーマを選ぶ画面。押したらその場で切り替わり、この端末に残る */
export default function ThemeScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<ThemeId>(currentTheme());

  function choose(id: ThemeId) {
    applyTheme(id);
    setSelected(id);
  }

  const now = THEMES.find((t) => t.id === selected);

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

      <div className="theme-lead">
        <h1 className="theme-title">My Color, My Choice.</h1>
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

      <p className="theme-message">今日の気分に、今日の色。</p>
      <p className="hint center">
        色を押すと、その場で切り替わります。何度でも選び直せます（保存した記事には影響しません。色はこの端末に残ります）。
      </p>
    </section>
  );
}
