import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            userQuery = "",
            responseText = "",
            selectedAgentId = "general",
            selectedAgentLabel = "General UTAR Assistant",
            storeDisplayName = "",
            sourceMode = "none",
            citations = [],
            rating = "like",
            comment = "",
            screenshotBase64 = "",
        } = body;

        const timestamp = new Date().toISOString();

        const feedbackRecord = {
            id: `fb_${Date.now()}`,
            timestamp,
            userQuery,
            responseText,
            selectedAgentId,
            selectedAgentLabel,
            storeDisplayName,
            sourceMode,
            citations,
            rating,
            comment,
            screenshotBase64,
        };

        // 1. Forward to Google Sheets Webhook (Primary Persistent Database)
        const webhookUrl =
            process.env.GOOGLE_SHEETS_WEBHOOK_URL ||
            "https://script.google.com/macros/s/AKfycbwdhB0g2hJ5nz8YamUr9VGZLGPbVRueEM8ak8EQOrlqavmWU5s21A_xuzhEf5jpM_4u/exec";
        let googleSheetsStatus = "skipped";
        let googleDriveImageUrl = "";

        if (webhookUrl) {
            try {
                const sheetRes = await fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(feedbackRecord),
                });
                if (sheetRes.ok) {
                    const sheetData = await sheetRes.json().catch(() => ({}));
                    googleSheetsStatus = "success";
                    googleDriveImageUrl = sheetData.imageUrl || "";
                } else {
                    googleSheetsStatus = `HTTP_${sheetRes.status}`;
                }
            } catch (err: any) {
                console.error("Failed to forward feedback to Google Sheets:", err);
                googleSheetsStatus = `Error: ${err?.message || err}`;
            }
        }

        // 2. Safe local file append (safeguard for local dev environment)
        try {
            const dataDir = path.join(process.cwd(), "data");
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            const filePath = path.join(dataDir, "feedback.json");
            let existing: any[] = [];
            if (fs.existsSync(filePath)) {
                try {
                    const raw = fs.readFileSync(filePath, "utf-8");
                    existing = JSON.parse(raw);
                } catch {
                    existing = [];
                }
            }
            existing.unshift({
                ...feedbackRecord,
                // Omit screenshotBase64 in local json to keep file lightweight
                screenshotBase64: Boolean(screenshotBase64),
                googleDriveImageUrl,
            });
            fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
        } catch {
            // Silently ignore disk write failures on Vercel read-only filesystem
        }

        return NextResponse.json({
            success: true,
            timestamp,
            googleSheetsStatus,
            googleDriveImageUrl,
        });
    } catch (error: any) {
        console.error("Feedback submission error:", error);
        return NextResponse.json(
            { error: error?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
