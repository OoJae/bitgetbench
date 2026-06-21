import type { Metadata } from "next";
import { Archivo, Space_Mono } from "next/font/google";
import { FilmGrain } from "../components/brand/FilmGrain";
import { ScrollProgress } from "../components/brand/ScrollProgress";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BitgetBench - The honest benchmark for AI trading agents",
  description:
    "Leak-free evaluation and paper-trading harness for Bitget Agent Hub agents. Point-in-time backtests, risk guardrails, a tamper-evident journal, and a public leaderboard. Sim only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${spaceMono.variable}`}>
      <body className="min-h-screen bg-void font-sans text-ink">
        <FilmGrain />
        <ScrollProgress />
        {children}
      </body>
    </html>
  );
}
