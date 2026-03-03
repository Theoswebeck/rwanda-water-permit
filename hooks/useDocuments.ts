import { useState, useCallback } from 'react'
import type { Document } from '@/types/database'

interface UseDocumentsReturn {
  documents: Document[]
  loading: boolean
  error: string | null
  getDocuments: (applicationId: string) => Promise<Document[]>
  uploadDocument: (file: File, applicationId: string, documentType: string) => Promise<Document | null>
  deleteDocument: (documentId: string) => Promise<boolean>
}

export function useDocuments(): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getDocuments = useCallback(async (applicationId: string): Promise<Document[]> => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/dashboard/applications/${applicationId}/documents`, {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to fetch documents')
      }
      const documents = (json.documents || []) as Document[]
      setDocuments(documents)
      return documents
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
      console.error('Error fetching documents:', err)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const uploadDocument = useCallback(async (
    file: File, 
    applicationId: string, 
    documentType: string
  ): Promise<Document | null> => {
    try {
      setError(null)
      const form = new FormData()
      form.set('file', file)
      form.set('documentType', documentType)
      const response = await fetch(`/api/dashboard/applications/${applicationId}/documents`, {
        method: 'POST',
        body: form,
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to upload document')
      }
      const newDocument = json.document as Document

      // Update local state
      setDocuments(prev => [newDocument, ...prev])

      return newDocument
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document')
      console.error('Error uploading document:', err)
      return null
    }
  }, [])

  const deleteDocument = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      setError(null)
      const response = await fetch(`/api/dashboard/documents/${documentId}`, { method: 'DELETE' })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || 'Failed to delete document')
      }

      // Update local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
      console.error('Error deleting document:', err)
      return false
    }
  }, [])

  return {
    documents,
    loading,
    error,
    getDocuments,
    uploadDocument,
    deleteDocument
  }
}
