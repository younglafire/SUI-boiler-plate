import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface ActivityLogEntry {
  id: string
  message: string
  type: 'success' | 'info'
  timestamp: Date
  icon?: string
}

interface ActivityLogContextType {
  logs: ActivityLogEntry[]
  addLog: (message: string, type?: 'success' | 'info', icon?: string) => void
  clearLogs: () => void
}

const ActivityLogContext = createContext<ActivityLogContextType | undefined>(undefined)

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])

  const addLog = useCallback((message: string, type: 'success' | 'info' = 'success', icon?: string) => {
    const newEntry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message,
      type,
      timestamp: new Date(),
      icon
    }
    
    setLogs(prev => {
      // Keep only the last 50 logs to prevent memory issues
      const newLogs = [newEntry, ...prev]
      return newLogs.slice(0, 50)
    })
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  return (
    <ActivityLogContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </ActivityLogContext.Provider>
  )
}

export function useActivityLog() {
  const context = useContext(ActivityLogContext)
  if (context === undefined) {
    throw new Error('useActivityLog must be used within an ActivityLogProvider')
  }
  return context
}
