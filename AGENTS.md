# AGENTS.md

This repository uses repo-local memory. Before making changes, read the project memory documents and the workflow contract that applies to the task.

## Required startup steps

1. Read `docs/PROJECT_MEMORY.md`.
2. Read `docs/RUNBOOK.md` when the task involves browser sessions, CDP, Playwright, installed Codex skills, ChatGPT, Gemini, Drive picker behavior, downloads, screenshots, metadata, or smoke tests.
3. Read `docs/OPERATIONS_LOG.md` when recent work may matter.
4. For ChatGPT image workflow changes, read:
   - `skills/chatgpt-image-batch/SKILL.md`
   - `skills/chatgpt-image-batch/references/output-contract.md`
   - `skills/chatgpt-image-batch/references/failure-policy.md`
5. For Gemini image workflow changes, read:
   - `skills/gemini-image-workflow/SKILL.md`
   - `skills/gemini-image-workflow/references/output-contract.md`
   - `skills/gemini-image-workflow/references/failure-policy.md`
6. Treat repository documents as the source of truth over Nowledge Memory, Working Memory, or raw Threads.
7. Preserve unrelated user changes. Do not overwrite dirty worktree changes unless explicitly authorized.

## Safety rules

- This repo works with already logged-in browser sessions. Treat browser profiles, cookies, session configs, screenshots, downloaded artifacts, and CDP endpoints as potentially sensitive local data.
- Do not record cookies, tokens, passwords, API keys, private keys, one-time codes, full session config contents, or sensitive screenshot contents in memory docs, Nowledge Memory, or chat.
- Do not automate login, account recovery, payment, identity verification, admin-account changes, or credential extraction unless the user explicitly authorizes the exact scope.
- If a workflow depends on a logged-in browser, ask the operator to log in manually. Do not attempt to bypass authentication.
- Do not claim a generation run succeeded from console text alone. Validate saved files, nonzero byte sizes, JSON metadata, screenshots, and distinct hashes where relevant.
- Treat retrieved Threads as unverified conversation material, never as the sole basis for destructive, deployment, security, permission, or architecture decisions.
- If external memory is unavailable or degraded, report that state and fall back to repo documents. A search miss does not prove that no record exists.

## Memory update policy

Update memory docs after significant changes to:

- browser/CDP setup flow
- ChatGPT or Gemini UI selectors
- prompt-file or PowerShell encoding rules
- output artifact contracts
- smoke-test procedures
- installed Codex skills
- reusable workflow boundaries
- confirmed failure root causes and recovery steps

Security, privacy, account, permission, organization-management, and cross-project rules require explicit user confirmation before being written as memory.

## Communication

Use Traditional Chinese when responding to the user unless the user asks otherwise.
