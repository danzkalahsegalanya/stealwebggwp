
"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("https://auto-reaction.zxcoderid.web.id");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [status, setStatus] = useState("READY");

  const colors = {
    background: "#080d18",
    panel: "#111a2b",
    border: "#26354d",
    blue: "#3985ff",
    text: "#f3f6ff",
    muted: "#91a0b8",
    green: "#48dfa0",
  };

  async function testConnection() {
    setLoading(true);
    setShowLogs(true);
    setStatus("TESTING");
    setLogs(["[SYSTEM] Starting connection test..."]);

    try {
      const response = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      setLogs(data.logs || ["No diagnostic logs returned."]);
      setStatus(
        data.targetStatus
          ? `HTTP ${data.targetStatus}`
          : data.success
            ? "SUCCESS"
            : "FAILED"
      );
    } catch (error) {
      setLogs([
        `[ERROR] ${
          error instanceof Error ? error.message : "Connection failed"
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
    setStatus("DOWNLOADING");
    setLogs(["[SYSTEM] Starting website export..."]);

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
            `[ERROR] HTTP ${response.status}`,
            data.error || "Download failed.",
            data.hint || "",
          ].filter(Boolean)
        );

        setStatus(`ERROR ${response.status}`);
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = "sitefetch-export.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      setLogs([
        "[SUCCESS] Website export completed.",
        `[INFO] ZIP size: ${blob.size} bytes`,
      ]);
      setStatus("DOWNLOAD SUCCESS");
    } catch (error) {
      setLogs([
        `[ERROR] ${
          error instanceof Error ? error.message : "Download failed"
        }`,
      ]);
      setStatus("DOWNLOAD ERROR");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(ellipse at 50% 0%, #172b4c 0%, #0b1220 45%, #070b13 100%)",
        color: colors.text,
        fontFamily: "Inter, Arial, sans-serif",
        padding: "55px 20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "850px",
          margin: "0 auto",
        }}
      >
        <header style={{ textAlign: "center", marginBottom: "38px" }}>
          <div
            style={{
              color: colors.blue,
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "5px",
              marginBottom: "15px",
            }}
          >
            WEBSITE ARCHIVER
          </div>

          <h1
            style={{
              fontSize: "clamp(42px, 9vw, 76px)",
              fontWeight: 900,
              letterSpacing: "-4px",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            SITE<span style={{ color: colors.blue }}>FETCH</span>
          </h1>

          <p style={{ color: colors.muted, marginTop: "15px" }}>
            Download HTML and publicly accessible website assets.
          </p>
        </header>

        <section
          style={{
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: "18px",
            padding: "26px",
            boxShadow: "0 20px 70px #0006",
          }}
        >
          <label
            htmlFor="website-url"
            style={{
              display: "block",
              color: colors.muted,
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "11px",
            }}
          >
            WEBSITE URL
          </label>

          <input
            id="website-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              background: "#080e1b",
              color: "white",
              border: `1px solid ${colors.border}`,
              borderRadius: "11px",
              padding: "17px",
              fontSize: "15px",
              outline: "none",
              marginBottom: "17px",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "12px",
            }}
          >
            <button
              onClick={testConnection}
              disabled={loading || !url.trim()}
              style={{
                border: "none",
                borderRadius: "11px",
                padding: "16px",
                background: colors.blue,
                color: "white",
                fontWeight: 800,
                fontSize: "13px",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "PLEASE WAIT..." : "TEST & VIEW LOG"}
            </button>

            <button
              onClick={downloadWebsite}
              disabled={loading || !url.trim()}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: "11px",
                padding: "16px",
                background: "#202d43",
                color: "white",
                fontWeight: 800,
                fontSize: "13px",
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              DOWNLOAD ZIP
            </button>
          </div>
        </section>

        <section
          style={{
            marginTop: "18px",
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              padding: "18px 21px",
              borderBottom: showLogs
                ? `1px solid ${colors.border}`
                : "none",
            }}
          >
            <button
              onClick={() => setShowLogs(!showLogs)}
              style={{
                background: "transparent",
                border: "none",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              TERMINAL LOG {showLogs ? "▲" : "▼"}
            </button>

            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                color: status.includes("ERROR") || status.includes("FAILED")
                  ? "#ff7777"
                  : colors.green,
              }}
            >
              {status}
            </span>
          </div>

          {showLogs && (
            <div style={{ padding: "18px" }}>
              <div
                style={{
                  background: "#050910",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "11px",
                  padding: "18px",
                  minHeight: "150px",
                  maxHeight: "420px",
                  overflowY: "auto",
                }}
              >
                <pre
                  style={{
                    color: colors.green,
                    fontSize: "12px",
                    lineHeight: 1.9,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    margin: 0,
                    fontFamily: "Consolas, monospace",
                  }}
                >
                  {logs.length
                    ? logs.join("\n")
                    : "Waiting for diagnostic request..."}
                </pre>
              </div>

              <button
                onClick={() =>
                  navigator.clipboard.writeText(logs.join("\n"))
                }
                style={{
                  marginTop: "12px",
                  background: "transparent",
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: colors.muted,
                  fontSize: "11px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                COPY LOG
              </button>
            </div>
          )}
        </section>

        <footer
          style={{
            textAlign: "center",
            color: "#62718b",
            fontSize: "11px",
            marginTop: "28px",
          }}
        >
          SITEFETCH • PUBLIC WEBSITE RESOURCES ONLY
        </footer>
      </div>
    </main>
  );
}
