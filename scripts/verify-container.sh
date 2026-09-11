#!/usr/bin/env bash
set -euo pipefail

# 실제 배포 대상과 같은 이미지를 빌드하고 검사한다. x86_64가 아닌 호스트에서는 Docker
# Desktop이 linux/amd64를 에뮬레이션할 수 있으므로, 인수인계 기록용으로 두 아키텍처를 출력한다.
image="${1:-persona-web:container-verify}"
requested_port="${PERSONA_WEB_VERIFY_PORT:-}"
container="persona-web-verify-$$"
export_container="${container}-image"
workdir="$(mktemp -d)"

cleanup() {
  docker rm -f "$container" "$export_container" >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

request() {
  curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 "$@"
}

echo "host architecture: $(uname -m)"
echo "Docker server: $(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')"
echo "build target: linux/amd64"

docker buildx build --platform linux/amd64 --load --tag "$image" .

image_platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
image_user="$(docker image inspect "$image" --format '{{.Config.User}}')"
[[ "$image_platform" == "linux/amd64" ]]
[[ -n "$image_user" && "$image_user" != "0" && "$image_user" != "root" ]]

# 최종 파일시스템에는 빌드 입력이나 머신별 설정이 남아 있으면 안 된다.
docker create --platform linux/amd64 --name "$export_container" "$image" >/dev/null
docker export "$export_container" > "$workdir/image.tar"
tar -tf "$workdir/image.tar" > "$workdir/files.txt"
if rg -n '(^|/)(\.env[^/]*|node_modules|src|package(-lock)?\.json)$' "$workdir/files.txt"; then
  echo "runtime image contains a build input or local configuration" >&2
  exit 1
fi

publish_args=(--publish "127.0.0.1::8080")
if [[ -n "$requested_port" ]]; then
  publish_args=(--publish "127.0.0.1:${requested_port}:8080")
fi

docker run --detach --rm --name "$container" --platform linux/amd64 \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,uid=101,gid=101,mode=1777 \
  "${publish_args[@]}" \
  "$image" >/dev/null
port="$(docker port "$container" 8080/tcp | awk -F: 'NR == 1 { print $NF }')"
base_url="http://127.0.0.1:${port}"

healthy=false
for _ in {1..20}; do
  if request "${base_url}/healthz" > /dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  docker logs "$container" >&2 || true
  echo "컨테이너가 health 응답 준비를 마치지 못했습니다." >&2
  exit 1
fi

request --dump-header "$workdir/health.headers" \
  "${base_url}/healthz" > "$workdir/health.body"
rg -qi '^cache-control:.*no-store' "$workdir/health.headers"
[[ "$(<"$workdir/health.body")" == "ok" ]]

request --dump-header "$workdir/index.headers" \
  "${base_url}/" > "$workdir/index.html"
rg -qi '^cache-control:.*no-cache' "$workdir/index.headers"

rg -o '"/assets/[^"?]+' "$workdir/index.html" | tr -d '"' > "$workdir/assets.txt"
[[ -s "$workdir/assets.txt" ]]
while IFS= read -r asset; do
  request --dump-header "$workdir/asset.headers" \
    "${base_url}${asset}" > /dev/null
  rg -qi '^cache-control:.*immutable' "$workdir/asset.headers"
done < "$workdir/assets.txt"

missing_asset="${base_url}/assets/missing-deploy-asset.js"
missing_asset_status="$(curl --silent --output /dev/null --dump-header "$workdir/missing-asset.headers" \
  --write-out '%{http_code}' "$missing_asset")"
[[ "$missing_asset_status" == "404" ]]
rg -qi '^cache-control:.*no-store' "$workdir/missing-asset.headers"
if rg -qi '^cache-control:.*immutable' "$workdir/missing-asset.headers"; then
  echo "누락 자산 응답에 immutable cache를 설정하면 안 됩니다." >&2
  exit 1
fi

for path in /missing-static-file /v1 /v1/me; do
  [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "${base_url}${path}")" == "404" ]]
done

[[ "$(docker exec "$container" id -u)" != "0" ]]
docker cp "$container:/usr/share/nginx/html" "$workdir/site"
if rg -n 'VITE_LOCAL_API_TARGET|127\.0\.0\.1:8000|PERSONA_STATIC_BEARER_TOKEN' "$workdir/site"; then
  echo "runtime bundle contains a local API setting or authentication secret name" >&2
  exit 1
fi

echo "container verification passed: ${image_platform}, user ${image_user}"
