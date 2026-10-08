import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ONCHAIN X-RAY",
  description: "See what the chart doesn't. X-ray a token's liquidity, holders, deployer and wallet clusters.",
};

export const viewport: Viewport = {
  themeColor: "#03050a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Syncopate:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
