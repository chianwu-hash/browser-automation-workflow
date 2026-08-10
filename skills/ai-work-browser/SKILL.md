---
name: ai-work-browser
description: Open, reuse, and validate the shared AI work browser for browser-based AI workflows. Use when the user says "開啟 AI 工作瀏覽器", "開啟AI工作瀏覽器", "AI 工作瀏覽器", "工作瀏覽器", "ChatGPT 工作瀏覽器", or "Gemini 工作瀏覽器", and when another skill needs an already logged-in browser session. Defaults to port 9232 and preserves the same persistent work-browser state so the user does not need to keep logging in again.
---

# AI Work Browser

Use this skill to open or reuse the same AI-operated browser environment before running browser-based workflows.

The user-facing promise is simple: reopen the same work browser, preserve login state when possible, and avoid taking over the user's everyday browser.

## Quickstart

1. If `ai-browser-launch` is available, use it as the preferred launcher:

```powershell
ai-browser-launch
ai-browser-launch https://chatgpt.com/
ai-browser-launch -Status
```

2. Use `http://127.0.0.1:9232` as the default CDP URL for downstream workflows.
3. Pass the CDP URL explicitly when a workflow supports it:

```powershell
npm run chatgpt:image-batch -- --cdp-url http://127.0.0.1:9232 --prompt-file <file> --output-dir <out>
```

4. If `ai-browser-launch` is not available, use this repo's browser setup entry point from the workflow repo:

```powershell
npm run browser:init -- --app chatgpt --browser chrome --port 9232 --yes
npm run browser:status -- --ports 9232
```

## Core Rules

- Reuse an existing AI work browser when available instead of creating a new empty browser profile.
- Do not use the user's everyday Chrome unless the user explicitly asks for that browser.
- Do not automate login, password entry, PIN entry, one-time codes, account recovery, payment, or identity verification.
- When login is required or has expired, open the site and ask the user to log in manually.
- Before upload, form submission, email sending, deletion, import, account changes, publication, or any write to live data, stop and ask the user to confirm.
- Do not read, print, save, or commit cookies, session files, passwords, tokens, profile contents, or sensitive screenshots.
- Avoid explaining CDP ports, browser profiles, Playwright, or session files to non-technical users unless they ask for troubleshooting details.

## User Communication

When the user asks to open the AI work browser, respond in plain language:

```text
我會開啟同一個 AI 工作瀏覽器，盡量沿用之前的登入狀態。若網站要求重新登入，我會停下來讓你自己登入。
```

After the browser is ready:

```text
AI 工作瀏覽器已開啟，可以開始使用。
```

If login is required:

```text
這個網站需要重新登入。我已經開到登入頁，請你自行完成登入；完成後告訴我「我登入好了」。
```

## Downstream Skill Handoff

When another skill such as `chatgpt-image-batch` or `gemini-image-workflow` needs a browser session:

1. Open or validate the AI work browser first.
2. Use `http://127.0.0.1:9232` unless local configuration says otherwise.
3. Pass `--cdp-url http://127.0.0.1:9232` to workflow commands that accept it.
4. Keep the workflow-specific skill responsible for the task itself; this skill only owns the browser entry point and safety boundary.

## Troubleshooting

- If port 9232 is occupied by the wrong browser profile, stop and report the conflict. Do not silently switch to another port.
- If the expected login state is missing, ask the user to log in manually rather than creating another profile.
- If a repo or older skill still mentions port 9222, treat it as an older example unless the current machine configuration explicitly requires it.
