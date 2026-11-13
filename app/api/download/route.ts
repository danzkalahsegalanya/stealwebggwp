
import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import JSZip from "jszip";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const maxDuration = 60;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const MAX_ASSETS = 35;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_TOTAL_SIZE = 12 * 1024 * 1024;

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = p;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const value = ip.toLowerCase();

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

async function validatePublicUrl(input: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("URL tidak valid.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Hanya URL HTTP dan HTTPS yang diizinkan.");
  }

  if (url.username || url.password) {
    throw new Error("URL dengan username/password tidak diizinkan.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Alamat lokal tidak diizinkan.");
  }

  const ipVersion = isIP(hostname);

  if (ipVersion === 4 && isPrivateIPv4(hostname)) {
    throw new Error("IP privat tidak diizinkan.");
  }

  if (ipVersion === 6 && isPrivateIPv6(hostname)) {
    throw new Error("IP privat tidak diizinkan.");
  }

  if (!ipVersion) {
    const addresses = await lookup(hostname, { all: true });

    if (!addresses.length) {
      throw new Error("Domain tidak memiliki alamat IP.");
    }

    for (const address of addresses) {
      if (
        (isIP(address.address) === 4 && isPrivateIPv4(address.address)) ||
        (isIP(address.address) === 6 && isPrivateIPv6(address.address))
      ) {
        throw new Error("Domain mengarah ke alamat IP privat.");
      }
    }
  }

  return url;
}

async function safeFetch(
  input: string,
  origin: string,
  accept: string
): Promise<Response> {
  const url = await validatePublicUrl(input);

  if (url.origin !== origin) {
    throw new Error("Akses ke domain lain tidak diizinkan.");
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(20000),
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");

    if (!location) {
      throw new Error("Redirect tidak memiliki alamat tujuan.");
    }

    const redirectedUrl = new URL(location, url);

    if (redirectedUrl.origin !== origin) {
      throw new Error("Redirect ke domain lain ditolak.");
    }

    const checkedRedirect = await validatePublicUrl(redirectedUrl.toString());

    return fetch(checkedRedirect.toString(), {
      method: "GET",
      redirect: "error",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: accept,
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(20000),
    });
  }

  return response;
}

function getSafeFilename(url: URL, index: number): string {
  const rawName = url.pathname.split("/").pop() || `asset-${index}`;
  const cleaned = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);

  return cleaned || `asset-${index}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inputUrl = body?.url;

    if (typeof inputUrl !== "string" || !inputUrl.trim()) {
      return NextResponse.json(
        { error: "Masukkan URL website terlebih dahulu." },
        { status: 400 }
      );
    }

    const target = await validatePublicUrl(inputUrl.trim());
    const origin = target.origin;

    const pageResponse = await safeFetch(
      target.toString(),
      origin,
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    );

    if (!pageResponse.ok) {
      return NextResponse.json(
        {
          error: `Website menolak request dengan HTTP ${pageResponse.status}.`,
          status: pageResponse.status,
          hint:
            pageResponse.status === 403
              ? "Server tujuan mungkin membatasi request dari server Vercel. Jika website milikmu, periksa aturan firewall atau Cloudflare."
              : "Server tujuan tidak berhasil memberikan halaman.",
        },
        { status: 502 }
      );
    }

    const contentType = pageResponse.headers.get("content-type") || "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return NextResponse.json(
        { error: "URL tersebut tidak mengembalikan halaman HTML." },
        { status: 400 }
      );
    }

    const declaredLength = Number(
      pageResponse.headers.get("content-length") || 0
    );

    if (declaredLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran halaman terlalu besar." },
        { status: 413 }
      );
    }

    const htmlBuffer = Buffer.from(await pageResponse.arrayBuffer());

    if (htmlBuffer.length > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran halaman melewati batas 2 MB." },
        { status: 413 }
      );
    }

    const html = htmlBuffer.toString("utf8");
    const $ = cheerio.load(html);
    const zip = new JSZip();

    const assetsFolder = zip.folder("assets");
    let totalSize = htmlBuffer.length;
    let downloadedAssets = 0;

    const assetElements = $(
      "img[src], script[src], link[rel='stylesheet'][href], link[rel='icon'][href]"
    ).toArray();

    const seen = new Set<string>();
    let assetIndex = 0;

    for (const element of assetElements) {
      if (downloadedAssets >= MAX_ASSETS) break;
      if (totalSize >= MAX_TOTAL_SIZE) break;

      const tag = element.tagName.toLowerCase();
      const attribute = tag === "link" ? "href" : "src";
      const rawUrl = $(element).attr(attribute);

      if (!rawUrl || rawUrl.startsWith("data:")) continue;

      let assetUrl: URL;

      try {
        assetUrl = new URL(rawUrl, target);
      } catch {
        continue;
      }

      if (assetUrl.origin !== origin) continue;

      const assetKey = assetUrl.toString();

      if (seen.has(assetKey)) continue;
      seen.add(assetKey);

      assetIndex++;

      try {
        const assetResponse = await safeFetch(
          assetKey,
          origin,
          "*/*"
        );

        if (!assetResponse.ok) continue;

        const assetType = assetResponse.headers.get("content-type") || "";

        if (
          assetType.includes("text/html") ||
          assetType.includes("application/json")
        ) {
          continue;
        }

        const assetLength = Number(
          assetResponse.headers.get("content-length") || 0
        );

        if (assetLength > MAX_FILE_SIZE) continue;

        const assetBuffer = Buffer.from(
          await assetResponse.arrayBuffer()
        );

        if (
          assetBuffer.length > MAX_FILE_SIZE ||
          totalSize + assetBuffer.length > MAX_TOTAL_SIZE
        ) {
          continue;
        }

        const filename = `${assetIndex}-${getSafeFilename(
          assetUrl,
          assetIndex
        )}`;

        assetsFolder?.file(filename, assetBuffer);

        $(element).attr(attribute, `assets/${filename}`);

        downloadedAssets++;
        totalSize += assetBuffer.length;
      } catch {
        // Lewati aset yang gagal diakses.
        continue;
      }
    }

    zip.file("index.html", $.html());

    zip.file(
      "sitefetch-info.txt",
      [
        "SiteFetch Export",
        `Source: ${target.toString()}`,
        `Assets downloaded: ${downloadedAssets}`,
        `HTML size: ${htmlBuffer.length} bytes`,
        `Total downloaded: ${totalSize} bytes`,
        "",
        "Only publicly accessible same-origin resources were collected.",
      ].join("\n")
    );

    const archive = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = "sitefetch-export.zip";

    return new NextResponse(new Uint8Array(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(archive.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Terjadi kesalahan.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
