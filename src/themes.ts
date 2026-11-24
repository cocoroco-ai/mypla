// カラーテーマ「My Color, My Choice.」
// 色そのものは styles.css の [data-theme="…"] にまとめてある（画面ごとに色を書かない）。
// テーマを増やすときは、① styles.css に [data-theme] のかたまりを1つ足し、② 下の THEMES に1行足す。
// 選んだテーマはこの端末に保存する（保存した記事などのデータには一切さわらない）。

export type ThemeId = 'jade' | 'azure' | 'lavender' | 'mauve' | 'blue-lavender' | 'sakura';

export type Theme = {
  id: ThemeId;
  name: string;
  kana: string;
  note: string;
  /** 丸い見本の色（メイン・淡色）。テーマ選びの画面だけで使う */
  swatch: { main: string; sub: string };
};

export const THEMES: Theme[] = [
  { id: 'jade', name: 'Jade', kana: 'ジェイド', note: 'いつもの自分に戻れる、安心感のあるグリーン', swatch: { main: '#307F70', sub: '#8FCDB8' } },
  { id: 'azure', name: 'Azure', kana: 'アジュール', note: '澄んだ空のような、爽やかなブルー', swatch: { main: '#397DA5', sub: '#93BEDC' } },
  { id: 'lavender', name: 'Lavender Mist', kana: 'ラベンダーミスト', note: '柔らかさと知性を兼ね備えたラベンダー', swatch: { main: '#75659D', sub: '#A99BC8' } },
  { id: 'mauve', name: 'Mauve', kana: 'モーヴ', note: '控えめな華やかさを持つ、大人の紫', swatch: { main: '#776479', sub: '#AA96AA' } },
  { id: 'blue-lavender', name: 'Blue Lavender', kana: 'ブルーラベンダー', note: '凛とした美しさと透明感', swatch: { main: '#646FA6', sub: '#9DA8D1' } },
  { id: 'sakura', name: 'Sakura', kana: 'さくら', note: '春の光に咲く、やさしく凛としたさくら色', swatch: { main: '#A35E74', sub: '#E3B5C3' } },
];

export const DEFAULT_THEME: ThemeId = 'lavender';
const KEY = 'mypla-theme';

function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

/** 今のテーマ（保存がなければ Lavender Mist） */
export function currentTheme(): ThemeId {
  const now = document.documentElement.dataset.theme;
  if (isThemeId(now)) return now;
  try {
    const saved = localStorage.getItem(KEY);
    if (isThemeId(saved)) return saved;
  } catch {
    // 保存を読めない端末では、初期のテーマにする
  }
  return DEFAULT_THEME;
}

/** テーマを画面に反映して、この端末に覚えておく */
export function applyTheme(id: ThemeId, save = true): void {
  document.documentElement.dataset.theme = id;
  // iPhone の上の帯（ステータスバーまわり）の色も合わせる
  const bar = getComputedStyle(document.documentElement).getPropertyValue('--topbar').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar || '#ffffff');
  if (!save) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 保存できなくても、開いている間はこの色のまま
  }
}
