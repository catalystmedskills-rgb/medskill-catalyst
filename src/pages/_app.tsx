import type { AppProps } from "next/app";
import { fraunces, plusJakarta } from "@/src/lib/brand-fonts";

// The App Router gets its styles from src/app/layout.tsx, which Pages Router
// routes never execute. Without this file, /admin renders with no CSS at all —
// every Tailwind class on the page is inert.
import "../app/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${fraunces.variable} ${plusJakarta.variable}`}>
      <Component {...pageProps} />
    </div>
  );
}
