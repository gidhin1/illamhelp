"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
    Banner,
    Button,
    Card,
    Field,
    SectionHeader,
    TextInput
} from "@/components/ui/primitives";
import {
    formatDate,
    getMyVerification,
    submitVerification,
    VerificationRecord
} from "@/lib/api";

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: "⏳ Pending review", color: "var(--warning)", bg: "color-mix(in srgb, var(--warning) 15%, transparent)" },
    under_review: { label: "🔍 Under review", color: "var(--info)", bg: "color-mix(in srgb, var(--info) 15%, transparent)" },
    approved: { label: "✅ Approved", color: "var(--success)", bg: "color-mix(in srgb, var(--success) 15%, transparent)" },
    rejected: { label: "❌ Rejected", color: "var(--danger)", bg: "color-mix(in srgb, var(--danger) 15%, transparent)" }
};

export default function VerificationPage(): JSX.Element {
    const { accessToken } = useSession();
    const [verification, setVerification] = useState<VerificationRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [documentType, setDocumentType] = useState("government_id");
    const [mediaIds, setMediaIds] = useState("");
    const [notes, setNotes] = useState("");

    const loadVerification = useCallback(async (): Promise<void> => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const result = await getMyVerification(accessToken);
            setVerification(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load verification status");
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    useEffect(() => {
        void loadVerification();
    }, [loadVerification]);

    const onSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        if (!accessToken) return;

        const ids = mediaIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0);

        if (ids.length === 0) {
            setError("Please enter at least one document media ID.");
            return;
        }

        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await submitVerification(
                {
                    documentType,
                    documentMediaIds: ids,
                    notes: notes.trim() || undefined
                },
                accessToken
            );
            setVerification(result);
            setSuccess("Verification request submitted! We'll review your documents shortly.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit verification request");
        } finally {
            setSubmitting(false);
        }
    };

    const statusInfo = verification ? STATUS_STYLES[verification.status] : null;
    const canSubmitNew = !verification || verification.status === "rejected";

    return (
        <PageShell>
            <section className="section">
                <div className="container stack">
                    <SectionHeader
                        eyebrow="Trust & Safety"
                        title="Get Verified"
                        subtitle="Earn the verified badge to stand out and build trust on IllamHelp."
                    />
                    <RequireSession>
                        <div className="stack" style={{ maxWidth: 800 }}>
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {success ? <Banner tone="success">{success}</Banner> : null}

                            {loading ? (
                                <p className="muted-text">Loading status...</p>
                            ) : verification ? (
                                <Card className="stack" style={{ borderLeft: `4px solid ${statusInfo?.color ?? "var(--line)"}` }}>
                                    <h3 style={{ fontFamily: "var(--font-display)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        Current Status
                                        <span className="pill" style={{ background: statusInfo?.bg, color: statusInfo?.color, borderColor: "transparent" }}>
                                            {statusInfo?.label ?? verification.status}
                                        </span>
                                    </h3>
                                    <div className="grid two" style={{ gap: "var(--spacing-lg)" }}>
                                        <div>
                                            <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Document Type</div>
                                            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{verification.documentType.replaceAll("_", " ")}</div>
                                        </div>
                                        <div>
                                            <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>Submitted On</div>
                                            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{formatDate(verification.createdAt)}</div>
                                        </div>
                                    </div>
                                    
                                    {verification.reviewerNotes && (
                                        <div style={{ padding: "var(--spacing-md)", background: "var(--surface-2)", borderRadius: "var(--radius-md)", marginTop: "var(--spacing-sm)" }}>
                                            <div className="muted-text" style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Admin Feedback</div>
                                            <div>{verification.reviewerNotes}</div>
                                        </div>
                                    )}
                                </Card>
                            ) : null}

                            {canSubmitNew ? (
                                <Card className="stack" style={{ marginTop: "var(--spacing-xl)" }}>
                                    <div style={{ marginBottom: "var(--spacing-md)" }}>
                                        <h3 style={{ fontFamily: "var(--font-display)" }}>
                                            {verification?.status === "rejected" ? "Submit a new request" : "Start your verification"}
                                        </h3>
                                        <p className="muted-text">
                                            Upload your ID documents via your Profile page first, then paste the resulting Media IDs below to link them to this request.
                                        </p>
                                    </div>

                                    <form className="stack" onSubmit={(e) => void onSubmit(e)}>
                                        <Field label="Identity Document Type">
                                            <select
                                                value={documentType}
                                                onChange={(e) => setDocumentType(e.target.value)}
                                                style={{
                                                    width: "100%",
                                                    padding: "12px 16px",
                                                    borderRadius: "var(--radius-md)",
                                                    border: "1px solid var(--line)",
                                                    background: "var(--surface)",
                                                    fontSize: "1rem",
                                                    color: "var(--ink)",
                                                    fontFamily: "var(--font-body)",
                                                }}
                                            >
                                                <option value="government_id">Government ID (Aadhaar, PAN, Passport)</option>
                                                <option value="professional_certification">Professional Certification</option>
                                                <option value="business_license">Business License</option>
                                                <option value="utility_bill">Utility Bill (Address proof)</option>
                                            </select>
                                        </Field>
                                        <Field
                                            label="Document Media IDs"
                                            hint="Paste the media IDs of your uploaded documents from the Profile tab, separated by commas."
                                        >
                                            <TextInput
                                                value={mediaIds}
                                                onChange={(e) => setMediaIds(e.target.value)}
                                                placeholder="e.g. 550e8400-e29b-41d4..."
                                                required
                                            />
                                        </Field>
                                        <Field label="Notes for Reviewer (optional)" hint="Provide any context that will help us verify you faster.">
                                            <TextInput
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="e.g. Included both front and back images"
                                            />
                                        </Field>
                                        <div style={{ marginTop: "var(--spacing-md)" }}>
                                            <Button type="submit" disabled={submitting}>
                                                {submitting ? "Submitting..." : "Submit Verification"}
                                            </Button>
                                        </div>
                                    </form>
                                </Card>
                            ) : null}
                        </div>
                    </RequireSession>
                </div>
            </section>
        </PageShell>
    );
}
