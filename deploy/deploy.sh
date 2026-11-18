#!/usr/bin/env bash
# build on the laptop, pipe the image into precision02's containerd, apply the manifests. see docs/architecture.md section 5
# secrets are made once by hand (section 5), this never touches them
set -euo pipefail
cd "$(dirname "$0")/.."

tag=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain)" ]; then tag="$tag-dirty-$(date +%s)"; fi

pnpm exec vite build
docker build --platform linux/amd64 -t "flambeur:$tag" .
docker save "flambeur:$tag" | ssh precision02 sudo k3s ctr images import -

for f in namespace netpol postgres backup cloudflared; do
  ssh precision01 kubectl apply -f - < "deploy/k8s/$f.yaml"
done
sed "s|flambeur:TAG|flambeur:$tag|" deploy/k8s/app.yaml | ssh precision01 kubectl apply -f -
ssh precision01 kubectl -n flambeur rollout status deploy/flambeur --timeout=180s
echo "deployed flambeur:$tag"
