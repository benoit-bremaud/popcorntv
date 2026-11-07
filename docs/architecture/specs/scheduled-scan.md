# UC1 on a schedule — Scheduled library scan

Every library is rescanned on a timer, so files added or replaced by hand appear without a
manual scan.

> **Feature**: Library — [use cases](../diagrams/library/01-use-case.md)
> **Issue**: #132 · **Related ADRs**: ADR-0002, ADR-0003, ADR-0014, ADR-0016
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** `SCAN_INTERVAL_MIN` (default 60, `0` disables) sets the minutes between two runs.
  An invalid value, or one above 35 791 (the longest Node timer, about 24.8 days), falls
  back to 60.
- **R2** A run scans every library one after the other with the same code as `POST
  /libraries/:id/scan` (`scanLibrary`): under the library lock, with the included metadata
  enrichment.
- **R3** A library already scanned or enriched (lock held) is skipped and logged at `info`; a
  failure (root unreadable, probe error) is logged at `warn` and the run goes on.
- **R4** A run never starts while the previous one is still going.
- **R5** The timer starts when the server is ready and stops before it closes; it does not
  keep the process alive.
- **R6** Done when the schedule, the skip and the stop have unit tests and an app test shows
  a file added on disk appearing after a tick.

## 2. Main scenario

1. The timer fires.
2. The system lists the libraries and scans each one (UC1 + UC2 include).
3. New files appear in the catalog; removed ones are pruned (spec library-scan step 8, skipped on 3a, 3b, 4b).
