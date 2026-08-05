import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function NoticeBoard() {
  const { role } = useAuth()
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // 작성/수정/삭제 권한 (관리자·임원)
  const canManage = role === 'admin' || role === 'executive'

  useEffect(() => {
    fetchNotices()
  }, [])

  async function fetchNotices() {
    setLoading(true)
    const { data } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false })
    setNotices(data || [])
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">📢 공지</h1>
          <p className="text-slate-400 text-sm mt-1">총 {notices.length}개</p>
        </div>
        {canManage && (
          <button
            onClick={() => navigate('/notices/new')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors"
          >
            ✍️ 공지 작성
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-10">⏳ 불러오는 중...</div>
      ) : notices.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-3">📭</p>
          <p>등록된 공지가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notices.map((notice) => (
            <Link
              key={notice.id}
              to={`/notices/${notice.id}`}
              className={`block bg-slate-800 border rounded-xl px-5 py-4 hover:bg-slate-700/60 transition-colors ${
                notice.is_active ? 'border-slate-700' : 'border-slate-700 opacity-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {!notice.is_active && (
                  <span className="text-[11px] bg-slate-600 text-slate-300 px-2 py-0.5 rounded-full flex-shrink-0">숨김</span>
                )}
                <h2 className="text-white font-medium truncate">{notice.title || '(제목 없음)'}</h2>
              </div>
              <p className="text-slate-500 text-xs">
                {notice.author ? `${notice.author} · ` : ''}
                {new Date(notice.created_at).toLocaleDateString('ko-KR')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default NoticeBoard