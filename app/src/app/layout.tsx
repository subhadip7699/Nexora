import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";
import { Splash } from "@/components/Splash";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexora | Private Access Gateway",
  description: "A Midnight Preprod access gateway for private Nexora credential proofs.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_LIVE_DEMO_URL || "http://localhost:3000"),
  openGraph: {
    title: "Nexora",
    description: "Private Nexora membership proofs on Midnight Preprod.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <Splash />
        <Navigation />
        {children}
        <Footer />
      </body>
    </html>
  );
}
