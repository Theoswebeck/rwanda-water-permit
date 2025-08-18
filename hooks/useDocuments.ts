import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const documents = data || []
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

      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${applicationId}/${documentType}_${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('application-documents')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('application-documents')
        .getPublicUrl(fileName)

      // Create document record
      const { data: newDocument, error: dbError } = await supabase
        .from('documents')
        .insert({
          application_id: applicationId,
          name: file.name,
          type: documentType,
          file_path: publicUrl,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id || '',
        })
        .select()
        .single()

      if (dbError) throw dbError

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

      // Get document info first
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', documentId)
        .single()

      if (fetchError) throw fetchError

      // Delete from storage if file exists
      if (document?.file_path) {
        const fileName = document.file_path.split('/').slice(-2).join('/')
        await supabase.storage
          .from('application-documents')
          .remove([fileName])
      }

      // Delete from database
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)

      if (error) throw error

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
