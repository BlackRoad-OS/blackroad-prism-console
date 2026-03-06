package deploy.authz

import data.deploy.authz

base := {
  "action": "deploy",
  "env": "prod",
  "commit": {"sha": "abc", "verified": true, "signer": "cosign.key"},
  "ci": {"system": "github_actions", "runner": "org/self-hosted-prod", "workflow": "deploy.yml"},
  "checks": {"tests": "pass", "coverage": 0.86, "coverage_min": 0.80, "lint": "pass", "sast": "pass"},
  "review": {"approvals": 2, "required": 2, "roles": ["owner", "security"], "present": ["owner", "security"]},
  "change": {"paths": ["services/payments/api/handler.go"]},
  "policy": {
    "allowed_paths": ["services/payments/", "infra/k8s/"],
    "trusted_runners": ["org/self-hosted-prod"],
    "trusted_workflows": ["deploy.yml"],
    "trusted_ci": ["github_actions"],
  },
  "timestamp": "2025-10-30T12:34:56Z",
  "actor": {"id": "U123", "name": "Alexa Amundson"},
}

test_allow_happy_path {
  input := base
  authz.allow with input as input
}

test_deny_unverified_commit {
  bad := base with base.commit.verified as false
  not authz.allow with input as bad
  authz.deny_reason with input as bad == "commit not verified"
}

test_deny_untrusted_ci {
  bad := base with base.ci.runner as "public/runner"
  not authz.allow with input as bad
  authz.deny_reason with input as bad == "untrusted CI context"
}

test_deny_quality_checks {
  bad := base with base.checks.tests as "fail"
  not authz.allow with input as bad
  authz.deny_reason with input as bad == "quality checks failed (tests=fail, cov=86.0%/80.0%, lint=pass, sast=pass)"
}

test_deny_path_whitelist {
  bad := base with base.change.paths as ["scripts/hack.sh"]
  not authz.allow with input as bad
  authz.deny_reason with input as bad == "changed files outside allowed_paths"
}

test_deny_reviews {
  bad := base with base.review.approvals as 1
  not authz.allow with input as bad
  authz.deny_reason with input as bad == "insufficient/incorrect approvals"
}

test_role_presence_required {
  bad := base with base.review.present as ["owner"]
  not authz.allow with input as bad
  authz.deny_reason with input as bad == "insufficient/incorrect approvals"
}
