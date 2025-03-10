import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // 檢查是否是特定類型的錯誤
    if (error && error.code === 403) {
      return { 
        hasError: true, 
        error,
        errorType: '403'
      };
    }
    
    if (error && error.name === 'i') {
      return { 
        hasError: true, 
        error,
        errorType: 'special'
      };
    }

    return { 
      hasError: true, 
      error,
      errorType: 'unknown'
    };
  }

  componentDidCatch(error, errorInfo) {
    console.log('組件錯誤:', error);
    console.log('錯誤信息:', errorInfo);
    
    // 可以在這裡發送錯誤報告到服務器
    this.setState({
      errorInfo: errorInfo
    });
  }

  handleRetry = () => {
    // 嘗試恢復應用
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null,
      errorType: null
    });
  };

  render() {
    if (this.state.hasError) {
      let errorMessage = '應用遇到了一些問題。';
      let actionMessage = '請嘗試重新整理頁面。';

      // 根據錯誤類型顯示不同的消息
      switch (this.state.errorType) {
        case '403':
          errorMessage = '存取被拒絕。';
          actionMessage = '請檢查您的權限或稍後再試。';
          break;
        case 'special':
          errorMessage = '發生了特殊錯誤。';
          actionMessage = '請稍後重試。';
          break;
        default:
          break;
      }

      return (
        <div className="error-boundary">
          <h2>出錯了！</h2>
          <p>{errorMessage}</p>
          <p>{actionMessage}</p>
          <div className="error-actions">
            <button 
              onClick={this.handleRetry}
              className="retry-button"
            >
              重試
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="reload-button"
            >
              重新整理
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 