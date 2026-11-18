import { useEffect, useState } from 'react'
import { getInference, type InferenceClient, type InferenceStatus } from '../lib/inference'

export type ModelStatus = InferenceStatus['status']

/** Subscribe to the shared MediaPipe inference client (worker-backed). */
export function useLandmarkers(): InferenceStatus & { client: InferenceClient | null } {
  const [client] = useState(getInference)
  const [status, setStatus] = useState<InferenceStatus>(client.status)
  useEffect(() => client.subscribe(setStatus), [client])
  return { ...status, client: status.status === 'ready' ? client : null }
}
