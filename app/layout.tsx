import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const source = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: "Situation 141",
  description:
    "The next banking situation builds itself from a household’s own past and from other people who bent the same way.",
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
