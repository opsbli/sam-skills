# Spec: receipt-gate stdin mode (auto-channel receipt text)

Status: APPROVED (2026-09-14)

## Goal

`scripts/receipt-gate.mjs` gains a stdin input mode so a receipt arriving as raw text (the auto/mailbox channel, US-4 §数据描述) can be validated without writing a temp file.

## Acceptance criteria

- AC1: `node scripts/receipt-gate.mjs --receipt -` reads the receipt text from stdin and validates it exactly as a file input would; a compliant piped receipt exits 0, a non-compliant one exits 1 with the same per-gate report and JSON envelope lines.
- AC2: the file-path mode is unchanged (`--receipt <path>` still works; tests still pass).

## Test seam

CLI behavior of `scripts/receipt-gate.mjs` (child_process spawn with piped stdin), exercised in `scripts/receipt-gate.test.mjs`.

## Non-goals

- No mailbox/mail integration; stdin is the only new input surface.
- No change to gate rules, error codes, or report format.
