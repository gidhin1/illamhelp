"use client";

import { useCallback, useEffect, useState } from "react";

import { PageShell } from "@/components/PageShell";
import { RequireSession } from "@/components/session/RequireSession";
import { useSession } from "@/components/session/SessionProvider";
import {
    Banner,
    Button,
    Card,
    EmptyState,
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

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
    pending: { label: "⏳ Pending review", color: "var(--warning, #f59e0b)" },
    under_review: { label: "🔍 Under review", color: "var(--info, #3b82f6)" },
    approved: { label: "✅ Approved", color: "var(--success, #10b981)" },
    rejected: { label: "❌ Rejected", color: "var(--danger, #ef4444)" }
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
                        eyebrow="Verification"
                        title="Get verified"
                        subtitle="Submit your identity documents to earn the verified badge on your profile."
                    />
                    <RequireSession>
                        <div className="stack">
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {success ? <Banner tone="success">{success}</Banner> : null}

                            {loading ? (
                                <p className="muted-text">Loading verification status...</p>
                            ) : verification ? (
                                <Card className="stack">
                                    <h3 style={{ fontFamily: "var(--font-display)" }}>Current verification</h3>
                                    <div className="data-row">
                                        <div className="data-title">Status</div>
                                        <div>
                                            <span
                                                className="pill"
                                                style={{
                                                    padding: "6px 12px",
                                                    borderColor: statusInfo?.color
                                                }}
                                            >
                                                {statusInfo?.label ?? verification.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="data-row">
                                        <div className="data-title">Document type</div>
                                        <div className="data-meta">{verification.documentType.replaceAll("_", " ")}</div>
                                    </div>
                                    <div className="data-row">
                                        <div className="data-title">Documents</div>
                                        <div className="data-meta">{verification.documentMediaIds.length} file(s)</div>
                                    </div>
                                    {verification.notes ? (
                                        <div className="data-row">
                                            <div className="data-title">Your notes</div>
                                            <div className="data-meta">{verification.notes}</div>
                                        </div>
                                    ) : null}
                                    <div className="data-row">
                                        <div className="data-title">Submitted</div>
                                        <div className="data-meta">{formatDate(verification.createdAt)}</div>
                                    </div>
                                    {verification.reviewerNotes ? (
                                        <div className="data-row">
                                            <div className="data-title">Reviewer feedback</div>
                                            <div className="data-meta">{verification.reviewerNotes}</div>
                                        </div>
                                    ) : null}
                                    {verification.reviewedAt ? (
                                        <div className="data-row">
                                            <div className="data-title">Reviewed</div>
                                            <div className="data-meta">{formatDate(verification.reviewedAt)}</div>
                                        </div>
                                    ) : null}
                                </Card>
                            ) : null}

                            {canSubmitNew ? (
                                <Card className="stack">
                                    <h3 style={{ fontFamily: "var(--font-display)" }}>
                                        {verification?.status === "rejected"
                                            ? "Submit a new request"
                                            : "Submit for verification"}
                                    </h3>
                                    <p className="muted-text">
                                        Upload your documents via the Media section on your Profile page first,
                                        then paste the media IDs here.
                                    </p>
                                    <form className="stack" onSubmit={(e) => void onSubmit(e)}>
                                        <Field label="Document type">
                                            <select
                                                value={documentType}
                                                onChange={(e) => setDocumentType(e.target.value)}
                                                style={{
                                                    width: "100%",
                                                    padding: "10px 14px",
                                                    borderRadius: "var(--radius-md)",
                                                    border: "1px solid var(--border)",
                                                    background: "var(--surface)",
                                                    fontSize: "0.95rem"
                                                }}
                                            >
                                                <option value="government_id">Government ID (Aadhaar, PAN, Passport)</option>
                                                <option value="professional_certification">Professional Certification</option>
                                                <option value="business_license">Business License</option>
                                                <option value="utility_bill">Utility Bill (Address proof)</option>
                                            </select>
                                        </Field>
                                        <Field
                                            label="Document media IDs"
                                            hint="Paste the media IDs from your uploaded documents, separated by commas."
                                        >
                                            <TextInput
                                                value={mediaIds}
                                                onChange={(e) => setMediaIds(e.target.value)}
                                                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                                                required
                                            />
                                        </Field>
                                        <Field label="Notes (optional)" hint="Any additional context for the reviewer.">
                                            <TextInput
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="e.g. Front and back of my Aadhaar card"
                                            />
                                        </Field>
                                        <div>
                                            <Button type="submit" disabled={submitting}>
                                                {submitting ? "Submitting..." : "Submit verification request"}
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
