# Operations Log

This file records dated changes that future AI assistants and maintainers may need to understand before modifying browser automation workflows.

Do not record secrets, cookies, tokens, full session configs, private browser profile data, sensitive screenshot contents, or account credentials.

## 2026-10-13 — 本機 AI 工作瀏覽器禁止擅自帶到前景

### 後續：程式層保護

- 根因：ChatGPT／Gemini 工作階段、公文分文及財管登入腳本含直接前景呼叫；共用引擎透過 `/json/new` 開分頁且冷啟動沒有前景授權 gate。未判定為網站改版。
- 新增 `lib/ai-work-browser/background-policy.js`，攔截 Playwright／Puppeteer 頁面及 CDP session 的前景／視窗操作；背景建頁前確認已有視窗。冷啟動預設拒絕，只有明確 `foreground: true` 才允許。管理器提供 `--foreground`，不從環境變數推導授權。
- 本機共用啟動器與命令入口新增 `-Foreground`；背景開頁使用 `D:/ai-browser/open-background-target.js`。本機保護模組部署於 `D:/ai-browser/background-policy.cjs` 及共用 cdp-safe-client，三份來源以雜湊核對。
- 移除 ChatGPT／Gemini、公文分文、財管登入及公文登入診斷的直接前景操作。下游技能改走 `D:/ai-browser/run-background.cjs`，先登記 worker 再放行，攔截受選端點的 Playwright／Puppeteer、CDP WebSocket 與 HTTP 前景路徑，結束後釋放占用。未修改其他專案舊腳本或歷史副本；透過此入口執行時會拒絕其前景呼叫。
- 實機先發現背景建頁事件接收時序，調整為先監聽事件再建立並核對精確 target；後續 Playwright 截圖逾時，改用有上限的 CDP 檢查，不以切到前景恢復。截圖結果與前景保護分開驗收。

驗證：背景保護測試 6 項、管理器測試 22 項、兩個 repo 的 check、prompt／step smoke、技能驗證、PowerShell 語法／ASCII、冷啟動拒絕 mock。分身01空白頁實機背景點擊、三種前景拒絕、啟動器背景開頁及 Playwright newPage 均保持原頁籤；304 次前景視窗取樣無切換。初次獨立測試截圖 9336 bytes；後續 CDP 截圖逾時未取得位元組，故不宣稱背景截圖普遍可用。下游 runner 實機確認 Playwright、Puppeteer、原生 WebSocket、HTTP 前景拒絕與端點錯配拒絕。未送出生成、公文或財管業務操作。

- 依使用者明確要求，更新 skill-vault 的 `ai-work-browser/SKILL.md`；安裝版 junction 指向同一來源，保留既有未提交修改。
- 將背景操作提升為硬規則，僅使用者明確指定顯示或切到前景才可啟用；移除登入、人工處理及桌面操作的自動例外，補上啟動器／下游腳本檢查與無法背景執行時的停點。
- 修正原生密碼選單桌面操作及登入提示，避免將任務、登入或開啟網址授權解讀為前景授權。
- 本次為本機技能規範更新，未修改公開版技能、啟動器或下游程式，未啟動或操作瀏覽器；不宣稱已有執行階段強制攔截。

驗證：技能格式驗證（Python UTF-8 模式）、修改檔案差異空白檢查，以及來源／安裝版 SHA-256 一致性核對。

## 2026-10-04 — 依網站變動頻率制定診斷與修正流程

- 新增 `docs/browser-recovery.md`，記錄 CDP 優先、頻繁變動 AI 服務及長期穩定系統的不同排查順序；所有腳本變更需有現場證據，避免將逾時直接判為改版。
- 明定定位失敗、分類原因、最小修正、確認接續點、驗證成果及回報的操作程序，沿用 workflow 個別重試限制及已送出請求不得自動重送的規則。
- 區分原始檔取得與 Chrome 原生下載完成，記錄另存視窗、額外工具、人工協助、失敗恢復及總耗時。
- 更新 README、文件入口、AGENTS、CLAUDE、RUNBOOK 與 PROJECT_MEMORY；自動控制權接續維持未實作／未驗證。
- 本次為文件規範更新，沒有改動 runtime、業務腳本、本機設定或安裝版技能；未追蹤的既有下載腳本保留，不納入提交。

