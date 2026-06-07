import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const grpc = require("../.tools/bruno/node_modules/@grpc/grpc-js");
const protoLoader = require("../.tools/bruno/node_modules/@grpc/proto-loader");

const accessToken = process.env.SEEKER_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("SEEKER_ACCESS_TOKEN is required");
}

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const protoPath = resolve(rootDir, "api-java/src/main/protobuf/media/v1/media.proto");
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const MediaService = proto.media.v1.MediaService;
const client = new MediaService("localhost:9090", grpc.credentials.createInsecure());

function metadata() {
  const md = new grpc.Metadata();
  md.set("authorization", `Bearer ${accessToken}`);
  return md;
}

function unary(method, payload) {
  return new Promise((resolvePromise, rejectPromise) => {
    client[method](payload, metadata(), (error, response) => {
      if (error) {
        rejectPromise(error);
        return;
      }
      resolvePromise(response);
    });
  });
}

const body = "Bruno E2E verification document fixture";
const ticket = await unary("CreateUploadTicket", {
  kind: "MEDIA_KIND_IMAGE",
  content_type: "image/jpeg",
  file_size_bytes: body.length,
  checksum_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  original_file_name: "e2e-id-proof.jpg",
  purpose: "MEDIA_PURPOSE_VERIFICATION_DOCUMENT"
});

const requiredHeaders = ticket.required_headers ?? {};
const uploadResponse = await fetch(ticket.upload_url, {
  method: "PUT",
  headers: requiredHeaders,
  body
});
if (!uploadResponse.ok) {
  throw new Error(`Media fixture upload failed with HTTP ${uploadResponse.status}`);
}

const etag = uploadResponse.headers.get("etag")?.replaceAll("\"", "") || "bruno-e2e";
await unary("CompleteUpload", {
  media_id: ticket.media_id,
  etag
});

const page = await unary("ListVerificationDocuments", {
  limit: 50
});
const found = (page.items ?? []).some((item) => item.id === ticket.media_id);
if (!found) {
  throw new Error(`Created media ${ticket.media_id} was not returned by ListVerificationDocuments`);
}

process.stdout.write(ticket.media_id);
