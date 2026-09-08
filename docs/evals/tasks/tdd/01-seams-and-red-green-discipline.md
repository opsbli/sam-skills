# tdd: seams and red-green discipline

- **Skill under test:** `tdd`
- **Contract being measured:** test at pre-agreed seams, one red-green slice at a time, behaviour through public interfaces — not implementation details.

## Setup

A repo (or throwaway scaffold) with a small service module and no tests for the behaviour in question. The prompt names the behaviour and the seam, but does not name the skill. The agent has no prior test conventions to lean on in the repo.

## Prompt

> Add the <behaviour> to <module>, testing it at the <seam>. Work test-first.

## Rubric

1. Tests target the named public seam — no private-method tests, no side-channel assertions.
2. The run transcript shows red before green for at least the first cycle (a failing test run before implementation).
3. One slice per cycle: the first implementation pass makes exactly one test pass before the next test is written.
4. No bulk test-writing: the transcript does not show all tests written before any implementation.
5. Test names read as behaviour specifications, not method names.

## Pass condition

All five rubric items check.

## Deviation markers

- Writing implementation first and tests after — the inverted loop.
- Tests coupled to internals (private method names, database state checked directly).
- A seam never agreed with the user — tests appearing at a boundary nobody named.
