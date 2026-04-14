#!/bin/sh
set -eu

OUTPUT_DIR="${1:-apps/control-server/assets/probes}"
PROBE_DIR="${2:-apps/probe-go}"

ROOT_DIR="$(pwd)"

case "$OUTPUT_DIR" in
  /*) ;;
  *) OUTPUT_DIR="$ROOT_DIR/$OUTPUT_DIR" ;;
esac

case "$PROBE_DIR" in
  /*) ;;
  *) PROBE_DIR="$ROOT_DIR/$PROBE_DIR" ;;
esac

mkdir -p "$OUTPUT_DIR"
cd "$PROBE_DIR"

build_target() {
  GOOS="$1"
  GOARCH="$2"
  EXTENSION="$3"
  OUTPUT_NAME="huha-probe-$GOOS-$GOARCH$EXTENSION"
  OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_NAME"

  echo "building $OUTPUT_NAME"
  CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
    go build -trimpath -ldflags="-s -w" -o "$OUTPUT_PATH" ./cmd/probe

  if [ "$EXTENSION" = "" ]; then
    chmod 755 "$OUTPUT_PATH"
  fi
}

build_target darwin amd64 ""
build_target darwin arm64 ""
build_target linux amd64 ""
build_target linux arm64 ""
build_target windows amd64 ".exe"
build_target windows arm64 ".exe"

echo "probe artifacts written to $OUTPUT_DIR"
