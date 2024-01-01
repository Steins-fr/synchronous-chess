resource "aws_apigatewayv2_domain_name" "sc_api_gateway_domain" {
  domain_name = var.api_ws_domain_name

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_route53_record" "sc_api_gateway_domain_record" {
  name    = aws_apigatewayv2_domain_name.sc_api_gateway_domain.domain_name
  type    = "A"
  zone_id = var.route_53_zone_id

  alias {
    name                   = aws_apigatewayv2_domain_name.sc_api_gateway_domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.sc_api_gateway_domain.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
