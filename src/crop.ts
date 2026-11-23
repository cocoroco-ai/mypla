import type { Region } from './ocr';

/** 囲んだ四角をすべて含む、1つの大きな四角にまとめる */
export function joinRegionList(regions: Region[]): Region[] {
  if (regions.length < 2) return regions;
  const x1 = Math.min(...regions.map((r) => r.x));
  const y1 = Math.min(...regions.map((r) => r.y));
  const x2 = Math.max(...regions.map((r) => r.x + r.w));
  const y2 = Math.max(...regions.map((r) => r.y + r.h));
  return [{ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }];
}

/**
 * 囲んだ範囲だけを切り抜いた画像を作る。2か所以上なら、上から順に縦につなげた1枚にする（間に少し白い余白）
 */
export async function cropToRegions(file: Blob, regions: Region[]): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const W = bitmap.width;
    const H = bitmap.height;
    const parts = [...regions]
      .sort((a, b) => a.y - b.y)
      .map((r) => ({
        sx: Math.round(r.x * W),
        sy: Math.round(r.y * H),
        sw: Math.max(1, Math.round(r.w * W)),
        sh: Math.max(1, Math.round(r.h * H)),
      }));
    const GAP = parts.length > 1 ? 16 : 0;
    const width = Math.max(...parts.map((p) => p.sw));
    const height = parts.reduce((sum, p) => sum + p.sh, 0) + GAP * (parts.length - 1);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    let y = 0;
    for (const p of parts) {
      ctx.drawImage(bitmap, p.sx, p.sy, p.sw, p.sh, 0, y, p.sw, p.sh);
      y += p.sh + GAP;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('切り抜いた画像を作れませんでした');
    return new File([blob], 'crop.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
