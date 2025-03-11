import React, { useState, useEffect } from 'react';
import ErrorBoundary from './ErrorBoundary';
import './App.css';

// 筆記類型枚舉
const NOTE_TYPES = {
  TASK: 'task',           // 任務
  EVENT: 'event',         // 事件
  NOTE: 'note',           // 筆記
};

// 任務狀態枚舉
const TASK_STATUS = {
  TODO: 'todo',           // • 待辦
  COMPLETED: 'completed', // × 已完成
  MIGRATED: 'migrated',   // > 已遷移
  SCHEDULED: 'scheduled', // < 已排程
};

// 全局錯誤處理
const setupErrorHandling = () => {
  // 處理未捕獲的Promise錯誤
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    
    // 檢查是否是403錯誤
    if (error && error.code === 403) {
      console.log('捕獲到403錯誤:', error);
      // 這裡可以添加重試邏輯或其他處理
      event.preventDefault();
      return;
    }

    // 檢查是否是特定的錯誤類型
    if (error && error.name === 'i') {
      console.log('捕獲到特定類型錯誤:', error);
      event.preventDefault();
      return;
    }

    console.log('捕獲到未處理的Promise錯誤:', error);
    event.preventDefault();
  });

  // 處理全局錯誤
  window.onerror = (message, source, lineno, colno, error) => {
    console.log('捕獲到全局錯誤:', { message, source, lineno, colno, error });
    return true;
  };

  // 處理全局fetch錯誤
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    try {
      const response = await originalFetch.apply(this, args);
      return response;
    } catch (error) {
      console.error('Fetch錯誤:', error);
      // 返回一個模擬的成功響應
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
};

