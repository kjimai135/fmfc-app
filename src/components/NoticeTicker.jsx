import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// 초당 이동 픽셀 (숫자를 줄이면 더 느려지고, 키우면 빨라짐)
const SPEED_PX_PER_SEC = 50

function NoticeTicker() {
  const [notices, setNotices] = useState([])
  const [duration, setDuration] = useState(20) // 애니메이션 소요 시간(초)
  const navigate = useNavigate()
  const trackRef = useRef(null)

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
    const nowISO = new Date().toISOString()

    const { data } = await supabase
      .from('notices')
      .select('*')
      .eq('is_active', true)
      // 시작일이 없거나(항상), 시작일이 지금 이전
      .or(`ticker_start_at.is.null,ticker_start_at.lte.${nowISO}`)
      // 종료일이 없거나(무기한), 종료일이 지금 이후
      .or(`ticker_end_at.is.null,ticker_end_at.gte.${nowISO}`)
      .order('created_at', { ascending: false })

    setNotices(data || [])
  }

  // 공지 사이 간격
  const gap = '\u00A0'.repeat(8)
  // 제목만 흐르게 (title 없으면 content 앞부분 사용)
  const tickerText =
    notices.map((n) => n.title || n.content).join(`${gap}·${gap}`) + `${gap}·${gap}`

  // 콘텐츠 실제 너비를 측정해서 속도(초당 픽셀)를 일정하게 유지
  useLayoutEffect(() => {
    if (!trackRef.current) return

    const measure = () => {
      // 트랙에는 텍스트가 2번 반복되어 들어감 → 절반이 실제 1회분 너비
      const singleWidth = trackRef.current.scrollWidth / 2
      const seconds = singleWidth / SPEED_PX_PER_SEC
      setDuration(seconds > 0 ? seconds : 20)
    }

    measure()

    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tickerText])

  if (notices.length === 0) return null

  return (
    <div
      onClick={() => navigate('/notices')}
      className="bg-emerald-600 text-white overflow-hidden whitespace-nowrap relative flex items-center h-9 border-b border-emerald-700 cursor-pointer hover:bg-emerald-500 transition-colors"
      title="클릭하면 공지 게시판으로 이동합니다"
    >
      {/* 📢 고정 라벨 (아이콘만) */}
      <div className="bg-emerald-700 h-full flex items-center px-3 font-bold text-sm flex-shrink-0 z-10">
        📢
      </div>

      {/* 흐르는 텍스트 (제목만) */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="notice-ticker-track inline-block"
          style={{ animationDuration: `${duration}s` }}
        >
          <span className="text-sm font-medium px-4">{tickerText}</span>
          <span className="text-sm font-medium px-4">{tickerText}</span>
        </div>
      </div>
    </div>
  )
}

export default NoticeTicker