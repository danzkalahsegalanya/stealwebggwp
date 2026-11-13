 "use client";
import { FormEvent, useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setStatus(""); setBusy(true);
    try {
      const response = await fetch("/api/download", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengambil website.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || "website-archive.zip";
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = objectUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(objectUrl);
      setStatus("Arsip berhasil dibuat dan unduhan dimulai.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally { setBusy(false); }
  }
  return <main className="shell">
    <nav className="nav"><div className="brand"><span className="brandIcon">S</span> sitefetch<span className="dot">.</span></div><span className="navTag">WEB ARCHIVER</span></nav>
    <section className="hero">
      <div className="eyebrow"><span className="pulse"/> SIMPLE WEBSITE ARCHIVER</div>
      <h1>Ambil website.<br/><em>Simpan jadi file.</em></h1>
      <p className="lead">Masukkan domain, lalu unduh arsip ZIP berisi HTML halaman utama dan aset publik satu domain yang terhubung.</p>
      <form className="downloadForm" onSubmit={submit}>
        <label htmlFor="url">URL WEBSITE</label>
        <div className="inputRow"><span className="globe">↗</span><input id="url" type="url" placeholder="https://contoh.com" value={url} onChange={e=>setUrl(e.target.value)} required/><button disabled={busy}>{busy ? "Memproses…" : "Download ZIP"} <span>↓</span></button></div>
        <div className="hint">Contoh: https://example.com</div>
      </form>
      {busy && <div className="notice">Sedang mengambil HTML dan aset publik. Tunggu sebentar…</div>}
      {error && <div className="error">{error}</div>}
      {status && <div className="success">{status}</div>}
    </section>
    <section className="features">
      <article><b>01</b><h3>HTML utama</h3><p>Menyimpan halaman index dan struktur HTML yang diambil dari URL.</p></article>
      <article><b>02</b><h3>Aset satu domain</h3><p>Mengumpulkan CSS, JavaScript, gambar, font, dan file publik yang terhubung.</p></article>
      <article><b>03</b><h3>Arsip ZIP</h3><p>File hasilnya dikemas agar mudah disimpan dan diperiksa secara lokal.</p></article>
    </section>
    <footer><span>sitefetch<span className="dot">.</span></span><span>Gunakan hanya untuk website milikmu atau yang kamu punya izin untuk arsipkan.</span></footer>
  </main>;
}