驗證：`npm run check`、Git 差異空白檢查及修改文件的相對連結檢查；未執行網站操作或生成新成果。

## 2026-10-03 — 釐清分身啟用時的登入提示

### 後續實作：公開版選用分身

- 新增公開管理器與 `browser:manage`／`browser:run`，預設單一持久瀏覽器，明確啟用才新增一個設定中的分身。沿用 CBS 所解析的 cdp-tools，未修改兩個依賴 repo。
- 設定、占用與端點工作鎖使用 SQLite 原子交易，資料放 repo 外；對話保持占用憑證與精確 target，存活 worker 的 PID／啟動時間保護逾時回收。停用、更新與重啟用不刪 profile。
- 安裝成功後實際顯示簡短啟用提示，並在安裝版參考文件記錄 runtime repo 位置。Chrome 同步選用，網站需手動登入。
- ChatGPT 與 Gemini 共用端點互斥；不同端點可並行，localhost 別名不能繞過同端點鎖。無法解析端點的舊程序保守阻擋。
- 受監督工作登記真正 PID 後才放行，每 30 秒續約，結束後釋放；手動無對話 ID 的工作退回單瀏覽器。新增 CDP 介面不接管下載。

驗證紀錄：管理器自動測試、repo 語法／技能檢查、既有 prompt 與 step smoke；另透過本機共用啟動器取得已登記實例，以唯讀 CDP 核對 profile 與精確 target，完成後釋放。沒有生成圖片、登入、複製 profile 或改動本機路由。Linux/macOS 尚未實機驗收；未提交、推送或發布這次公開版變更。

打包檢查另確認 runtime／技能參考文件完整，並排除 `.chat-mode` 討論紀錄與既有未追蹤的單次下載腳本；該腳本保留原樣。新增 npm 發布檔案清單及 scripts 子目錄的排除規則，沒有實際發布套件。

變更：

- 在公開版 `ai-work-browser` 技能加入分身建立後的登入提示，明確說明 Chrome 帳號登入與同步是選用功能。
- 區分瀏覽器資料同步與網站登入工作階段；分身需各自手動登入所需網站。
- 提示僅在已支援分身的啟動器成功建立分身後使用。本次只修改文件，未將本機分配器移植到公開 repo，也未新增安裝完成提醒或發布。

驗證：檢查技能差異，執行 repo 檢查與技能格式驗證；未操作瀏覽器或登入帳號。

## 2026-09-30 — Verify image mode and isolate ChatGPT image batches

Changed:

- Made the verified `製作圖像` action the default, and reselect it before each batch prompt because the chip disappears after a response.
- Stopped a batch immediately when a round reports image-generation failure, retaining the partial result.
- Added a shared-browser lease and a preflight check for already-running ChatGPT image jobs.
- Rejected images when the latest user message no longer matches the accepted prompt. A URL change alone is allowed because ChatGPT may assign a permanent conversation URL after send.
- Updated the skill, failure policy, output contract, and escalation guidance.

Validation:

- `npm run check`, `npm run smoke:prompt-construction`, and `npm run smoke:step-verification` passed.
- The no-send Images action check passed three consecutive trials.
- A live image generated from the accepted yellow-star prompt was downloaded without resubmitting and visually matched the prompt.
- A competing local ChatGPT workflow was detected and rejected before browser navigation.

## 2026-09-30 — Support assistant image file cards in ChatGPT

Changed:

- Probed the current ChatGPT composer without submitting a prompt, then ran one authorized image request.
- Confirmed a valid 1024×1024 PNG was available from an assistant file card despite a visible image-generation failure message.
- Added file-card detection and verified browser download alongside the existing image-node route.
- Recorded the mixed UI state in round checks and removed a school-specific tone from generic follow-up prompts.
- Updated the bundled skill and output/failure guidance for the observed page.

Validation:

- `npm run check`
- `npm run smoke:prompt-construction`
- Downloaded and validated the existing file card through the updated detection and download functions without sending another prompt.

