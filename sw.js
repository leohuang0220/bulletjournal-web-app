// 简化的Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker 安装中...');
  // 跳过等待阶段
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service Worker 已激活');
  // 不要立即调用clients.claim()
});

// 简单的fetch处理程序
self.addEventListener('fetch', event => {
  // 只记录请求，不进行拦截
  console.log('Service Worker: 请求 ' + event.request.url);
  
  // 让浏览器正常处理请求
  // 不调用event.respondWith()
});

// 监听消息
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLAIM_CLIENTS') {
    console.log('Service Worker: 尝试声明客户端控制权');
    // 只有在收到特定消息时才尝试claim clients
    self.clients.claim()
      .then(() => console.log('Service Worker: 成功声明客户端控制权'))
      .catch(err => console.error('Service Worker: 声明客户端控制权失败', err));
  }
}); 