#!/usr/bin/env bash
# Builds the Sunk Cost IBC bundle: IBC.jar plus the start scripts the desktop
# app runs, packed as dist/IBC-<version>.tar.gz with a .sha256 beside it.
#
# IBC calls exactly two IBKR classes (ibgateway.GWClient, jclient.LoginFrame),
# so it compiles against the stubs in sunk/tws-stubs instead of IBKR's jars.
# The build needs only a JDK 17 or newer, GNU tar and sha256sum.
#
# Usage: sunk/build.sh [output-dir]
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
version=$(tr -d '[:space:]' < "$root/sunk/VERSION")
out=${1:-"$root/dist"}
work="$root/target/sunk"
name="IBC-$version"
bundle="$work/$name"

rm -rf "$work"
mkdir -p "$work/stubs" "$work/classes" "$bundle/scripts" "$out"

# Same file the upstream Ant build's init target writes.
cat > "$root/src/ibcalpha/ibc/IbcVersionInfo.java" <<EOF
// NB: this file is updated by the Ant build script

package ibcalpha.ibc;

public class IbcVersionInfo {
    public final static String IBC_VERSION = "$version";
}
EOF

find "$root/sunk/tws-stubs" -name '*.java' -print0 |
	xargs -0 javac --release 17 -d "$work/stubs"
find "$root/src" -name '*.java' -print0 |
	xargs -0 javac --release 17 -Xlint:all -cp "$work/stubs" -d "$work/classes"

# Reproducible archive: fixed entry times taken from the last commit.
epoch=$(git -C "$root" log -1 --format=%ct)
iso=$(date -u -d "@$epoch" +%Y-%m-%dT%H:%M:%SZ)
jar --create --date="$iso" --file "$bundle/IBC.jar" -C "$work/classes" .

cp "$root/LICENSE.txt" "$bundle/LICENSE.txt"
printf '%s\n' "$version" > "$bundle/version"
for script in ibcstart.sh StartIBC.bat getExtraJavaOptions.ps1; do
	cp "$root/resources/scripts/$script" "$bundle/scripts/$script"
done

tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@$epoch" \
	-cf - -C "$work" "$name" | gzip -n > "$out/$name.tar.gz"
(cd "$out" && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256")
cat "$out/$name.tar.gz.sha256"
