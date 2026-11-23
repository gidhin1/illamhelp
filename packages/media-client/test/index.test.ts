import { describe, expect, it, vi } from "vitest";
import { createMediaClient } from "../src/index";

describe("gRPC-Web media contract", () => {
  it("surfaces a trailers-only permission denial from the response headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      headers: { "grpc-status": "7", "grpc-message": "Staff%20access%20required" }
    }));
    const client = createMediaClient({ baseUrl: "http://media.test", fetchImpl });

    await expect(client.getModerationDetails("upload", "member-token"))
      .rejects.toMatchObject({ grpcStatus: 7, statusCode: 403, message: "Staff access required" });
  });

  it("sends staff queue search and ordering along with the status filter", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([0, 0, 0, 0, 0])));
    const client = createMediaClient({ baseUrl: "http://media.test/", fetchImpl });

    await expect(client.listModerationQueue("staff-token", {
      status: "pending", limit: 25, query: "Case 42", newestFirst: true
    })).resolves.toEqual([]);

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://media.test/media.v1.AdminMediaService/ListModerationQueue");
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer staff-token");
    const bytes = new Uint8Array(options?.body as ArrayBuffer);
    // Request fields 2–5 carry status, limit, query, and newest-first.
    expect([...bytes]).toEqual([
      0, 0, 0, 0, 22,
      0x12, 7, ...new TextEncoder().encode("pending"), 0x18, 25,
      0x22, 7, ...new TextEncoder().encode("Case 42"), 0x28, 1
    ]);
  });

  it("sends a member's appeal and decodes the owner-only eligibility field", async () => {
    const pending = new Uint8Array([0, 0, 0, 0, 10, 10, 3, 97, 98, 99, 96, 7, 136, 1, 0]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(pending));
    const client = createMediaClient({ baseUrl: "http://media.test", fetchImpl });

    await expect(client.requestMediaReview("abc", "member-token")).resolves.toMatchObject({
      id: "abc", state: "appeal_pending", appealEligible: false
    });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://media.test/media.v1.MediaService/RequestMediaReview");
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer member-token");
    expect([...new Uint8Array(options?.body as ArrayBuffer)]).toEqual([0, 0, 0, 0, 5, 10, 3, 97, 98, 99]);
  });

  it("surfaces a failed review from gRPC trailers even when the HTTP status is successful", async () => {
    const trailer = new TextEncoder().encode("grpc-status: 9\r\ngrpc-message: Review%20already%20recorded\r\n");
    const frame = new Uint8Array(5 + trailer.length);
    frame[0] = 0x80;
    new DataView(frame.buffer).setUint32(1, trailer.length);
    frame.set(trailer, 5);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(frame));
    const client = createMediaClient({ baseUrl: "http://media.test", fetchImpl });

    await expect(client.reviewMedia("upload", { decision: "approved" }, "staff-token"))
      .rejects.toMatchObject({ grpcStatus: 9, message: "Review already recorded" });
  });
});
