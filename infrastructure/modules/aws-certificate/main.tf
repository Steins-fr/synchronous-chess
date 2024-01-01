resource "aws_acm_certificate" "sc_certificate" {
  provider          = aws.acm
  domain_name       = var.domain_name
  validation_method = "DNS"

  tags = {
    Environment = var.stage
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validate_certificate_record" {
  provider = aws.route53
  for_each = {
    for dvo in aws_acm_certificate.sc_certificate.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 300
  type            = each.value.type
  zone_id         = var.route_53_zone_id
}

resource "aws_acm_certificate_validation" "certificate_validation" {
  provider                = aws.acm
  certificate_arn         = aws_acm_certificate.sc_certificate.arn
  validation_record_fqdns = [for record in aws_route53_record.validate_certificate_record : record.fqdn]
}

#    "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "IntegrationId": "5rlygkc",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_onconnect_staging/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "IntegrationId": "7a6o0eg",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_ondisconnect_staging/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "IntegrationId": "l6cfx30",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_sendmessage_staging/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "IntegrationId": "pqjlq2a",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_sendmessage_staging/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "IntegrationId": "t9cdgc0",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_ondisconnect_staging/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "IntegrationId": "tngjqr2",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_onconnect_staging/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "TimeoutInMillis": 29000
#         },


# {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "Description": "Connect integration",
#             "IntegrationId": "33qlg6p",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_onconnect_dev/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "PayloadFormatVersion": "1.0",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "Description": "Disconnect integration",
#             "IntegrationId": "ghf1o9h",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_ondisconnect_dev/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "PayloadFormatVersion": "1.0",
#             "TimeoutInMillis": 29000
#         },
#         {
#             "ConnectionType": "INTERNET",
#             "ContentHandlingStrategy": "CONVERT_TO_TEXT",
#             "Description": "Send message integration",
#             "IntegrationId": "z781kq6",
#             "IntegrationMethod": "POST",
#             "IntegrationType": "AWS_PROXY",
#             "IntegrationUri": "arn:aws:apigateway:eu-west-1:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:404273159415:function:sc_sendmessage_dev/invocations",
#             "PassthroughBehavior": "WHEN_NO_MATCH",
#             "PayloadFormatVersion": "1.0",
#             "TimeoutInMillis": 29000
#         }
