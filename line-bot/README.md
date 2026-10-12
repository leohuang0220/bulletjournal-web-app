# 果果日記 LINE 小助手

在 LINE 傳文字或照片給「果果日記」官方帳號，就會自動記帳、分類，也能查詢與記錄餵奶尿布。資料直接寫進果果日記（Firebase `guoguo-diary`），App 即時同步。

程式跑在 Google Apps Script（免費，用你自己的 Google 帳號），不用架伺服器。

## 安裝（一次，約 10 分鐘）

請用**建立 Firebase 專案的那個 Google 帳號**操作。

1. 開 https://script.google.com → 「新專案」，左上角把名稱改成「果果日記小助手」。
2. 把 `Code.gs` 全部內容貼進編輯器（取代原本的 `function myFunction`），按儲存。
3. 左邊齒輪「專案設定」→ 勾選「在編輯器中顯示『appsscript.json』資訊清單檔案」。回到編輯器，打開 `appsscript.json`，用本資料夾的 `appsscript.json` 整段取代，儲存。
4. 同一個「專案設定」頁往下 →「指令碼屬性」→ 新增：
   - 屬性 `LINE_TOKEN`，值：LINE Developers → 果果日記 → Messaging API → Channel access token（跟 GitHub Secrets 裡的同一串）。
5. 回到編輯器，上方函式選單選「測試連線」→ 按「執行」→ 依畫面授權（出現「Google 尚未驗證這個應用程式」時按「進階」→「前往果果日記小助手」）。下方記錄出現「Firebase 連線成功」「LINE 連線成功」就對了。
6. 右上「部署」→「新增部署作業」→ 齒輪選「網頁應用程式」→ 執行身分「我」、誰可以存取「所有人」→ 部署 → 複製「網頁應用程式網址」（`https://script.google.com/macros/s/…/exec`）。
7. LINE Developers → 果果日記 → Messaging API：
   - Webhook URL 貼上第 6 步的網址 → Update → Verify（顯示 Success）。
   - 打開「Use webhook」。
   - LINE Official Account Manager →「回應設定」：聊天關閉、Webhook 開啟、自動回應訊息關閉。
8. 果果日記 App →「設定 → LINE 小助手」→「產生綁定碼」，在 LINE 傳「綁定 123456」。太太也用同一組碼綁一次。

## 之後改版

貼上新的 `Code.gs` 後：「部署」→「管理部署作業」→ 鉛筆 → 版本選「新版本」→ 部署。網址不變，LINE 不用改。

## 常見問題

- **LINE 沒反應**：Apps Script 左邊「執行作業」看最近的錯誤。最常見是第 7 步沒打開 Use webhook，或 Manager 的聊天模式還開著。
- **Firestore 403 / SERVICE_DISABLED**：代表登入的 Google 帳號不是 Firebase 專案擁有者。改用服務帳戶：在指令碼屬性新增 `FIREBASE_SA`，值為 Firebase → 專案設定 → 服務帳戶 → 產生新的私密金鑰的整段 JSON。
- **照片、口語句子看不懂**：AI 用的是 App「設定 → AI 設定」裡的 Gemini 金鑰。沒有金鑰時只能用簡單格式（「尿布 699」「配方奶 120」「尿尿」）。
- **費用**：Apps Script、Gemini 免費額度、LINE 回覆訊息都免費；回覆超過約 1 分鐘才改用推播，會算進每月 200 則。
