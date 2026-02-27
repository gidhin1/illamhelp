import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";

import { SessionProvider } from "@/components/session/SessionProvider";

import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body"
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "IllamHelp",
  description: "Find trusted home services with privacy-first connections"
};

export default function RootLayout({ children }: { children: any }): JSX.Element {
  return (
    <html lang="en" className={`${sora.variable} ${fraunces.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
