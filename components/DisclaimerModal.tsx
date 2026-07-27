"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, Check, FileText, Lock, AlertCircle } from "lucide-react";

const STORAGE_KEY = "taro_disclaimer_accepted_v1";

interface DisclaimerModalProps {
    onAccept?: () => void;
}

export default function DisclaimerModal({ onAccept }: DisclaimerModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isChecked, setIsChecked] = useState(false);

    useEffect(() => {
        const accepted = localStorage.getItem(STORAGE_KEY);
        if (!accepted) {
            setIsOpen(true);
        }
    }, []);

    const handleAccept = () => {
        if (!isChecked) return;
        localStorage.setItem(STORAGE_KEY, "true");
        setIsOpen(false);
        if (onAccept) {
            onAccept();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 text-white px-6 py-5 flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 border border-blue-400/20 rounded-xl text-blue-400">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight text-white">
                            Welcome to TARo AI Assistant
                        </h2>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Important Disclaimer & Terms of Use
                        </p>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-4 text-xs leading-relaxed text-zinc-600">
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 flex gap-3 text-amber-900">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-snug">
                            Please review and accept the following guidelines before using TARo to query UTAR academic handbook guidelines, procedures, and campus information.
                        </p>
                    </div>

                    <div className="space-y-3 pt-1">
                        <div className="flex gap-3">
                            <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-700 h-fit shrink-0 mt-0.5">
                                <FileText className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-900 text-xs mb-0.5">
                                    1. AI Reference Tool Only
                                </h4>
                                <p className="text-zinc-600">
                                    TARo uses generative AI to index official UTAR knowledge bases. Answers are for reference purposes and do not replace official announcements or Senate decisions.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-700 h-fit shrink-0 mt-0.5">
                                <Lock className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-900 text-xs mb-0.5">
                                    2. Privacy & Data Protection
                                </h4>
                                <p className="text-zinc-600">
                                    Do not submit private personal data such as passwords, NRIC/Passport numbers, bank accounts, or confidential grade records into the chat.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="p-1.5 bg-zinc-100 rounded-lg text-zinc-700 h-fit shrink-0 mt-0.5">
                                <ShieldAlert className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-zinc-900 text-xs mb-0.5">
                                    3. Official Department Verification
                                </h4>
                                <p className="text-zinc-600">
                                    For official applications, credit transfers, fees, or exam appeals, always confirm procedures directly with the relevant division (DACE, DEAS, DFN, DSA, Registrar, etc.).
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer / Action */}
                <div className="border-t border-zinc-100 px-6 py-4 bg-zinc-50/50 flex flex-col gap-4">
                    <label className="flex items-start gap-3 cursor-pointer group select-none">
                        <div className="relative flex items-center justify-center mt-0.5">
                            <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => setIsChecked(e.target.checked)}
                                className="peer sr-only"
                            />
                            <div className="w-4 h-4 border-2 border-zinc-300 rounded bg-white peer-checked:bg-zinc-900 peer-checked:border-zinc-900 peer-focus:ring-2 peer-focus:ring-zinc-400 transition-all" />
                            <Check className="w-3 h-3 text-white absolute opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none stroke-[3]" />
                        </div>
                        <span className="text-[11px] text-zinc-600 group-hover:text-zinc-900 transition-colors leading-snug">
                            I have read, understood, and agree to the TARo AI Assistant Disclaimer and Terms of Use.
                        </span>
                    </label>

                    <button
                        onClick={handleAccept}
                        disabled={!isChecked}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                        <span>Agree & Continue</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
