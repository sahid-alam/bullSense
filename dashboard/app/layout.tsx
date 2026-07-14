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
      <body>{children}</body>
    </html>
  );
}
