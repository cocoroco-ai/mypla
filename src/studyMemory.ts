// 学びノートで選んでいるテーマを、アプリを開いている間だけ覚えておく（カテゴリーごと）。
// 書く画面から戻ってきても選んだまま・書く画面では最初から選ばれているようにするため。
const selected: Record<string, string | null> = {};

export function getStudyTheme(shelfId: string | null | undefined): string | null {
  return shelfId ? selected[shelfId] ?? null : null;
}

export function setStudyThemeMemory(shelfId: string | null | undefined, themeId: string | null) {
  if (shelfId) selected[shelfId] = themeId;
}
