import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function NoticeTicker() {
  const [notices, setNotices] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    fetchNotices()

    const channel = supabase
      .channel('notices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, () => {
        fetchNotices()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setNotices(data || [])
  }

  if (notices.length === 0) return null

  // 공지 사이 간격
  const gap = '\u00A0'.repeat(8)
  // 제목만 흐르게 (title 없으면 content 앞부분 사용)
  const tickerText = notices
    .map((n) => n.title || n.content)
    .join(`${gap}·${gap}`) + `${gap}·${gap}`

  return (
    <div
      onClick={() => navigate('/notices')}
      className="bg-emerald-600 text-white overflow-hidden whitespace-nowrap relative flex items-center h-9 border-b border-emerald-700 cursor-pointer hover:bg-emerald-500 transition-colors"
      title="클릭하면 공지 게시판으로 이동합니다"
    >
      {/* 📢 고정 라벨 */}
      <div className="bg-emerald-700 h-full flex items-center px-3 font-bold text-sm flex-shrink-0 z-10">
        📢 공지
      </div>

      {/* 흐르는 텍스트 (제목만) */}
      <div className="flex-1 overflow-hidden">
        <div className="notice-ticker-track inline-block">
          <span className="text-sm font-medium px-4">{tickerText}</span>
          <span className="text-sm font-medium px-4">{tickerText}</span>
        </div>
      </div>
    </div>
  )
}

export default NoticeTicker