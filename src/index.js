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

// 如果您希望應用程式可以離線工作並加載更快，
// 請將 unregister() 改為 register()
serviceWorkerRegistration.register({
  onUpdate: registration => {
    const waitingServiceWorker = registration.waiting;
    if (waitingServiceWorker) {
      waitingServiceWorker.addEventListener("statechange", event => {
        if (event.target.state === "activated") {
          window.location.reload();
        }
      });
      waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    }
  },
  onSuccess: registration => {
    console.log('PWA已成功註冊');
  },
  onError: error => {
    console.error('PWA註冊失敗:', error);
  }
});

// 如果您想要開始測量應用程式性能，
// 傳遞函數來記錄結果（例如：reportWebVitals(console.log)）
reportWebVitals();

// 在現有代碼之後添加
// 註冊Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker註冊成功:', registration.scope);
        
        // 監聽Service Worker狀態變化
        registration.addEventListener('statechange', (event) => {
          if (event.target.state === 'activated') {
            console.log('Service Worker已激活，發送CLAIM_CLIENTS消息');
            navigator.serviceWorker.controller?.postMessage({
              type: 'CLAIM_CLIENTS'
            });
          }
        });
        
        // 如果已經有激活的Service Worker
        if (registration.active) {
          console.log('已有激活的Service Worker，發送CLAIM_CLIENTS消息');
          registration.active.postMessage({
            type: 'CLAIM_CLIENTS'
          });
        }
      })
      .catch(error => {
        console.log('Service Worker註冊失敗:', error);
      });
  });
  
  // 監聽控制變化
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service Worker控制器已更改');
  });
}
