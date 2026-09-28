import localFont from "next/font/local";

// Bundled Google Fonts (SIL OFL) keep production builds independent of its API.
export const fraunces = localFont({
  src: [
    { path: "../../assets/fonts/brand/Fraunces.ttf", weight: "100 900", style: "normal" },
    { path: "../../assets/fonts/brand/Fraunces-Italic.ttf", weight: "100 900", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

export const plusJakarta = localFont({
  src: "../../assets/fonts/brand/PlusJakartaSans.ttf",
  weight: "200 800",
  variable: "--font-plus-jakarta",
  display: "swap",
});
