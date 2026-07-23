import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Woney — Money, made clear",
  description: "Canadian personal finance with clear categorization and calm planning.",
  icons: {
    icon: [
      { url: "/brand/woney-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/woney-favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/brand/woney-favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/woney-favicon-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

const themeBoot = `
(function () {
  try {
    var key = "woney-theme";
    var stored = localStorage.getItem(key);
    var mode = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.style.colorScheme = mode;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className={`${sans.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
