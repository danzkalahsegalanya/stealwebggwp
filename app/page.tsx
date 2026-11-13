
"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState(
    "https://auto-reaction.zxcoderid.web.id"
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [status, setStatus] = useState("");

  async function testConnection() {
    setLoading(true);
    setShowLogs(true);
    setLogs(["Memulai pemeriksaan..."]);
    setStatus("");

    try {
      const response = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      setLogs(data.logs || ["Tidak ada log yang diterima."]);
      setStatus(
        data.targetStatus
          ? `HTTP ${data.targetStatus}`
          : data.success
            ? "Berhasil"
            : "Gagal"
      );
    } catch (error) {
      setLogs([
        `Gagal menghubungi API SiteFetch: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ]);
      setStatus("API ERROR");
    } finally {
      setLoading(false);
    }
  }

  async function downloadWebsite() {
    setLoading(true);
    setShowLogs(true);
    setLogs(["Memulai download website..."]);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const data = await response.json();
        setLogs(
          data.logs || [
            `HTTP ${response.status}`,
            data.error || "Download gagal.",
            data.hint || "",
          ].filter(Boolean)
        );
        setStatus(`DOWNLOAD ERROR ${response.status}`);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = "sitefetch-export.zip";
      link.click();

      URL.revokeObjectURL(objectUrl);

      setLogs([
        "Download berhasil.",
        `Ukuran ZIP: ${blob.size} byte`,
      ]);
      setStatus("DOWNLOAD BERHASIL");
    } catch (error) {
      setLogs([
        error instanceof Error ? error.message : String(error),
      ]);
      setStatus("DOWNLOAD ERROR");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090d18] text-white px-5 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-blue-400 font-bold tracking-[0.3em] text-sm mb-3">
            WEBSITE ARCHIVER
          </div>

          <h1 className="text-5xl font-black tracking-tight">
            SITE<span className="text-blue-500">FETCH</span>
          </h1>

          <p className="text-gray-400 mt-4">
            Download HTML dan aset publik website.
          </p>
        </div>

        <section className="bg-[#111827] border border-gray-700 rounded-2xl p-6 shadow-xl">
          <label className="block text-sm text-gray-300 mb-2">
            Website URL
          </label>

          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full bg-[#090d18] border border-gray-700 rounded-xl px-4 py-4 outline-none focus:border-blue-500"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <button
              onClick={testConnection}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl py-4 font-bold"
            >
              {loading ? "MEMERIKSA..." : "TES & LIHAT LOG"}
            </button>

            <button
              onClick={downloadWebsite}
              disabled={loading}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-xl py-4 font-bold"
            >
              DOWNLOAD ZIP
            </button>
          </div>
        </section>

        <section className="mt-5 bg-[#111827] border border-gray-700 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <span className="font-bold">
              TERMINAL LOG
            </span>

            <span className="text-blue-400 text-sm">
              {showLogs ? "SEMBUNYIKAN ▲" : "LIHAT LOG ▼"}
            </span>
          </button>

          {showLogs && (
            <div className="border-t border-gray-700 p-5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs text-gray-400">
                  STATUS: {status || "MENUNGGU"}
                </span>

                <button
                  onClick={() =>
                    navigator.clipboard.writeText(logs.join("\n"))
                  }
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  COPY LOG
                </button>
              </div>

              <pre className="bg-black rounded-xl p-4 text-green-400 text-xs leading-6 whitespace-pre-wrap break-words max-h-[450px] overflow-y-auto">
                {logs.length
                  ? logs.join("\n")
                  : "Belum ada log. Jalankan tes koneksi."}
              </pre>
            </div>
          )}
        </section>

        <p className="text-center text-gray-500 text-xs mt-8">
          SiteFetch • Public website resources only
        </p>
      </div>
    </main>
  );
}
