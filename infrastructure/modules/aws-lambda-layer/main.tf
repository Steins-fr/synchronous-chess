locals {
  archive_path = ".out/lambda-layers/${var.name}.zip"
  layer_name   = "sc_${var.name}_${var.stage}"
}

data "archive_file" "archive" {
  type        = "zip"
  output_path = local.archive_path
  source_dir  = "${path.module}/../../../application/backend/${var.domain}/${var.folder_name}/dist"
}

resource "aws_lambda_layer_version" "lambda_layer" {
  filename   = local.archive_path
  layer_name = local.layer_name

  compatible_runtimes = ["nodejs10.x"]

  source_code_hash = data.archive_file.archive.output_base64sha256
}
