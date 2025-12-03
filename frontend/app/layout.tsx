import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Team Workspace",
  description: "Slack-like multi-agent chat built with Next.js and AG UI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
