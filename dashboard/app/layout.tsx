import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BullSense — Test Lab",
  description: "Run the BullSense engine on any ticker.",
  // No-auth internal tool: keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="topnav">
          <a href="/" className="nav-brand"><span className="nav-diamond" /> BULLSENSE</a>
          <div className="nav-links">
            <a href="/advisor">Advisor</a>
            <a href="/screener">Screener</a>
            <a href="/">Test Lab</a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
