"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeAsset = activeIndex === null ? null : items[activeIndex] ?? null;

  useEffect(() => {
    if (!activeAsset) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowRight") setActiveIndex((previous) => (previous === null ? previous : Math.min(items.length - 1, previous + 1)));
      if (event.key === "ArrowLeft") setActiveIndex((previous) => (previous === null ? previous : Math.max(0, previous - 1)));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAsset, items.length]);

  if (items.length === 0) {
    return (
      <div className="media-empty" data-testid={testId ? `${testId}-empty` : undefined}>
        <p className="muted-text">{emptyText}</p>
      </div>
    );
  }

  return (
    <>
      <div className="media-grid media-carousel" data-testid={testId} aria-label="Approved media carousel">
        {items.map((asset, index) => (
          <article
            key={asset.id}
            className="media-tile"
            data-testid={testId ? `${testId}-item` : undefined}
            style={{ "--i": index } as CSSProperties & Record<"--i", number>}
          >
            <button
              type="button"
              className="media-card-button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Open approved ${mediaPurposeLabel(asset.purpose)} ${asset.kind}`}
            >
              <span className="media-frame">
                {asset.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.downloadUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={800}
                  />
                ) : (
                  <video muted playsInline preload="metadata" aria-hidden="true">
                    <source src={asset.downloadUrl} type={asset.contentType} />
                  </video>
                )}
                <span className="media-kind-badge">{asset.kind === "image" ? "Photo" : "Video"}</span>
                {asset.kind === "video" ? <span className="media-play-badge" aria-hidden="true">Play</span> : null}
              </span>
              <span className="media-meta">
                <strong>{asset.kind === "image" ? "Photo" : "Video"}</strong>
                <span>{formatBytes(asset.fileSizeBytes)} · {formatDate(asset.createdAt).split(",")[0]}</span>
              </span>
            </button>
          </article>
        ))}
      </div>
      {activeAsset ? (
        <div className="media-viewer-backdrop" role="presentation" onMouseDown={() => setActiveIndex(null)}>
          <section
            className="media-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={`${activeAsset.kind === "image" ? "Photo" : "Video"} viewer`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="media-viewer-toolbar">
              <div>
                <strong>{activeAsset.kind === "image" ? "Photo" : "Video"}</strong>
                <span>{formatBytes(activeAsset.fileSizeBytes)} · {formatDate(activeAsset.createdAt).split(",")[0]}</span>
              </div>
              <button type="button" className="media-viewer-close" onClick={() => setActiveIndex(null)}>
                Close
              </button>
            </div>
            <div className="media-viewer-frame">
              {activeAsset.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeAsset.downloadUrl} alt={`Approved ${mediaPurposeLabel(activeAsset.purpose)} photo`} />
              ) : (
                <video controls autoPlay preload="metadata" aria-label={`Approved ${mediaPurposeLabel(activeAsset.purpose)} video`}>
                  <source src={activeAsset.downloadUrl} type={activeAsset.contentType} />
                </video>
              )}
            </div>
            {items.length > 1 ? (
              <div className="media-viewer-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((previous) => (previous === null ? previous : Math.max(0, previous - 1)))}
                >
                  Previous media
                </button>
                <span>{(activeIndex ?? 0) + 1} of {items.length}</span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={activeIndex === items.length - 1}
                  onClick={() => setActiveIndex((previous) => (previous === null ? previous : Math.min(items.length - 1, previous + 1)))}
                >
                  Next media
                </button>
              </div>
            ) : null}
            <a href={activeAsset.downloadUrl} target="_blank" rel="noreferrer" className="media-viewer-link">
              Open original file
            </a>
          </section>
        </div>
      ) : null}
    </>
  );
}
