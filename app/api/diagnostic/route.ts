import { NextRequest, NextResponse } from "next/server";
import { fetchSameOrigin, validatePublicUrl } from "@/lib/site";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const logs: string[] = [];
  const started = Date.now();
  const log = (s: string) => logs.push(`[${new Date().toISOString()}] ${s}`);
  try {
    const body = await req.json();
    if (typeof body?.url !== "string" || !body.url.trim()) throw new Error("URL belum diisi.");
    log("Memulai pemeriksaan dari server deployment.");
    const target = await validatePublicUrl(body.url.trim());
    log(`Target: ${target.origin}${target.pathname}`);
    log("Validasi DNS dan alamat publik: OK.");
    log("Mengirim HTTP GET...");
    const response = await fetchSameOrigin(target.toString(), target.origin, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    const server = response.headers.get("server") || "tidak diinformasikan";
    const ray = response.headers.get("cf-ray") || "tidak ada";
    const type = response.headers.get("content-type") || "tidak diketahui";
    const length = response.headers.get("content-length") || "tidak diinformasikan";
    log(`HTTP status: ${response.status} ${response.statusText}`);
    log(`Server header: ${server}`);
    log(`Cloudflare Ray ID: ${ray}`);
    log(`Content-Type: ${type}`);
    log(`Content-Length: ${length}`);
    const bodyText = await response.text();
    log(`Ukuran body diterima: ${new TextEncoder().encode(bodyText).length} byte`);
    const title = bodyText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    if (title) log(`Judul halaman: ${title.slice(0, 180)}`);
    if (response.status === 403) log("KESIMPULAN: server target menolak request dari runtime deployment. Header tidak dapat menjamin akses; pemilik situs perlu memeriksa firewall/WAF atau menyediakan API/export.");
    else if (response.ok) log("KESIMPULAN: koneksi berhasil; endpoint download dapat dicoba.");
    else log(`KESIMPULAN: server mengembalikan status ${response.status}.`);
    log(`Durasi total: ${Date.now() - started} ms`);
    return NextResponse.json({ success: response.ok, targetStatus: response.status, logs });
  } catch (e) {
    log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    log(`Durasi sampai gagal: ${Date.now() - started} ms`);
    return NextResponse.json({ success: false, logs }, { status: 200 });
  }
}
