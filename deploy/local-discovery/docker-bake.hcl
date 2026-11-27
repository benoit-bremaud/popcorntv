variable "SIXLABORS_LICENSE_FILE" {
  default = ""
}

target "prowlarr" {
  context = "."
  dockerfile = "deploy/local-discovery/prowlarr.Dockerfile"
  tags = ["popcorntv-prowlarr:3.1.0.5792-libxml2r5"]
  output = ["type=docker"]
}

target "radarr" {
  context = "."
  dockerfile = "deploy/local-discovery/radarr.Dockerfile"
  target = "runtime"
  tags = ["popcorntv-radarr:af772b0-imagesharp3.2.0-libxml2r5"]
  secret = ["id=sixlabors,src=${SIXLABORS_LICENSE_FILE}"]
  output = ["type=docker"]
}

target "ingress" {
  context = "."
  dockerfile = "deploy/local-discovery/ingress.Dockerfile"
  tags = ["popcorntv-discovery-ingress:7ce9f08"]
  output = ["type=docker"]
}

target "radarr-regression" {
  inherits = ["radarr"]
  target = "regression"
  tags = []
  output = ["type=cacheonly"]
}
