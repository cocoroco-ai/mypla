// ホームで使う、線だけのシンプルなアイコン（色は文字の色 currentColor に合わせる）
// 棚の絵文字に対応する線画があればそれを出し、無ければ絵文字のまま出す

const PATHS: Record<string, string> = {
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.5 1-4 15-3.5-1',
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
};

const EMOJI_TO_ICON: Record<string, string> = {
  '💎': 'gem',
  '🤖': 'ai',
  '📘': 'book',
  '💡': 'bulb',
  '🍳': 'cook',
  '📷': 'camera',
  '✈️': 'plane',
  '✈': 'plane',
  '💰': 'money',
  '🏠': 'home',
  '❤️': 'heart',
  '❤': 'heart',
  '🎵': 'music',
  '📚': 'library',
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
