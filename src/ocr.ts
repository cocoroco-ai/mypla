// 文字認識（OCR）。Tesseract.js を使い、画像は端末の外へ送らない。
// ※初回だけ、文字認識用の辞書データ（日本語・英語）をネットから読み込む。画像は送信しない。
import { createWorker, type Worker } from 'tesseract.js';

export type OcrProgress = { label: string; ratio: number };

let workerPromise: Promise<Worker> | null = null;
let progressHandler: (p: OcrProgress) => void = () => {};

const STATUS_LABEL: Record<string, string> = {
  'loading tesseract core': '準備中',
  'initializing tesseract': '準備中',
  'loading language traineddata': '辞書データを読み込み中（初回のみ時間がかかります）',
  'initializing api': '準備中',
  'recognizing text': '文字を読み取り中',
};

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(['jpn', 'eng'], 1, {
      logger: (m: { status: string; progress: number }) =>
        progressHandler({ label: STATUS_LABEL[m.status] ?? '処理中', ratio: m.progress ?? 0 }),
    }).catch((e) => {
      workerPromise = null; // 失敗したら次回やり直せるようにする
      throw e;
    });
  }
  return workerPromise;
}

/** 読み取る範囲。画像の幅・高さに対する割合（0〜1）で持つ */
export type Region = { x: number; y: number; w: number; h: number };

/**
 * 認識用の画像を用意する。範囲の指定があればその部分だけ切り抜く。
 * 大きすぎる画像は縮める（長辺 2400px まで）。
 */
