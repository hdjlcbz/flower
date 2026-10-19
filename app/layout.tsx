import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "我们去过的地方 | PLACES WE'VE BEEN",
  description: "记录我们一起去过的城市、日期、照片和一路上的记忆。",
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
