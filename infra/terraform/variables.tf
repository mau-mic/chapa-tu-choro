variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "database_ssm_parameter_name" {
  type        = string
  default     = "/chapa-tu-choro/dev/database-url"
  description = "Existing SSM SecureString containing the API's Npgsql connection string. Do not put the secret value in Terraform variables or state."
  validation {
    condition     = can(regex("^/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$", var.database_ssm_parameter_name))
    error_message = "The API SSM parameter must be an absolute parameter path with nonempty segments and no whitespace."
  }
}

variable "ingestion_database_ssm_parameter_name" {
  type        = string
  default     = "/chapa-tu-choro/dev/ingestion-database-url"
  description = "Existing, separate SSM SecureString containing a PostgreSQL URI or libpq DSN for the ingestion writer role. Must differ from the API parameter."
  validation {
    condition     = can(regex("^/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$", var.ingestion_database_ssm_parameter_name))
    error_message = "The ingestion SSM parameter must be a nonempty absolute parameter path with no whitespace; there is no API-secret fallback."
  }
}

variable "sidpol_source_url" {
  type        = string
  default     = ""
  description = "Optional verified direct HTTPS government CSV URL. Empty discovers the current single CSV link from the official catalogue."
}

variable "enable_ingestion_schedule" {
  type        = bool
  default     = false
  description = "Enable only after reviewing deployment and validating the ETL in the target environment."
}

variable "ingestion_schedule_expression" {
  type        = string
  default     = "rate(7 days)"
  description = "EventBridge Scheduler rate or cron expression for the complete official-data ETL."
}

variable "enable_log_archive" {
  type        = bool
  default     = false
  description = "Enables CloudWatch Logs -> Firehose -> S3. Adds usage-based charges."
}

variable "site_domain" {
  type        = string
  default     = ""
  description = "Canonical apex domain, without scheme or path. Empty uses the CloudFront hostname."
  validation {
    condition     = var.site_domain == "" || can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.site_domain))
    error_message = "Use a lowercase DNS name without scheme, path or trailing dot."
  }
}

variable "site_certificate_arn" {
  type        = string
  default     = ""
  description = "Existing issued ACM certificate in us-east-1 covering the apex and www. Terraform does not create or own this certificate."
  validation {
    condition     = var.site_certificate_arn == "" || can(regex("^arn:aws:acm:us-east-1:[0-9]{12}:certificate/[a-f0-9-]+$", var.site_certificate_arn))
    error_message = "CloudFront requires an ACM certificate ARN in us-east-1."
  }
}

variable "enable_cloudflare_proxy" {
  type        = bool
  default     = false
  description = "Require the private Cloudflare header at the edge and use its verified visitor IP."
}

variable "cloudflare_origin_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Private header value set by Cloudflare. Stored in HCP state and edge code; never commit or log it."
  validation {
    condition     = var.cloudflare_origin_token == "" || can(regex("^[A-Za-z0-9_-]{43,128}$", var.cloudflare_origin_token))
    error_message = "Use a cryptographically random 43–128 character base64url token."
  }
}
