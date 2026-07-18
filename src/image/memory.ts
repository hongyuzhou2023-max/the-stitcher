type Task<T> = () => Promise<T>

class DecodeQueue {
  private running = 0
  private concurrency: number
  private queue: Array<{
    task: Task<unknown>
    resolve: (v: unknown) => void
    reject: (e: unknown) => void
  }> = []

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n)
    this.pump()
  }

  run<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task: task as Task<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      this.pump()
    })
  }

  private pump() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!
      this.running++
      item
        .task()
        .then(item.resolve, item.reject)
        .finally(() => {
          this.running--
          this.pump()
        })
    }
  }
}

function defaultConcurrency(): number {
  if (typeof navigator === 'undefined') return 2
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return mobile ? 2 : 4
}

export const decodeQueue = new DecodeQueue(defaultConcurrency())

export function closeBitmap(bitmap: ImageBitmap | null | undefined) {
  if (bitmap && typeof bitmap.close === 'function') {
    try {
      bitmap.close()
    } catch {
      /* ignore */
    }
  }
}

export function revokeUrl(url: string | null | undefined) {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }
}
