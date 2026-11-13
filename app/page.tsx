"use client";

import { useState } from "react";

type LogLine = { text: string; kind: "normal" | "error" | "success" | "info" };

export default function Home() {
  const [url, setUrl] = useState("https://auto-reaction.zxcoderid.web.id");
  const [logs, setLogs] = useState<LogLine[]>([{ text: "SiteFetch siap. Masukkan URL lalu jalankan tes koneksi.", kind: "info" }]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("READY");

  function addLog(text: string, kind: LogLine["kind"] = "normal") {
    setLogs((old) => [...old, { text: `[${new Date().toLocaleTimeString("id-ID")}] ${text}`, kind }]);
  }

  async function diagnose() {
    setBusy(true);
    setStatus("CHECKING");
    setLogs([{ text: "Memulai diagnosis dari server deployment...", kind: "info" }]);
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      const received: LogLine[] = (data.logs || []).map((line: string) => ({
        text: line,
        kind: /ERROR|403|menolak|gagal/i.test(line) ? "error" : /berhasil|: OK/i.test(line) ? "success" : "normal",
      }));
      setLogs(received.length ? received : [{ text: `API mengembalikan HTTP ${res.status} tanpa log.`, kind: "error" }]);
      setStatus(data.targetStatus ? `HTTP ${data.targetStatus}` : data.success ? "SUCCESS" : "FAILED");
    } catch (error) {
      setLogs([{ text: error instanceof Error ? error.message : "Tidak dapat menghubungi API diagnosis.", kind: "error" }]);
      setStatus("API ERROR");
    } finally { setBusy(false); }
  }

  async function download() {
    setBusy(true);
    setStatus("DOWNLOADING");
    setLogs([{ text: "Memulai export homepage dan aset publik...", kind: "info" }]);
    try {
      const res = await fetch("/api/download", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLogs([
          { text: `Download gagal: HTTP ${res.status}`, kind: "error" },
          { text: data.error || "Server tidak memberikan detail error.", kind: "error" },
          ...(data.hint ? [{ text: data.hint, kind: "info" as const }] : []),
        ]);
        setStatus(`ERROR ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = "sitefetch-export.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setLogs([
        { text: "ZIP berhasil dibuat dan download dimulai.", kind: "success" },
        { text: `Ukuran file: ${(blob.size / 1024).toFixed(1)} KB`, kind: "info" },
        { text: "Isi: index.html, aset publik yang berhasil diambil, dan README.txt.", kind: "normal" },
      ]);
      setStatus("DOWNLOAD OK");
    } catch (error) {
      setLogs([{ text: error instanceof Error ? error.message : "Download gagal.", kind: "error" }]);
      setStatus("DOWNLOAD ERROR");
    } finally { setBusy(false); }
  }

  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(logs.map((l) => l.text).join("\n"));
      addLog("Log berhasil disalin ke clipboard.", "success");
    } catch { addLog("Clipboard tidak tersedia. Pilih dan salin teks log secara manual.", "error"); }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">SF</span><span>SITEFETCH</span></div>
        <div className="top-tag">PUBLIC WEBSITE ARCHIVER</div>
      </header>

      <section className="hero">
        <div className="eyebrow">WEB EXTRACTION TOOLKIT</div>
        <h1>Site<span>Fetch.</span></h1>
        <p>Ambil HTML dan aset publik website dalam satu arsip ZIP.<br />Diagnosis koneksi langsung dari dashboard.</p>
      </section>

      <div className="workspace">
        <section className="panel">
          <div className="panel-head">
            <div><div className="panel-title">SOURCE WEBSITE</div><div className="panel-sub">Masukkan alamat website yang ingin diarsipkan.</div></div>
            <span className="step">01 / INPUT</span>
          </div>
          <label className="field-label" htmlFor="website-url">WEBSITE URL</label>
          <div className="url-wrap">
            <input id="website-url" className="url-input" type="url" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </div>
          <div className="actions">
            <button className="btn btn-secondary" onClick={diagnose} disabled={busy || !url.trim()}><span className="btn-icon">⌁</span>{busy ? "PLEASE WAIT..." : "TES & LIHAT LOG"}</button>
            <button className="btn btn-primary" onClick={download} disabled={busy || !url.trim()}><span className="btn-icon">↓</span>DOWNLOAD ZIP</button>
          </div>
          <div className="notice"><b>Info:</b> SiteFetch mengambil homepage dan maksimal 35 aset publik dari domain yang sama. Tidak menjalankan JavaScript halaman atau melewati login, CAPTCHA, maupun firewall.</div>
        </section>

        <section className="panel log-panel">
          <div className="log-header">
            <div className="log-heading"><span className="live-dot" />DIAGNOSTIC CONSOLE</div>
            <span className="status">{status}</span>
          </div>
          <div className="log-body">
            <div className="log-toolbar"><span className="log-caption">LIVE REQUEST OUTPUT</span><button className="copy-btn" onClick={copyLogs}>COPY LOG ↗</button></div>
            <pre className="terminal" aria-live="polite">{logs.map((line, i) => <span key={i} className={`terminal-line ${line.kind}`}>{line.text}{"\n"}</span>)}</pre>
          </div>
        </section>
      </div>
      <footer className="footer"><span><strong>SITEFETCH</strong> · Website archiver</span><span>Built for publicly accessible resources</span></footer>
    </main>
  );
}
