#!/usr/bin/env bash
# Install the latest signed Windows installer published by this fork.
# Usage: curl -fsSL https://raw.githubusercontent.com/gest0r1/openchamber-ru/main/scripts/install.sh | bash

set -euo pipefail

REPOSITORY='gest0r1/openchamber-ru'
API_URL="https://api.github.com/repos/${REPOSITORY}/releases/latest"
ASSET_PREFIX='https://github.com/gest0r1/openchamber-ru/releases/download/'

info() { printf 'info  %s\n' "$*"; }
fail() { printf 'error  %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;
  *)
    fail "This fork currently publishes a Windows installer only. Do not install @openchamber/web: it is upstream, not this fork."
    ;;
esac

command -v curl >/dev/null 2>&1 || fail 'curl is required to download the release.'

release_json=$(curl --fail --silent --show-error --location --retry 3 --retry-all-errors "$API_URL")
asset_url=''

if command -v python3 >/dev/null 2>&1; then
  asset_url=$(RELEASE_JSON="$release_json" python3 - <<'PY'
import json, os
release = json.loads(os.environ['RELEASE_JSON'])
for asset in release.get('assets', []):
    name = asset.get('name', '')
    if name.startswith('OpenChamber-') and name.endswith('-win-x64.exe'):
        print(asset['browser_download_url'])
        break
PY
)
elif command -v node >/dev/null 2>&1; then
  asset_url=$(RELEASE_JSON="$release_json" node -e '
const release = JSON.parse(process.env.RELEASE_JSON);
const asset = (release.assets || []).find((item) => /^OpenChamber-.*-win-x64\\.exe$/.test(item.name));
if (asset) process.stdout.write(asset.browser_download_url);
')
else
  asset_url=$(printf '%s' "$release_json" | tr -d '\n' | sed -nE 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"([^"[:space:]]*OpenChamber-[^"[:space:]]*-win-x64\.exe)".*/\1/p')
fi

[[ "$asset_url" == "${ASSET_PREFIX}"* ]] || fail 'Latest release has no valid Windows x64 installer asset.'

version=${asset_url#*'/download/'}
version=${version%%/*}
download_dir=${TEMP:-${TMPDIR:-/tmp}}
installer="${download_dir%/}/OpenChamber-${version}-win-x64.exe"
partial="${installer}.partial"

info "Downloading OpenChamber ${version} from ${REPOSITORY} release…"
curl --fail --location --retry 3 --retry-all-errors --output "$partial" "$asset_url"
mv -f "$partial" "$installer"
[[ -s "$installer" ]] || fail 'Downloaded installer is empty.'

info "Starting installer: $installer"
if command -v powershell.exe >/dev/null 2>&1; then
  windows_installer=$(cygpath -w "$installer" 2>/dev/null || printf '%s' "$installer")
  powershell.exe -NoProfile -Command "Start-Process -FilePath '$windows_installer'"
else
  info "Run this file manually to continue: $installer"
fi
