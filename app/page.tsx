import Link from "next/link";
import { MessageSquare, UploadCloud } from "lucide-react";

export default function HomePage() {
    return (
        <div className="min-h-[100dvh] bg-[#FDFDFD] flex flex-col items-center justify-center px-4">
            <div className="max-w-sm w-full space-y-8 text-center">
                <div>
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center mx-auto mb-4">
                        <MessageSquare size={22} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">UTAR Knowledge Bot</h1>
                    <p className="mt-2 text-sm text-zinc-500">AI-powered assistant for UTAR students and staff</p>
                </div>

                <div className="space-y-3">
                    <Link
                        href="/chat"
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 active:scale-[0.98] transition-all"
                    >
                        <MessageSquare size={15} />
                        Start chatting
                    </Link>
                    <Link
                        href="/admin/upload"
                        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white border border-zinc-200 text-zinc-700 text-sm font-medium rounded-xl hover:border-zinc-300 active:scale-[0.98] transition-all"
                    >
                        <UploadCloud size={15} />
                        Admin — Upload knowledge base
                    </Link>
                </div>
            </div>
        </div>
    );
}
