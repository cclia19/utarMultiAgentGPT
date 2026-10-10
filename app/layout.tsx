import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
    title: "UTARCHAT (Limited Beta) - UTAR Official Chatbot",
    description: "University Knowledge Base",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
        { media: "(prefers-color-scheme: dark)", color: "#09090b" },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={inter.variable}>
            <body className="font-sans bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 selection:bg-indigo-600 selection:text-white antialiased">
                {children}
            </body>
        </html>
    );
}
