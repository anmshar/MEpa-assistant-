import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MEpa: your AI creator manager",
  description: "Connect your accounts. Get a manager who knows your numbers: what to post, when to post it, and what to charge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
