import { supabase } from './supabase'

// 🎯 라운드 기준점 (구버전 호환용)
export const ANCHOR_DATE = '2026-08-08'
export const ANCHOR_FIRST_ROUND = 13

/**
 * 🔢 라운드 자동 계산 (시즌별로 1·2R부터 시작)
 */
export async function calcRounds(date) {
  // 1) 현재 시즌 조회
  const { data: seasonRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'season_label')
    .single()
  const currentSeason = seasonRow?.value || null

  // 2) 현재 시즌의 경기 조회
  let matchQuery = supabase
    .from('matches')
    .select('game_date, is_champions, season')
  if (currentSeason) {
    matchQuery = matchQuery.eq('season', currentSeason)
  }
  const { data: matchData } = await matchQuery
  const matchRows = matchData || []

  // 🏆 챔스 날짜 수집
  const champsDates = new Set(matchRows.filter(r => r.is_champions).map(r => r.game_date))

  // 선택한 날이 챔스면 라운드 없음
  if (champsDates.has(date)) return null

  // 🔥 3) 현재 시즌의 "시작 기준 날짜" 결정
  //    - 현재 시즌 matches가 있으면 그 중 가장 빠른 날짜
  //    - 없으면 → 이전 시즌 마지막 경기 이후부터 (오늘 기준)
  let seasonStartDate = null

  if (matchRows.length > 0) {
    // 현재 시즌 경기 중 가장 빠른 날
    const matchDates = matchRows.map(r => r.game_date).sort()
    seasonStartDate = matchDates[0]
  } else {
    // 🔥 현재 시즌 경기가 아직 없으면 → 이전 시즌 마지막 날짜 다음부터
    const { data: prevData } = await supabase
      .from('matches')
      .select('game_date')
      .neq('season', currentSeason)
      .order('game_date', { ascending: false })
      .limit(1)

    if (prevData && prevData.length > 0) {
      seasonStartDate = prevData[0].game_date // 이 날짜 "초과"부터 현재 시즌
    }
  }

  // 🔥 4) 확정 예약 날짜 (현재 시즌 범위만)
  let resQuery = supabase
    .from('reservations')
    .select('date')
    .eq('is_confirmed', true)

  // 이전 시즌 마지막 경기 "이후" 예약만 (현재 시즌 경기가 없을 때)
  if (matchRows.length === 0 && seasonStartDate) {
    resQuery = resQuery.gt('date', seasonStartDate)
  } else if (matchRows.length > 0 && seasonStartDate) {
    // 현재 시즌 시작일 이상 예약만
    resQuery = resQuery.gte('date', seasonStartDate)
  }

  const { data: resData } = await resQuery
  const resDates = (resData || []).map(r => r.date)

  // 5) matches + reservations 날짜 합치기 (챔스 제외)
  const allDates = new Set([
    ...matchRows.map(r => r.game_date),
    ...resDates,
  ])

  const dates = [...allDates].filter(d => !champsDates.has(d))

  // 선택한 날짜가 목록에 없으면 추가
  if (!dates.includes(date)) dates.push(date)
  dates.sort()

  // 6) 시즌 첫 경기일 = 1·2R부터
  const targetIdx = dates.indexOf(date)
  if (targetIdx === -1) return null

  const first = 1 + targetIdx * 2
  return { first, second: first + 1 }
}