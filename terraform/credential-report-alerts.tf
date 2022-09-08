terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
  backend "s3" {
    bucket = "terraform-state--appsmith"
    key    = "credential-report-alerts"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = {
      ManagedBy = "Terraform"
    }
  }
}

variable "source_repo" {
  type        = string
  default     = ""
  description = "Link to source code"
}

resource "aws_lambda_function" "credential-report-alerts" {
  function_name    = "credential-report-alerts"
  role             = aws_iam_role.role.arn
  filename         = "../dist-lambda.zip"
  source_code_hash = filebase64sha256("../dist-lambda.zip")
  runtime          = "nodejs16.x"
  handler          = "dist/credential-report-alerts.main"
  timeout          = 15 * 60 // 15 minutes
  environment {
    variables = {
      AWS_SECRET_NAME = data.aws_secretsmanager_secret.secret.name
    }
  }
}

resource "aws_iam_role" "role" {
  name               = "credential-report-alerts"
  assume_role_policy = data.aws_iam_policy_document.role-policy.json
  inline_policy {
    name   = "lambda-execution"
    policy = data.aws_iam_policy_document.credential-report-alerts-policy.json
  }
}

data "aws_iam_policy_document" "credential-report-alerts-policy" {
  statement {
    actions   = ["iam:GenerateCredentialReport", "iam:GetCredentialReport"]
    resources = ["*"]
  }

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [data.aws_secretsmanager_secret.secret.arn]
  }
}

data "aws_iam_policy_document" "role-policy" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"
    principals {
      identifiers = ["lambda.amazonaws.com"]
      type        = "Service"
    }
  }
}

data "aws_secretsmanager_secret" "secret" {
  name = "aws-checks"
}

resource "aws_cloudwatch_event_rule" "everyday" {
  name                = "everyday"
  schedule_expression = "cron(0 0 * * ? *)"
}

resource "aws_cloudwatch_event_target" "target" {
  rule      = aws_cloudwatch_event_rule.everyday.name
  target_id = aws_lambda_function.credential-report-alerts.function_name
  arn       = aws_lambda_function.credential-report-alerts.arn
}

resource "aws_lambda_permission" "cloudwatch-invoke-permission" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.credential-report-alerts.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.everyday.arn
}
