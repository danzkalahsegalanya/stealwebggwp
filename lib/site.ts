import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function isPrivateV4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
function isPrivateV6(ip: string) {
  const s = ip.toLowerCase();
  return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") ||
    s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") ||
    s.startsWith("feb") || s.startsWith("ff") || s.startsWith("::ffff:127.") ||
    s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
}
export async function validatePublicUrl(input: string): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("URL tidak valid. Sertakan https:// atau http://"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Hanya HTTP dan HTTPS yang diizinkan.");
  if (url.username || url.password) throw new Error("URL dengan kredensial tidak diizinkan.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Alamat lokal tidak diizinkan.");
  const version = isIP(host);
  if (version === 4 && isPrivateV4(host)) throw new Error("IP privat tidak diizinkan.");
  if (version === 6 && isPrivateV6(host)) throw new Error("IP privat tidak diizinkan.");
  if (!version) {
    const records = await lookup(host, { all: true });
    if (!records.length) throw new Error("DNS tidak menemukan alamat IP.");
    for (const record of records) {
      if ((isIP(record.address) === 4 && isPrivateV4(record.address)) || (isIP(record.address) === 6 && isPrivateV6(record.address))) throw new Error("Domain mengarah ke IP privat; request dibatalkan.");
    }
  }
  return url;
}

export async function fetchSameOrigin(input: string, origin: string, accept = "*/*") {
  let current = await validatePublicUrl(input);
  for (let hop = 0; hop <= 4; hop++) {
    if (current.origin !== origin) throw new Error("Akses atau redirect ke domain lain ditolak.");
    const response = await fetch(current.toString(), {
      method: "GET", redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(20000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect tidak memiliki Location header.");
      current = await validatePublicUrl(new URL(location, current).toString());
      continue;
    }
    return response;
  }
  throw new Error("Terlalu banyak redirect.");
}
