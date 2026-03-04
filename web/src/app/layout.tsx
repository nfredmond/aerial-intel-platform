import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DroneOps Auth MVP",
  description: "Minimal DroneOps authentication and entitlement gate",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
