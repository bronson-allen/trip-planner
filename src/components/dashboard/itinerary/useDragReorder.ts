import { useState, type DragEvent } from 'react'
import type { DragRef } from './parts'

export function useDragReorder(
  onReorderStops: (dayIndex: number, fromIndex: number, toIndex: number) => void,
) {
  const [dragging, setDragging] = useState<DragRef | null>(null)
  const [dragOver, setDragOver] = useState<DragRef | null>(null)

  function finishDrag() {
    setDragging(null)
    setDragOver(null)
  }

  function handleDrop(dayIndex: number, targetIndex: number) {
    if (dragging && dragging.day === dayIndex && dragging.index !== targetIndex) {
      onReorderStops(dayIndex, dragging.index, targetIndex)
    }
    finishDrag()
  }

  function entryDragProps(dayIndex: number, localIndex: number) {
    const isDragging = dragging?.day === dayIndex && dragging.index === localIndex
    const isDragOver =
      dragOver?.day === dayIndex && dragOver.index === localIndex && !isDragging

    return {
      className: `trip-list__entry${
        isDragging ? ' trip-list__entry--dragging' : ''
      }${isDragOver ? ' trip-list__entry--drag-over' : ''}`,
      onDragOver: (event: DragEvent) => {
        event.preventDefault()
        if (dragging?.day === dayIndex && dragging.index !== localIndex) {
          setDragOver({ day: dayIndex, index: localIndex })
        }
      },
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return
        if (dragOver?.day === dayIndex && dragOver.index === localIndex) {
          setDragOver(null)
        }
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        handleDrop(dayIndex, localIndex)
      },
    }
  }

  return {
    dragging,
    setDragging,
    finishDrag,
    entryDragProps,
  }
}
