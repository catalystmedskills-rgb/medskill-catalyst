import type { ReactNode } from "react";
import type { Metadata } from "next";
import { fraunces, plusJakarta } from "@/src/lib/brand-fonts";
import { MetaPixel } from "@/src/components/MetaPixel";
import { GoogleAnalytics } from "@/src/components/GoogleAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://medskillscatalyst.com"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en" className={`${fraunces.variable} ${plusJakarta.variable}`}>
      <body>
        {children}
        <MetaPixel />
        {gaId && <GoogleAnalytics gaId={gaId} />}
      </body>
    </html>
  );
}
