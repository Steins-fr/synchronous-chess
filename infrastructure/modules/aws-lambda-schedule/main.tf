# A rule of EventBridge invoking a function on a schedule, without input. EventBridge invokes it asynchronously: Lambda
# retries a failed invocation twice, a minute then two minutes later
resource "aws_cloudwatch_event_rule" "schedule" {
  name                = "sc-${var.name}-${var.stage}"
  schedule_expression = var.schedule_expression

  tags = {
    Name        = "Schedule - ${var.name}"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

resource "aws_cloudwatch_event_target" "function" {
  rule = aws_cloudwatch_event_rule.schedule.name
  arn  = var.function_arn
}

# The rule of the stage only invokes the function
resource "aws_lambda_permission" "schedule" {
  action        = "lambda:InvokeFunction"
  function_name = var.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule.arn
}
