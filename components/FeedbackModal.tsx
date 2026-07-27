"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, X, Send, Loader2, CheckCircle2, MessageSquare, ShieldCheck } from "lucide-react";

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    rating: "like" | "dislike";
    userQuery: string;
    responseText: string;
    selectedAgentId?: string;
    selectedAgentLabel?: string;
    storeDisplayName?: string;
    sourceMode?: string;
    citations?: string[];
    screenshotBase64?: string;
    onSubmitSuccess?: () => void;
}

export default function FeedbackModal({
    isOpen,
    onClose,
    rating,
    userQuery,
    responseText,
    selectedAgentId = "general",
    selectedAgentLabel = "General UTAR Assistant",
    storeDisplayName = "",
    sourceMode = "none",
    citations = [],
    screenshotBase64 = "",
    onSubmitSuccess,
}: FeedbackModalProps) {
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const payload = {
                userQuery,
                responseText,
                selectedAgentId,
                selectedAgentLabel,
                storeDisplayName,
                sourceMode,
                citations,
                rating,
                comment: comment.trim(),
                screenshotBase64,
            };

            const res = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                setSubmitted(true);
                setTimeout(() => {
                    setSubmitted(false);
                    setComment("");
                    if (onSubmitSuccess) onSubmitSuccess();
                    onClose();
                }, 1200);
            }
        } catch (error) {
            console.error("Failed to submit feedback:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                    <div className="flex items-center gap-2.5">
                        <div
                            className={`p-2 rounded-xl border ${
                                rating === "like"
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                    : "bg-amber-50 text-amber-600 border-amber-200"
                            }`}
                        >
                            {rating === "like" ? (
                                <ThumbsUp className="w-4 h-4" />
                            ) : (
                                <ThumbsDown className="w-4 h-4" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold text-zinc-900">
                                {rating === "like"
                                    ? "Positive Feedback"
                                    : "Report Issue / Feedback"}
                            </h3>
                            <p className="text-[11px] text-zinc-400">
                                Help us improve TARo AI Assistant
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {submitted ? (
                        <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-in zoom-in duration-300" />
                            <h4 className="text-sm font-semibold text-zinc-900">
                                Thank you for your feedback!
                            </h4>
                            <p className="text-xs text-zinc-500">
                                Your response has been recorded.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Query Preview */}
                            <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-xs space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>User Query</span>
                                </div>
                                <p className="text-zinc-800 line-clamp-2 italic font-sans">
                                    "{userQuery}"
                                </p>
                                <div className="pt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 border-t border-zinc-200/50">
                                    <span className="font-semibold text-zinc-700">
                                        {selectedAgentLabel}
                                    </span>
                                    {storeDisplayName && (
                                        <span>• {storeDisplayName}</span>
                                    )}
                                </div>
                            </div>

                            {/* Screenshot Preview */}
                            {screenshotBase64 && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-medium text-zinc-600 flex items-center gap-1">
                                        <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                                        Visual Proof Captured
                                    </span>
                                    <div className="rounded-xl border border-zinc-200 overflow-hidden max-h-36 bg-zinc-100">
                                        <img
                                            src={screenshotBase64}
                                            alt="Captured interaction"
                                            className="w-full object-cover object-top"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Comment Input */}
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-zinc-700">
                                    Additional Comments{" "}
                                    <span className="text-zinc-400 font-normal">
                                        (Optional)
                                    </span>
                                </label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder={
                                        rating === "like"
                                            ? "What did TARo do well?"
                                            : "What was inaccurate or missing?"
                                    }
                                    rows={3}
                                    className="w-full text-xs p-3 rounded-xl border border-zinc-200 outline-none focus:border-zinc-400 transition-colors resize-none placeholder:text-zinc-400"
                                />
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Submitting Feedback...</span>
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3.5 h-3.5" />
                                        <span>Submit Feedback</span>
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
