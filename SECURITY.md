# Security policy

## Supported versions

Only the latest commit on `main` (and the `latest` container image built from it) receives
security fixes. There are no maintained release branches.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub's vulnerability reporting form:
<https://github.com/davin-young/trivia-pig/security/advisories/new>
(the repository's **Security** tab, then **Report a vulnerability**). Include what you
found, how to reproduce it, and what an attacker could do with it.

Disclosure timeline:

- Acknowledgement within 7 days of your report.
- A fix or a mitigation plan within 30 days for confirmed vulnerabilities.
- Coordinated public disclosure once a fix is released, or 90 days after the report,
  whichever comes first. You are credited in the advisory unless you ask not to be.

## Scope

In scope: the application in this repository (the Next.js app, the Socket.IO game server,
the container image) and the deployment files under `deploy/`.

Out of scope: problems that require an already-compromised host or administrator account,
and denial of service through sheer request volume against a self-hosted instance.

## How this repository is kept in check

- Dependencies and pinned GitHub Actions and base images are updated by Dependabot.
- CodeQL scans every push and pull request.
- The container runs as an unprivileged user from a digest-pinned base image.
- Parsers for untrusted input are covered by property-based (fuzz) tests in `src/shared/fuzz.test.ts`.
- Accepted scanner exceptions are listed, with reasons, in `.trivyignore.yaml`.
