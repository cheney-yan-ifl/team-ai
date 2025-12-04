import type { Metadata } from "next";
import "./globals.css";

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
      <body style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
