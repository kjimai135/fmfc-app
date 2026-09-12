import { supabase } from './supabase'

// 🎯 라운드 기준점 (구버전 호환용 · buildRoundMap 등에서 사용)
export const ANCHOR_DATE = '2026-08-08'
export const ANCHOR_FIRST_ROUND = 13

/**
 * 🔢 라운드 자동 계산 (시즌별로 1·2라운드부터 시작)
 * - 리그 경기일 1일 = 2라운드
 * - 🏆 챔스 경기일은 라운드 계산에서 완전히 제외
 * - 🔥 현재 시즌의 첫 리그 경기일 = 1·2라운드
 *
 * @param {string} date  'YYYY-MM-DD'
 * @returns {Promise<{first:number, second:number}|null>}
 *          챔스 날짜이거나 계산 불가 시 null
 */
export async function calcRounds(date) {
  // 🔥 1) 현재 시즌 조회
  const { data: seasonRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'season_label')
    .single()
  const currentSeason = seasonRow?.value || null

  // 🔥 2) 현재 시즌의 경기만 조회
  let query = supabase
    .from('matches')
    .select('game_date, is_champions, season')

  if (currentSeason) {
    query = query.eq('season', currentSeason)
  }

  const { data } = await query
  const rows = data || []

  // 🏆 챔스로 등록된 날짜 수집
  const champsDates = new Set(rows.filter(r => r.is_champions).map(r => r.game_date))

  // 선택한 날이 챔스면 라운드 없음
  if (champsDates.has(date)) return null

  // 🔥 3) 현재 시즌의 리그 경기일만 수집 (챔스 제외)
  const dates = [...new Set(rows.map(r => r.game_date))].filter(d => !champsDates.has(d))

  // 선택한 날짜가 목록에 없으면 추가 (아직 생성 전인 경우)
  if (!dates.includes(date)) dates.push(date)
  dates.sort()

  // 🔥 4) 현재 시즌 첫 경기일 = 인덱스 0 = 1·2라운드
  const targetIdx = dates.indexOf(date)
  if (targetIdx === -1) return null

  const first = 1 + targetIdx * 2
  return { first, second: first + 1 }
}