data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "forward_without_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

locals {
  prefix        = "chapa-tu-choro-${var.environment}-${data.aws_caller_identity.current.account_id}"
  api_zip       = "${path.module}/../../dist/api.zip"
  ingestion_zip = "${path.module}/../../dist/ingestion.zip"
}

resource "aws_s3_bucket" "site" {
  bucket = "${local.prefix}-site"
}

resource "aws_s3_bucket" "data" {
  bucket = "${local.prefix}-raw"
}

resource "aws_s3_bucket" "logs" {
  bucket = "${local.prefix}-logs"
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "delete-old-log-archives"
    status = "Enabled"
    filter {}
    expiration { days = 90 }
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.prefix}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role" "ingestion" {
  name               = "${local.prefix}-ingestion"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "api_basic_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "ingestion_basic_logs" {
  role       = aws_iam_role.ingestion.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api_access" {
  statement {
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.database_ssm_parameter_name}"]
  }
}

resource "aws_iam_role_policy" "api_access" {
  name   = "api-read-db-secret"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_access.json
}

data "aws_iam_policy_document" "ingestion_access" {
  statement {
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ingestion_database_ssm_parameter_name}"]
  }
  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.data.arn}/official/*"]
  }
}

resource "aws_iam_role_policy" "ingestion_access" {
  name   = "ingestion-archive-sources-and-read-secret"
  role   = aws_iam_role.ingestion.id
  policy = data.aws_iam_policy_document.ingestion_access.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/chapa-tu-choro-${var.environment}-api"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "ingestion" {
  name              = "/aws/lambda/chapa-tu-choro-${var.environment}-ingestion"
  retention_in_days = 7
}

resource "aws_lambda_function" "api" {
  function_name                  = "chapa-tu-choro-${var.environment}-api"
  handler                        = "ChapaTuChoro.Api"
  runtime                        = "dotnet10"
  role                           = aws_iam_role.api.arn
  filename                       = local.api_zip
  source_code_hash               = try(filebase64sha256(local.api_zip), null)
  timeout                        = 30
  memory_size                    = 512
  reserved_concurrent_executions = 3 # Cap DB connections to Supabase Free
  lifecycle {
    precondition {
      condition     = fileexists(local.api_zip)
      error_message = "Build dist/api.zip before planning or applying the Lambda deployment."
    }
  }
  environment {
    variables = {
      ASPNETCORE_ENVIRONMENT                = "Production"
      Database__SsmParameterName            = var.database_ssm_parameter_name
      ReverseProxy__UseVerifiedEdgeClientIp = tostring(var.enable_cloudflare_proxy)
    }
  }
  depends_on = [aws_iam_role_policy_attachment.api_basic_logs, aws_cloudwatch_log_group.api]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}

resource "aws_lambda_function" "ingestion" {
  function_name    = "chapa-tu-choro-${var.environment}-ingestion"
  handler          = "ingestion.lambda_handler.handler"
  runtime          = "python3.13"
  role             = aws_iam_role.ingestion.arn
  filename         = local.ingestion_zip
  source_code_hash = try(filebase64sha256(local.ingestion_zip), null)
  timeout          = 900
  memory_size      = 1536
  architectures    = ["x86_64"]
  ephemeral_storage { size = 1024 }
  reserved_concurrent_executions = 1 # Avoid overlapping imports
  lifecycle {
    precondition {
      condition     = fileexists(local.ingestion_zip)
      error_message = "Build dist/ingestion.zip before planning or applying the Lambda deployment."
    }
    precondition {
      condition     = var.ingestion_database_ssm_parameter_name != var.database_ssm_parameter_name
      error_message = "Use separate SSM parameters: the API requires an Npgsql connection string, while ingestion requires a PostgreSQL URI or libpq DSN."
    }
  }
  environment {
    variables = {
      DATABASE_URL_PARAMETER_NAME = var.ingestion_database_ssm_parameter_name
      DATA_BUCKET                 = aws_s3_bucket.data.bucket
      SIDPOL_SOURCE_URL           = var.sidpol_source_url
    }
  }
  depends_on = [aws_iam_role_policy_attachment.ingestion_basic_logs, aws_cloudwatch_log_group.ingestion, aws_iam_role_policy.ingestion_access]
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "chapa-tu-choro-${var.environment}-s3-oac"
  description                       = "Private React origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "api" {
  name                              = "chapa-tu-choro-${var.environment}-lambda-oac"
  description                       = "Private Lambda Function URL origin"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  aliases             = var.site_domain == "" ? [] : [var.site_domain, "www.${var.site_domain}"]
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  comment             = "Chapa Tu Choro MVP"

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "static-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    domain_name              = split("/", trimprefix(aws_lambda_function_url.api.function_url, "https://"))[0]
    origin_id                = "api-lambda"
    origin_access_control_id = aws_cloudfront_origin_access_control.api.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "static-s3"
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    compress                   = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.site_routes.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "api-lambda"
    viewer_protocol_policy     = "redirect-to-https"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.forward_without_host.id
    compress                   = true
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.site_routes.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    cloudfront_default_certificate = var.site_domain == ""
    acm_certificate_arn            = var.site_certificate_arn == "" ? null : var.site_certificate_arn
    ssl_support_method             = var.site_domain == "" ? null : "sni-only"
    minimum_protocol_version       = var.site_domain == "" ? "TLSv1" : "TLSv1.2_2021"
  }
  lifecycle {
    precondition {
      condition     = (var.site_domain == "") == (var.site_certificate_arn == "")
      error_message = "Configure site_domain and site_certificate_arn together, or leave both empty for preview."
    }
  }
}

data "aws_iam_policy_document" "s3_cloudfront" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.s3_cloudfront.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}

# Both permissions are required for IAM-authenticated Lambda Function URLs (since Oct 2025).
resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "AllowCloudFrontInvokeUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id             = "AllowCloudFrontInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.site.arn
  invoked_via_function_url = true
}

output "cloudfront_url" { value = "https://${aws_cloudfront_distribution.site.domain_name}" }
output "site_bucket" { value = aws_s3_bucket.site.id }
output "raw_data_bucket" { value = aws_s3_bucket.data.id }
output "api_lambda" { value = aws_lambda_function.api.function_name }
output "ingestion_lambda" { value = aws_lambda_function.ingestion.function_name }

# Consumed by the publication job only after a successful HCP run.
output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}
