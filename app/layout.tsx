import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RaiseSport Academy",
  description: "Athlete development, memberships and academy management.",
  icons: {
    icon: "/images/logo.jpeg",
    shortcut: "/images/logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
