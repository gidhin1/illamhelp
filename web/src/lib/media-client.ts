import { createMediaClient } from "@illamhelp/media-client";

export const mediaClient = createMediaClient({
  baseUrl: process.env.NEXT_PUBLIC_MEDIA_GRPC_WEB_URL
});
