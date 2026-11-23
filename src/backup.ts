// 書き出し（バックアップ）と読み込み（復元）。
// どちらも端末の中だけで ZIP を作る・開く（外部のサービスには送らない）。
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { supabase, toJapaneseError } from './supabase';
import { createShelf, listShelves, type Shelf } from './library';

const BUCKET = 'item-images';
const FORMAT = 'mypla-backup';
const VERSION = 1;
const DATA_FILE = 'mypla-data.json';

type BackupImage = {
  file: string; // ZIP の中の場所（例: images/<id>-0.webp）
  position: number;
  mime: string | null;
  width: number | null;
  height: number | null;
  regions: unknown;
};

type BackupItem = {
  id: string;
  title: string;
  ocr_text: string;
  edited_text: string | null;
  memo: string;
  ai_allowed: boolean;
  source_type: string;
  ocr_engine: string | null;
  ocr_confidence: number | null;
  created_at: string;
  updated_at: string;
  shelf?: string | null; // 008 の棚（古い書き出し用）
  shelf_id?: string | null;
  shelf_info?: { name: string; icon: string; style: string } | null; // 009 以降：置いてある棚
  source?: string; // 誰の言葉・どこで見たか
  images: BackupImage[];
};

type BackupFile = { format: string; version: number; exportedAt: string; items: BackupItem[] };

export type Progress = (done: number, total: number) => void;

type ItemRow = Omit<BackupItem, 'images' | 'shelf_info'> & {
  shelves: { name: string; icon: string; style: string } | null;
  item_images: { storage_path: string; position: number; mime: string | null; width: number | null; height: number | null; regions: unknown }[] | null;
};

function extOf(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'bin';
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function readable(items: BackupItem[], exportedAt: Date): string {
  const lines = [`mypla. 書き出し（${exportedAt.toLocaleString('ja-JP')}）　全${items.length}件`, ''];
  for (const item of items) {
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`■ ${item.title}`);
    lines.push(`保存：${new Date(item.created_at).toLocaleString('ja-JP')}`);
    if (item.images.length > 0) lines.push(`画像：${item.images.map((i) => i.file).join('、')}`);
    if (item.source) lines.push(`誰の言葉・どこで：${item.source}`);
    if (item.memo) lines.push(`メモ：${item.memo}`);
    lines.push('');
    lines.push(item.edited_text ?? item.ocr_text);
    lines.push('');
  }
  return lines.join('\n');
}

