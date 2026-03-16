import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Aerial Operations OS",
  description: "Mission planning, ingest, processing, and delivery workspace for DroneOps customers",
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
