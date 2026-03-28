'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">エラーが発生しました</h2>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || '予期せぬエラーが発生しました。再度お試しください。'}
        </p>
        <button
          onClick={reset}
          className="text-white px-6 py-3 rounded-xl font-bold text-sm transition-colors"
          style={{ backgroundColor: '#14252A' }}
          aria-label="再試行"
        >
          再試行する
        </button>
      </div>
    </div>
  )
}
