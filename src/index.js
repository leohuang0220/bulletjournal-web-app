import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import reportWebVitals from './reportWebVitals';

// 添加全局Promise错误处理
window.addEventListener('unhandledrejection', event => {
  console.log('Promise错误被捕获:', event.reason);
  // 防止默认处理（例如将错误输出到控制台）
  event.preventDefault();
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// 在现有代码之后添加
// 注册Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker注册成功:', registration.scope);
        
        // 监听Service Worker状态变化
        registration.addEventListener('statechange', (event) => {
          if (event.target.state === 'activated') {
            console.log('Service Worker已激活，发送CLAIM_CLIENTS消息');
            navigator.serviceWorker.controller?.postMessage({
              type: 'CLAIM_CLIENTS'
            });
          }
        });
        
        // 如果已经有激活的Service Worker
        if (registration.active) {
          console.log('已有激活的Service Worker，发送CLAIM_CLIENTS消息');
          registration.active.postMessage({
            type: 'CLAIM_CLIENTS'
          });
        }
      })
      .catch(error => {
        console.log('Service Worker注册失败:', error);
      });
  });
  
  // 监听控制变化
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service Worker控制器已更改');
  });
}
