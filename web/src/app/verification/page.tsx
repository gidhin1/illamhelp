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
    Skeleton,
    StatusLabel,
    TextInput
} from "@/components/ui/primitives";
import {
    completeMediaUpload,
    createMediaUploadTicket,
    formatDate,
    getMyVerification,
    listVerificationDocumentsPage,
    MediaAssetRecord,
    submitVerification,
    VerificationRecord
} from "@/lib/api";
import { trackEvent } from "@/lib/analytics";

const STATUS_STYLES: Record<string, { label: string; tone: "info" | "success" | "warning" | "error" }> = {
    pending: { label: "Pending review", tone: "warning" },
    under_review: { label: "Under review", tone: "info" },
    approved: { label: "Approved", tone: "success" },
    rejected: { label: "Needs changes", tone: "error" }
};

export default function VerificationPage(): JSX.Element {
    const { accessToken } = useSession();
    const [verification, setVerification] = useState<VerificationRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [documentType, setDocumentType] = useState("government_id");
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentMedia, setDocumentMedia] = useState<MediaAssetRecord[]>([]);
    const [notes, setNotes] = useState("");

    const loadVerification = useCallback(async (): Promise<void> => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const [result, documents] = await Promise.all([
                getMyVerification(accessToken),
                listVerificationDocumentsPage(accessToken)
            ]);
            setVerification(result);
            setDocumentMedia(documents.items);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load verification status");
        } finally {
            setLoading(false);
        }
    }, [accessToken]);

    useEffect(() => {
        trackEvent("verification_started", {
            surface: "web",
            document_type: documentType
        });
        // Track once when the user lands in the verification flow; document changes are not separate starts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void loadVerification();
    }, [loadVerification]);

    const onSubmit = async (event: React.FormEvent): Promise<void> => {
        event.preventDefault();
        if (!accessToken) return;

        const ids = documentMedia
            .filter((media) => media.purpose === "verification_document" && media.state !== "uploaded" && media.state !== "rejected")
            .map((media) => media.id);

        if (ids.length === 0) {
            setError("Upload at least one verification document before submitting.");
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
            setSuccess("Verification request submitted. We'll review your documents shortly.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit verification request");
        } finally {
            setSubmitting(false);
        }
    };

    const onUploadDocument = async (): Promise<void> => {
        if (!accessToken || !documentFile) return;
        const contentType = documentFile.type.trim().toLowerCase() || "application/octet-stream";
        const kind = contentType.startsWith("video/") ? "video" : "image";
        setUploading(true);
        setError(null);
        setSuccess(null);
        try {
            const checksumSha256 = await sha256Hex(documentFile);
            const ticket = await createMediaUploadTicket({
                kind,
                purpose: "verification_document",
                contentType,
                fileSizeBytes: documentFile.size,
                checksumSha256,
                originalFileName: documentFile.name
            }, accessToken);
            const uploadResponse = await fetch(ticket.uploadUrl, {
                method: "PUT",
                headers: ticket.requiredHeaders,
                body: documentFile
            });
            if (!uploadResponse.ok) {
                throw new Error(`Upload failed with status ${uploadResponse.status}`);
            }
            const etag = uploadResponse.headers.get("etag")?.replaceAll('"', "");
            const completed = await completeMediaUpload(ticket.mediaId, { etag: etag || undefined }, accessToken);
            setDocumentMedia((previous) => [completed, ...previous.filter((item) => item.id !== completed.id)]);
            setDocumentFile(null);
            setSuccess("Document uploaded privately for verification.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to upload document");
        } finally {
            setUploading(false);
        }
    };

    const statusInfo = verification ? STATUS_STYLES[verification.status] : null;
    const canSubmitNew = !verification || verification.status === "rejected";

    return (
        <PageShell>
            <section className="section">
                <div className="container stack">
                    <SectionHeader
                        title="Verify profile"
                        subtitle="Earn the verified badge to stand out and build trust on IllamHelp."
                    />
                    <RequireSession>
                        <div className="stack" style={{ maxWidth: 800 }}>
                            {error ? <Banner tone="error">{error}</Banner> : null}
                            {success ? <Banner tone="success">{success}</Banner> : null}

                            {loading ? (
                                <Skeleton lines={3} />
                            ) : verification ? (
                                <Card className="stack">
                                    <h3 style={{ fontFamily: "var(--font-display)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        Current status
                                        <StatusLabel tone={statusInfo?.tone ?? "info"}>
                                            {statusInfo?.label ?? verification.status}
                                        </StatusLabel>
                                    </h3>
                                    <div className="grid two" style={{ gap: "var(--spacing-lg)" }}>
                                        <div>
                                            <div className="muted-text" style={{ fontSize: "0.85rem" }}>Document type</div>
                                            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{verification.documentType.replaceAll("_", " ")}</div>
                                        </div>
                                        <div>
                                            <div className="muted-text" style={{ fontSize: "0.85rem" }}>Submitted on</div>
                                            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{formatDate(verification.createdAt)}</div>
                                        </div>
                                    </div>
                                    
                                    {verification.reviewerNotes && (
                                        <div style={{ padding: "var(--spacing-md)", background: "var(--surface-2)", borderRadius: "var(--radius-md)", marginTop: "var(--spacing-sm)" }}>
                                            <div className="muted-text" style={{ fontSize: "0.85rem", marginBottom: "4px" }}>Review feedback</div>
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
                                            Upload ID documents here. These files are private and only visible to you and verification reviewers.
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
                                        <Field label="Private document upload" hint="Images and videos are supported for ID, certificates, licenses, and address proof.">
                                            <input
                                                type="file"
                                                accept="image/*,video/*"
                                                aria-label="Choose private verification document"
                                                onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                                            />
                                        </Field>
                                        <Button type="button" variant="secondary" disabled={!documentFile || uploading} onClick={() => void onUploadDocument()}>
                                            {uploading ? "Uploading..." : "Upload Document"}
                                        </Button>
                                        {documentMedia.length > 0 ? (
                                            <div className="stack" style={{ gap: "var(--spacing-xs)" }}>
                                                {documentMedia.map((media) => (
                                                    <div key={media.id} className="muted-text" style={{ fontSize: "0.9rem" }}>
                                                        {media.kind} · {media.state} · {media.id}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                        <Field label="Notes for Reviewer (optional)" hint="Provide any context that will help us verify you faster.">
                                            <TextInput
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                placeholder="e.g. Included both front and back images"
                                            />
                                        </Field>
                                        <div style={{ marginTop: "var(--spacing-md)" }}>
                                            <Button type="submit" disabled={submitting}>
                                                {submitting ? "Submitting..." : "Submit verification"}
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

async function sha256Hex(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
