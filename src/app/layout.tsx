import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Nunito } from "next/font/google";
import "./globals.css";

// One soft rounded family for everything: headings and pesos at semibold, text at medium.
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ambagan", template: "%s · ambagan" },
  description: "Split it, settle it. Shared subscription statements and payments for friends.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff4f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1e111b" },
  ],
};

// Constant string (no user input): sets the theme class before first paint to avoid a flash.
const THEME_INIT = `try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by src/proxy.ts for the Content-Security-Policy: without it the browser refuses this inline script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${nunito.variable} h-full`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
