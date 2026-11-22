// お試しの人に最初から入れておく見本（3件）。画像は public/samples/ にある
import { supabase, toJapaneseError } from './supabase';

const BUCKET = 'item-images';

export type Sample = { title: string; heading: string; text: string; memo: string; image: string };

export const SAMPLES: Sample[] = [
  {
    title: '【見本】作り置きレシピ：鶏むね肉のねぎ塩だれ',
    heading: '鶏むね肉のねぎ塩だれ（2人分）',
    text: [
      '鶏むね肉のねぎ塩だれ（2人分）',
      '材料',
      '・鶏むね肉 1枚',
      '・長ねぎ 1/2本',
      '・ごま油 大さじ1',
      '・鶏がらスープの素 小さじ1',
      '・レモン汁 小さじ1',
      '作り方',
      '1. 鶏むね肉をそぎ切りにして、片栗粉をまぶす',
      '2. フライパンで両面を焼き、ふたをして弱火で5分',
      '3. 刻んだねぎと調味料を混ぜて、上からかける',
      'ポイント：冷蔵で3日ほど保存できます',
    ].join('\n'),
    memo: '見本：ひとことメモはこんなふうに使えます。「来週の作り置きに」',
    image: '/samples/sample-1.jpg',
  },
  {
    title: '【見本】セミナーのメモ：伝わる資料の3つのコツ',
    heading: '伝わる資料の3つのコツ',
    text: [
      '伝わる資料の3つのコツ',
      '1. 1枚に伝えたいことは1つだけ',
      '2. 結論を先に、理由はあとに',
      '3. 文字は少なく、図や数字で見せる',
      '次にやること',
      '・来週の報告資料を、この3つで見直す',
    ].join('\n'),
    memo: '',
    image: '/samples/sample-2.jpg',
  },
  {
    title: '【見本】AIの使い分けメモ',
    heading: 'AIの使い分けメモ',
    text: [
      'AIの使い分けメモ',
      '文章の下書き・要約 → 対話型AI（Claude など）',
      '調べもの → 検索に強いAI',
      '画像づくり → 画像生成AI',
      '気をつけること',
      '・個人情報や社外秘は入れない',
      '・答えはそのまま使わず、必ず確かめる',
    ].join('\n'),
    memo: '',
    image: '/samples/sample-3.jpg',
  },
];

/** 見本を入れる（古い順に並ぶよう、1件ずつ入れる）。入れた件数を返す */
export async function addSampleItems(): Promise<number> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return 0;
  const userId = userData.user.id;

  let added = 0;
  for (const sample of SAMPLES) {
    const res = await fetch(sample.image);
    if (!res.ok) continue;
    const blob = await res.blob();

    const { data: item, error } = await supabase
      .from('items')
      .insert({ title: sample.title, ocr_text: sample.text, memo: sample.memo, ocr_engine: 'sample' })
      .select('id')
      .single();
    if (error || !item) throw new Error(toJapaneseError(error?.message ?? '見本を入れられませんでした'));

    const path = `${userId}/${item.id}/1.jpg`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      await supabase.from('items').delete().eq('id', item.id);
      throw new Error(toJapaneseError(upErr.message));
    }
    await supabase.from('item_images').insert({
      item_id: item.id,
      position: 0,
      storage_path: path,
      mime: 'image/jpeg',
      bytes: blob.size,
      width: 720,
      height: 1280,
    });
    added++;
  }
  return added;
}
