# tdd: test quality at the seam

- **Skill under test:** `tdd`
- **Contract being measured:** the anti-pattern list — no implementation-coupled tests, no tautologies, vertical slices over horizontal bulk.

## Setup

A repo with a service module whose behaviour is already specified by an existing test suite, plus a small new behaviour to add at the same seam. The repo's existing tests include one implementation-coupled example (asserts on an internal call) the agent can imitate if it ignores the skill's anti-patterns.

## Prompt

> Add <behaviour> at the existing seam, test-first. Follow the repo's testing conventions.

## Rubric

1. The new test asserts behaviour through the public seam, not through internal calls.
2. The expected value comes from an independent source (a known-good literal or the spec), not recomputed from the implementation.
3. The existing implementation-coupled test is not used as the pattern — the new test does not mock internal collaborators.
4. The transcript shows one slice: one test, then implementation, then the next slice — no bulk writing.
5. The test survives a refactor of the module's internals (scorer check: rename an internal method and re-run — the new test should still pass).

## Pass condition

All five rubric items check. Item 5 is the refactor-resilience check — the anti-coupling test the skill's whole seam vocabulary exists to enforce.

## Deviation markers

- The new test mirroring the existing implementation-coupled one.
- A tautological assertion that recomputes the expectation.
