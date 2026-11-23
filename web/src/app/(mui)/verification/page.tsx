"use client";

import { formatUiError, readyVerificationDocuments, verificationDocumentLabel, verificationDocumentTypes, verificationPrivacy, verificationStatus } from "@illamhelp/shared-types";

import { useCallback, useEffect, useRef, useState } from "react";

import { FilePicker } from "@/components/media/FilePicker";
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

export default function VerificationPage(): JSX.Element {
    const { accessToken } = useSession();
    const [verification, setVerification] = useState<VerificationRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [documentType, setDocumentType] = useState("government_id");
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentMedia, setDocumentMedia] = useState<MediaAssetRecord[]>([]);
    const [notes, setNotes] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);
    const [reuseDocuments, setReuseDocuments] = useState(false);
    const rejectedRequest = verification?.status === "rejected" ? verification : null;
    const previousDocuments = rejectedRequest
      ? readyVerificationDocuments(documentMedia).filter((item) => rejectedRequest.documentMediaIds.includes(item.id))
      : [];
    const readyDocuments = [
      ...readyVerificationDocuments(documentMedia, rejectedRequest?.createdAt),
      ...(reuseDocuments ? previousDocuments : [])
    ];
    const canSubmitNew = !verification || verification.status === "rejected";

    const loadVerification = useCallback(async (): Promise<void> => {
        if (!accessToken) return;
        setLoading(true);
        setLoadError(null);
        try {
            const [result, documents] = await Promise.all([
                getMyVerification(accessToken),
                listVerificationDocumentsPage(accessToken)
            ]);
            setVerification(result);
            setDocumentMedia(documents.items);
        } catch (err) {
            setLoadError(formatUiError(err, "Couldn’t load your verification details. Refresh and try again."));
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
        if (!accessToken || loading || loadError || uploading || submitting || !canSubmitNew || documentFile) return;
        if (readyDocuments.length === 0) {
            setError("Upload at least one private document, then submit your request.");
            return;
        }

        setSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await submitVerification(
                {
                    documentType,
                    documentMediaIds: readyDocuments.map((media) => media.id),
                    notes: notes.trim() || undefined
                },
                accessToken
            );
            setVerification(result);
            setReuseDocuments(false);
            setSuccess("Request sent. Check this page for the review result.");
        } catch (err) {
            setError(formatUiError(err, "Couldn’t submit your request. Check the document type and try again."));
        } finally {
            setSubmitting(false);
        }
    };

    const onUploadDocument = async (): Promise<void> => {
        if (!accessToken || !documentFile || uploading || submitting || loading || loadError) return;
        const contentType = documentFile.type.trim().toLowerCase();
        if ((!contentType.startsWith("image/") && !contentType.startsWith("video/")) || !documentFile.size) {
            setError("Choose a readable photo or video of your document.");
            return;
        }
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
            clearFile();
            setSuccess("Document uploaded. Submit your request when you’re ready.");
        } catch (err) {
            setError(formatUiError(err, "Couldn’t upload the document. Choose the file and try again."));
        } finally {
            setUploading(false);
        }
    };

    function clearFile(): void {
        setDocumentFile(null);
        if (fileInput.current) fileInput.current.value = "";
    }

    const status = verification ? verificationStatus(verification.status) : null;

    return (
        <PageShell>
            <section className="section">
                <div className="container stack">
                    <SectionHeader title="Verify your profile" subtitle="An approved request adds a verified badge to your profile." />
                    <RequireSession>
                        <div className="stack verification-flow">
                            {loadError ? <Banner tone="error">{loadError}</Banner> : null}
                            {success && !canSubmitNew ? <Banner tone="success">{success}</Banner> : null}
                            {loading && !verification ? <Skeleton lines={3} /> : null}
                            {verification && status ? (
                                <Card variant="review" className="stack">
                                    <h2 className="verification-status-heading">
                                        Current status <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
                                    </h2>
                                    <p>{status.detail}</p>
                                    <dl className="grid two verification-request-details">
                                        <div><dt>Document type</dt><dd>{verificationDocumentLabel(verification.documentType)}</dd></div>
                                        <div><dt>Submitted</dt><dd>{formatDate(verification.createdAt)}</dd></div>
                                    </dl>
                                    {verification.reviewerNotes ? (
                                        <div className="verification-feedback">
                                            <h3>Review feedback</h3>
                                            <p>{verification.reviewerNotes}</p>
                                        </div>
                                    ) : null}
                                </Card>
                            ) : null}
                            {!loading && !loadError && canSubmitNew ? (
                                <Card variant="action" className="stack">
                                    <h2>{verification ? "Submit a new request" : "Submit a verification request"}</h2>
                                    <form className="stack" onSubmit={(event) => void onSubmit(event)}>
                                        <fieldset className="verification-document-types" disabled={uploading || submitting}>
                                            <legend>1. Choose a document type</legend>
                                            {verificationDocumentTypes.map(([value, label]) => (
                                                <label key={value}>
                                                    <input name="verification-document-type" type="radio" value={value} checked={documentType === value} onChange={() => setDocumentType(value)} />
                                                    <span>{label}</span>
                                                </label>
                                            ))}
                                        </fieldset>
                                        <div className="stack verification-step">
                                            <h3>2. Upload your document</h3>
                                            <p className="muted-text" id="verification-file-hint">{verificationPrivacy} Choose a photo or video of the document.</p>
                                            {error ? <Banner tone="error">{error}</Banner> : null}
                                            {success ? <Banner tone="success">{success}</Banner> : null}
                                            <div className="job-action-row">
                                                <FilePicker label="Choose private verification document" inputRef={fileInput} accept="image/*,video/*" secondary disabled={uploading || submitting} aria-describedby="verification-file-hint" onChange={(event) => {
                                                    setError(null);
                                                    setSuccess(null);
                                                    setDocumentFile(event.target.files?.[0] ?? null);
                                                }} />
                                            </div>
                                            {documentFile ? (
                                                <div className="stack verification-feedback">
                                                    <p role="status">{documentFile.name}</p>
                                                    <div className="job-action-row">
                                                        <Button type="button" disabled={uploading || submitting} onClick={() => void onUploadDocument()}>{uploading ? "Uploading…" : "Upload private document"}</Button>
                                                        <Button type="button" variant="ghost" disabled={uploading || submitting} onClick={clearFile}>Remove file</Button>
                                                    </div>
                                                </div>
                                            ) : null}
                                            {previousDocuments.length ? (
                                                <label className="verification-reuse"><input type="checkbox" checked={reuseDocuments}
                                                    onChange={(event) => setReuseDocuments(event.target.checked)} disabled={uploading || submitting} /> Include documents from the last request</label>
                                            ) : null}
                                            {readyDocuments.length ? (
                                                <p className="muted-text" role="status">{readyDocuments.length} private {readyDocuments.length === 1 ? "document" : "documents"} ready to submit.</p>
                                            ) : null}
                                        </div>
                                        <div className="stack verification-step">
                                            <h3>3. Send for review</h3>
                                            <Field label="Notes for the reviewer (optional)">
                                                <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} />
                                            </Field>
                                            <p className="muted-text">{documentFile ? "Upload or remove the selected file before submitting." : readyDocuments.length ? "The reviewer will receive the documents and your notes." : "Upload a private document to enable submission."}</p>
                                            <div><Button type="submit" disabled={submitting || uploading || !!documentFile || readyDocuments.length === 0}>
                                                {submitting ? "Submitting…" : "Submit verification request"}
                                            </Button></div>
                                        </div>
                                    </form>
                                </Card>
                            ) : null}
                            <div><Button type="button" variant="ghost" disabled={loading || uploading || submitting} onClick={() => void loadVerification()}>
                                {loading ? "Refreshing…" : "Refresh verification"}
                            </Button></div>
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
