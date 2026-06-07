"use client";

import { formatDate, PublicMediaAssetRecord } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaPurposeLabel(purpose: string): string {
  return purpose.replace(/_/g, " ");
}

export function MediaPreviewGrid({
  items,
  emptyText = "No approved media yet.",
  testId
}: {
  items: PublicMediaAssetRecord[];
  emptyText?: string;
  testId?: string;
}): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="media-empty" data-testid={testId ? `${testId}-empty` : undefined}>
        <p className="muted-text">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="media-grid" data-testid={testId}>
      {items.map((asset) => (
        <article key={asset.id} className="media-tile" data-testid={testId ? `${testId}-item` : undefined}>
          <div className="media-frame">
            {asset.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.downloadUrl}
                alt={`Approved ${mediaPurposeLabel(asset.purpose)} photo`}
                loading="lazy"
                decoding="async"
                width={640}
                height={480}
              />
            ) : (
              <video controls preload="metadata" aria-label={`Approved ${mediaPurposeLabel(asset.purpose)} video`}>
                <source src={asset.downloadUrl} type={asset.contentType} />
              </video>
            )}
          </div>
          <div className="media-meta">
            <strong>{asset.kind === "image" ? "Photo" : "Video"}</strong>
            <span>{formatBytes(asset.fileSizeBytes)}</span>
            <span>{formatDate(asset.createdAt).split(",")[0]}</span>
          </div>
          <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
            Open original file
          </a>
        </article>
      ))}
    </div>
  );
}
