export async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw Object.assign(new Error(payload.error || 'Request failed'), { status: response.status, payload })
  return payload as T
}

export async function compress(file: File) {
  if (!file.type.startsWith('image/') || file.size > 25_000_000) throw new Error('Choose an image under 25 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image compression is unavailable.')
    let scale = Math.min(1, 1024 / Math.max(image.width, image.height))
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const jpeg = canvas.toDataURL('image/jpeg', 0.8)
      if (jpeg.length <= 750_000) return jpeg
      scale *= 0.8
    }
    throw new Error('The image could not be compressed. Try a different photo.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
export const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong.')
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))
export const dayLabel = (value: string | number) =>
  new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value))

/** "3h 20m left" / "Overdue by 2d 4h" */
export function slaText(due: number, now = Date.now()) {
  const diff = due - now
  const abs = Math.abs(diff)
  const days = Math.floor(abs / 86_400_000)
  const hours = Math.floor((abs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((abs % 3_600_000) / 60_000)
  const span = days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`
  return diff >= 0 ? span + ' left' : 'Overdue by ' + span
}
