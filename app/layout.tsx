import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Anime Production Scheduler",
  description: "Table + Gantt scheduler for animation production teams"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
