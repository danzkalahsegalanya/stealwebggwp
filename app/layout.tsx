import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SiteFetch — Website Downloader",
  description: "Unduh salinan halaman website publik yang kamu miliki atau punya izin untuk arsipkan."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
