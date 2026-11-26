// 線だけのシンプルなアイコン（色は文字の色 currentColor に合わせる）
// 棚の絵文字に対応する線画があればそれを出し、無ければ絵文字のまま出す。
// 棚の名前・アイコン・空のときのメッセージは、ここで一か所にまとめる（ホーム・棚の中・棚の編集で同じものを使う）
import type { ReactNode } from 'react';
import type { Shelf } from './library';

const PATHS: Record<string, string> = {
  library: 'M16 6l4 14M12 6v14M8 8v12M4 4v16',
  flask: 'M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9V2M8.5 2h7M7 16h10',
  sprout: 'M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z',
  images: 'M18 22H4a2 2 0 0 1-2-2V6M22 13l-1.3-1.3a2.4 2.4 0 0 0-3.4 0L11 18M14 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
  bookOpen: 'M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
  plus: 'M12 5v14M5 12h14',
  gem: 'M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l-2 5 5 11 5-11-2-5',
  ai: 'M7 8h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3zM12 8V4.5M12 4.5h.01M9 13h.01M15 13h.01M9.5 16.5h5',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  cook: 'M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM2 11h20M9 4c0 1.5 1 1.5 1 3M13 4c0 1.5 1 1.5 1 3',
  camera: 'M4 8h3.5L9 5.5h6L16.5 8H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plane: 'M21 15.5l-8-4.5V5a1.5 1.5 0 0 0-3 0v6l-8 4.5V17l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-4.5l8 2.5z',
  money: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 8.5h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9M12 6.5v2M12 16.5v2',
  home: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6',
  heart: 'M12 20s-7.5-4.6-9-9.5C2 7 4.5 4 7.5 4c2 0 3.5 1.2 4.5 2.8C13 5.2 14.5 4 16.5 4 19.5 4 22 7 21 10.5 19.5 15.4 12 20 12 20z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 9l11-2',
  leaf: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z',
  cart: 'M3 4h2.5l2.2 11h10.8L21 7H6.4M9 20h.01M17 20h.01',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-1.5a1.5 1.5 0 0 0-1 2.6c.6.6.4 2.9-2.5 2.9zM7.5 11h.01M10 7h.01M14.5 7h.01M17 11h.01',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z',
  // ホームのライブラリー：未分類（トレイ）・検索・矢印
  inbox: 'M3 13h5l1.5 2.5h5L16 13h5M5.5 5h13L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5l-4.5-4.5',
  chevronRight: 'M9 5.5l6.5 6.5L9 18.5',
  chevronDown: 'M5.5 9l6.5 6.5L18.5 9',
  // 記事の「この文章を使う」：使う（上向き矢印）・コピー・AI（きらめき）
  share: 'M4.5 12.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6M12 15V3.5M7.5 8L12 3.5 16.5 8',
  copy: 'M9.5 8.5h9A1.5 1.5 0 0 1 20 10v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 19v-9a1.5 1.5 0 0 1 1.5-1.5zM16 8.5V5a1.5 1.5 0 0 0-1.5-1.5h-9A1.5 1.5 0 0 0 4 5v9a1.5 1.5 0 0 0 1.5 1.5H8',
  sparkle: 'M11 3.5l1.6 4.6a2 2 0 0 0 1.3 1.3l4.6 1.6-4.6 1.6a2 2 0 0 0-1.3 1.3L11 18.5l-1.6-4.6a2 2 0 0 0-1.3-1.3L3.5 11l4.6-1.6a2 2 0 0 0 1.3-1.3zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
};

const EMOJI_TO_ICON: Record<string, string> = {
  '💎': 'gem',
  '🤖': 'flask',
  '🧪': 'flask',
  '📘': 'bookOpen',
  '📖': 'bookOpen',
  '💡': 'sprout',
  '🍳': 'cook',
  '📷': 'images',
  '🖼️': 'images',
  '🖼': 'images',
  '✈️': 'plane',
  '✈': 'plane',
  '💰': 'money',
  '🏠': 'home',
  '❤️': 'heart',
  '❤': 'heart',
  '🎵': 'music',
  '📚': 'book',
  '🌱': 'leaf',
  '⭐': 'star',
  '🛒': 'cart',
  '📁': 'folder',
};

export function LineIcon({ name, size = 24 }: { name: string; size?: number }) {
  const d = PATHS[name] ?? PATHS.folder;
  return (
    <svg className="line-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** 棚のアイコン：対応する線画があれば線画、無ければ選んだ絵文字 */
export function ShelfIcon({ emoji, size = 24 }: { emoji: string; size?: number }) {
  const name = EMOJI_TO_ICON[emoji.trim()];
  if (name) return <LineIcon name={name} size={size} />;
  return (
    <span className="emoji-icon" aria-hidden="true">
      {emoji}
    </span>
  );
}

/** 棚の中の画面の見出し：アイコン＋名前（ホームと同じ線画） */
export function ShelfLabel({ shelf, size = 20 }: { shelf: Pick<Shelf, 'icon' | 'name'>; size?: number }) {
  return (
    <span className="shelf-label">
      <span className="shelf-label-icon">
        <ShelfIcon emoji={shelf.icon} size={size} />
      </span>
      <span>{shelf.name}</span>
    </span>
  );
}

/** 棚が空のときのひとこと（棚の見た目、またはアイコンで決まる。自分で作った棚は無し） */
const MESSAGES: Record<string, string> = {
  library: 'あなたの知識が集まる場所。',
  gem: '心に残った言葉を、ここに。',
  flask: '今日の発見を、明日のスキルに。',
  bookOpen: '小さな学びが、未来の私をつくる。',
  sprout: 'ふと浮かんだひらめきを、育てていこう。',
  images: '残しておきたい景色や瞬間を。',
};
const STYLE_ICON: Record<Shelf['style'], string | null> = { list: null, cards: 'gem', ai: 'flask', study: 'bookOpen', photos: 'images', idea: 'sprout' };

export function shelfMessage(shelf: Pick<Shelf, 'icon' | 'style'> | null): string {
  if (!shelf) return MESSAGES.library;
  return MESSAGES[STYLE_ICON[shelf.style] ?? ''] ?? MESSAGES[EMOJI_TO_ICON[shelf.icon.trim()] ?? ''] ?? '';
}

/** 棚が空のとき：真ん中に少し大きなアイコン・ひとこと・「まだ登録されていません」 */
export function ShelfEmpty({ shelf, children }: { shelf: Pick<Shelf, 'icon' | 'style' | 'name'> | null; children?: ReactNode }) {
  const message = shelfMessage(shelf);
  return (
    <div className={`shelf-empty ${shelf?.style === 'cards' ? 'is-cards' : ''}`}>
      <span className="shelf-empty-icon">
        {shelf ? <ShelfIcon emoji={shelf.icon} size={44} /> : <LineIcon name="library" size={44} />}
      </span>
      {message && <p className="shelf-empty-message">{message}</p>}
      <p className="shelf-empty-note">まだ登録されていません</p>
      {children}
    </div>
  );
}
