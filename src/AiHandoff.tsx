import { useState } from 'react';

/**
 * 「AIに渡す」：頼み方と記事の文章をまとめてコピーし、AI のページを開く。
 * mypla. からは何も送らない（貼り付けて送るのは本人）。API キーも費用も不要。
 */

const ASKS = [
  { id: 'summary', label: '要約して', text: '次の内容を、短く要約してください。' },
  { id: 'easy', label: 'やさしく説明', text: '次の内容を、専門用語を使わずに、やさしく説明してください。' },
  { id: 'points', label: '要点を3つ', text: '次の内容の要点を、3つの箇条書きにまとめてください。' },
  { id: 'use', label: '活かし方', text: '次の内容を、私の仕事や暮らしにどう活かせるか、具体的な案を3つ出してください。' },
  { id: 'free', label: '自分で書く', text: '' },
] as const;

const AIS = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
] as const;

const KEY = 'mypla-ai-handoff';

function loadPrefs(): { ask: string; ai: string } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { ask: typeof v.ask === 'string' ? v.ask : 'summary', ai: typeof v.ai === 'string' ? v.ai : 'claude' };
  } catch {
    return { ask: 'summary', ai: 'claude' };
  }
}

type Props = { title: string; body: string; url: string; source: string };

export default function AiHandoff({ title, body, url, source }: Props) {
  const [open, setOpen] = useState(false);
  const prefs = loadPrefs();
  const [askId, setAskId] = useState(prefs.ask);
  const [ask, setAsk] = useState<string>(ASKS.find((a) => a.id === prefs.ask)?.text ?? ASKS[0].text);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  function chooseAsk(id: string) {
    setAskId(id);
    setAsk(ASKS.find((a) => a.id === id)?.text ?? '');
  }

  function buildText(): string {
    const parts = [ask.trim(), '', `【${title}】`, body.trim()];
    if (source) parts.push(`（${source}）`);
    if (url) parts.push('', `参考リンク：${url}`);
    return parts.join('\n').trim();
  }

  function handOff(ai: (typeof AIS)[number]) {
    setError('');
    setDone('');
    const text = buildText();
    try {
      localStorage.setItem(KEY, JSON.stringify({ ask: askId, ai: ai.id }));
    } catch {
      // 覚えられなくても動く
    }
    // iPhone では、押した瞬間の中でコピーと「開く」を両方行う必要がある（待つと開けなくなる）
    navigator.clipboard
      .writeText(text)
      .then(() => setDone(`コピーしました。開いた ${ai.name} の入力欄を長押しして「ペースト」し、送ってください。`))
      .catch(() => setError('コピーできませんでした。お手数ですが、文章を長押しして選んでコピーしてください。'));
    window.open(ai.url, '_blank', 'noopener');
  }

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        🤖 AIに渡す
      </button>
    );
  }

  return (
    <div className="ai-handoff">
      <h3 className="ai-title">🤖 AIに渡す</h3>
      <p className="hint">
        頼み方とこの記事の文章をまとめてコピーし、AI を開きます。mypla. からは何も送りません（貼り付けて送るのは、あなたです）。
      </p>
      <div className="ai-asks" role="group" aria-label="頼み方">
        {ASKS.map((a) => (
          <button key={a.id} className={`ai-ask ${askId === a.id ? 'is-on' : ''}`} onClick={() => chooseAsk(a.id)} aria-pressed={askId === a.id}>
            {a.label}
          </button>
        ))}
      </div>
      <textarea
        className="ai-ask-text"
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        placeholder="AI への頼み方を書いてください（例：この内容で、友人に送る短いメッセージを作って）"
        maxLength={1000}
      />
      <p className="ai-targets-label">コピーして開く AI</p>
      <div className="ai-targets">
        {AIS.map((ai) => (
          <button key={ai.id} className={ai.id === prefs.ai ? 'btn-primary' : 'btn-secondary'} onClick={() => handOff(ai)}>
            {ai.name}
          </button>
        ))}
      </div>
      {done && <p className="notice" role="status">{done}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn-text" onClick={() => setOpen(false)}>閉じる</button>
    </div>
  );
}
