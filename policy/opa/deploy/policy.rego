package deploy.authz

default allow = false
default deny_reason = "unspecified"

# Core allow rule ensures all guardrails pass
allow {
  input.action == "deploy"
  input.env == "prod"
  commit_verified
  ci_trusted
  checks_pass
  paths_whitelisted
  reviews_satisfied
}

deny_reason := r {
  not commit_verified
  r := "commit not verified"
} else := r {
  not ci_trusted
  r := "untrusted CI context"
} else := r {
  not checks_pass
  r := sprintf(
    "quality checks failed (tests=%v, cov=%0.1f%%/%0.1f%%, lint=%v, sast=%v)",
    [
      input.checks.tests,
      input.checks.coverage * 100,
      input.checks.coverage_min * 100,
      input.checks.lint,
      input.checks.sast,
    ],
  )
} else := r {
  not paths_whitelisted
  r := "changed files outside allowed_paths"
} else := r {
  not reviews_satisfied
  r := "insufficient/incorrect approvals"
}

commit_verified {
  input.commit.verified == true
  startswith(input.commit.signer, "cosign")
}
commit_verified {
  input.commit.verified == true
  endswith(input.commit.signer, ".pub")
}

ci_trusted {
  input.ci.system == input.policy.trusted_ci[_]
  input.ci.runner == input.policy.trusted_runners[_]
  input.ci.workflow == input.policy.trusted_workflows[_]
}

checks_pass {
  input.checks.tests == "pass"
  input.checks.lint == "pass"
  input.checks.sast == "pass"
  input.checks.coverage >= input.checks.coverage_min
}

paths_whitelisted {
  not exists_non_whitelisted_path
}
exists_non_whitelisted_path {
  some p
  p := input.change.paths[_]
  not allowed_prefix(p)
}
allowed_prefix(p) {
  some ap
  ap := input.policy.allowed_paths[_]
  startswith(p, ap)
}

reviews_satisfied {
  input.review.approvals >= input.review.required
  required_roles_satisfied
}

required_roles_satisfied {
  count(required_roles_minus_present) == 0
}

required_roles_minus_present[role] {
  role := input.review.roles[_]
  not role_present(role)
}

role_present(role) {
  some p
  p := input.review.present[_]
  p == role
}
