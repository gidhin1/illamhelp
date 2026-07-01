import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import { AnalyticsConsentBanner } from "@/components/analytics/AnalyticsConsentBanner";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { SessionProvider } from "@/components/session/SessionProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

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
  title: "IllamHelp",
  description: "Find trusted home services with privacy-first connections"
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        {gtmId || ga4MeasurementId ? (
          <>
            <Script id="gtm-consent-default" strategy="beforeInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                ${ga4MeasurementId ? `window.illamhelpGa4MeasurementId = '${ga4MeasurementId}';` : ""}
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                var illamhelpAnalyticsStorage = 'denied';
                try {
                  var storedConsent = window.localStorage.getItem('illamhelp.analyticsConsent.v1');
                  var parsedConsent = storedConsent ? JSON.parse(storedConsent) : null;
                  if (parsedConsent && parsedConsent.analytics === 'granted') {
                    illamhelpAnalyticsStorage = 'granted';
                  }
                } catch (error) {}
                gtag('consent', 'default', {
                  analytics_storage: illamhelpAnalyticsStorage,
                  ad_storage: 'denied',
                  wait_for_update: 500
                });
                if (illamhelpAnalyticsStorage === 'granted') {
                  gtag('consent', 'update', {
                    analytics_storage: 'granted',
                    ad_storage: 'denied'
                  });
                }
                ${!gtmId && ga4MeasurementId ? `
                gtag('js', new Date());
                gtag('config', '${ga4MeasurementId}', {
                  send_page_view: false,
                  debug_mode: ${process.env.NODE_ENV !== "production" ? "true" : "false"}
                });
                ` : ""}
              `}
            </Script>
            {gtmId ? (
              <Script id="gtm-loader" strategy="afterInteractive">
                {`
                  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                  })(window,document,'script','dataLayer','${gtmId}');
                `}
              </Script>
            ) : null}
            {!gtmId && ga4MeasurementId ? (
              <>
                <Script
                  id="ga4-loader"
                  src={`https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`}
                  strategy="afterInteractive"
                />
                <Script id="ga4-config" strategy="afterInteractive">
                  {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    window.gtag = gtag;
                  `}
                </Script>
              </>
            ) : null}
          </>
        ) : null}
        <ThemeProvider>
          <SessionProvider>
            <AnalyticsProvider>{children}</AnalyticsProvider>
            <AnalyticsConsentBanner />
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
