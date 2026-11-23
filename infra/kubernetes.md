# Local Kubernetes Workflow

IllamHelp keeps the Docker Compose workflow during the Kubernetes migration. The Kubernetes path is local-first and uses kind, Helm, and locally loaded images.

## Prerequisites

- Docker
- kind
- kubectl
- Helm

The local workflow reads credentials from the ignored `.env` file. Create and populate it before deploying:

```bash
make init-env
```

`make k8s-up` generates `illamhelp/illamhelp-secrets` from that file. Helm values contain no default passwords or credential-bearing connection URLs.

## Commands

```bash
make k8s-create
make k8s-build-load
make k8s-up
make k8s-status
make k8s-smoke
make k8s-port-forward
make k8s-logs
make k8s-down
```

`make k8s-up` installs two Helm releases into the `illamhelp` namespace:

- `illamhelp`: local-only infrastructure, including Postgres, Redis, MinIO, NATS, Keycloak, OPA, and ClamAV. OpenSearch is disabled by default in chart values because it is memory-heavy.
- `illamhelp-app`: API, web, admin, Envoy gRPC-Web, services, and ingress.

Default ingress hosts are:

- `web.illamhelp.local`
- `admin.illamhelp.local`
- `api.illamhelp.local`
- `grpc.illamhelp.local`

Map those hosts to the local ingress address used by your kind ingress setup, or port-forward services while developing.

The default kind cluster does not install an ingress controller. `make k8s-port-forward` is therefore the guaranteed local access path:

- Web: `http://localhost:3000`
- Admin: `http://localhost:3003`
- API health: `http://localhost:4000/api/v1/health`
- gRPC-Web: `http://localhost:9091`

The web and admin `NEXT_PUBLIC_*` URLs are compiled into their Next.js images. Local images use the localhost ports above. A hosted environment must pass its public API and gRPC-Web URLs as Docker build arguments rather than expecting pod environment variables to rewrite browser bundles at runtime.

## Validation And Rollback

```bash
make k8s-template
make k8s-smoke
helm test illamhelp-app -n illamhelp --logs
helm history illamhelp-app -n illamhelp
helm rollback illamhelp-app <revision> -n illamhelp --wait
```

Application pods run as explicit non-root users with read-only root filesystems, dropped Linux capabilities, seccomp `RuntimeDefault`, and disabled service-account token mounts. Set `networkPolicy.enabled=true` when an ingress controller is installed; update `networkPolicy.ingressNamespaceLabels` if its namespace is not `ingress-nginx`.

## CI Images

GitHub Actions builds API, web, and admin images from:

- `infra/docker/api.Dockerfile`
- `infra/docker/web.Dockerfile`
- `infra/docker/admin.Dockerfile`

Images are scanned with Trivy. On branch pushes, CI publishes to GHCR as:

- `ghcr.io/gidhin1/illamhelp/api:<sha>`
- `ghcr.io/gidhin1/illamhelp/api-speech:<sha>`
- `ghcr.io/gidhin1/illamhelp/api-visual:<sha>`
- `ghcr.io/gidhin1/illamhelp/web:<sha>`
- `ghcr.io/gidhin1/illamhelp/admin:<sha>`

Pull requests build and scan images without requiring live cluster credentials.

## Video speech screening

Use the same local kind and Helm commands to enable speech screening. Run these after `make k8s-create`.

```bash
make k8s-build-load K8S_API_TARGET=speech
make k8s-up K8S_API_TARGET=speech
make k8s-smoke
```

The local deployment selects the speech API tag and the ClamAV service from the infrastructure release. For a hosted Helm deployment, use `images.api.repository=ghcr.io/gidhin1/illamhelp/api-speech`, set `images.api.tag` to the CI build SHA and `config.clamavHost` to your ClamAV service. `config.clamavPort` defaults to 3310. The image includes FFmpeg, English and Malayalam OCR, whisper.cpp v1.9.5, and the pinned multilingual tiny model. Speech results are evidence for staff review.

Use the existing Helm rollback command to restore a prior release. For local kind, running the standard build and up commands selects the standard API image again.

## Visual screening

The visual API image includes the speech and OCR tools plus the pinned Falconsai model. It runs the model locally and records its findings for staff review.

```bash
make k8s-build-load K8S_API_TARGET=visual
make k8s-up K8S_API_TARGET=visual
make k8s-smoke
```

For hosted Helm deployments, use `charts/illamhelp-app/values-visual.yaml` with `images.api.repository=ghcr.io/gidhin1/illamhelp/api-visual`, the CI build SHA as `images.api.tag`, and the reachable ClamAV service as `config.clamavHost`. The visual overlay requests 1 CPU and 1 GiB of memory and sets limits of 2 CPU and 2 GiB for initial evaluation. Use the existing Helm rollback command or select the speech image to disable the visual model.

## Production Notes

The charts keep image repositories, tags, service URLs, and secrets configurable. Production Kubernetes is intentionally not wired in this phase; future cloud deployments should use managed Postgres, Redis, object storage, and search where available.
