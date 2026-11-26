import { createMediaClient } from "@illamhelp/media-client";

import { WEB_SESSION } from "./member-session";

export const mediaClient = createMediaClient({
  baseUrl: process.env.NEXT_PUBLIC_MEDIA_GRPC_WEB_URL,
  fetchImpl: (url, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") !== `Bearer ${WEB_SESSION}`) return fetch(url, init);
    headers.delete("Authorization");
    const path = String(url).match(/\/media\.v1\.MediaService\/[a-zA-Z]+$/)?.[0];
    if (!path) throw new Error("This action is unavailable for member sessions.");
    return fetch(`/api/member${path}`, { ...init, headers });
  }
});
