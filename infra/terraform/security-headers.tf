locals {
  # Observe before enforcing: MapLibre uses workers, inline positioning and
  # external vector tiles. No reporting collector/service is introduced.
  site_csp_report_only = join("; ", [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self' https://tiles.openfreemap.org https://geomininter.mininter.gob.pe",
    "form-action 'self'",
    "frame-src 'none'"
  ])
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${local.prefix}-security-headers"
  comment = "Browser protections with an observational CSP rollout"

  security_headers_config {
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 86400
      include_subdomains         = false
      preload                    = false
      override                   = true
    }
    # Restrict embedding, plugins and base URL changes immediately; resource
    # restrictions below remain report-only until real browser verification.
    content_security_policy {
      content_security_policy = "base-uri 'self'; object-src 'none'; frame-ancestors 'none'"
      override                = true
    }
  }
  custom_headers_config {
    items {
      header   = "Content-Security-Policy-Report-Only"
      value    = local.site_csp_report_only
      override = true
    }
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
      override = true
    }
  }
}
