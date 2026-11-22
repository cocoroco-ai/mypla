import { useRef, useState } from 'react';
import { createBackup, restoreBackup, saveBackupFile, type RestoreResult } from './backup';

/** 書き出し（バックアップ）と読み込み（復元） */
export default function BackupScreen({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ready, setReady] = useState<{ file: File; count: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RestoreResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onProgress = (done: number, total: number) => setProgress({ done, total });

  async function makeBackup() {
    setBusy('export');
    setError('');
    setNotice('');
    setResult(null);
    setReady(null);
    try {
      setReady(await createBackup(onProgress));
    } catch (e) {
      setError(e instanceof Error ? e.message : '書き出せませんでした。');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function saveFile() {
    if (!ready) return;
    setError('');
    try {
      const how = await saveBackupFile(ready.file);
      if (how === 'shared') setNotice('保存しました。保存した場所（「ファイル」アプリなど）を確かめておいてください。');
      if (how === 'downloaded') setNotice('ダウンロードしました。「ダウンロード」フォルダなどに保存されています。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    }
  }

  async function pickedFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    if (!window.confirm(`「${file.name}」を読み込みますか？\nすでに入っているものは飛ばして、無いものだけを追加します。`)) return;
    setBusy('import');
    setError('');
    setNotice('');
    setResult(null);
    try {
      setResult(await restoreBackup(file, onProgress));
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const sizeMB = ready ? (ready.file.size / 1024 / 1024).toFixed(1) : '';

  return (
    <section>
      <button className="link-back" onClick={onBack} disabled={busy !== null}>← ホーム</button>
      <h1 className="screen-title">書き出し・読み込み</h1>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <div className="card backup-card">
        <h2 className="backup-title">書き出し（バックアップ）</h2>
        <p className="hint">
          保存している文章・メモ・元の画像を、1つの ZIP ファイルにまとめて、この端末に保存します。ゴミ箱の中身は入りません。
          ファイルは端末の中だけで作り、外部には送りません。
        </p>
        {!ready ? (
          <button className="btn-primary" onClick={makeBackup} disabled={busy !== null}>
            {busy === 'export' ? 'まとめています…' : 'ファイルを作る'}
          </button>
        ) : (
          <>
            <p className="backup-ready">
              {ready.count}件をまとめました（{sizeMB} MB）。下のボタンで保存してください。
            </p>
            <button className="btn-primary" onClick={saveFile}>
              端末に保存する
            </button>
            <button className="btn-text" onClick={() => setReady(null)}>作り直す</button>
          </>
        )}
        {busy === 'export' && progress && (
          <p className="hint">{progress.done} / {progress.total} 件</p>
        )}
      </div>

      <div className="card backup-card">
        <h2 className="backup-title">読み込み（復元）</h2>
        <p className="hint">
          書き出した ZIP ファイルから mypla. に戻します。すでに入っているものは飛ばすので、同じファイルを何度読み込んでも二重にはなりません。
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => pickedFile(e.target.files?.[0])}
        />
        <button className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === 'import' ? '読み込んでいます…' : 'ZIP ファイルを選ぶ'}
        </button>
        {busy === 'import' && progress && (
          <p className="hint">{progress.done} / {progress.total} 件</p>
        )}
        {result && (
          <div className="notice" role="status">
            <p>読み込みが終わりました。</p>
            <p>追加：{result.added}件／すでに入っていたので飛ばした：{result.skipped}件</p>
            {result.failed.length > 0 && (
              <>
                <p className="error">戻せなかったもの：{result.failed.length}件</p>
                <ul>
                  {result.failed.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <p className="hint">
        おすすめ：月に1回くらい書き出して、「ファイル」アプリの iCloud Drive やパソコンに保存しておくと安心です。
      </p>
    </section>
  );
}
