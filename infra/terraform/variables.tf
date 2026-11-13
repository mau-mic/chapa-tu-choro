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
