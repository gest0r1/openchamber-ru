#!/usr/bin/env bash
# Usage: bash upgrade-working-from-bundle.sh ARCHIVE MANIFEST [INSTALLER]
# Update the EXISTING root/user systemd OpenChamber service; never start a second instance.
set -Eeuo pipefail
[[ $# -ge 2 && $# -le 3 ]] || { echo 'Usage: upgrade-working-from-bundle.sh ARCHIVE MANIFEST [INSTALLER]' >&2; exit 2; }
archive=$(realpath -- "$1")
manifest=$(realpath -- "$2")
installer=$(realpath -- "${3:-$(dirname "$0")/install-linux-integration-bundle.sh}")
[[ -f "$archive" && -f "$manifest" && -f "$installer" ]] || { echo 'Missing archive, manifest, or installer' >&2; exit 1; }
[[ $EUID -eq 0 ]] || { echo 'Run as the existing root service owner' >&2; exit 1; }
for cmd in gh node systemctl ss ip curl flock realpath; do command -v "$cmd" >/dev/null || { echo "Missing dependency: $cmd" >&2; exit 1; }; done
prefix="$HOME/.local/share/openchamber"
unit_dir="$HOME/.config/systemd/user/openchamber.service.d"
unit="$unit_dir/90-integration-bundle.conf"
password_file="$HOME/.config/openchamber-live.env"
host="${OPENCHAMBER_BIND_HOST:-172.18.0.1}"
port="${OPENCHAMBER_BIND_PORT:-3000}"
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]] || { echo 'Invalid port' >&2; exit 1; }
ip -4 addr show | grep -Fq "inet $host/" || { echo "Bind address $host is not assigned on this host" >&2; exit 1; }
[[ -L "$prefix/current" && -x /usr/local/bin/openchamber && -e "$HOME/.opencode/bin/opencode" ]] || { echo 'Existing OpenChamber installation is missing' >&2; exit 1; }
systemctl --user is-active --quiet openchamber.service || { echo 'Existing OpenChamber service is not active' >&2; exit 1; }
if ss -H -lnt "sport = :$port" | grep -q .; then
  echo "Host TCP port $port is occupied. Update hh-auto to the Docker-only frontend FIRST, then retry." >&2
  ss -lntp "sport = :$port" >&2 || true
  exit 1
fi
old=$(readlink -f -- "$prefix/current")
mkdir -p -- "$prefix/backups" "$unit_dir" "$HOME/.config"
backup=$(mktemp -d "$prefix/backups/live-XXXXXXXX")
printf '%s\n' "$old" > "$backup/current-target"
cp -a /usr/local/bin/openchamber "$backup/openchamber"
cp -a "$HOME/.opencode/bin/opencode" "$backup/opencode"
[[ ! -e "$unit" ]] || cp -a "$unit" "$backup/unit"
[[ ! -e "$password_file" ]] || cp -a "$password_file" "$backup/password-env"
new_password=''
rollback() {
  local code="$1"
  trap - ERR
  set +e
  ln -s "$old" "$prefix/.rollback.$$" && mv -Tf "$prefix/.rollback.$$" "$prefix/current"
  cp -a "$backup/openchamber" /usr/local/bin/openchamber
  rm -f "$HOME/.opencode/bin/opencode"
  cp -a "$backup/opencode" "$HOME/.opencode/bin/opencode"
  if [[ -f "$backup/unit" ]]; then cp -a "$backup/unit" "$unit"; else rm -f "$unit"; fi
  if [[ -f "$backup/password-env" ]]; then cp -a "$backup/password-env" "$password_file"; else rm -f "$password_file"; fi
  systemctl --user daemon-reload
  systemctl --user restart openchamber.service
  echo "FAILED (exit $code); restored prior installation. Backup: $backup" >&2
  exit "$code"
}
trap 'rollback "$?"' ERR
# Only the GitHub-built archive is installed; source checkout is never executed.
bash "$installer" "$archive" "$manifest" "$prefix"
# Preserve the original OpenCode environment and override it only with dedicated live settings.
cat > /usr/local/bin/.openchamber-live.$$ <<'LAUNCHER'
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
[[ ! -f "$HOME/.config/opencode.env" ]] || . "$HOME/.config/opencode.env"
[[ ! -f "$HOME/.config/openchamber-live.env" ]] || . "$HOME/.config/openchamber-live.env"
set +a
exec "$HOME/.local/share/openchamber/bin/openchamber" "$@"
LAUNCHER
chmod 755 /usr/local/bin/.openchamber-live.$$
mv -f /usr/local/bin/.openchamber-live.$$ /usr/local/bin/openchamber
ln -s "$prefix/bin/opencode" "$HOME/.opencode/bin/.opencode-live.$$"
mv -Tf "$HOME/.opencode/bin/.opencode-live.$$" "$HOME/.opencode/bin/opencode"
# The CLI refuses network-exposed binding without UI authentication.
set +u
[[ ! -f "$HOME/.config/opencode.env" ]] || . "$HOME/.config/opencode.env"
[[ ! -f "$password_file" ]] || . "$password_file"
set -u
if [[ -z "${OPENCHAMBER_UI_PASSWORD:-}" ]]; then
  new_password="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))')"
  (umask 077; printf 'OPENCHAMBER_UI_PASSWORD=%s\n' "$new_password" > "$password_file")
fi
cat > "$unit" <<EOF
[Service]
EnvironmentFile=-$password_file
ExecStart=
ExecStart=/usr/local/bin/openchamber serve --foreground --host $host --port $port
EOF
systemctl --user daemon-reload
systemctl --user restart openchamber.service
systemctl --user is-active --quiet openchamber.service
ss -H -lnt "sport = :$port" | grep -Fq "$host:$port"
status=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "http://$host:$port/")
case "$status" in 200|301|302|303|307|308|401|403) ;; *) echo "Unexpected HTTP status: $status" >&2; false;; esac
"$prefix/bin/openchamber" --version
"$prefix/bin/opencode" --version
trap - ERR
echo "SUCCESS: existing openchamber.service bound to http://$host:$port/; HTTP $status"
echo "Rollback backup: $backup"
if [[ -n "$new_password" ]]; then
  echo "NEW UI PASSWORD (save securely): $new_password"
fi
