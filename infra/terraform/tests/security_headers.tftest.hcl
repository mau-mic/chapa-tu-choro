# Run after packaging Lambda/frontend artifacts, using mock AWS: no cloud calls.
mock_provider "aws" {
  override_during = plan
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::467173180594:role/mock-runtime" }
  }
  mock_resource "aws_lambda_function_url" {
    defaults = { function_url = "https://example.lambda-url.us-east-1.on.aws/" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "467173180594" }
  }
}

override_resource {
  target          = aws_cloudfront_response_headers_policy.security
  override_during = plan
  values          = { id = "11111111-1111-1111-1111-111111111111" }
}

run "browser_security_headers" {
  command = plan
  variables {
    environment = "prod"
  }
  assert {
    condition = (
      aws_cloudfront_distribution.site.default_cache_behavior[0].response_headers_policy_id == aws_cloudfront_response_headers_policy.security.id &&
      aws_cloudfront_distribution.site.ordered_cache_behavior[0].response_headers_policy_id == aws_cloudfront_response_headers_policy.security.id
    )
    error_message = "Frontend and API must both receive the security policy."
  }
  assert {
    condition = (
      aws_cloudfront_response_headers_policy.security.security_headers_config[0].frame_options[0].frame_option == "DENY" &&
      aws_cloudfront_response_headers_policy.security.security_headers_config[0].content_type_options[0].override &&
      aws_cloudfront_response_headers_policy.security.security_headers_config[0].strict_transport_security[0].access_control_max_age_sec == 86400 &&
      !aws_cloudfront_response_headers_policy.security.security_headers_config[0].strict_transport_security[0].include_subdomains &&
      !aws_cloudfront_response_headers_policy.security.security_headers_config[0].strict_transport_security[0].preload
    )
    error_message = "Browser protections must use the reviewed HSTS and framing settings."
  }
  assert {
    condition = (
      length(aws_cloudfront_response_headers_policy.security.cors_config) == 0 &&
      alltrue([for h in aws_cloudfront_response_headers_policy.security.custom_headers_config[0].items : h.override]) &&
      anytrue([for h in aws_cloudfront_response_headers_policy.security.custom_headers_config[0].items : h.header == "Content-Security-Policy-Report-Only" && strcontains(h.value, "worker-src 'self' blob:") && strcontains(h.value, "https://tiles.openfreemap.org") && strcontains(h.value, "https://geomininter.mininter.gob.pe")])
    )
    error_message = "CSP must observe MapLibre/external sources without changing API CORS."
  }
}
