import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wecomconnect",
  description: "Shift scheduling for three-shift teams"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("wecomconnect-theme");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}`
          }}
        />
        {children}
      </body>
    </html>
  );
}
