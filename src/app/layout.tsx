import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Archivo } from "next/font/google";
import "./globals.css";

// One family, two voices: narrow/heavy for pesos and headings, normal width for text.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ambagan", template: "%s · ambagan" },
  description: "Split it, settle it. Shared subscription statements and payments for friends.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#16121f" },
  ],
};

// Constant string (no user input): sets the theme class before first paint to avoid a flash.
const THEME_INIT = `try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by src/proxy.ts for the Content-Security-Policy: without it the browser refuses this inline script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${archivo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