## 2026-09-30 — Align browser setup docs and protect linked skill installs

Changed:

- Updated the portable browser examples to the repo's current port `9232` and corrected npm argument forwarding.
- Documented checks for the active browser's download location, download behavior, and extension availability.
- Made the force skill installer reject symlink and Windows junction destinations, preserving skill-vault links.
- Kept machine-specific profile paths and routing outside the repository.

Validation:

- `npm run check`
- Confirmed a forced update of the linked installed skill stops with a clear error and leaves the junction intact.

## 2026-08-12 — Remove product-specific prompt injection from the generic ChatGPT runner

Changed:

- Removed the hard-coded AI administrative workbench deck block from `lib/chatgpt/image-batch.js`.
- Removed hard-coded Dingxi mascot size, anatomy, and crest-corner rules from the generic runner.
- Generalized sequence wording from slides/presentations to images/items.
- Kept only orchestration instructions required to request one new standalone image per round.
- Updated workflow docs and the bundled ChatGPT skill contract to make prompt files authoritative for brand and layout rules.

Reason:

- LINE cards, posters, formal decks, and mascot-led visuals require different prominence and layout rules.
- The generic runner previously forced formal-deck and fixed-corner assumptions into unrelated image tasks.

Validation:

- `npm run check`
- `npm run smoke:prompt-construction`
- Prompt-construction assertions confirm no Dingxi, AI-workbench, fixed-percentage, or fixed-corner text is injected.

## 2026-08-12 — Add step-level verification to image workflows

Changed:

- Added prompt-fill and verified-send checks to ChatGPT and Gemini workflows.
- Send acceptance now requires composer clearance plus a matching new user message.
- Added early browser-health and unsent-prompt checks during generation waits.
- Added a separate 30-second generation-start deadline and rejection detection before long completion waits.
- Added output image signature and byte-count validation.
- Added failed-run metadata and a local success/failure regression smoke test.
- Updated both installed-skill contracts and failure policies.
- Added at-most-two recovery retries followed by one structured Codex CLI escalation; unresolved escalation fails closed.
- Added `@openai/codex` as a repo development dependency because the Microsoft Store app binary is not directly executable from PowerShell on this machine.
- Windows CLI escalation uses `danger-full-access` after a verified `workspace-write` sandbox-helper initialization failure; it remains a single attempt and must return structured artifact verification.
- Added ChatGPT's observed `正在產生更細緻的圖片` progress wording to generation-start detection after a live false negative at 76% progress.
- Strengthened Codex CLI escalation after reviewing a timed-out live event log: the CLI found useful `data-turn` selector drift and began a rerun, but spent too much time on broad document reads and unrelated MCP startup warnings.
- Escalation now receives an attached browser screenshot plus structured DOM snapshot, ignores user MCP configuration, classifies the failure within 60 seconds, and prioritizes one clean fresh-chat image-mode rerun for healthy transient model failures.

Reason:

- A live ChatGPT run left the prompt in the composer while the runner waited nearly seven minutes for an image.
- Each inexpensive step check should fail close to the real cause instead of consuming the full downstream timeout.

Validation:

- `npm run check`
- `npm run smoke:step-verification`

## 2026-08-08 — Add repo-local AI memory layer

Changed:

- Added `AGENTS.md` and `CLAUDE.md`.
- Added `docs/PROJECT_MEMORY.md`.
- Added `docs/RUNBOOK.md`.
- Added this operations log.

Reason:

- `browser-automation-workflow` is reusable browser/CDP automation infrastructure used across ChatGPT, Gemini, and future AI browser workflows.
- Future AI sessions need clear boundaries around logged-in browser state, prompt encoding, CDP setup, UI drift, evidence artifacts, and smoke-test validation.

Validation:

- Docs-only change.
- No browser automation was run.
- No browser profile, cookie, session config, screenshot, or generated artifact was read or copied into memory docs.

Next-time warnings:

- Read the workflow skill and reference files before changing ChatGPT or Gemini behavior.
- Do not claim success from console text alone; validate artifacts and metadata.
- Do not store logged-in browser state or sensitive screenshots in memory.
