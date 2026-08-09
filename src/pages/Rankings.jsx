import { useState, useRef } from 'react'
import SeasonRanking from './SeasonRanking'
import ScorerRanking from './ScorerRanking'

const TABS = [
  { key: 'team', label: '🏆 팀순위' },
  { key: 'scorer', label: '👟 득점순위' },
]

function Rankings() {
  const [index, setIndex] = useState(0) // 0: 팀순위, 1: 득점순위

  const startX = useRef(null)
  const startY = useRef(null)
  const dragging = useRef(false)
  const decidedHorizontal = useRef(false)

  function handleStart(x, y) {
    startX.current = x
    startY.current = y
    dragging.current = true
    decidedHorizontal.current = false
  }

  function handleMove(x, y) {
    if (!dragging.current || startX.current === null) return
    const dx = x - startX.current
    const dy = y - startY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      decidedHorizontal.current = true
    }
  }

  function handleEnd(x, y) {
    if (!dragging.current || startX.current === null) {
      dragging.current = false
      return
    }
    const dx = x - startX.current
    const dy = y - startY.current

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && index < TABS.length - 1) {
        setIndex((i) => i + 1)
      } else if (dx > 0 && index > 0) {
        setIndex((i) => i - 1)
      }
    }

    startX.current = null
    startY.current = null
    dragging.current = false
    decidedHorizontal.current = false
  }

  // 터치
  function onTouchStart(e) {
    handleStart(e.touches[0].clientX, e.touches[0].clientY)
  }
  function onTouchMove(e) {
    handleMove(e.touches[0].clientX, e.touches[0].clientY)
  }
  function onTouchEnd(e) {
    handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
  }

  // 마우스 드래그
  function onMouseDown(e) {
    handleStart(e.clientX, e.clientY)
  }
  function onMouseMove(e) {
    if (!dragging.current) return
    handleMove(e.clientX, e.clientY)
    if (decidedHorizontal.current) e.preventDefault()
  }
  function onMouseUp(e) {
    handleEnd(e.clientX, e.clientY)
  }
  function onMouseLeave(e) {
    if (dragging.current) handleEnd(e.clientX, e.clientY)
  }

  return (
    // 순위 테이블과 동일한 폭(max-w-md) + 좌우 패딩(p-4) 통일
    <div className="max-w-md mx-auto p-4">
      {/* 탭 */}
      <div className="flex gap-2 mb-4 bg-slate-800/60 border border-slate-700 rounded-xl p-1.5">
        {TABS.map((tab, i) => {
          const active = index === i
          return (
            <button
              key={tab.key}
              onClick={() => setIndex(i)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                active
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-300 hover:bg-slate-700/60'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 스와이프/드래그 힌트 */}
      <p className="text-slate-500 text-xs text-center mb-3">← 좌우로 넘기거나 드래그해서 전환 →</p>

      {/* 슬라이드 영역 */}
      <div
        className="overflow-hidden select-none"
        style={{ cursor: 'grab', touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {/* 팀순위 */}
          <div className="w-full flex-shrink-0">
            <SeasonRanking />
          </div>
          {/* 득점순위 */}
          <div className="w-full flex-shrink-0">
            <ScorerRanking />
          </div>
        </div>
      </div>

      {/* 하단 점 인디케이터 */}
      <div className="flex justify-center gap-2 mt-4">
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setIndex(i)}
            aria-label={tab.label}
            className="transition-all"
            style={{
              width: index === i ? '24px' : '8px',
              height: '8px',
              borderRadius: '9999px',
              background: index === i ? '#10b981' : '#475569',
            }}
          ></button>
        ))}
      </div>

      {/* 하단 여백 */}
      <div style={{ height: '40px', width: '100%' }} aria-hidden="true"></div>
    </div>
  )
}

export default Rankings