import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Myself · 和自己一起成长",
  description: "认识你，陪你聊聊，记住成长，安排生活。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
