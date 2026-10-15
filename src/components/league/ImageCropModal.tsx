'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ImageCropModal.module.css'

interface ImageCropModalProps {
  isOpen: boolean
  imageSrc: string | null
  onClose: () => void
  onCropComplete: (croppedFile: File, previewUrl: string) => Promise<void> | void
  isSaving?: boolean
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
  isSaving = false,
}: ImageCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [mounted, setMounted] = useState(false)
  const [zoom, setZoom] = useState<number>(1)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
  })

  // Ensure portal target exists on client mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll and reset state when opened
  useEffect(() => {
    if (isOpen) {
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen, imageSrc])

  if (!mounted || !isOpen || !imageSrc) return null

  // Pointer / Drag handling
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return
    e.preventDefault()
    e.stopPropagation()
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setOffset({
      x: dragStartRef.current.offsetX + dx,
      y: dragStartRef.current.offsetY + dy,
    })
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const zoomFactor = e.deltaY < 0 ? 0.08 : -0.08
    setZoom((prev) => Math.min(3, Math.max(1, +(prev + zoomFactor).toFixed(2))))
  }

  function handleReset(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  function handleCropConfirm(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!containerRef.current || !imgRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const W_c = containerRect.width
    const H_c = containerRect.height

    const naturalW = imgRef.current.naturalWidth || 1280
    const naturalH = imgRef.current.naturalHeight || 720

    const baseScale = Math.max(W_c / naturalW, H_c / naturalH)
    const currentScale = baseScale * zoom

    // Center in natural coordinates
    const centerX = naturalW / 2 - offset.x / currentScale
    const centerY = naturalH / 2 - offset.y / currentScale

    const cropW = W_c / currentScale
    const cropH = H_c / currentScale

    const startX = Math.max(0, Math.min(naturalW - cropW, centerX - cropW / 2))
    const startY = Math.max(0, Math.min(naturalH - cropH, centerY - cropH / 2))

    // High resolution banner output: 1280x720 (16:9)
    const targetW = 1280
    const targetH = 720

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')

    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imgRef.current, startX, startY, cropW, cropH, 0, 0, targetW, targetH)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const croppedFile = new File([blob], 'banner.webp', { type: 'image/webp' })
        const previewUrl = URL.createObjectURL(blob)
        onCropComplete(croppedFile, previewUrl)
      },
      'image/webp',
      0.92
    )
  }

  const modalContent = (
    <div
      className={styles.overlay}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!isSaving) onClose()
      }}
    >
      <div
        className={styles.modal}
        onClick={(e) => {
          e.stopPropagation()
        }}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h3 className={styles.title}>Ajustar Banner da Liga</h3>
            <span className={styles.subtitle}>
              Arraste para posicionar e use o zoom para enquadrar perfeitamente
            </span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!isSaving) onClose()
            }}
            disabled={isSaving}
            aria-label="Fechar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body / Crop Viewport */}
        <div className={styles.body}>
          <div
            ref={containerRef}
            className={styles.cropContainer}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
          >
            {/* Image being cropped */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Para recortar"
              className={styles.cropImage}
              style={{
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                maxWidth: 'none',
                minWidth: '100%',
                minHeight: '100%',
                objectFit: 'cover',
              }}
              draggable={false}
            />

            {/* Grid Lines Overlay */}
            <div className={styles.cropGrid} />

            {/* Aspect Ratio Badge */}
            <span className={styles.cropBadge}>16:9 • Proporção Oficial</span>
          </div>

          {/* Controls: Zoom & Reset */}
          <div className={styles.controls}>
            <span className={styles.zoomLabel}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
              Zoom
            </span>

            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => {
                e.stopPropagation()
                setZoom(Number(e.target.value))
              }}
              className={styles.slider}
            />

            <button type="button" className={styles.resetBtn} onClick={handleReset}>
              Redefinir
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!isSaving) onClose()
            }}
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleCropConfirm}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <span>⏳</span> Salvando Banner...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Recortar e Salvar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
