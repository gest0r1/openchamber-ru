#!/usr/bin/env bash
# Install or update a GitHub-built Linux integration bundle in an isolated prefix.
# Usage: bash install-linux-integration-bundle.sh ARCHIVE MANIFEST PREFIX
# The caller owns service stop/start; this script never changes system services.
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo 'Usage: install-linux-integration-bundle.sh ARCHIVE MANIFEST PREFIX' >&2
  exit 2
fi
archive=$(realpath -- "$1")
manifest=$(realpath -- "$2")
prefix=$3
[[ -f "$archive" && -f "$manifest" ]] || { echo 'Bundle or manifest not found' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js >=22 is required' >&2; exit 1; }
command -v sha256sum >/dev/null || { echo 'sha256sum is required' >&2; exit 1; }

read_manifest() {
  node - "$manifest" "$1" <<'NODE'
const fs = require('node:fs');
const [file, key] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const value = manifest[key];
if (typeof value !== 'string' || !value) process.exit(1);
process.stdout.write(value);
NODE
}
sha=$(read_manifest source_sha)
expected=$(read_manifest sha256)
asset=$(read_manifest asset)
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid manifest SHA' >&2; exit 1; }
[[ "$(basename "$archive")" == "$asset" ]] || { echo 'Archive name does not match manifest' >&2; exit 1; }
actual=$(sha256sum -- "$archive" | cut -d ' ' -f 1)
[[ "$actual" == "$expected" ]] || { echo 'Archive checksum mismatch; install aborted' >&2; exit 1; }

mkdir -p -- "$prefix/releases" "$prefix/bin"
prefix=$(realpath -- "$prefix")
exec 9>"$prefix/.install.lock"
flock -x 9
stage=$(mktemp -d "$prefix/releases/.stage.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
# Do not extract an archive containing files outside the package/ directory.
if tar -tzf "$archive" | grep -Ev '^package(/|$)' | grep -q .; then
  echo 'Archive contains unexpected paths' >&2
  exit 1
fi
tar -xzf "$archive" -C "$stage" --no-same-owner
root="$stage/package"
[[ -f "$root/packages/web/bin/cli.js" && -f "$root/packages/sdk/dist/index.js" ]] || { echo 'Incomplete OpenChamber bundle' >&2; exit 1; }
cli="$root/opencode-cli/node_modules/.bin/opencode"
[[ -x "$cli" ]] || { echo 'Missing bundled OpenCode CLI' >&2; exit 1; }
sdk=$(node -p "require(process.argv[1]).dependencies['@opencode-ai/sdk']" "$root/package.json")
web_sdk=$(node -p "require(process.argv[1]).dependencies['@opencode-ai/sdk']" "$root/packages/web/package.json")
[[ "$sdk" == "$web_sdk" && "$($cli --version)" == "$sdk" ]] || { echo 'OpenCode CLI / SDK version mismatch' >&2; exit 1; }
node --input-type=module -e 'import(process.argv[1])' "file://$root/packages/sdk/dist/index.js" >/dev/null

release="$prefix/releases/$sha"
if [[ ! -e "$release" ]]; then
  mv -- "$root" "$release"
else
  [[ -x "$release/opencode-cli/node_modules/.bin/opencode" ]] || { echo 'Existing release is incomplete' >&2; exit 1; }
  [[ "$("$release/opencode-cli/node_modules/.bin/opencode" --version)" == "$sdk" ]] || { echo 'Existing release OpenCode version mismatch' >&2; exit 1; }
fi
cat > "$prefix/bin/.openchamber.$$" <<'LAUNCHER'
#!/usr/bin/env bash
set -Eeuo pipefail
base=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export OPENCODE_BINARY="$base/current/opencode-cli/node_modules/.bin/opencode"
export PATH="$base/current/opencode-cli/node_modules/.bin:$PATH"
exec node "$base/current/packages/web/bin/cli.js" "$@"
LAUNCHER
chmod 755 "$prefix/bin/.openchamber.$$"
mv -f -- "$prefix/bin/.openchamber.$$" "$prefix/bin/openchamber"
ln -s "releases/$sha" "$prefix/.current.$$"
mv -Tf -- "$prefix/.current.$$" "$prefix/current"
ln -sfn "../current/opencode-cli/node_modules/.bin/opencode" "$prefix/bin/.opencode.$$"
mv -Tf -- "$prefix/bin/.opencode.$$" "$prefix/bin/opencode"
echo "Installed OpenChamber SHA $sha with OpenCode $sdk to $prefix"
echo "Executable: $prefix/bin/openchamber"