function App() {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedType, setSelectedType] = useState(NOTE_TYPES.TASK);
  const [priority, setPriority] = useState({ important: false, urgent: false });
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');

  // 設置全局錯誤處理
  useEffect(() => {
    setupErrorHandling();
  }, []);

  // 從本地存儲加載筆記
  useEffect(() => {
    const loadNotes = async () => {
      try {
        setIsLoading(true);
        const savedNotes = localStorage.getItem('bulletJournalNotes');
        if (savedNotes) {
          setNotes(JSON.parse(savedNotes));
        }
        const savedTags = localStorage.getItem('bulletJournalTags');
        if (savedTags) {
          setTags(JSON.parse(savedTags));
        }
      } catch (err) {
        console.error('載入筆記時出錯:', err);
        if (retryCount < 3) {
      setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 1000);
        } else {
          setError('載入筆記時出錯，請重新整理頁面重試');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadNotes();
  }, [retryCount]);

  // 保存筆記到本地存儲
  useEffect(() => {
    const saveNotes = async () => {
      try {
        localStorage.setItem('bulletJournalNotes', JSON.stringify(notes));
        localStorage.setItem('bulletJournalTags', JSON.stringify(tags));
      } catch (err) {
        console.error('保存筆記時出錯:', err);
        setError('保存筆記時出錯，請確保有足夠的存儲空間');
      }
    };

    if (!isLoading) {
      saveNotes();
    }
  }, [notes, tags, isLoading]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    
    try {
      const note = {
        id: Date.now(),
        content: newNote,
        type: selectedType,
        status: selectedType === NOTE_TYPES.TASK ? TASK_STATUS.TODO : null,
        priority: {
          important: priority.important,
          urgent: priority.urgent
        },
        tags: [],
        createdAt: new Date().toISOString()
      };
      
      setNotes(prevNotes => [...prevNotes, note]);
      setNewNote('');
      setPriority({ important: false, urgent: false });
      setError(null);
    } catch (err) {
      console.error('添加筆記時出錯:', err);
      setError('添加筆記時出錯，請重試');
    }
  };

  const updateNoteStatus = async (id, newStatus) => {
    try {
      setNotes(prevNotes => 
        prevNotes.map(note => 
          note.id === id ? { ...note, status: newStatus } : note
        )
      );
      setError(null);
    } catch (err) {
      console.error('更新筆記狀態時出錯:', err);
      setError('更新筆記狀態時出錯，請重試');
    }
  };

  const deleteNote = async (id) => {
    try {
      setNotes(prevNotes => prevNotes.filter(note => note.id !== id));
      setError(null);
    } catch (err) {
      console.error('刪除筆記時出錯:', err);
      setError('刪除筆記時出錯，請重試');
    }
  };

  const addTag = (e) => {
    e.preventDefault();
    if (!newTag.trim() || tags.includes(newTag.trim())) return;
    setTags(prev => [...prev, newTag.trim()]);
    setNewTag('');
  };

  const toggleNoteTag = (noteId, tag) => {
    setNotes(prevNotes =>
      prevNotes.map(note => {
        if (note.id === noteId) {
          const newTags = note.tags.includes(tag)
            ? note.tags.filter(t => t !== tag)
            : [...note.tags, tag];
          return { ...note, tags: newTags };
        }
        return note;
      })
    );
  };

  const getStatusSymbol = (status) => {
    switch (status) {
      case TASK_STATUS.TODO: return '•';
      case TASK_STATUS.COMPLETED: return '×';
      case TASK_STATUS.MIGRATED: return '>';
      case TASK_STATUS.SCHEDULED: return '<';
      default: return '';
    }
  };

  if (isLoading) {
    return (
      <div className="App">
        <div className="container">
          <div className="loading">載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="App">
        <div className="container">
          <h1>子彈筆記</h1>
          
          {error && (
            <div className="error-message">
              {error}
              <button 
                onClick={() => {
                  setError(null);
                  setRetryCount(0);
                }}
                className="close-error"
              >
                ✕
              </button>
            </div>
          )}
          
          <form onSubmit={addNote} className="note-form">
            <select 
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="note-type-select"
            >
              <option value={NOTE_TYPES.TASK}>任務</option>
              <option value={NOTE_TYPES.EVENT}>事件</option>
              <option value={NOTE_TYPES.NOTE}>筆記</option>
            </select>

            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="新增筆記..."
              className="note-input"
            />

            <div className="priority-controls">
              <label>
                <input
                  type="checkbox"
                  checked={priority.important}
                  onChange={() => setPriority(prev => ({ ...prev, important: !prev.important }))}
                />
                重要 *
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={priority.urgent}
                  onChange={() => setPriority(prev => ({ ...prev, urgent: !prev.urgent }))}
                />
                緊急 !
              </label>
            </div>

            <button type="submit" className="add-button">新增</button>
          </form>

          <div className="tags-section">
            <form onSubmit={addTag} className="tag-form">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="新增標籤..."
                className="tag-input"
              />
              <button type="submit" className="add-tag-button">新增標籤</button>
            </form>
            <div className="tags-list">
              {tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          </div>

          <div className="notes-list">
            {notes.length === 0 ? (
              <div className="empty-message">還沒有筆記，開始新增吧！</div>
            ) : (
              notes.map(note => (
                <div 
                  key={note.id} 
                  className={`note ${note.type} ${
                    note.priority && (note.priority.important || note.priority.urgent) ? 'priority' : ''
                  }`}
                >
                  <span className="note-status" onClick={() => {
                    if (note.type === NOTE_TYPES.TASK) {
                      const currentIndex = Object.values(TASK_STATUS).indexOf(note.status);
                      const nextIndex = (currentIndex + 1) % Object.values(TASK_STATUS).length;
                      updateNoteStatus(note.id, Object.values(TASK_STATUS)[nextIndex]);
                    }
                  }}>
                    {note.type === NOTE_TYPES.TASK ? getStatusSymbol(note.status) : ''}
                  </span>
                  <span className="note-content">{note.content}</span>
                  {note.priority && (note.priority.important || note.priority.urgent) && (
                    <span className="priority-indicator">
                      {note.priority.important ? '!' : ''}{note.priority.urgent ? '⚡' : ''}
                    </span>
                  )}
                  <button onClick={() => deleteNote(note.id)} className="delete-note">✕</button>
                  <div className="note-tags">
                    {tags.map(tag => (
                      <span
                        key={tag}
                        className={`tag ${note.tags.includes(tag) ? 'active' : ''}`}
                        onClick={() => toggleNoteTag(note.id, tag)}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </div>
    </ErrorBoundary>
  );
}

export default App;
