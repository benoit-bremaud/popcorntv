group "default" {
  targets = ["gluetun"]
}

target "gluetun" {
  context = "."
  dockerfile = "deploy/local-retrieval/gluetun.Dockerfile"
  tags = ["popcorntv-gluetun:v3.41.3-pctv.2"]
  platforms = ["linux/amd64"]
  output = ["type=docker"]
}

// Local artifact only: requires an explicitly selected ARM64-capable builder.
// Never replaces the reviewed AMD64 image or publishes a registry tag.
target "gluetun-arm64" {
  inherits = ["gluetun"]
  tags = ["popcorntv-gluetun:v3.41.3-pctv.2-arm64"]
  platforms = ["linux/arm64"]
  output = ["type=oci,dest=data/build-artifacts/local-retrieval/gluetun-arm64.tar"]
}
