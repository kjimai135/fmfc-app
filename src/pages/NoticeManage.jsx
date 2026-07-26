import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function NoticeManage() {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)

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

  async function addNotice(e) {
    e.preventDefault()
    if (!newContent.trim()) {
      alert('공지 내용을 입력해주세요!')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('notices')
      .insert([{ content: newContent.trim(), is_active: true }])

    if (error) {
      alert('공지 등록에 실패했습니다: ' + error.message)
    } else {
      setNewContent('')
      fetchNotices()
    }
    setSaving(false)
  }

  async function toggleActive(notice) {
    await supabase
      .from('notices')
      .update({ is_active: !notice.is_active })
      .eq('id', notice.id)
    fetchNotices()
  }

  async function deleteNotice(id) {
    if (!window.confirm('이 공지를 삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchNotices()
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">📢 공지 관리</h1>
      <p className="text-slate-400 text-sm mb-6">
        공지를 등록하면 모든 화면 상단에 흐르는 자막으로 표시됩니다. (관리자·임원 전용)
      </p>

      {/* 공지 추가 */}
      <form onSubmit={addNotice} className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
        <label className="block text-slate-300 text-sm font-medium mb-2">새 공지 내용</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="예: 이번 주 토요일 경기 취소되었습니다!"
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? '등록 중...' : '➕ 등록'}
          </button>
        </div>
      </form>

      {/* 공지 목록 */}
      {loading ? (
        <div className="text-center text-slate-400 py-10">⏳ 불러오는 중...</div>
      ) : notices.length === 0 ? (
        <div className="text-center text-slate-400 py-10">등록된 공지가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {notices.map((notice) => (
            <div
              key={notice.id}
              className={`bg-slate-800 border rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
                notice.is_active ? 'border-emerald-500/40' : 'border-slate-700 opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm break-words">{notice.content}</p>
                <p className="text-slate-500 text-xs mt-1">
                  {new Date(notice.created_at).toLocaleString('ko-KR')}
                  {notice.is_active ? (
                    <span className="ml-2 text-emerald-400">● 표시 중</span>
                  ) : (
                    <span className="ml-2 text-slate-500">○ 숨김</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => toggleActive(notice)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    notice.is_active
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {notice.is_active ? '🙈 숨기기' : '👁️ 표시'}
                </button>
                <button
                  onClick={() => deleteNotice(notice.id)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs transition-colors"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NoticeManage