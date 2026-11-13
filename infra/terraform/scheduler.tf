data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "chapa-tu-choro-${var.environment}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "invoke-ingestion-lambda"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.ingestion.arn
    }]
  })
}

resource "aws_scheduler_schedule" "weekly_ingestion" {
  name                         = "chapa-tu-choro-${var.environment}-weekly-import"
  schedule_expression          = var.ingestion_schedule_expression
  schedule_expression_timezone = "America/Lima"
  state                        = var.enable_ingestion_schedule ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.ingestion.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ source = "eventbridge-scheduler" })
    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 2
    }
  }
  depends_on = [aws_iam_role_policy.scheduler_invoke]
}

# Scheduler invokes asynchronously; bound Lambda's execution retries as well.
resource "aws_lambda_function_event_invoke_config" "ingestion" {
  function_name                = aws_lambda_function.ingestion.function_name
  maximum_event_age_in_seconds = 3600
  maximum_retry_attempts       = 1
}
