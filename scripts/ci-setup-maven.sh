#!/usr/bin/env bash
set -euo pipefail

if command -v mvn >/dev/null 2>&1; then
  exit 0
fi

version=3.9.11
checksum=bcfe4fe305c962ace56ac7b5fc7a08b87d5abd8b7e89027ab251069faebee516b0ded8961445d6d91ec1985dfe30f8153268843c89aa392733d1a3ec956c9978
install_dir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/maven.XXXXXX")"
archive="$install_dir/apache-maven-$version-bin.tar.gz"
curl --fail --silent --show-error --location \
  --connect-timeout 10 --max-time 90 --retry 3 --retry-max-time 160 \
  "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$version/apache-maven-$version-bin.tar.gz" \
  --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha512sum --check
tar -xzf "$archive" -C "$install_dir"
printf '%s\n' "$install_dir/apache-maven-$version/bin" >> "$GITHUB_PATH"
