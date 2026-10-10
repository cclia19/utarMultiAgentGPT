import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "UTARCHAT knowledge base",
    robots: { index: false, follow: false },
};

export default function KnowledgeBaseLayout({ children }: { children: React.ReactNode }) {
    return children;
}
