import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "FAFO — Fuck Around and Find Out",
  description:
    "Productividad contextual gamificada. The more you fuck around, the more you find out.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "FAFO",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF5EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0E11" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
