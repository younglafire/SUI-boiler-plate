import { useState, useEffect } from 'react'
import { useActivityLog, type ActivityLogEntry } from '../hooks/useActivityLog'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

// Demo logs to show when empty (for presentation)
const DEMO_LOGS: ActivityLogEntry[] = [
  { id: 'demo1', message: 'Planted 5 seeds in slot 3', type: 'success', timestamp: new Date(Date.now() - 2000), icon: '🌱' },
  { id: 'demo2', message: 'Harvested 4 fruits!', type: 'success', timestamp: new Date(Date.now() - 5000), icon: '🍎' },
  { id: 'demo3', message: 'Minted 25 seeds from game!', type: 'success', timestamp: new Date(Date.now() - 8000), icon: '🌱' },
  { id: 'demo4', message: 'Watered slot 2 (-25% grow time)', type: 'success', timestamp: new Date(Date.now() - 12000), icon: '🚿' },
  { id: 'demo5', message: 'Game started! Drop fruits to merge', type: 'info', timestamp: new Date(Date.now() - 15000), icon: '🎮' },
]

export default function ActivityLog() {
  const { logs, clearLogs } = useActivityLog()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showDemo, setShowDemo] = useState(true)

  // Use demo logs when there are no real logs
  const displayLogs = logs.length > 0 ? logs : (showDemo ? DEMO_LOGS : [])

  useEffect(() => {
    // Hide demo after user interacts
    if (logs.length > 0) {
      setShowDemo(false)
    }
  }, [logs.length])

  if (displayLogs.length === 0 && !isHovered) {
    return null // Don't show if no logs
  }

  return (
    <div 
      className={`activity-log-container ${isMinimized ? 'minimized' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="activity-log-header">
        <div className="header-left">
          <span className="pulse-dot"></span>
          <span className="header-title">Activity Log</span>
        </div>
        <div className="header-actions">
          {logs.length > 0 && (
            <button className="clear-btn" onClick={clearLogs} title="Clear logs">
              🗑️
            </button>
          )}
          <button 
            className="minimize-btn" 
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '📖' : '📕'}
          </button>
        </div>
      </div>
      
      {!isMinimized && (
        <div className="activity-log-content">
          {displayLogs.length === 0 ? (
            <div className="empty-log">
              <span>✨ Actions will appear here</span>
            </div>
          ) : (
            displayLogs.map((log: ActivityLogEntry, index: number) => (
              <div 
                key={log.id} 
                className={`log-entry ${log.type} ${index === 0 ? 'newest' : ''}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <span className="log-icon">{log.icon || '✅'}</span>
                <div className="log-details">
                  <span className="log-message">{log.message}</span>
                  <span className="log-time">{formatTime(log.timestamp)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        .activity-log-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 280px;
          max-height: 350px;
          background: linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(22, 33, 62, 0.95));
          border-radius: 16px;
          border: 2px solid rgba(255, 215, 0, 0.3);
          box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.5),
            0 0 20px rgba(255, 215, 0, 0.1);
          backdrop-filter: blur(15px);
          z-index: 1500;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .activity-log-container:hover {
          border-color: rgba(255, 215, 0, 0.5);
          box-shadow: 
            0 15px 50px rgba(0, 0, 0, 0.6),
            0 0 30px rgba(255, 215, 0, 0.2);
        }

        .activity-log-container.minimized {
          max-height: 44px;
          width: 160px;
        }

        .activity-log-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: linear-gradient(90deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05));
          border-bottom: 1px solid rgba(255, 215, 0, 0.2);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pulse-dot {
          width: 8px;
          height: 8px;
          background: #00fa9a;
          border-radius: 50%;
          animation: pulse 2s infinite;
          box-shadow: 0 0 8px #00fa9a;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        .header-title {
          font-size: 0.8rem;
          font-weight: 700;
          color: #ffd700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .header-actions {
          display: flex;
          gap: 6px;
        }

        .minimize-btn, .clear-btn {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          width: 26px;
          height: 26px;
          cursor: pointer;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .minimize-btn:hover, .clear-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.1);
        }

        .activity-log-content {
          max-height: 290px;
          overflow-y: auto;
          padding: 8px;
        }

        .activity-log-content::-webkit-scrollbar {
          width: 4px;
        }

        .activity-log-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 2px;
        }

        .activity-log-content::-webkit-scrollbar-thumb {
          background: rgba(255, 215, 0, 0.3);
          border-radius: 2px;
        }

        .empty-log {
          padding: 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.8rem;
        }

        .log-entry {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 8px 10px;
          margin-bottom: 6px;
          background: rgba(0, 250, 154, 0.08);
          border-radius: 10px;
          border-left: 3px solid #00fa9a;
          animation: slideIn 0.3s ease-out;
          transition: all 0.2s;
        }

        .log-entry:hover {
          background: rgba(0, 250, 154, 0.15);
          transform: translateX(2px);
        }

        .log-entry.newest {
          animation: slideInBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          background: rgba(0, 250, 154, 0.15);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideInBounce {
          0% {
            opacity: 0;
            transform: translateX(30px) scale(0.9);
          }
          50% {
            transform: translateX(-5px) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        .log-icon {
          font-size: 1rem;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .log-details {
          flex: 1;
          min-width: 0;
        }

        .log-message {
          display: block;
          font-size: 0.8rem;
          color: #fff;
          line-height: 1.3;
          word-break: break-word;
        }

        .log-time {
          display: block;
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 2px;
          font-family: 'Courier New', monospace;
        }

        .log-entry.info {
          background: rgba(52, 152, 219, 0.08);
          border-left-color: #3498db;
        }

        .log-entry.info:hover {
          background: rgba(52, 152, 219, 0.15);
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .activity-log-container {
            width: 240px;
            max-height: 280px;
            bottom: 80px;
            right: 10px;
          }

          .activity-log-container.minimized {
            width: 140px;
          }

          .activity-log-content {
            max-height: 220px;
          }
        }
      `}</style>
    </div>
  )
}
