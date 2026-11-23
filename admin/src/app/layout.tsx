import { BrandProvider, ThemeInit } from "@illamhelp/ui-web/theme";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/session/SessionProvider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "IllamHelp Admin",
  description: "Admin and support operations console for IllamHelp"
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html suppressHydrationWarning lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <ThemeInit persistent={false} />
        <AppRouterCacheProvider><BrandProvider><SessionProvider>{children}</SessionProvider></BrandProvider></AppRouterCacheProvider>
      </body>
    </html>
  );
}
