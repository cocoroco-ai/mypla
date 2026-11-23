import type { Region } from './ocr';
import { supabase, toJapaneseError } from './supabase';

const BUCKET = 'item-images';
/** 保存する画像の長い辺の上限。スクショの文字が読める大きさを保ちつつ、容量（無料枠1GB）を節約する */
const MAX_SIDE = 2000;

export type SaveInput = {
  title: string;
  ocrText: string; // 読み取ったままの文章
  text: string; // 画面で手直しした後の文章
  confidence: number | null; // 文字を読まずに画像だけ保存したときは null
  files: File[]; // 1枚目から順に（続きのスクショをまとめて1件にできる）
  regions: Region[] | null; // 1枚目を範囲を囲んで読んだときだけ。全体を読んだときは null
};

type PreparedImage = { blob: Blob; mime: string; ext: string; width: number; height: number };

/** 画像を縮小して、軽い形式（WebP、使えない端末では JPEG）にする */
async function prepareForUpload(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const toBlob = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

    // iPhone の Safari は WebP に変換できない場合があるので、そのときは JPEG にする
    let blob = await toBlob('image/webp', 0.85);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.88);
    if (!blob) throw new Error('画像の変換に失敗しました');
    const mime = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    return { blob, mime, ext: mime === 'image/webp' ? 'webp' : 'jpg', width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * 画像を保管庫に入れて記録する（position は startPosition から順に）。
 * 途中で失敗したら、この呼び出しで入れた画像を消してから失敗を伝える
 */
async function uploadImages(
  userId: string,
  itemId: string,
  images: PreparedImage[],
  startPosition: number,
  firstRegions: Region[] | null,
): Promise<void> {
  const uploaded: string[] = [];
  try {
    for (const [i, image] of images.entries()) {
      const position = startPosition + i;
      const path = `${userId}/${itemId}/${position + 1}-${Date.now().toString(36)}.${image.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, image.blob, { contentType: image.mime, upsert: false });
      if (uploadError) throw new Error(toJapaneseError(uploadError.message));
      uploaded.push(path);
      const { error: imageError } = await supabase.from('item_images').insert({
        item_id: itemId,
        position,
        storage_path: path,
        mime: image.mime,
        bytes: image.blob.size,
        width: image.width,
        height: image.height,
        regions: i === 0 && firstRegions && firstRegions.length > 0 ? firstRegions : null,
      });
      if (imageError) throw new Error(toJapaneseError(imageError.message));
    }
  } catch (e) {
    if (uploaded.length > 0) {
      await supabase.storage.from(BUCKET).remove(uploaded);
      await supabase.from('item_images').delete().in('storage_path', uploaded);
    }
    throw e;
  }
}

/** 保存済みの記事に、続きの画像を足す（今ある画像の後ろに並べる） */
export async function addImagesToItem(itemId: string, files: File[]): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
  const { data, error } = await supabase
    .from('item_images')
    .select('position')
    .eq('item_id', itemId)
    .order('position', { ascending: false })
    .limit(1);
  if (error) throw new Error(toJapaneseError(error.message));
  const next = data && data.length > 0 ? (data[0].position as number) + 1 : 0;
  const images: PreparedImage[] = [];
  for (const f of files) images.push(await prepareForUpload(f));
  await uploadImages(userData.user.id, itemId, images, next, null);
}

/**
 * 読み取った文章と元画像を保存する。
 * 途中で失敗したときは、作りかけのデータを消して「保存されていない」状態に戻す。
 * 戻り値：保存した記事の id
 */
export async function saveItem(input: SaveInput): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
  const userId = userData.user.id;

  if (input.files.length === 0) throw new Error('画像がありません');
  const images: PreparedImage[] = [];
  for (const f of input.files) images.push(await prepareForUpload(f));

  // 1. 文章を保存（手直ししていなければ edited_text は空のまま）
  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      title: input.title.trim() || 'タイトルなし',
      ocr_text: input.ocrText,
      edited_text: input.text !== input.ocrText ? input.text : null,
      ocr_engine: input.confidence === null ? null : 'tesseract.js',
      ocr_confidence: input.confidence === null ? null : Math.round(input.confidence),
    })
    .select('id')
    .single();
  if (itemError || !item) throw new Error(toJapaneseError(itemError?.message ?? '保存できませんでした'));

  try {
    // 2. 元画像を保管庫へ（自分の user_id のフォルダの中）、3. 画像の情報を記録
    await uploadImages(userId, item.id, images, 0, input.regions);
  } catch (e) {
    // 作りかけを片付ける（文章を消すと画像の記録も一緒に消える）
    await supabase.from('items').delete().eq('id', item.id);
    throw e;
  }
  return item.id;
}

/** 保存している件数（ゴミ箱を除く） */
export async function countItems(): Promise<number> {
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);
  if (error) throw new Error(toJapaneseError(error.message));
  return count ?? 0;
}

// ---------------------------------------------------------------------
// 一覧・詳細
// ---------------------------------------------------------------------

export type ItemSummary = {
  id: string;
  title: string;
  body: string; // 手直しした文章があればそちら、なければ読み取ったままの文章
  edited: boolean;
  memo: string;
  createdAt: string;
  imagePath: string | null;
  imageCount: number;
  shelfId: string | null; // 置いてある棚（null = ライブラリーだけ）
  source: string; // 誰の言葉・どこで見たか
  url: string; // リンク（空 = なし）
  isNote: boolean; // 自分で書いたノート（スクショではない）
  favorite: boolean; // ★お気に入り
};

// ---------------------------------------------------------------------
// 棚（ライブラリーの記事を、特に分けたいときに置く場所。ライブラリーにも出たまま）
// ---------------------------------------------------------------------

/** 棚。名前・アイコン・見た目（一覧 / 言葉のカード）は、自分で決められる */
export type Shelf = { id: string; name: string; icon: string; style: 'list' | 'cards'; sortOrder: number };
export const SHELF_MAX = 20;

/** 自分の棚を並び順で取る（初めてのときは、最初の4つの棚を作る） */
export async function listShelves(): Promise<Shelf[]> {
  await supabase.rpc('ensure_default_shelves');
  const { data, error } = await supabase
    .from('shelves')
    .select('id, name, icon, style, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(toJapaneseError(error.message));
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    icon: r.icon as string,
    style: r.style as Shelf['style'],
    sortOrder: r.sort_order as number,
  }));
}

export async function createShelf(input: { name: string; icon: string; style: Shelf['style'] }, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('shelves')
    .insert({ name: input.name.trim(), icon: input.icon.trim() || '📁', style: input.style, sort_order: sortOrder });
  if (error) throw new Error(toJapaneseError(error.message));
}

export async function updateShelf(id: string, patch: { name?: string; icon?: string; style?: Shelf['style']; sortOrder?: number }): Promise<void> {
  const values: Record<string, string | number> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.icon !== undefined) values.icon = patch.icon.trim() || '📁';
  if (patch.style !== undefined) values.style = patch.style;
  if (patch.sortOrder !== undefined) values.sort_order = patch.sortOrder;
  const { error } = await supabase.from('shelves').update(values).eq('id', id);
  if (error) throw new Error(toJapaneseError(error.message));
}

/** 棚を削除する（中の記事は消えずに、ライブラリーだけに戻る） */
export async function deleteShelf(id: string): Promise<void> {
  const { error } = await supabase.from('shelves').delete().eq('id', id);
  if (error) throw new Error(toJapaneseError(error.message));
}

export type ItemDetail = ItemSummary & {
  imagePaths: string[]; // すべての画像（並び順）
  images: { id: string; path: string }[]; // 同じ並びで、画像の番号つき
  ocrText: string;
  editedText: string | null;
  ocrConfidence: number | null;
  updatedAt: string;
};

type Row = {
  id: string;
  title: string;
  ocr_text: string;
  edited_text: string | null;
  memo: string;
  ocr_confidence: number | null;
  created_at: string;
  updated_at: string;
  item_images: { id: string; storage_path: string; position: number }[] | null;
  shelf_id: string | null;
  source: string;
  url: string;
  source_type: string;
  favorite: boolean;
};

function firstImage(row: Row): string | null {
  const images = [...(row.item_images ?? [])].sort((a, b) => a.position - b.position);
  return images[0]?.storage_path ?? null;
}

function toSummary(row: Row): ItemSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.edited_text ?? row.ocr_text,
    edited: row.edited_text !== null,
    memo: row.memo,
    createdAt: row.created_at,
    imagePath: firstImage(row),
    imageCount: row.item_images?.length ?? 0,
    shelfId: row.shelf_id ?? null,
    source: row.source ?? '',
    url: row.url ?? '',
    isNote: row.source_type === 'note',
    favorite: row.favorite ?? false,
  };
}

const COLUMNS = 'id, title, ocr_text, edited_text, memo, ocr_confidence, created_at, updated_at, item_images(id, storage_path, position), shelf_id, source, url, source_type, favorite';

/** 新しい順に一覧を取る（ゴミ箱は除く）。offset 件目から limit 件 */
export async function listItems(
  offset: number,
  limit: number,
  query = '',
  onlyUnsorted = false,
  shelfId: string | null = null,
  onlyFavorite = false,
): Promise<{ items: ItemSummary[]; total: number }> {
  let request = supabase
    .from('items')
    .select(COLUMNS, { count: 'exact' })
    .is('deleted_at', null);
  // 整理待ち：文字を読まずに画像だけで保存したもの
  if (onlyUnsorted) request = request.eq('ocr_text', '').is('edited_text', null);
  if (shelfId) request = request.eq('shelf_id', shelfId);
  if (onlyFavorite) request = request.eq('favorite', true);

  // 検索：空白で区切った言葉が「すべて」、タイトル・文章・メモのどこかに含まれるものを探す
  for (const word of searchWords(query)) {
    const pattern = quoteForFilter(`%${escapeLike(word)}%`);
    request = request.or(
      ['title', 'ocr_text', 'edited_text', 'memo', 'source', 'url'].map((col) => `${col}.ilike.${pattern}`).join(','),
    );
  }

  const { data, error, count } = await request
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(toJapaneseError(error.message));
  return { items: (data as Row[]).map(toSummary), total: count ?? 0 };
}

/** 検索語を空白（全角も）で区切る。最大5語まで */
export function searchWords(query: string): string[] {
  return query
    .split(/[\s　]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** 「%」「_」を、記号そのものとして探せるようにする */
function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 検索語に「,」や「(」が入っても壊れないように、ダブルクォートで囲む */
function quoteForFilter(value: string): string {
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** 1件を詳しく取る */
export async function getItem(id: string): Promise<ItemDetail> {
  const { data, error } = await supabase.from('items').select(COLUMNS).eq('id', id).single();
  if (error) throw new Error(toJapaneseError(error.message));
  const row = data as Row;
  return {
    ...toSummary(row),
    imagePaths: [...(row.item_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.storage_path),
    images: [...(row.item_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, path: i.storage_path })),
    ocrText: row.ocr_text,
    editedText: row.edited_text,
    ocrConfidence: row.ocr_confidence,
    updatedAt: row.updated_at,
  };
}

/**
 * 非公開の保管庫の画像を表示するための「期限付きの住所」をまとめて作る（1時間有効）。
 * 戻り値：保管庫の場所 → 表示用の住所
 */
export async function imageUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 60 * 60);
  if (error) throw new Error(toJapaneseError(error.message));
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

/** 日時を「2026/11/22 10:30」の形にする */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------
// 書き換え
// ---------------------------------------------------------------------

export type ItemPatch = {
  title?: string;
  /** 画面で直した文章。読み取ったままの文章と同じなら「手直しなし」に戻す */
  text?: { value: string; ocrText: string };
  memo?: string;
  source?: string;
  shelfId?: string | null;
  url?: string;
  /** ノートの文章（ノートは「読み取った文章」と「手直し」を分けないので、そのまま置き換える） */
  noteText?: string;
  favorite?: boolean;
};

/** タイトル・文章・メモを書き換える（読み取ったままの文章 ocr_text は変えない） */
/** 画像だけで保存した記事に、あとから読み取った文章を入れる（手直しなしの状態にする） */
export async function setReadText(id: string, ocrText: string, confidence: number, title?: string): Promise<void> {
  const values: Record<string, string | number | null> = {
    ocr_text: ocrText,
    edited_text: null,
    ocr_engine: 'tesseract.js',
    ocr_confidence: Math.round(confidence),
  };
  if (title !== undefined) values.title = title.trim() || 'タイトルなし';
  const { error } = await supabase.from('items').update(values).eq('id', id);
  if (error) throw new Error(toJapaneseError(error.message));
}

/** 足した画像から読み取った文章を、今の文章の最後につなげる（手直しした文章があれば、そちらにも） */
export async function appendReadText(item: ItemDetail, added: string): Promise<void> {
  if (!added.trim()) return;
  const join = (t: string) => (t.trim() ? `${t}\n\n${added}` : added);
  const values: Record<string, string> = { ocr_text: join(item.ocrText) };
  if (item.editedText !== null) values.edited_text = join(item.editedText);
  const { error } = await supabase.from('items').update(values).eq('id', item.id);
  if (error) throw new Error(toJapaneseError(error.message));
}

export async function updateItem(id: string, patch: ItemPatch): Promise<void> {
  const values: Record<string, string | boolean | null> = {};
  if (patch.title !== undefined) values.title = patch.title.trim() || 'タイトルなし';
  if (patch.text !== undefined) values.edited_text = patch.text.value === patch.text.ocrText ? null : patch.text.value;
  if (patch.memo !== undefined) values.memo = patch.memo.trim();
  if (patch.source !== undefined) values.source = patch.source.trim();
  if (patch.shelfId !== undefined) values.shelf_id = patch.shelfId;
  if (patch.url !== undefined) values.url = normalizeUrl(patch.url);
  if (patch.favorite !== undefined) values.favorite = patch.favorite;
  if (patch.noteText !== undefined) {
    values.ocr_text = patch.noteText;
    values.edited_text = null;
  }
  const { error } = await supabase.from('items').update(values).eq('id', id);
  if (error) throw new Error(toJapaneseError(error.message));
}

// ---------------------------------------------------------------------
// 削除（ゴミ箱）
// ---------------------------------------------------------------------

/** ゴミ箱に入れてから完全に消すまでの日数 */
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TrashItem = ItemSummary & { deletedAt: string; daysLeft: number };

/** ゴミ箱に入れる（データは残したまま、一覧や検索に出なくなる） */
export async function trashItem(id: string): Promise<void> {
  const { error } = await supabase.from('items').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(toJapaneseError(error.message));
}

/** ゴミ箱から元に戻す */
export async function restoreItem(id: string): Promise<void> {
  const { error } = await supabase.from('items').update({ deleted_at: null }).eq('id', id);
  if (error) throw new Error(toJapaneseError(error.message));
}

/** ゴミ箱の中身（最近入れた順） */
export async function listTrash(): Promise<TrashItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select(`${COLUMNS}, deleted_at`)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(toJapaneseError(error.message));
  return (data as (Row & { deleted_at: string })[]).map((row) => {
    const passed = Math.floor((Date.now() - new Date(row.deleted_at).getTime()) / DAY_MS);
    return { ...toSummary(row), deletedAt: row.deleted_at, daysLeft: Math.max(0, TRASH_DAYS - passed) };
  });
}

/** ゴミ箱の件数 */
export async function countTrash(): Promise<number> {
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .not('deleted_at', 'is', null);
  if (error) throw new Error(toJapaneseError(error.message));
  return count ?? 0;
}

/** 完全に削除する（画像も消す。元に戻せない） */
export async function deleteForever(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data: images, error: imageError } = await supabase
    .from('item_images')
    .select('storage_path')
    .in('item_id', ids);
  if (imageError) throw new Error(toJapaneseError(imageError.message));

  const paths = (images ?? []).map((i) => i.storage_path as string);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) throw new Error(toJapaneseError(removeError.message));
  }
  // 文章を消すと、画像の記録（item_images）も一緒に消える
  const { error } = await supabase.from('items').delete().in('id', ids);
  if (error) throw new Error(toJapaneseError(error.message));
}

/**
 * 選んだ記事を1つにまとめる。古い順に、画像・文章・メモをつなげて一番古い記事に入れ、残りは消す。
 * タイトルは、自動で付けた「画像のみ（…）」でないものがあれば、古い順で最初のものを使う。戻り値：まとめた記事の id
 */
export function mergedTitle(items: ItemSummary[]): string {
  const ordered = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return ordered.find((i) => !i.title.startsWith('画像のみ（'))?.title ?? ordered[0]?.title ?? '';
}

export async function mergeItems(items: ItemSummary[], newTitle?: string): Promise<string> {
  const ordered = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const title = newTitle?.trim() || mergedTitle(items);
  const { data, error } = await supabase.rpc('merge_items', { ids: ordered.map((i) => i.id), new_title: title });
  if (error) throw new Error(toJapaneseError(error.message));
  return data as string;
}

/** 記事の中の1枚を、別の記事（整理待ち）として切り離す。戻り値：新しい記事の id */
export async function splitImage(imageId: string): Promise<string> {
  const { data, error } = await supabase.rpc('split_image', { image_id: imageId });
  if (error) throw new Error(toJapaneseError(error.message));
  return data as string;
}

/** 記事の中の1枚を完全に削除する（元に戻せない） */
export async function deleteImage(imageId: string, path: string): Promise<void> {
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw new Error(toJapaneseError(removeError.message));
  const { error } = await supabase.from('item_images').delete().eq('id', imageId);
  if (error) throw new Error(toJapaneseError(error.message));
}

// ---------------------------------------------------------------------
// バックアップの声かけ
// ---------------------------------------------------------------------

/** 書き出しを勧める間隔（日） */
export const BACKUP_REMIND_DAYS = 30;

/** 最後に書き出した日時（まだなら null） */
export async function getLastBackup(): Promise<Date | null> {
  const { data, error } = await supabase.from('user_settings').select('last_backup_at').maybeSingle();
  if (error) throw new Error(toJapaneseError(error.message));
  return data?.last_backup_at ? new Date(data.last_backup_at as string) : null;
}

/** 書き出したことを記録する（どの端末で書き出しても、声かけが止まる） */
export async function markBackupDone(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userData.user.id, last_backup_at: now, updated_at: now }, { onConflict: 'user_id' });
  if (error) throw new Error(toJapaneseError(error.message));
}

/**
 * 声かけが必要か：記事が5件以上あって、まだ一度も書き出していないか、最後の書き出しから30日以上たっているとき。
 * 戻り値：必要なら経過日数（一度も無ければ -1）、不要なら null
 */
export async function backupReminder(itemCount: number): Promise<number | null> {
  if (itemCount < 5) return null;
  const last = await getLastBackup();
  if (!last) return -1;
  const days = Math.floor((Date.now() - last.getTime()) / DAY_MS);
  return days >= BACKUP_REMIND_DAYS ? days : null;
}

/** ★お気に入り（最近さわった順に、少しだけ。ホーム用）と全部の件数 */
export async function listFavorites(limit = 5): Promise<{ items: ItemSummary[]; total: number }> {
  const { data, error, count } = await supabase
    .from('items')
    .select(COLUMNS, { count: 'exact' })
    .is('deleted_at', null)
    .eq('favorite', true)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(toJapaneseError(error.message));
  return { items: (data as Row[]).map(toSummary), total: count ?? 0 };
}

/** 棚ごとの件数（棚の id → 件数） */
export async function countByShelf(shelves: Shelf[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  await Promise.all(
    shelves.map(async (sh) => {
      const { count } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('shelf_id', sh.id);
      result[sh.id] = count ?? 0;
    }),
  );
  return result;
}

/** 今日のことば：「言葉のカード」の見た目の棚から、日替わりで1つ（同じ日は同じもの）。無ければ null */
export async function pickTodayWord(shelves: Shelf[]): Promise<ItemSummary | null> {
  const ids = shelves.filter((s) => s.style === 'cards').map((s) => s.id);
  if (ids.length === 0) return null;
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('shelf_id', ids);
  if (error || !count) return null;
  const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY_MS);
  const offset = (today * 7) % count; // 読み返しのお知らせと重なりにくいよう、進み方を変える
  const { data } = await supabase
    .from('items')
    .select(COLUMNS)
    .is('deleted_at', null)
    .in('shelf_id', ids)
    .order('created_at', { ascending: true })
    .range(offset, offset);
  const row = (data as Row[] | null)?.[0];
  return row ? toSummary(row) : null;
}

/** リンクを整える：空ならそのまま、「example.com」のように始まりが無ければ https:// を付ける */
export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+/.test(t)) return `https://${t}`;
  throw new Error('リンクは「https://」で始まる住所を入れてください。');
}

/** ノート（文字だけの記事）を保存する。戻り値：記事の id */
export async function saveNote(input: { title: string; text: string; url: string }): Promise<string> {
  const text = input.text.trim();
  if (!text && !input.title.trim()) throw new Error('タイトルか本文を書いてください。');
  const { data, error } = await supabase
    .from('items')
    .insert({
      title: input.title.trim() || [...text.split('\n')[0]].slice(0, 30).join('') || 'ノート',
      ocr_text: text,
      source_type: 'note',
      url: normalizeUrl(input.url),
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(toJapaneseError(error?.message ?? '保存できませんでした'));
  return data.id as string;
}

/** 整理待ち（画像だけで保存して、まだ文字にしていないもの）の件数 */
export async function countUnsorted(): Promise<number> {
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('ocr_text', '')
    .is('edited_text', null);
  if (error) throw new Error(toJapaneseError(error.message));
  return count ?? 0;
}

/**
 * 何枚かの画像を、文字を読まずに1枚ずつ別の記事として保存する（まとめて取り込み）。
 * 上限などで途中から保存できなくなったら、そこで止めて理由を返す
 */
export async function saveImagesOnly(
  files: File[],
  onProgress: (done: number, total: number) => void,
): Promise<{ saved: number; stoppedReason: string | null }> {
  let saved = 0;
  onProgress(0, files.length);
  for (const file of files) {
    const d = file.lastModified ? new Date(file.lastModified) : new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const title = `画像のみ（${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}）`;
    try {
      await saveItem({ title, ocrText: '', text: '', confidence: null, files: [file], regions: null });
      saved++;
      onProgress(saved, files.length);
    } catch (e) {
      return { saved, stoppedReason: e instanceof Error ? e.message : '保存できませんでした' };
    }
  }
  return { saved, stoppedReason: null };
}

// ---------------------------------------------------------------------
// 保存数の上限（お試しの人など。管理者は上限なし）
// ---------------------------------------------------------------------

/** 自分の保存上限と、使っている件数（ゴミ箱の中も数える）。上限なしなら null */
export async function myQuota(): Promise<{ limit: number; used: number } | null> {
  const { data, error } = await supabase.rpc('my_item_limit');
  if (error) throw new Error(toJapaneseError(error.message));
  if (data === null || data === undefined) return null;
  const { count, error: countError } = await supabase.from('items').select('id', { count: 'exact', head: true });
  if (countError) throw new Error(toJapaneseError(countError.message));
  return { limit: data as number, used: count ?? 0 };
}

/**
 * 30日使われていないお試しアカウントを、画像ごと片付ける（管理者がアプリを開いたときだけ働く。
 * 管理者以外が呼んでも、対象が0件になるだけ）。片付けた人数を返す
 */
export async function cleanupExpiredGuests(): Promise<number> {
  for (let round = 0; round < 10; round++) {
    const { data, error } = await supabase.rpc('expired_guest_files');
    if (error) throw new Error(toJapaneseError(error.message));
    const paths = (data ?? []) as string[];
    if (paths.length === 0) break;
    for (let i = 0; i < paths.length; i += 100) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (removeError) throw new Error(toJapaneseError(removeError.message));
    }
  }
  const { data, error } = await supabase.rpc('delete_expired_guests');
  if (error) throw new Error(toJapaneseError(error.message));
  return (data as number) ?? 0;
}

/** 自分の画像の上限と使っている枚数。上限なしなら null */
export async function myImageQuota(): Promise<{ limit: number; used: number } | null> {
  const { data, error } = await supabase.rpc('my_image_quota');
  if (error) throw new Error(toJapaneseError(error.message));
  const row = (data as { image_limit: number | null; images_used: number }[] | null)?.[0];
  if (!row || row.image_limit === null) return null;
  return { limit: row.image_limit, used: Number(row.images_used) };
}

export type Usage = { storageMB: number; databaseMB: number; users: number; guests: number; images: number };
/** 管理者だけ：無料枠の使用量。管理者でなければ null */
export async function usageSummary(): Promise<Usage | null> {
  const { data, error } = await supabase.rpc('usage_summary');
  if (error) throw new Error(toJapaneseError(error.message));
  const row = (data as Record<string, number>[] | null)?.[0];
  if (!row) return null;
  const mb = (b: number) => Math.round((Number(b) / 1024 / 1024) * 10) / 10;
  return {
    storageMB: mb(row.storage_bytes),
    databaseMB: mb(row.database_bytes),
    users: Number(row.users_total),
    guests: Number(row.guests_total),
    images: Number(row.images_total),
  };
}

// ---------------------------------------------------------------------
// ホームのお知らせ
// ---------------------------------------------------------------------

/** 読み返しのお知らせに出すのは、保存してからこの日数以上たったもの */
export const REREAD_MIN_DAYS = 7;
/** ゴミ箱で「もうすぐ消える」と知らせるのは、残りこの日数以内のもの */
export const TRASH_WARN_DAYS = 7;

export type RereadPick = { id: string; title: string; daysAgo: number };

/**
 * 読み返しのお知らせ：保存して REREAD_MIN_DAYS 日以上たったものから1件選ぶ。
 * 同じ日は同じものが出るように、日付で順番に選ぶ（開くたびに変わらない）。無ければ null
 */
export async function pickReread(): Promise<RereadPick | null> {
  const before = new Date(Date.now() - REREAD_MIN_DAYS * DAY_MS).toISOString();
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .lt('created_at', before);
  if (error) throw new Error(toJapaneseError(error.message));
  if (!count) return null;

  const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY_MS);
  const offset = today % count;
  const { data, error: pickError } = await supabase
    .from('items')
    .select('id, title, created_at')
    .is('deleted_at', null)
    .lt('created_at', before)
    .order('created_at', { ascending: true })
    .range(offset, offset);
  if (pickError) throw new Error(toJapaneseError(pickError.message));
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    daysAgo: Math.floor((Date.now() - new Date(row.created_at as string).getTime()) / DAY_MS),
  };
}

/** ゴミ箱の中で、あと TRASH_WARN_DAYS 日以内に完全に削除されるものの件数 */
export async function countTrashExpiringSoon(): Promise<number> {
  const before = new Date(Date.now() - (TRASH_DAYS - TRASH_WARN_DAYS) * DAY_MS).toISOString();
  const { count, error } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .lt('deleted_at', before);
  if (error) throw new Error(toJapaneseError(error.message));
  return count ?? 0;
}

/** ゴミ箱に入れて30日を過ぎたものを完全に削除する（アプリを開いたときに呼ぶ）。消した件数を返す */
export async function purgeExpiredTrash(): Promise<number> {
  const limit = new Date(Date.now() - TRASH_DAYS * DAY_MS).toISOString();
  const { data, error } = await supabase.from('items').select('id').lt('deleted_at', limit).limit(100);
  if (error) throw new Error(toJapaneseError(error.message));
  const ids = (data ?? []).map((r) => r.id as string);
  await deleteForever(ids);
  return ids.length;
}
