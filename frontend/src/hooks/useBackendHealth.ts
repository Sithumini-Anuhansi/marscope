import axios from 'axios'
import { useEffect, useState } from 'react'
import { getBackendHealth } from '../services/api'
import type { ConnectionStatus } from '../types/mission'

function isAbortError(error: unknown): boolean {
  if (axios.isCancel(error)) {
    return true
  }

  if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') {
    return true
  }

  return error instanceof DOMException && error.name === 'AbortError'
}

export function useBackendHealth(pollMs = 30000): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>('checking')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const check = async () => {
      try {
        await getBackendHealth(controller.signal)
        if (!cancelled) {
          setStatus('online')
        }
      } catch (error) {
        if (cancelled || isAbortError(error)) {
          return
        }

        if (!cancelled) {
          setStatus('offline')
        }
      }
    }

    void check()
    const timer = window.setInterval(() => {
      void check()
    }, pollMs)

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(timer)
    }
  }, [pollMs])

  return status
}
