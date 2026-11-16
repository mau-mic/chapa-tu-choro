# Optional. Serilog writes structured JSON to Lambda stdout -> CloudWatch Logs.
# CloudWatch subscription -> Amazon Data Firehose -> private S3 log bucket.
# Disabled by default to avoid Firehose and S3 requests/retention charges.

data "aws_iam_policy_document" "firehose_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["firehose.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "firehose" {
  count              = var.enable_log_archive ? 1 : 0
  name               = "chapa-tu-choro-${var.environment}-firehose"
  assume_role_policy = data.aws_iam_policy_document.firehose_assume.json
}

resource "aws_iam_role_policy" "firehose_s3" {
  count = var.enable_log_archive ? 1 : 0
  name  = "put-log-archive"
  role  = aws_iam_role.firehose[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation", "s3:ListBucketMultipartUploads"], Resource = aws_s3_bucket.logs.arn },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"], Resource = "${aws_s3_bucket.logs.arn}/*" }
    ]
  })
}

resource "aws_kinesis_firehose_delivery_stream" "api_logs" {
  count       = var.enable_log_archive ? 1 : 0
  name        = "chapa-tu-choro-${var.environment}-api-log-archive"
  destination = "extended_s3"
  extended_s3_configuration {
    role_arn            = aws_iam_role.firehose[0].arn
    bucket_arn          = aws_s3_bucket.logs.arn
    buffering_size      = 5
    buffering_interval  = 300
    compression_format  = "GZIP"
    prefix              = "api/"
    error_output_prefix = "errors/"
    processing_configuration {
      enabled = true
      processors { type = "Decompression" }
    }
  }
  depends_on = [aws_iam_role_policy.firehose_s3]
}

data "aws_iam_policy_document" "cloudwatch_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cloudwatch_subscription" {
  count              = var.enable_log_archive ? 1 : 0
  name               = "chapa-tu-choro-${var.environment}-logs-subscription"
  assume_role_policy = data.aws_iam_policy_document.cloudwatch_assume.json
}

resource "aws_iam_role_policy" "cloudwatch_firehose" {
  count = var.enable_log_archive ? 1 : 0
  name  = "put-to-firehose"
  role  = aws_iam_role.cloudwatch_subscription[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["firehose:PutRecord", "firehose:PutRecordBatch"]
      Resource = aws_kinesis_firehose_delivery_stream.api_logs[0].arn
    }]
  })
}

resource "aws_cloudwatch_log_subscription_filter" "api_to_s3" {
  count           = var.enable_log_archive ? 1 : 0
  name            = "api-log-archive-to-s3"
  log_group_name  = aws_cloudwatch_log_group.api.name
  filter_pattern  = ""
  destination_arn = aws_kinesis_firehose_delivery_stream.api_logs[0].arn
  role_arn        = aws_iam_role.cloudwatch_subscription[0].arn
  depends_on      = [aws_iam_role_policy.cloudwatch_firehose]
}

resource "aws_cloudwatch_log_subscription_filter" "ingestion_to_s3" {
  count           = var.enable_log_archive ? 1 : 0
  name            = "ingestion-log-archive-to-s3"
  log_group_name  = aws_cloudwatch_log_group.ingestion.name
  filter_pattern  = ""
  destination_arn = aws_kinesis_firehose_delivery_stream.api_logs[0].arn
  role_arn        = aws_iam_role.cloudwatch_subscription[0].arn
  depends_on      = [aws_iam_role_policy.cloudwatch_firehose]
}
