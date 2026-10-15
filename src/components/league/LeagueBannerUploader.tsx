'use client'

import { useRef, useState, useTransition } from 'react'
import { uploadLeagueBannerAction } from '@/app/(dashboard)/dashboard/actions'
import { ImageCropModal } from './ImageCropModal'
import styles from './LeagueCard.module.css'

interface LeagueBannerUploaderProps {
  leagueId: string
  currentBannerUrl: string | null
  onSuccess?: (url: string) => void
}

export function LeagueBannerUploader({
  leagueId,
  currentBannerUrl,
  onSuccess,
}: LeagueBannerUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Crop Modal state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [isCropOpen, setIsCropOpen] = useState(false)

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    setCropImageSrc(objectUrl)
    setIsCropOpen(true)
    setFeedback(null)

    // Reset input value so user can pick the same file again if desired
    e.target.value = ''
  }

  function handleCloseCrop() {
    setIsCropOpen(false)
    setCropImageSrc(null)
  }

  function handleCropComplete(croppedFile: File) {
    const formData = new FormData()
    formData.append('banner', croppedFile)

    startTransition(async () => {
      const result = await uploadLeagueBannerAction(leagueId, formData)
      if (result.success && result.url) {
        setFeedback({ type: 'success', message: 'Banner atualizado com sucesso!' })
        setIsCropOpen(false)
        setCropImageSrc(null)
        onSuccess?.(result.url)
        setTimeout(() => setFeedback(null), 3000)
      } else {
        setFeedback({ type: 'error', message: result.error || 'Erro ao salvar o banner recortado.' })
      }
    })
  }

  return (
    <div className={styles.uploaderWrapper}>
      <button
        type="button"
        className={styles.uploaderBtn}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          inputRef.current?.click()
        }}
        disabled={isPending}
        title="Alterar e recortar imagem de fundo do card"
      >
        {isPending ? (
          <span className={styles.uploadingSpinner}>⏳ Salvando...</span>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Editar Banner
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={styles.fileInput}
        onChange={handleFileSelected}
        onClick={(e) => e.stopPropagation()}
      />

      {feedback && (
        <span className={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}>
          {feedback.message}
        </span>
      )}

      {/* Interactive Crop Modal */}
      <ImageCropModal
        isOpen={isCropOpen}
        imageSrc={cropImageSrc}
        onClose={handleCloseCrop}
        onCropComplete={handleCropComplete}
        isSaving={isPending}
      />
    </div>
  )
}
