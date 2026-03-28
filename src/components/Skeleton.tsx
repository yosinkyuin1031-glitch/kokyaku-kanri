'use client'

export function SkeletonDashboard() {
  return (
    <div className="animate-pulse px-4 py-5 max-w-lg mx-auto space-y-6" role="status" aria-label="読み込み中">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
            <div className="h-8 w-8 bg-gray-200 rounded-full mx-auto" />
            <div className="h-6 bg-gray-200 rounded w-1/2 mx-auto" />
            <div className="h-3 bg-gray-100 rounded w-2/3 mx-auto" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 bg-gray-200 rounded-xl" />
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-1/3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="animate-pulse px-4 py-5 max-w-lg mx-auto space-y-4" role="status" aria-label="読み込み中">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-3 space-y-2">
            <div className="h-5 bg-gray-200 rounded w-1/2 mx-auto" />
            <div className="h-3 bg-gray-100 rounded w-2/3 mx-auto" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex justify-between">
            <div className="h-4 bg-gray-100 rounded w-1/4" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="animate-pulse space-y-2" role="status" aria-label="読み込み中">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-12 bg-gray-100 rounded-lg" />
      ))}
    </div>
  )
}
