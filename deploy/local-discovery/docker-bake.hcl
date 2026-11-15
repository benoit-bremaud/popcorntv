variable "SIXLABORS_LICENSE_FILE" {
  default = ""
}

target "radarr" {
  context = "."
  dockerfile = "deploy/local-discovery/radarr.Dockerfile"
  tags = ["popcorntv-radarr:af772b0-imagesharp3.2.0"]
  secret = ["id=sixlabors,src=${SIXLABORS_LICENSE_FILE}"]
  output = ["type=docker"]
}

target "ingress" {
  context = "."
  dockerfile = "deploy/local-discovery/ingress.Dockerfile"
  tags = ["popcorntv-discovery-ingress:7ce9f08"]
  output = ["type=docker"]
}
