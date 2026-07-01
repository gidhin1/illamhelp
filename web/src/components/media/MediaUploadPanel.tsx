"use client";

import type { CSSProperties } from "react";
import { ChangeEvent, RefObject, useMemo } from "react";

import { formatDate, MediaAssetRecord, PublicMediaAssetRecord } from "@/lib/api";
import { Banner, Button } from "@/components/ui/primitives";

type OwnerMedia = MediaAssetRecord | PublicMediaAssetRecord;

const REVIEW_STATES = new Set(["uploaded", "scanning", "ai_reviewed", "human_review_pending"]);

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

function stateLabel(state: string): string {
  return state.replaceAll("_", " ");
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
  cameraLabel = "Take photo or video",
  uploadLabel,
  selectedFiles,
  inputRef,
  cameraInputRef,
  pendingItems,
  error,
  success,
  uploading,
  testId,
  onFileChange,
  onCameraFileChange,
  onClearFile,
  onRemoveFile,
  onUpload
}: {
  title: string;
  description: string;
  pickerLabel: string;
  cameraLabel?: string;
  uploadLabel: string;
  selectedFiles: File[];
  inputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef?: RefObject<HTMLInputElement | null>;
  pendingItems: OwnerMedia[];
  error: string | null;
  success: string | null;
  uploading: boolean;
  testId: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCameraFileChange?: (event: ChangeEvent<HTMLInputElement>) => void;
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
  return (
    <div className="media-upload-panel" data-testid={testId}>
      <div className="media-upload-header">
        <div>
          <h3>{title}</h3>
          <p className="muted-text">{description}</p>
        </div>
        <div className="media-picker-actions">
          <label className="button secondary media-picker-button">
            <span>{cameraLabel}</span>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              aria-label={cameraLabel}
              onChange={onCameraFileChange ?? onFileChange}
            />
          </label>
          <label className="button media-picker-button">
            <span>{pickerLabel}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              aria-label={pickerLabel}
              multiple
              onChange={onFileChange}
            />
          </label>
        </div>
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
                {selectedFiles.filter((file) => file.type.startsWith("video/")).length} videos · automatic ordering
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
                  <button
                    type="button"
                    className="media-remove-button"
                    disabled={uploading}
                    onClick={() => onRemoveFile(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="media-upload-empty">
          <p className="muted-text">Take media now or choose several photos and videos from your gallery.</p>
        </div>
      )}

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
                <span className="status-chip pending">{stateLabel(asset.state)}</span>
                <span className="muted-text">{formatDate(asset.createdAt).split(",")[0]}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
