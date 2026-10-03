---
name: ai-work-browser
description: Open and reuse a persistent AI work browser, preserve site login state, and optionally enable independent browser clones with automatic per-conversation allocation. Use for AI 工作瀏覽器, 工作瀏覽器分身, ChatGPT or Gemini work-browser tasks, and workflows needing a logged-in browser session.
---

# AI 工作瀏覽器

預設沿用一個持久工作瀏覽器，不接管使用者日常 Chrome。只有使用者要求「我想要使用 AI 工作瀏覽器分身」時才啟用分身；啟用後自動安排空閒實例，不要求使用者選擇。

## 入口

先讀 [執行程式位置](references/runtime-location.md)，確認本機共用啟動器或安裝來源。

- 本機已有 `ai-browser-launch`：遵守本機占用設定，以 `ai-browser-launch -Acquire -Json` 取得並保存端點、占用與精確分頁。不能只執行手動啟動命令或固定猜 9232。既有固定端點流程按本機規則明確取得。
- 沒有共用啟動器：從安裝來源 repo 使用 `npm run browser:manage -- acquire --url <工作網址>`。首次會初始化單一瀏覽器。更新既有 CBS 安裝時，先以 `init --session-file <原設定檔>` 採用原 profile；不能直接建立新 profile 冒充原登入狀態。
- 一般下游工作優先使用 `npm run browser:run -- --workflow <工作流程> -- <工作參數>`，自動取得、續約與釋放。此命令只適用公開管理器；不要拿它繞過本機共用啟動器。
- 要啟用／停用分身、處理忙碌、占用生命週期或自行操作 CDP，先讀 [分身與占用管理](references/clones.md)。回傳 busy 時等待，不借用其他實例。

同一占用期間固定使用回傳的端點與精確 target；分頁不存在、占用失效或 profile 不符就停止，不依網址、前景或順序接管替代分頁。

## 界線

- 各分身各自保留網站登入。Chrome 帳號登入與同步選用，可共用選定書籤、密碼、擴充功能等，但不共用網站登入工作階段；不複製或同步 profile 檔案。
- 不輸入密碼、PIN、驗證碼或操作身分驗證。需要登入時開啟該網站，停止自己的自動化、釋放占用，讓使用者手動登入；分身設定中須保留設定狀態，不能供其他對話取得。
- 上傳、提交、寄信、刪除、匯入、變更帳號、發布或正式資料寫入需要使用者授權；已明確授權的範圍不重複確認。多帳號服務先驗證畫面上的實際登入帳號。
- 不讀取、輸出或提交 Cookie、密碼、token、登入工作階段內容、profile 檔案或敏感截圖。CBS 設定遷移只由管理器讀取必要的路徑／端點欄位。
- 不呼叫 `Browser.setDownloadBehavior`、`Page.setDownloadBehavior`，或框架的下載接管設定，包括為事件使用 `eventsEnabled`；持久瀏覽器必須保留原生下載紀錄的點擊開啟功能。沿用網站原生下載與瀏覽器設定，或用已授權的同來源 fetch 取得附件位元組；後者不產生 Chrome 原生下載紀錄。
- 工作完成、錯誤、取消或等使用者時，先斷開自己的自動化並停止 worker，再 finally 釋放占用；不關閉整個瀏覽器，不刪 profile。設定與登入資料放使用者資料目錄，不在 repo／技能目錄。

## 使用者溝通

一般：「我會安排一個空閒的 AI 工作瀏覽器，讓這個對話固定使用它，盡量沿用登入狀態。」

忙碌：「工作瀏覽器目前都在使用中，我會等空位再繼續。」

登入：「這個網站需要你手動登入。我已開到登入頁；完成後告訴我，我會接著處理。」

不要求一般使用者理解 CDP、連接埠或占用憑證。不要在尚未成功啟動時宣稱分身已開啟，也不要把 Chrome 同步當成網站登入證明。
