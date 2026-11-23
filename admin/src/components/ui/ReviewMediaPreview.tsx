"use client";

import { useState } from "react";
import type { ModerationDetails } from "@/lib/api";
import { Banner } from "./primitives";

export function ReviewMediaPreview({
  media,
  alt,
  testIdPrefix,
}: {
  media: ModerationDetails["media"];
  alt: string;
  testIdPrefix?: string;
}) {
  const { previewUrl, kind } = media;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!previewUrl) return <Banner tone="info">This file has no preview.</Banner>;
  if (failedUrl === previewUrl) {
    return <Banner tone="error">Couldn’t load the preview. Select Refresh preview to try again.</Banner>;
  }
  if (kind === "image") {
    // Signed URLs are served directly by local or deployed object storage.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={previewUrl} alt={alt} data-testid={testIdPrefix && `${testIdPrefix}-image`} onError={() => setFailedUrl(previewUrl)} />;
  }
  return <video src={previewUrl} controls preload="metadata" aria-label={alt} data-testid={testIdPrefix && `${testIdPrefix}-video`} onError={() => setFailedUrl(previewUrl)} />;
}
