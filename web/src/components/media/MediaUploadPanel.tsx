"use client";

import { ChangeEvent, RefObject } from "react";

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
  uploadLabel,
  selectedFile,
  inputRef,
  pendingItems,
  error,
  success,
  uploading,
  testId,
  onFileChange,
  onClearFile,
  onUpload
}: {
  title: string;
  description: string;
  pickerLabel: string;
  uploadLabel: string;
  selectedFile: File | null;
  inputRef: RefObject<HTMLInputElement | null>;
  pendingItems: OwnerMedia[];
  error: string | null;
  success: string | null;
  uploading: boolean;
  testId: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onUpload: () => void;
}): JSX.Element {
  return (
    <div className="media-upload-panel" data-testid={testId}>
      <div className="media-upload-header">
        <div>
          <h3>{title}</h3>
          <p className="muted-text">{description}</p>
        </div>
        <label className="button media-picker-button">
          <span>{pickerLabel}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            aria-label={pickerLabel}
            onChange={onFileChange}
          />
        </label>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {success ? <Banner tone="success">{success}</Banner> : null}

      {selectedFile ? (
        <div className="media-selected-row" data-testid={`${testId}-selected`}>
          <div className="media-file-icon" aria-hidden="true">
            {fileKindLabel(selectedFile).slice(0, 1)}
          </div>
          <div className="media-selected-copy">
            <strong>{selectedFile.name}</strong>
            <span className="muted-text">
              {fileKindLabel(selectedFile)} · {formatBytes(selectedFile.size)}
            </span>
          </div>
          <div className="media-selected-actions">
            <Button type="button" variant="ghost" disabled={uploading} onClick={onClearFile}>
              Remove file
            </Button>
            <Button type="button" disabled={uploading} onClick={onUpload}>
              {uploading ? "Uploading..." : uploadLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="media-upload-empty">
          <p className="muted-text">Choose an image or video, then upload it for review.</p>
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
