"use client";

import { mediaAppealError, mediaAppealReceipt, pendingMediaReviewLabel } from "@illamhelp/shared-types";
import { ActionControl } from "@illamhelp/ui-web";
import { FilePicker } from "./FilePicker";

import type { CSSProperties } from "react";
import { ChangeEvent, RefObject, useMemo, useState } from "react";

import { formatDate, MediaAssetRecord, PublicMediaAssetRecord } from "@/lib/api";
import { Banner, Button } from "@/components/ui/primitives";

type OwnerMedia = MediaAssetRecord | PublicMediaAssetRecord;

const REVIEW_STATES = new Set(["uploaded", "scanning", "ai_reviewed", "human_review_pending", "appeal_pending"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKindLabel(file: File): string {
  if (file.type.startsWith("image/")) return "Photo";
  if (file.type.startsWith("video/")) return "Video";
  return "File";
}

function mediaKindLabel(asset: OwnerMedia): string {
  return asset.kind === "image" ? "Photo" : "Video";
}

function fileName(asset: OwnerMedia): string {
  if ("objectKey" in asset) {
    return asset.objectKey.split("/").at(-1) ?? asset.id;
  }
  return asset.id;
}

export function pendingReviewMedia<TMedia extends OwnerMedia>(items: TMedia[]): TMedia[] {
  return items.filter((item) => REVIEW_STATES.has(item.state));
}

export function approvedMedia<TMedia extends OwnerMedia>(items: TMedia[]): TMedia[] {
  return items.filter((item) => item.state === "approved");
}

export function MediaUploadPanel({
  title,
  description,
  pickerLabel,
  uploadLabel,
  selectedFiles,
  inputRef,
  pendingItems,
  rejectedItems = [],
  onRequestReview,
  error,
  success,
  uploading,
  testId,
  onFileChange,
  onClearFile,
  onRemoveFile,
  onUpload
}: {
  title: string;
  description: string;
  pickerLabel: string;
  uploadLabel: string;
  selectedFiles: File[];
  inputRef: RefObject<HTMLInputElement | null>;
  pendingItems: OwnerMedia[];
  rejectedItems?: OwnerMedia[];
  onRequestReview?: (mediaId: string) => Promise<void>;
  error: string | null;
  success: string | null;
  uploading: boolean;
  testId: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onRemoveFile?: (index: number) => void;
  onUpload: () => void;
}): JSX.Element {
  const hasSelection = selectedFiles.length > 0;
  const uploadCopy = useMemo(() => {
    if (uploading) return "Uploading...";
    if (selectedFiles.length <= 1) return uploadLabel;
    return `Upload ${selectedFiles.length} files`;
  }, [selectedFiles.length, uploadLabel, uploading]);
  function onCapture(event: ChangeEvent<HTMLInputElement>): void {
    onFileChange(event);
    event.currentTarget.value = "";
  }

  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewReceipt, setReviewReceipt] = useState(false);

  async function requestReview(mediaId: string) {
    if (!onRequestReview || reviewing) return;
    setReviewing(mediaId);
    setReviewError(null);
    setReviewReceipt(false);
    try {
      await onRequestReview(mediaId);
      setReviewReceipt(true);
    } catch {
      setReviewError(mediaAppealError);
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div className="media-upload-panel" data-testid={testId}>
      <div>
        <h3>{title}</h3>
        <p className="muted-text">{description}</p>
      </div>
      <div className="media-picker-actions">
        <FilePicker
          label={pickerLabel}
          inputRef={inputRef}
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          disabled={uploading}
          onChange={onFileChange}
        />
        <FilePicker label="Take a photo" accept="image/*" capture="environment" secondary camera disabled={uploading} onChange={onCapture} />
        <FilePicker label="Record a video" accept="video/*" capture="environment" secondary camera disabled={uploading} onChange={onCapture} />
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {success ? <Banner tone="success">{success}</Banner> : null}

      {hasSelection ? (
        <div className="media-selected-row media-selected-row-stack" data-testid={`${testId}-selected`}>
          <div className="media-selected-summary">
            <div>
              <strong>
                {selectedFiles.length} selected {selectedFiles.length === 1 ? "file" : "files"}
              </strong>
              <span className="muted-text">
                {selectedFiles.filter((file) => file.type.startsWith("image/")).length} photos ·{" "}
                {selectedFiles.filter((file) => file.type.startsWith("video/")).length} videos
              </span>
            </div>
            <div className="media-selected-actions">
              <Button type="button" variant="ghost" disabled={uploading} onClick={onClearFile}>
                Clear selection
              </Button>
              <Button type="button" disabled={uploading} onClick={onUpload}>
                {uploadCopy}
              </Button>
            </div>
          </div>
          <div className="media-selection-rail" aria-label="Selected media">
            {selectedFiles.map((file, index) => (
              <article
                key={`${file.name}-${file.size}-${index}`}
                className="media-selection-card"
                style={{ "--i": index } as CSSProperties & Record<"--i", number>}
              >
                <div className="media-selection-thumb">
                  <div className="media-file-icon" aria-hidden="true">
                    {fileKindLabel(file).slice(0, 1)}
                  </div>
                  <span className="media-kind-badge">{fileKindLabel(file)}</span>
                </div>
                <div className="media-selected-copy">
                  <strong>{file.name}</strong>
                  <span className="muted-text">{formatBytes(file.size)}</span>
                </div>
                {onRemoveFile ? (
                  <ActionControl
                    type="button"
                    className="media-remove-button"
                    disabled={uploading}
                    onClick={() => onRemoveFile(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </ActionControl>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="media-review-live">{reviewReceipt ? <p className="media-review-receipt">{mediaAppealReceipt}</p> : null}</div>
      {pendingItems.length > 0 ? (
        <div className="media-review-list" data-testid={`${testId}-pending`}>
          <div className="media-review-title">Pending review</div>
          {pendingItems.map((asset) => (
            <div key={asset.id} className="media-review-row">
              <div>
                <strong>{mediaKindLabel(asset)}</strong>
                <span className="muted-text">{fileName(asset)}</span>
              </div>
              <div className="media-review-meta">
                <span className="status-chip pending">{pendingMediaReviewLabel(asset.state)}</span>
                <span className="muted-text">{formatDate(asset.createdAt).split(",")[0]}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {reviewError ? <Banner tone="error">{reviewError}</Banner> : null}
      {rejectedItems.length > 0 ? (
        <div className="media-review-list" data-testid={`${testId}-rejected`}>
          <div className="media-review-title">Rejected uploads</div>
          {rejectedItems.map((asset) => (
            <div className="media-review-row media-review-row--rejected" key={asset.id}>
              <div>
                <strong>{mediaKindLabel(asset)} was not approved</strong>
                {"rejectionMessage" in asset && asset.rejectionMessage ? <span className="muted-text">{asset.rejectionMessage}</span> : null}
                <span className="muted-text">Added {formatDate(asset.createdAt)}</span>
              </div>
              {onRequestReview && "appealEligible" in asset && asset.appealEligible ? (
                <Button type="button" variant="secondary" className="media-appeal-action" disabled={reviewing !== null}
                  aria-busy={reviewing === asset.id}
                  onClick={() => void requestReview(asset.id)}>
                  {reviewing === asset.id ? "Requesting review…" : "Request review"}
                </Button>
              ) : null}
            </div>
          ))}
          <p className="muted-text">You can upload a replacement.</p>
        </div>
      ) : null}
    </div>
  );
}
