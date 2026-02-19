import { useQuery } from '@tanstack/react-query'

export type IncomingTransferRequest = {
  id: string
  application_id: string
  original_permit_id: string
  transferor_user_id: string
  transferee_email: string
  transferee_phone: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by_user_id?: string | null
  approved_at?: string | null
  created_at: string
  updated_at: string
  application?: {
    id: string
    application_number?: string | null
    project_title?: string | null
    status: string
    terms_status?: string | null
    application_type?: string | null
    internal_notes?: string | null
  } | null
}

export function useIncomingTransfersQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: ['transfers', 'incoming'],
    queryFn: async () => {
      const resp = await fetch('/api/transfers/incoming', { method: 'GET' })
      const json = await resp.json().catch(() => null)
      if (!resp.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch incoming transfers')
      }
      return (json.transfers || []) as IncomingTransferRequest[]
    },
    enabled,
    staleTime: 30 * 1000,
    retry: 1,
    retryDelay: 1000,
  })
}

