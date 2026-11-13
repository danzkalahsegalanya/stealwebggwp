import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import JSZip from "jszip";
import { fetchSameOrigin, validatePublicUrl } from "@/lib/site";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ASSETS = 35;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.url !== "string" || !body.url.trim()) return NextResponse.json({ error: "Masukkan URL website." }, { status: 400 });
    const target = await validatePublicUrl(body.url.trim());
    const response = await fetchSameOrigin(target.toString(), target.origin, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    if (!response.ok) return NextResponse.json({ error: `Website merespons dengan status ${response.status}.`, hint: response.status === 403 ? "Request dari runtime deployment ditolak oleh server tujuan. Jika situs milikmu, periksa firewall/WAF atau gunakan mekanisme export resmi." : "Server tujuan tidak mengirim halaman yang berhasil." }, { status: 502 });
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) return NextResponse.json({ error: "URL tidak mengembalikan dokumen HTML." }, { status: 400 });
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.length > MAX_FILE) return NextResponse.json({ error: "HTML melebihi batas 2 MB." }, { status: 413 });
    const $ = cheerio.load(raw.toString("utf8"));
    const zip = new JSZip();
    const assets = zip.folder("assets");
    let total = raw.length;
    let count = 0;
    const seen = new Set<string>();
    const nodes = $("img[src],script[src],link[rel='stylesheet'][href],link[rel='icon'][href]").toArray();
    for (const node of nodes) {
      if (count >= MAX_ASSETS || total >= MAX_TOTAL) break;
      const tag = node.tagName.toLowerCase();
      const attr = tag === "link" ? "href" : "src";
      const original = $(node).attr(attr);
      if (!original || original.startsWith("data:") || original.startsWith("#")) continue;
      let assetUrl: URL;
      try { assetUrl = new URL(original, target); } catch { continue; }
      if (assetUrl.origin !== target.origin || seen.has(assetUrl.toString())) continue;
      seen.add(assetUrl.toString());
      try {
        const assetResponse = await fetchSameOrigin(assetUrl.toString(), target.origin);
        if (!assetResponse.ok) continue;
        const assetType = assetResponse.headers.get("content-type") || "";
        if (assetType.includes("text/html") || assetType.includes("application/json")) continue;
        const declared = Number(assetResponse.headers.get("content-length") || 0);
        if (declared > MAX_FILE) continue;
        const buffer = Buffer.from(await assetResponse.arrayBuffer());
        if (buffer.length > MAX_FILE || total + buffer.length > MAX_TOTAL) continue;
        const pathName = assetUrl.pathname.split("/").pop() || `asset-${count + 1}`;
        const safeName = pathName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 90) || `asset-${count + 1}`;
        const filename = `${count + 1}-${safeName}`;
        assets?.file(filename, buffer);
        $(node).attr(attr, `assets/${filename}`);
        total += buffer.length;
        count++;
      } catch { /* Asset publik yang gagal diambil dilewati. */ }
    }
    zip.file("index.html", $.html());
    zip.file("README.txt", `SiteFetch export\nSource: ${target.toString()}\nAssets downloaded: ${count}\nTotal bytes: ${total}\n\nOnly publicly accessible same-origin HTML resources were collected. This is a bounded homepage export, not a full-site mirror.`);
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new NextResponse(new Uint8Array(archive), { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="sitefetch-export.zip"', "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Terjadi kesalahan saat membuat ZIP." }, { status: 500 });
  }
}
