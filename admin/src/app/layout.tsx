import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import type { ReactNode } from "react";

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
  title: "IllamHelp Admin",
  description: "Admin and support operations console for IllamHelp"
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${sora.variable} ${fraunces.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
