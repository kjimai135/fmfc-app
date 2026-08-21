import { supabase } from './supabase'

// 🎯 라운드 기준점: 이 날짜가 (13, 14)라운드
export const ANCHOR_DATE = '2026-08-08'
export const ANCHOR_FIRST_ROUND = 13

/**
 * 🔢 라운드 자동 계산
 * - 리그 경기일 1일 = 2라운드
 * - 🏆 챔스 경기일은 라운드 계산에서 완전히 제외
 *
 * @param {string} date  'YYYY-MM-DD'
 * @returns {Promise<{first:number, second:number}|null>}
 *          챔스 날짜이거나 계산 불가 시 null
 */
export async function calcRounds(date) {
  const { data } = await supabase
    .from('matches')
    .select('game_date, is_champions')

  const rows = data || []

  // 🏆 챔스로 등록된 날짜 수집
  const champsDates = new Set(rows.filter(r => r.is_champions).map(r => r.game_date))

  // 선택한 날이 챔스면 라운드 없음
  if (champsDates.has(date)) return null

  // 리그 경기일만 수집
  const dates = [...new Set(rows.map(r => r.game_date))].filter(d => !champsDates.has(d))

  if (!dates.includes(ANCHOR_DATE)) dates.push(ANCHOR_DATE)
  if (!dates.includes(date)) dates.push(date)
  dates.sort()

  const anchorIdx = dates.indexOf(ANCHOR_DATE)
  const targetIdx = dates.indexOf(date)
  if (anchorIdx === -1 || targetIdx === -1) return null

  const first = ANCHOR_FIRST_ROUND + (targetIdx - anchorIdx) * 2
  if (first <= 0) return null

  return { first, second: first + 1 }
}