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
      <body style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        margin: 0,
        padding: '20px',
        backgroundColor: '#f5f5f5',
        lineHeight: '1.6'
      }}>
        {children}
      </body>
    </html>
  );
}