/** 保存しているもの（ゴミ箱を除く）を、文章・メモ・画像ごと ZIP にまとめる */
export async function createBackup(onProgress: Progress): Promise<{ file: File; count: number }> {
  const rows: ItemRow[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('items')
      .select(
        'id, title, ocr_text, edited_text, memo, ai_allowed, source_type, ocr_engine, ocr_confidence, created_at, updated_at, shelf, source, shelf_id, shelves(name, icon, style), item_images(storage_path, position, mime, width, height, regions)',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(toJapaneseError(error.message));
    rows.push(...(data as unknown as ItemRow[]));
    if (!data || data.length < PAGE) break;
  }

  const files: Zippable = {};
  const items: BackupItem[] = [];
  onProgress(0, rows.length);
  for (const [index, row] of rows.entries()) {
    // 棚は、この利用者の中だけの番号（shelf_id）ではなく、名前・アイコン・見た目で書き出す
    const { item_images, shelves: shelfInfo, shelf_id: _shelfId, ...rest } = row;
    const images: BackupImage[] = [];
    for (const img of [...(item_images ?? [])].sort((a, b) => a.position - b.position)) {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(img.storage_path);
      if (error || !blob) throw new Error(`「${row.title}」の画像を取り出せませんでした。通信の良い場所でもう一度お試しください。`);
      const name = `images/${row.id}-${img.position}.${extOf(img.storage_path)}`;
      // 画像はもともと圧縮済みなので、ZIP では圧縮しない（速くするため）
      files[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
      images.push({ file: name, position: img.position, mime: img.mime, width: img.width, height: img.height, regions: img.regions });
    }
    items.push({ ...rest, shelf_info: shelfInfo ?? null, images });
    onProgress(index + 1, rows.length);
  }

  const now = new Date();
  const backup: BackupFile = { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), items };
  files[DATA_FILE] = strToU8(JSON.stringify(backup, null, 2));
  files['読みやすい一覧.txt'] = strToU8(readable(items, now));

  const zipped = zipSync(files);
  const file = new File([zipped], `mypla-backup-${stamp(now)}.zip`, { type: 'application/zip' });
  return { file, count: items.length };
}

/** 作った ZIP を端末に保存する。iPhone では共有メニュー（「ファイルに保存」）、パソコンではダウンロード */
export async function saveBackupFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const isTouch = navigator.maxTouchPoints > 0 && /iPhone|iPad|Android|Macintosh/.test(navigator.userAgent);
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // 共有がうまくいかなければ、下のダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

export type RestoreResult = { added: number; skipped: number; failed: string[] };

/**
 * 書き出した ZIP から読み込む。
 * すでに入っているもの（同じもの）は飛ばすので、同じファイルを2回読み込んでも二重にはならない
 */
export async function restoreBackup(zip: File, onProgress: Progress): Promise<RestoreResult> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  } catch {
    throw new Error('ZIP ファイルを開けませんでした。mypla. で書き出したファイルを選んでください。');
  }
  const json = entries[DATA_FILE];
  let backup: BackupFile;
  try {
    backup = JSON.parse(strFromU8(json));
  } catch {
    throw new Error('mypla. の書き出しファイルではないようです（中身の一覧が見つかりません）。');
  }
  if (backup.format !== FORMAT || !Array.isArray(backup.items)) {
    throw new Error('mypla. の書き出しファイルではないようです。');
  }
  if (backup.version > VERSION) throw new Error('新しい版の mypla. で書き出したファイルです。アプリを更新してからお試しください。');

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
  const userId = userData.user.id;

  // すでに入っているもの（ゴミ箱の中も含む）を調べる
  const existing = new Set<string>();
  const ids = backup.items.map((i) => i.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('items').select('id').in('id', ids.slice(i, i + 100));
    if (error) throw new Error(toJapaneseError(error.message));
    for (const r of data ?? []) existing.add(r.id as string);
  }

  // 棚は名前で探し、無ければ作る（008 の古い書き出しは、最初の4つの棚の名前に置き換える）
  const shelves = await listShelves();
  const shelfFor = async (item: BackupItem): Promise<string | null> => {
    const legacy: Record<string, { name: string; icon: string; style: string }> = {
      kotoba: { name: 'ことばの宝箱', icon: '💎', style: 'cards' },
      ai: { name: 'AI図鑑', icon: '🤖', style: 'list' },
      learn: { name: '学びノート', icon: '📘', style: 'list' },
      idea: { name: 'アイデア帳', icon: '💡', style: 'list' },
    };
    const info = item.shelf_info ?? (item.shelf ? legacy[item.shelf] : null);
    if (!info) return null;
    let found = shelves.find((x) => x.name === info.name);
    if (!found) {
      await createShelf(
        { name: info.name, icon: info.icon, style: info.style === 'cards' ? 'cards' : 'list' },
        shelves.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1,
      );
      const fresh: Shelf[] = await listShelves();
      shelves.splice(0, shelves.length, ...fresh);
      found = shelves.find((x) => x.name === info.name);
    }
    return found?.id ?? null;
  };

  const result: RestoreResult = { added: 0, skipped: 0, failed: [] };
  onProgress(0, backup.items.length);
  for (const [index, item] of backup.items.entries()) {
    if (existing.has(item.id)) {
      result.skipped++;
    } else {
      try {
        let shelfId: string | null = null;
        try {
          shelfId = await shelfFor(item);
        } catch {
          shelfId = null; // 棚を作れなくても（上限など）、記事はライブラリーに戻す
        }
        await restoreOne(item, entries, userId, shelfId);
        result.added++;
      } catch (e) {
        result.failed.push(`${item.title || 'タイトルなし'}（${(e as Error).message}）`);
      }
    }
    onProgress(index + 1, backup.items.length);
  }
  return result;
}

async function restoreOne(
  item: BackupItem,
  entries: Record<string, Uint8Array>,
  userId: string,
  shelfId: string | null,
): Promise<void> {
  const row = {
    title: item.title ?? '',
    ocr_text: item.ocr_text ?? '',
    edited_text: item.edited_text ?? null,
    memo: item.memo ?? '',
    ai_allowed: item.ai_allowed ?? false,
    source_type: item.source_type ?? 'screenshot',
    ocr_engine: item.ocr_engine ?? null,
    ocr_confidence: item.ocr_confidence ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    shelf_id: shelfId,
    source: item.source ?? '',
  };
  // 元の番号のまま戻す（2回目の読み込みで二重にならないように）。
  // 別の人がすでに同じ番号を使っていたときだけ、新しい番号で入れる
  let { data, error } = await supabase.from('items').insert({ id: item.id, ...row }).select('id').single();
  if (error?.code === '23505') {
    ({ data, error } = await supabase.from('items').insert(row).select('id').single());
  }
  if (error || !data) throw new Error(toJapaneseError(error?.message ?? '保存できませんでした'));
  const itemId = data.id as string;

  const uploaded: string[] = [];
  try {
    for (const img of item.images ?? []) {
      const bytes = entries[img.file];
      if (!bytes) continue; // 画像が ZIP に無ければ文章だけ戻す
      const mime = img.mime ?? 'image/jpeg';
      const path = `${userId}/${itemId}/${img.position + 1}.${extOf(img.file)}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
      if (upErr) throw new Error(toJapaneseError(upErr.message));
      uploaded.push(path);
      const { error: imgErr } = await supabase.from('item_images').insert({
        item_id: itemId,
        position: img.position,
        storage_path: path,
        mime,
        bytes: bytes.length,
        width: img.width,
        height: img.height,
        regions: img.regions ?? null,
      });
      if (imgErr) throw new Error(toJapaneseError(imgErr.message));
    }
  } catch (e) {
    // 作りかけを片付ける
    if (uploaded.length > 0) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from('items').delete().eq('id', itemId);
    throw e;
  }
}
