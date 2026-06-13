"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const activeAsset = activeIndex === null ? null : items[activeIndex] ?? null;
  const viewerOpen = activeAsset !== null;

  const scrollToIndex = (nextIndex: number): void => {
    const boundedIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
    const rail = railRef.current;
    const slide = rail?.children.item(boundedIndex) as HTMLElement | null;
    setCurrentIndex(boundedIndex);
    slide?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  const onRailScroll = (): void => {
    const rail = railRef.current;
    if (!rail) return;
    const slideWidth = rail.clientWidth || 1;
    setCurrentIndex(Math.max(0, Math.min(items.length - 1, Math.round(rail.scrollLeft / slideWidth))));
  };

  const showActiveIndex = (nextIndex: number): void => {
    const boundedIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
    setCurrentIndex(boundedIndex);
    setActiveIndex(boundedIndex);
  };

  const focusableViewerElements = (): HTMLElement[] => {
    const viewer = viewerRef.current;
    if (!viewer) return [];
    return Array.from(
      viewer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), video[controls], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
  };

  useEffect(() => {
    if (!viewerOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [viewerOpen]);

  useEffect(() => {
    if (!activeAsset) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowRight") setActiveIndex((previous) => {
        if (previous === null) return previous;
        const nextIndex = Math.min(items.length - 1, previous + 1);
        setCurrentIndex(nextIndex);
        return nextIndex;
      });
      if (event.key === "ArrowLeft") setActiveIndex((previous) => {
        if (previous === null) return previous;
        const nextIndex = Math.max(0, previous - 1);
        setCurrentIndex(nextIndex);
        return nextIndex;
      });
      if (event.key === "Tab") {
        const focusable = focusableViewerElements();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
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
      <div className="media-story-card" data-testid={testId} aria-label="Approved media carousel">
        <div
          ref={railRef}
          className="media-story-rail"
          onScroll={onRailScroll}
          tabIndex={0}
          aria-label={`${items.length} approved media item${items.length === 1 ? "" : "s"}`}
        >
          {items.map((asset, index) => (
            <article
              key={asset.id}
              className="media-story-slide media-tile"
              data-testid={testId ? `${testId}-item` : undefined}
              style={{ "--i": index } as CSSProperties & Record<"--i", number>}
              aria-label={`${index + 1} of ${items.length}: approved ${mediaPurposeLabel(asset.purpose)} ${asset.kind}`}
            >
              <div className="media-frame">
                {asset.kind === "image" ? (
                  <button
                    type="button"
                    className="media-frame-button"
                    onClick={() => showActiveIndex(index)}
                    aria-label={`Maximise approved ${mediaPurposeLabel(asset.purpose)} photo`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.downloadUrl}
                      alt={`Approved ${mediaPurposeLabel(asset.purpose)} photo`}
                      loading="lazy"
                      decoding="async"
                      width={640}
                      height={800}
                    />
                  </button>
                ) : (
                  <video
                    className="media-inline-video"
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    poster={undefined}
                    aria-label={`Approved ${mediaPurposeLabel(asset.purpose)} video`}
                  >
                    <source src={asset.downloadUrl} type={asset.contentType} />
                  </video>
                )}
                <span className="media-kind-badge">{asset.kind === "image" ? "Photo" : "Video"}</span>
                {asset.kind === "video" ? <span className="media-play-badge" aria-hidden="true">Play</span> : null}
                <button
                  type="button"
                  className="media-maximise-button"
                  onClick={() => showActiveIndex(index)}
                  aria-label={`Maximise approved ${mediaPurposeLabel(asset.purpose)} ${asset.kind}`}
                >
                  Maximise
                </button>
              </div>
            </article>
          ))}
        </div>
        {items.length > 1 ? (
          <div className="media-carousel-dots" aria-label="Media slides">
            {items.map((asset, index) => (
              <button
                key={asset.id}
                type="button"
                className={index === currentIndex ? "active" : undefined}
                onClick={() => scrollToIndex(index)}
                aria-label={`Show media ${index + 1} of ${items.length}`}
                aria-current={index === currentIndex ? "true" : undefined}
              />
            ))}
          </div>
        ) : null}
        <div className="media-story-footer">
          <div className="media-meta">
            <strong>{items[currentIndex]?.kind === "video" ? "Video" : "Photo"}</strong>
            <span>
              {formatBytes(items[currentIndex]?.fileSizeBytes ?? items[0].fileSizeBytes)} ·{" "}
              {formatDate(items[currentIndex]?.createdAt ?? items[0].createdAt).split(",")[0]}
            </span>
          </div>
          {items.length > 1 ? (
            <div className="media-story-actions" aria-label="Carousel controls">
              <button type="button" onClick={() => scrollToIndex(currentIndex - 1)} disabled={currentIndex === 0}>
                Previous
              </button>
              <button type="button" onClick={() => scrollToIndex(currentIndex + 1)} disabled={currentIndex === items.length - 1}>
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {activeAsset ? (
        <div className="media-viewer-backdrop" role="presentation" onMouseDown={() => setActiveIndex(null)}>
          <section
            ref={viewerRef}
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
              <button ref={closeButtonRef} type="button" className="media-viewer-close" onClick={() => setActiveIndex(null)}>
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
                  onClick={() => {
                    if (activeIndex !== null) showActiveIndex(activeIndex - 1);
                  }}
                >
                  Previous media
                </button>
                <span>{(activeIndex ?? 0) + 1} of {items.length}</span>
                <button
                  type="button"
                  className="button secondary"
                  disabled={activeIndex === items.length - 1}
                  onClick={() => {
                    if (activeIndex !== null) showActiveIndex(activeIndex + 1);
                  }}
                >
                  Next media
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
