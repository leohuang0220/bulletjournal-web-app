import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';

// 添加全局Promise錯誤處理
window.addEventListener('unhandledrejection', event => {
  console.log('Promise錯誤被捕獲:', event.reason);
  // 防止默認處理（例如將錯誤輸出到控制台）
  event.preventDefault();
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 註冊Service Worker
serviceWorkerRegistration.register({
  onUpdate: registration => {
    console.log('發現新版本的Service Worker');
    const waitingServiceWorker = registration.waiting;
    if (waitingServiceWorker) {
      waitingServiceWorker.addEventListener("statechange", event => {
        if (event.target.state === "activated") {
          console.log('新版本Service Worker已激活');
          window.location.reload();
        }
      });
      console.log('請求Service Worker跳過等待');
      waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    }
  },
  onSuccess: registration => {
    console.log('PWA已成功註冊，scope:', registration.scope);
    // 檢查是否支持安裝
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('檢測到可安裝事件');
      // 阻止Chrome 67及更早版本自動顯示安裝提示
      e.preventDefault();
      // 存儲事件以便稍後觸發
      window.deferredPrompt = e;
    });
  },
  onError: error => {
    console.error('PWA註冊失敗:', error);
  }
});

// 如果你想要測量應用程式的效能，請傳遞一個函數
// 來記錄結果（例如：reportWebVitals(console.log)）
// 或傳送到分析端點。了解更多：https://bit.ly/CRA-vitals
reportWebVitals();