async function prepareImage(bitmap: ImageBitmap, region?: Region): Promise<HTMLCanvasElement> {
  const sx = region ? Math.round(region.x * bitmap.width) : 0;
  const sy = region ? Math.round(region.y * bitmap.height) : 0;
  const sw = region ? Math.max(1, Math.round(region.w * bitmap.width)) : bitmap.width;
  const sh = region ? Math.max(1, Math.round(region.h * bitmap.height)) : bitmap.height;
  const scale = Math.min(1, 2400 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 日本語の文字の間に入る余計な空白を取り除き、空行を整える */
export function cleanJapaneseText(raw: string): string {
  const jp = '[\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef]';
  return raw
    .replace(new RegExp(`(${jp}) +(?=${jp})`, 'g'), '$1')
    .replace(new RegExp(`(${jp}) +(?=[0-9A-Za-z])`, 'g'), '$1')
    .replace(new RegExp(`([0-9A-Za-z]) +(?=${jp})`, 'g'), '$1')
    // 「AI」が「Al」「A|」と読まれやすいので直す（前後が日本語・空白・行頭行末のとき）
    .replace(new RegExp(`(^|\\s|${jp})A[l|] ?(?=${jp}|\\s|$)`, 'gm'), '$1AI')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 画像（写真・イラスト）部分から出た文字化けと判断して外した行 */
export type RemovedLine = { text: string; reason: string };

export type OcrResult = {
  text: string;
  removed: RemovedLine[];
  confidence: number;
  seconds: number;
};

// 「読める文字」= ひらがな・カタカナ・漢字・英数字・よく使う記号
const READABLE = /[぀-ヿ㐀-鿿0-9A-Za-z０-９Ａ-Ｚａ-ｚ、。，．・ー「」『』（）()！？!?：:％%＃#＠@\-/〜~.,'"]/u;

/**
 * 1行が「文字化け」かどうかを判定する。
 * 写真などを無理に読むと、確からしさが低く、記号や1文字ずつの断片だらけの行になる。
 */
function judgeLine(text: string, lineConf: number, wordConfs: number[]): string | null {
  const chars = [...text.replace(/\s/g, '')];
  if (chars.length === 0) return '空の行';
  const readable = chars.filter((c) => READABLE.test(c)).length / chars.length;
  const lowWords = wordConfs.length ? wordConfs.filter((c) => c < 50).length / wordConfs.length : 0;

  if (readable < 0.7) return '記号が多い';
  if (lineConf < 45) return '確からしさが低い';
  if (lowWords > 0.5 && lineConf < 70) return '確からしさが低い';
  if (chars.length <= 2 && lineConf < 80) return '短い断片';
  // 「の (A 7し」のように、1〜2文字の切れ端が空白で並ぶ行
  const tokens = text.split(/\s+/).filter(Boolean);
  const tiny = tokens.filter((t) => [...t].length <= 2).length;
  if (tokens.length >= 3 && tiny / tokens.length >= 0.6 && lineConf < 85) return '断片の並び';
  return null;
}

/**
 * 文字を読み取る。regions を渡すと、その範囲だけを上から順に読み取ってつなげる。
 */
export async function recognize(
  file: Blob,
  onProgress: (p: OcrProgress) => void,
  regions: Region[] = [],
): Promise<OcrResult> {
  progressHandler = onProgress;
  const started = performance.now();
  const worker = await getWorker();
  const bitmap = await createImageBitmap(file);
  try {
    const targets = regions.length ? [...regions].sort((a, b) => a.y - b.y) : [undefined];
    const parts: Omit<OcrResult, 'seconds'>[] = [];
    for (const [i, region] of targets.entries()) {
      if (targets.length > 1) {
        progressHandler = (p) => onProgress({ ...p, label: `${p.label}（${i + 1}/${targets.length}か所目）` });
      }
      const canvas = await prepareImage(bitmap, region);
      parts.push(await recognizeCanvas(worker, canvas));
    }
    return {
      text: parts.map((p) => p.text).filter(Boolean).join('\n\n'),
      removed: parts.flatMap((p) => p.removed),
      confidence: Math.round(parts.reduce((s, p) => s + p.confidence, 0) / parts.length),
      seconds: Math.round((performance.now() - started) / 100) / 10,
    };
  } finally {
    bitmap.close();
  }
}

async function recognizeCanvas(worker: Worker, canvas: HTMLCanvasElement): Promise<Omit<OcrResult, 'seconds'>> {
  const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });

  // 1) 行ごとに判定
  type Judged = { text: string; conf: number; top: number; para: number; reason: string | null };
  const lines: Judged[] = [];
  let paraNo = 0;
  for (const block of data.blocks ?? []) {
    // Tesseract 自身が「画像」や「区切り線」と判断した領域は丸ごと外す
    const isPicture = /IMAGE|LINE/.test(block.blocktype ?? '');
    for (const para of block.paragraphs) {
      paraNo++;
      for (const line of para.lines) {
        const text = cleanJapaneseText(line.text);
        if (!text) continue;
        const reason = isPicture ? '画像の領域' : judgeLine(text, line.confidence, line.words.map((w) => w.confidence));
        lines.push({ text, conf: line.confidence, top: line.bbox.y0, para: paraNo, reason });
      }
    }
  }

  // 2) 上下を文字化けに挟まれた、確からしさの高くない行は「画像の中」とみなす
  const byPosition = [...lines].sort((a, b) => a.top - b.top);
  byPosition.forEach((l, i) => {
    const above = byPosition[i - 1];
    const below = byPosition[i + 1];
    if (!l.reason && l.conf < 85 && above?.reason && below?.reason) l.reason = '画像の中と判断';
  });

  // 3) 残った行を段落ごとにまとめる
  const removed: RemovedLine[] = [];
  const paragraphs: string[] = [];
  let current: string[] = [];
  let currentPara = -1;
  for (const l of lines) {
    if (l.reason) {
      removed.push({ text: l.text, reason: l.reason });
      continue;
    }
    if (l.para !== currentPara && current.length) {
      paragraphs.push(current.join('\n'));
      current = [];
    }
    currentPara = l.para;
    current.push(l.text);
  }
  if (current.length) paragraphs.push(current.join('\n'));

  return {
    text: paragraphs.join('\n\n'),
    removed,
    confidence: Math.round(data.confidence),
  };
}
