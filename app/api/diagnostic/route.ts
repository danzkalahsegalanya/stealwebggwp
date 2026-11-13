
import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36";

function privateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4) return true;

  const [a, b] = p;

  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function privateIPv6(ip: string) {
  const s = ip.toLowerCase();
  return (
    s === "::" || s === "::1" ||
    s.startsWith("fc") || s.startsWith("fd") ||
    s.startsWith("fe8") || s.startsWith("fe9") ||
    s.startsWith("fea") || s.startsWith("feb") ||
    s.startsWith("ff")
  );
}

async function validate(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Hanya HTTP dan HTTPS yang diizinkan.");
  }

  if (url.username || url.password) {
    throw new Error("URL dengan kredensial tidak diizinkan.");
  }

  const host = url.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Alamat lokal tidak diizinkan.");
  }

  const version = isIP(host);

  if (version === 4 && privateIPv4(host)) {
    throw new Error("IP privat tidak diizinkan.");
  }

  if (version === 6 && privateIPv6(host)) {
    throw new Error("IP privat tidak diizinkan.");
  }

  if (!version) {
    const records = await lookup(host, { all: true });

    if (!records.length) throw new Error("DNS tidak menemukan IP.");

    for (const record of records) {
      if (
        (isIP(record.address) === 4 && privateIPv4(record.address)) ||
        (isIP(record.address) === 6 && privateIPv6(record.address))
      ) {
        throw new Error("Domain mengarah ke IP privat.");
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const logs: string[] = [];
  const started = Date.now();

  const log = (message: string) => {
    logs.push(`[${new Date().toISOString()}] ${message}`);
  };

  try {
    const body = await req.json();
    const input = body?.url;

    if (typeof input !== "string" || !input.trim()) {
      return NextResponse.json({
        success: false,
        logs: ["URL belum diisi."],
      }, { status: 400 });
    }

    const target = new URL(input.trim());

    log("Memulai pemeriksaan koneksi.");
    log(`Target: ${target.origin}${target.pathname}`);
    log("Memvalidasi alamat tujuan.");

    await validate(target);

    log("Validasi alamat selesai.");
    log("Mengirim HTTP request dari server Vercel.");

    let current = target;
    let response: Response | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      await validate(current);

      response = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(20000),
      });

      log(`Percobaan ${attempt + 1}: HTTP ${response.status}`);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (!location) {
          throw new Error("Redirect tidak memiliki Location header.");
        }

        const next = new URL(location, current);

        if (next.origin !== target.origin) {
          throw new Error("Redirect ke domain lain ditolak.");
        }

        current = next;
        log(`Redirect terdeteksi: ${current.pathname}`);
        continue;
      }

      break;
    }

    if (!response) throw new Error("Tidak menerima response.");

    const server = response.headers.get("server") || "Tidak diketahui";
    const ray = response.headers.get("cf-ray") || "Tidak tersedia";
    const contentType =
      response.headers.get("content-type") || "Tidak diketahui";

    log(`Status HTTP: ${response.status}`);
    log(`Server: ${server}`);
    log(`Cloudflare Ray: ${ray}`);
    log(`Content-Type: ${contentType}`);

    const text = await response.text();

    log(`Ukuran body: ${new TextEncoder().encode(text).length} byte`);
    log(`Cuplikan response: ${text.slice(0, 350).replace(/\s+/g, " ")}`);
    log(`Waktu request: ${Date.now() - started} ms`);

    if (response.status === 403) {
      log("HASIL: Server tujuan menolak request dari Vercel.");
      log("Periksa aturan firewall, Cloudflare, atau kebijakan akses situs.");
    } else if (response.ok) {
      log("HASIL: Koneksi berhasil.");
    } else {
      log(`HASIL: Server memberikan HTTP ${response.status}.`);
    }

    return NextResponse.json({
      success: response.ok,
      targetStatus: response.status,
      logs,
    });
  } catch (error) {
    log(
      `ERROR: ${error instanceof Error ? error.message : String(error)}`
    );
    log(`Waktu sampai gagal: ${Date.now() - started} ms`);

    return NextResponse.json({
      success: false,
      logs,
    });
  }
}
