import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 35;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 10000;

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  return p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255) ||
    p[0] === 10 || p[0] === 127 || p[0] === 0 || p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
function isPrivateIPv6(ip: string) {
  const s = ip.toLowerCase();
  return s === "::1" || s === "::" || s.startsWith("fe80:") || s.startsWith("fc") ||
    s.startsWith("fd") || s.startsWith("::ffff:127.") || s.startsWith("::ffff:10.") ||
    s.startsWith("::ffff:192.168.");
}
async function validatePublicUrl(input: string): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Format URL tidak valid."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Hanya URL HTTP atau HTTPS yang didukung.");
  if (url.username || url.password) throw new Error("URL dengan username/password tidak diizinkan.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Port selain 80/443 tidak diizinkan.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateIPv4(host)) throw new Error("Alamat IP privat tidak diizinkan.");
  if (ipType === 6 && isPrivateIPv6(host)) throw new Error("Alamat IP privat tidak diizinkan.");
  if (!ipType) {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some(r => r.family === 4 ? isPrivateIPv4(r.address) : isPrivateIPv6(r.address))) {
      throw new Error("Domain mengarah ke alamat IP privat atau tidak aman.");
    }
  }
  url.hash = "";
  return url;
}
async function safeFetch(input: string, baseOrigin: string): Promise<{url: URL; response: Response}> {
  let current = await validatePublicUrl(input);
  if (current.origin !== baseOrigin) throw new Error("Hanya file dari domain yang sama yang diambil.");
  for (let i = 0; i < 4; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, { redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": "SiteFetch-Archive/1.0", "Accept": "*/*" } });
    } catch (e) {
      clearTimeout(timer);
      throw new Error("Tidak bisa mengakses URL. Periksa domain atau coba lagi.");
    }
    clearTimeout(timer);
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect tidak valid.");
      const next = await validatePublicUrl(new URL(location, current).toString());
      if (next.origin !== baseOrigin) throw new Error("Redirect ke domain lain diblokir.");
      current = next; continue;
    }
    return { url: current, response };
  }
  throw new Error("Terlalu banyak redirect.");
}
function localPath(url: URL, base: URL) {
  let path = decodeURIComponent(url.pathname);
  if (!path || path.endsWith("/")) path += "index.html";
  path = path.replace(/^\/+/, "").replace(/\.\./g, "_");
  if (url.search) path += "_" + Buffer.from(url.search).toString("hex").slice(0, 24);
  return path || "index.html";
}
function isFetchableAsset(url: URL) {
  return /\.(css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp4|webm|pdf)(?:$)/i.test(url.pathname);
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body.url !== "string" || body.url.length > 2048) {
      return NextResponse.json({ error: "Masukkan URL website yang valid." }, { status: 400 });
    }
    const start = await validatePublicUrl(body.url);
    const { url: finalUrl, response } = await safeFetch(start.toString(), start.origin);
    if (!response.ok) throw new Error(`Website merespons dengan status ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("URL tersebut bukan halaman HTML.");
    const html = await response.text();
    if (Buffer.byteLength(html) > MAX_FILE_BYTES) throw new Error("HTML terlalu besar (maksimal 2 MB).");

    const $ = cheerio.load(html);
    const zip = new JSZip();
    const htmlFile = "index.html";
    const assetUrls = new Map<string, string>();
    const base = finalUrl;
    const addUrl = (raw: string | undefined) => {
      if (!raw || raw.startsWith("#") || /^(data:|blob:|javascript:|mailto:|tel:)/i.test(raw)) return;
      try {
        const u = new URL(raw, base);
        if (u.origin !== base.origin || !isFetchableAsset(u)) return;
        u.hash = "";
        assetUrls.set(u.toString(), localPath(u, base));
      } catch {}
    };
    $("link[href],script[src],img[src],source[src],video[poster],audio[src]").each((_, el) => {
      const node = $(el);
      addUrl(node.attr("href") || node.attr("src") || node.attr("poster"));
    });
    $("[style]").each((_, el) => {
      const style = $(el).attr("style") || "";
      for (const m of style.matchAll(/url\((?:['"]?)([^)'"]+)(?:['"]?)\)/gi)) addUrl(m[1]);
    });
    for (const style of $("style").toArray()) {
      const css = $(style).html() || "";
      for (const m of css.matchAll(/url\((?:['"]?)([^)'"]+)(?:['"]?)\)/gi)) addUrl(m[1]);
    }

    const files: Array<{url:string; path:string; data:Buffer; type:string}> = [];
    let total = Buffer.byteLength(html);
    for (const [assetUrl, path] of [...assetUrls.entries()].slice(0, MAX_FILES)) {
      try {
        const got = await safeFetch(assetUrl, base.origin);
        if (!got.response.ok) continue;
        const len = Number(got.response.headers.get("content-length") || 0);
        if (len > MAX_FILE_BYTES) continue;
        const ab = await got.response.arrayBuffer();
        const data = Buffer.from(ab);
        if (data.length > MAX_FILE_BYTES || total + data.length > MAX_TOTAL_BYTES) continue;
        total += data.length;
        files.push({ url: assetUrl, path, data, type: got.response.headers.get("content-type") || "" });
      } catch {}
    }

    // Repoint downloaded asset references to their local paths.
    for (const [assetUrl, path] of assetUrls) {
      const escaped = assetUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rel = path;
      const original = new URL(assetUrl);
      const candidates = [assetUrl, original.pathname + original.search, original.pathname];
      for (const candidate of candidates) {
        $("*").each((_, el) => {
          const node = $(el);
          for (const attr of ["src", "href", "poster"]) {
            const value = node.attr(attr);
            if (value === candidate) node.attr(attr, rel);
          }
        });
      }
      void escaped;
    }
    zip.file(htmlFile, $.html());
    for (const file of files) {
      zip.file(file.path, file.data);
      if (/css/i.test(file.type) || file.path.endsWith(".css")) {
        // CSS is included as downloaded; relative nested URLs may need manual adjustment.
      }
    }
    zip.file("README.txt", `SiteFetch archive\nSource: ${finalUrl.toString()}\nDownloaded: ${new Date().toISOString()}\n\nThis archive contains the homepage and a limited set of same-domain public assets discovered in its HTML.\nIt is not a complete mirror of the website. Some links, dynamic content, API data, and nested CSS assets may not work offline.\nOnly archive websites you own or have permission to copy.\n`);
    const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 5 } });
    const hostname = finalUrl.hostname.replace(/[^a-z0-9.-]/gi, "_");
    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${hostname}-archive.zip"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memproses website.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
