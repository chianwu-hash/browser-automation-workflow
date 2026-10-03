# 選用分身與占用管理

從 [runtime-location.md](runtime-location.md) 指定的 repo 執行。第一版需要 Node.js 22.13 以上；占用交易使用 Node 內建 SQLite，不需要伺服器。

## 使用者要求啟用

1. 先 `npm run browser:manage -- status`。本機已有共用啟動器時，不用本入口覆蓋本機設定。
2. 若是更新既有 CBS 安裝，初始化時明確傳入原 `--session-file <CBS設定檔>`；只讀取 profile 路徑與端點欄位，保留原設定及資料，不複製 profile。存在多份設定或來源不明時，請使用者確認原設定，不能猜測。
3. `npm run browser:manage -- enable`：註冊一個獨立分身，總容量先為兩個。重複執行不重設現有分身；有工作時拒絕切換。
4. `npm run browser:manage -- acquire --instance 01 --setup --url https://chatgpt.com/`。取得實例、`leaseId`、`cdpUrl`、`targetId` 後才稱已開啟分身。沿用穩定的 `CODEX_THREAD_ID`；其他客戶端需明確傳 `--owner <真實對話識別>`。
5. 斷開自己的連線、釋放占用：`npm run browser:manage -- release --lease-id <id>`，再請使用者手動登入本次需要的網站。分身保持「設定中」，不會被別人自動取得；主瀏覽器仍可使用。Chrome 帳號登入與同步選用，不同步網站登入。
6. 使用者說完成後，`npm run browser:manage -- ready --instance 01`。下一次工作仍須現場確認網站登入與帳號；ready 不是登入驗證。

提示：「分身已開啟。請登入你需要使用的網站，之後會盡量保留登入狀態。若想共用書籤、已儲存的密碼、擴充功能，也可登入 Chrome 並選擇同步項目；這是選用功能。」

需要更多分身且使用者要求時，以 `add` 擴充；最多三個實例，新增的 `02` 也要走設定流程。不要自行擴充容量。

## 一般對話操作

- `acquire [--url <網址>]` 自動分配。單瀏覽器模式仍互斥，不偷偷啟用分身。
- 保存回傳的 `leaseId`、`instance`、`cdpUrl`、`targetId`；同一占用期間再取得時必須帶原 `--lease-id`。已有 target 時不再帶 `--url`，不建立替代分頁。
- 每 60 秒內、每段瀏覽器操作前：`heartbeat --lease-id <id>`。占用期限 15 分鐘。失效即停止，不換分身、不用舊端點。
- 另開 worker 時，初始化閘門必須先 `heartbeat --lease-id <id> --worker-pid <PID>` 登記真實 PID，才允許 CDP 操作。它必須用原對話 owner；不要把 PID 冒充對話 ID。
- 存活且啟動時間相符的 worker 不會被逾時回收；無法確認存活時保守保持占用。工作結束、錯誤、取消或等使用者時，停止及斷開 worker 後在 finally 釋放。
- `busy` 結束碼 2：約 8 秒後重試，簡短說正在等候；不要借用忙碌分身、換端點或新增 profile。
- 固定選擇 `targetId`；分頁不存在或端點 profile 不符時停止，不按網址、順序或前景挑替代分頁。

## 受監督下游流程

```powershell
npm run browser:run -- --workflow chatgpt:image-batch -- --prompt-file <file> --output-dir <out>
npm run browser:run -- --workflow gemini:image-sequence -- --prompt-dir <dir>
```

wrapper 自動取得、開啟專屬分頁、登記 worker 後放行、每 30 秒續約，並在 child 結束後釋放。CLI 端點不可覆寫。不使用穩定對話 ID 的手動執行退回 main 的單瀏覽器模式；一般 `acquire` 缺少 owner 則拒絕，不共用假 ID。

原 `--cdp-url` 與 `--session-file` 流程仍可用，有端點互斥，但沒有跨對話占用保證。並行分身請使用 wrapper；所有其他 CDP 程序也必須配合協定。桌面滑鼠／鍵盤仍需全機序列執行。不同 CDP 端點可並行，同一端點（包括 localhost 別名）不可同時執行工作。

## 停用、更新與故障

- `disable` 立即停止新的分身分配，不殺現有工作、不刪 profile；既有工作完成後自行釋放。
- 重新 `enable` 沿用原 profile 與設定狀態。更新／重裝技能不動使用者資料目錄下的瀏覽器設定。
- 設定預設在 Windows `%LOCALAPPDATA%/ai-work-browser`、其他平台 `~/.local/share/ai-work-browser`，維運可傳 `--root`。不要放進 repo 或同步 profile。
- 既有端點無法證明使用登記的 profile 時拒絕接管。舊版 Chrome 沒有命令列查詢時，Windows 以程序命令列核對；其他平台的舊端點可能需要在使用者授權後由新入口重開，不能猜測。
- Windows 已驗證管理器與無送出 CDP 接線；Linux/macOS 尚未實機驗證，不宣稱跨平台驗收完成。
