import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wecomconnect",
  description: "Shift scheduling for three-shift teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
