# Bootstrap

What the stages share, and what the Terraform workflows cannot create for themselves, since they assume a role it
creates. Applied by hand with an admin profile, once, before any stage, and again after each change.

- **The trust of AWS in GitHub Actions**: the OIDC provider of `token.actions.githubusercontent.com`.
- **A deploy role per stage the workflows deploy**: `sc-github-deploy-staging` and `sc-github-deploy-production`.
  - Each is assumed by the jobs of `terraform-plan.yml` and `terraform-apply.yml` that reference the GitHub
    environment of its stage.
  - Its trust checks the environment, the branch, and the IDs of the repository and of its owner. Staging deploys
    from any branch, production from `main` only.
  - Each reaches the resources of its stage only (`modules/stage-deploy-role/deploy-policy.tf`).
  - Staging, restricted to its owner (`restricted_stages`), gets a fourth policy, `access`: the read of its login
    (Cognito), the key group of its signed cookies and the authorizers of its APIs. Production gets none of it.
  - Production, which wakes its database on a schedule (`wake_stages`), gets another policy, `wake`: the rule of
    EventBridge invoking the function waking it. Staging gets none of it.
- **The boundary of the roles of the lambdas of each stage**: `sc-lambda-boundary-<stage>` (`lambda-boundary.tf`).
  - It is the most a role of a lambda can do, whatever policy is attached to it.
  - A deploy role creates those roles with the boundary of its stage only, and attaches to them only the policies
    `main.tf` attaches.
  - On production only, it lets the function waking the database read its capacity in CloudWatch
    (`cloudwatch:GetMetricData`).
- **The account of API Gateway**: the role the WebSocket stages write their execution logs with. There is one per
  account and region, which each stage would otherwise create again.
- **The login of each stage restricted to its owner** (`module.access_login`): the user pool `sc-access-staging` of
  Cognito, its managed login `synchronous-chess-staging` and its app client.
  - The stage reads them, and never writes them: its owner, created once, outlives the destruction of the stage.
  - The pool is protected from deletion.

Its state is `bootstrap/terraform.tfstate` in the bucket of the states, out of reach of the deploy roles.

## Prerequisites

- Terraform 1.16, from 1.16.4 (the workflows run 1.16.4).
- AWS CLI v2 with the SSO profile `admin`.
- `gh`, logged in with admin rights on the repository.

## Checks before the first apply

```bash
aws sso login --profile admin && export AWS_PROFILE=admin
aws sts get-caller-identity --query Account --output text   # 404273159415
aws s3api get-bucket-versioning --bucket synchronous-chess-terraform
aws s3api get-bucket-encryption --bucket synchronous-chess-terraform
aws s3 ls s3://synchronous-chess-terraform/ --recursive
aws iam list-open-id-connect-providers
aws iam get-role --role-name api_gateway_cloudwatch_global
```

- **Bucket versioning.** Turn it on if it is off, so that a state can be recovered:
  `aws s3api put-bucket-versioning --bucket synchronous-chess-terraform --versioning-configuration Status=Enabled`.
- **Encryption of the bucket.** SSE-S3 or the AWS managed key `aws/s3` needs nothing. A customer managed key needs
  `kms:Decrypt` and `kms:GenerateDataKey` on it for each deploy role, in a statement of their own in the `edge` document
  of `modules/stage-deploy-role/deploy-policy.tf`.
- **A state of a stage already there.** If `aws s3 ls` lists `staging/terraform.tfstate` or
  `production/terraform.tfstate`, read it (`aws s3 cp s3://synchronous-chess-terraform/<stage>/terraform.tfstate -`),
  then delete it before the first run of that stage, once its resources are gone: the deploy role has no rights on
  resources of another time.
- **Leftovers of a stage.** A first apply fails on the names they take, and a deploy role can neither import them nor
  delete them. Delete them, or import them locally into the state of the stage:
  - roles, policies, functions and log groups named after the stage, especially a role `sc_lambda_*_<stage>`
    without boundary, which a deploy role could pass to a function;
  - the bucket `sc-<stage>.<domain>`, the API domains, the parameters `/sc/<stage>/` and the DNS records;
  - on staging, the key group `sc-access-staging` of CloudFront, with its public keys `sc-access-staging-*`. Not the parameter `/sc/staging/access-signing-key`, which its owner
    writes outside Terraform.
- **Certificates and distributions without an `Environment` tag.** Tag or delete the ACM certificates (eu-west-1 and
  us-east-1) and the CloudFront distributions that have none. A deploy role tags a new one with its stage, and could
  take an untagged one the same way.

## Apply

```bash
cd infrastructure/bootstrap
terraform init
# Only if the role api_gateway_cloudwatch_global already exists:
terraform import module.api_gateway_account.aws_iam_role.cloudwatch api_gateway_cloudwatch_global
terraform import module.api_gateway_account.aws_iam_role_policy.cloudwatch api_gateway_cloudwatch_global:default
terraform plan -out=tfplan
terraform apply tfplan
terraform output deploy_role_arns
terraform output access_user_pool_ids
```

