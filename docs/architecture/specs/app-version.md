# Running version in the app

A signed-in person reads which build runs from the account menu, while the public health
route says nothing about the build.

> **Feature**: Accounts — [use cases](../diagrams/auth/01-use-case.md)
> **Issue**: #162, #92 · **Related ADRs**: ADR-0010, ADR-0013, ADR-0022
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** The image bakes the version at `docker build` with `--build-arg
  APP_VERSION=$(git describe --tags --always)`: the release tag, else the commit SHA (with
  the distance to the last tag once one exists). The server reads `APP_VERSION`, `dev` when
  unset, and refuses to start on a value outside `[0-9A-Za-z.+_-]` (64 characters at most,
  first character alphanumeric).
- **R2** `GET /health` stays public and answers `{ "status": "ok" }` only (#92).
- **R3** `GET /version` answers `{ "version": "<APP_VERSION>" }` to any signed-in caller and
  401 to anyone else (spec auth R1).
- **R4** The account menu shows `PopCornTV <version>` under its actions; it shows nothing
  when the call fails. The web build ships in the same image as the server (ADR-0013), so
  the menu always names the build that serves it.
- **R5** `make staging-up` and the homelab deploy doc pass the build argument.

## 2. Main scenario

1. The person opens the account menu.
2. The web app calls `GET /version` with the session cookie.
3. The menu shows `PopCornTV v0.3.0` (or a short SHA).

### Extensions

- 2a. The call fails (offline, session ended): the line is omitted; the rest of the menu works.

## 3. Tests

Config parsing (default, valid, refused values), `/health` without a version, `/version`
signed in and anonymous, the web client and the menu (shown, omitted).
