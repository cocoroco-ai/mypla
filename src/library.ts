import type { Region } from './ocr';
import { supabase, toJapaneseError } from './supabase';

const BUCKET = 'item-images';
/** 保存する画像の長い辺の上限。スクショの文字が読める大きさを保ちつつ、容量（無料枠1GB）を節約する */
const MAX_SIDE = 2000;

export type SaveInput = {
  title: string;
  ocrText: string; // 読み取ったままの文章
  text: string; // 画面で手直しした後の文章
  confidence: number;
  file: File;
  regions: Region[] | null; // 範囲を囲んで読んだときだけ。全体を読んだときは null
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
 * 読み取った文章と元画像を保存する。
 * 途中で失敗したときは、作りかけのデータを消して「保存されていない」状態に戻す。
 * 戻り値：保存した記事の id
 */
export async function saveItem(input: SaveInput): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
  const userId = userData.user.id;

  const image = await prepareForUpload(input.file);

  // 1. 文章を保存（手直ししていなければ edited_text は空のまま）
  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      title: input.title.trim() || 'タイトルなし',
      ocr_text: input.ocrText,
      edited_text: input.text !== input.ocrText ? input.text : null,
      ocr_engine: 'tesseract.js',
      ocr_confidence: Math.round(input.confidence),
    })
    .select('id')
    .single();
  if (itemError || !item) throw new Error(toJapaneseError(itemError?.message ?? '保存できませんでした'));

  const path = `${userId}/${item.id}/1.${image.ext}`;
  let uploaded = false;
  try {
    // 2. 元画像を保管庫へ（自分の user_id のフォルダの中）
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, image.blob, { contentType: image.mime, upsert: false });
    if (uploadError) throw new Error(toJapaneseError(uploadError.message));
    uploaded = true;

    // 3. 画像の情報を記録
    const { error: imageError } = await supabase.from('item_images').insert({
      item_id: item.id,
      position: 0,
      storage_path: path,
      mime: image.mime,
      bytes: image.blob.size,
      width: image.width,
      height: image.height,
      regions: input.regions && input.regions.length > 0 ? input.regions : null,
    });
    if (imageError) throw new Error(toJapaneseError(imageError.message));
  } catch (e) {
    // 作りかけを片付ける（文章を消すと画像の記録も一緒に消える）
    if (uploaded) await supabase.storage.from(BUCKET).remove([path]);
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
};

export type ItemDetail = ItemSummary & {
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
  item_images: { storage_path: string; position: number }[] | null;
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
  };
}

const COLUMNS = 'id, title, ocr_text, edited_text, memo, ocr_confidence, created_at, updated_at, item_images(storage_path, position)';

/** 新しい順に一覧を取る（ゴミ箱は除く）。offset 件目から limit 件 */
export async function listItems(
  offset: number,
  limit: number,
  query = '',
): Promise<{ items: ItemSummary[]; total: number }> {
  let request = supabase
    .from('items')
    .select(COLUMNS, { count: 'exact' })
    .is('deleted_at', null);

  // 検索：空白で区切った言葉が「すべて」、タイトル・文章・メモのどこかに含まれるものを探す
  for (const word of searchWords(query)) {
    const pattern = quoteForFilter(`%${escapeLike(word)}%`);
    request = request.or(
      ['title', 'ocr_text', 'edited_text', 'memo'].map((col) => `${col}.ilike.${pattern}`).join(','),
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
};

/** タイトル・文章・メモを書き換える（読み取ったままの文章 ocr_text は変えない） */
export async function updateItem(id: string, patch: ItemPatch): Promise<void> {
  const values: Record<string, string | null> = {};
  if (patch.title !== undefined) values.title = patch.title.trim() || 'タイトルなし';
  if (patch.text !== undefined) values.edited_text = patch.text.value === patch.text.ocrText ? null : patch.text.value;
  if (patch.memo !== undefined) values.memo = patch.memo.trim();
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