Access Analyzer flags the condition keys an action does not support. Run it on each policy of the deploy roles
(`sc-github-deploy-<stage>-{edge,api,data}`, `sc-github-deploy-staging-access` and `sc-github-deploy-production-wake`)
and on each boundary:

```bash
arn=arn:aws:iam::404273159415:policy/sc-github-deploy-staging-edge
version=$(aws iam get-policy --policy-arn "$arn" --query Policy.DefaultVersionId --output text)
aws iam get-policy-version --policy-arn "$arn" --version-id "$version" --query PolicyVersion.Document --output json > policy.json
aws accessanalyzer validate-policy --policy-type IDENTITY_POLICY --policy-document file://policy.json
```

## GitHub settings

The environments must exist before any run of the workflows: GitHub creates a missing one on its first use, without
protection.

```bash
# Staging: any branch
gh api -X PUT repos/Steins-fr/synchronous-chess/environments/staging --input - <<<'{"deployment_branch_policy":null}'
# Production: main only, approved by Steins-fr, who may approve his own runs
gh api -X PUT repos/Steins-fr/synchronous-chess/environments/production --input - \
  <<<'{"reviewers":[{"type":"User","id":36641258}],"prevent_self_review":false,"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X POST repos/Steins-fr/synchronous-chess/environments/production/deployment-branch-policies -f name=main -f type=branch

gh secret set AWS_ROLE_ARN --env staging    --body "arn:aws:iam::404273159415:role/sc-github-deploy-staging"
gh secret set AWS_ROLE_ARN --env production --body "arn:aws:iam::404273159415:role/sc-github-deploy-production"
gh variable set TF_STATE_BUCKET  --body synchronous-chess-terraform
gh variable set MAIN_DOMAIN_NAME --body steins.fr
```

The variable `ACCESS_PUBLIC_KEY` of the staging environment comes with the key of the access cookies: the root README
(Access to staging).

A rename or a transfer of the repository switches the subject of its tokens to the immutable format
(`repo:Steins-fr@36641258/synchronous-chess@206330696:...`). The `sub` conditions of the trusts must then be updated:
`gh api repos/Steins-fr/synchronous-chess/actions/oidc/customization/sub` shows the prefix.

## A denied action in a run of the CI

1. **Read the denied action and resource.** Terraform prints
   `... assumed-role/sc-github-deploy-<stage>/GitHubActions is not authorized to perform: <action> on resource: <arn>`.
   - For EC2, decode the message: `aws sts decode-authorization-message --encoded-message ...`.
   - Otherwise, look in the CloudTrail event history, by the user name `GitHubActions`.
2. **Widen the narrowest statement** of `modules/stage-deploy-role/deploy-policy.tf`, scoped to the stage where IAM
   allows it. A new `"*"` is said why.
   - A managed policy holds 6,144 characters at most: IAM refuses a larger one at apply. Move statements between
     `edge`, `api` and `data` (`access` holds the rights of a restricted stage only, `wake` those of a stage waking its
     database).
3. **Apply bootstrap again**, then plan again: an apply stopped halfway makes its saved plan stale.
4. **A run killed during an apply leaves its lock** `<stage>/terraform.tfstate.tflock`. Run `terraform force-unlock <ID>`
   locally, and only once no run is active.

An `AccessDenied` in the logs of a lambda, rather than in Terraform, means the boundary is too tight: widen
`lambda-boundary.tf`.

## What a deploy role still reaches outside its stage

- **The origin access controls of CloudFront.** They take no tag and no condition key.
- **The public keys and key groups of CloudFront**, for staging. They take no tag and have no resource type. A key
  group lets a distribution trusting it check signed cookies: it opens none.
- **The log deliveries and the resource policy of the logs of the account.** The HTTP APIs of every stage set up
  their access logs through them.
- **The creation of a custom domain of API Gateway.** It takes no condition key, but needs a certificate of its name,
  and ACM issues the role certificates for the names of its stage only.
- **Roles of the lambdas outside the state.** A deploy role can create roles `sc_lambda_*_<stage>` with any trust,
  outside any state. They still carry the boundary of the stage.
- **Describe and List calls**, which read metadata only.

The secret of the master user of a cluster holds no stage in its name (`rds!cluster-<uuid>`). RDS tags it with the ARN
of its cluster (`aws:rds:primaryDBClusterArn`), a key no one can set: the roles of the lambdas read, and the deploy role
tags, the secret of the cluster of their stage only (`DatabaseSecret` of `lambda-boundary.tf` and of
`modules/stage-deploy-role/deploy-policy.tf`).

Inherent to deploying staging from any branch: anyone with write access to the repository runs code with the rights
of staging. The deploy role of staging is denied the key signing its access cookies (`KeepAccessSigningKey`), but such
code could deploy a lambda of staging with the policy reading it, and sign cookies.

`main` requires no review, so the approval of the production environment is the only human check before production.
Read the summary of the plan run before approving its apply.

## Never destroy it while a stage exists

- The roles of the lambdas carry their boundary.
- The WebSocket stages log through the account of API Gateway.
- The workflows assume the deploy roles.
- The restricted stages read their user pool, which holds their owner. Turn its deletion protection off by hand first.
