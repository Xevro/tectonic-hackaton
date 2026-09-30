import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const source = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: "KBC Compass",
  description: "A financial companion that learns from each conversation and acts only with your approval.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${source.variable} font-sans antialiased`}>
        <div className="h-1 bg-kbc-blue" />
        {children}
      </body>
    </html>
  );
}
