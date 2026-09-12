import { supabase } from './supabase'

// 🎯 라운드 기준점 (구버전 호환용)
export const ANCHOR_DATE = '2026-08-08'
export const ANCHOR_FIRST_ROUND = 13

/**
 * 🔢 라운드 자동 계산 (해당 날짜가 속한 시즌 기준으로 1·2R부터)
 */
export async function calcRounds(date) {
  // 1) 현재 시즌 조회
  const { data: seasonRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'season_label')
    .single()
  const currentSeason = seasonRow?.value || null

  // 🔥 2) 이 날짜(date)가 실제로 어느 시즌인지 확인
  //    - matches에 있으면 그 경기의 season 사용
  //    - 없으면 현재 시즌으로 간주 (미래 예약)
  const { data: dayMatch } = await supabase
    .from('matches')
    .select('season, is_champions')
    .eq('game_date', date)
    .limit(1)

  let targetSeason = currentSeason
  if (dayMatch && dayMatch.length > 0) {
    targetSeason = dayMatch[0].season || currentSeason
    // 🏆 챔스면 라운드 없음
    if (dayMatch[0].is_champions) return null
  }

  // 3) 🔥 targetSeason의 경기 조회 (해당 날짜가 속한 시즌)
  const { data: matchData } = await supabase
    .from('matches')
    .select('game_date, is_champions, season')
    .eq('season', targetSeason)

  const matchRows = matchData || []

  // 🏆 챔스 날짜 수집
  const champsDates = new Set(matchRows.filter(r => r.is_champions).map(r => r.game_date))
  if (champsDates.has(date)) return null

  // 4) 🔥 targetSeason의 날짜 범위 결정
  const matchDates = matchRows.map(r => r.game_date).sort()
  const seasonStartDate = matchDates.length > 0 ? matchDates[0] : null

  // 5) 확정 예약 날짜 (해당 시즌 범위만)
  //    현재 시즌이고, 경기가 아직 없거나 미래 예약을 포함해야 할 때만 reservations 사용
  let allDatesSet = new Set(matchRows.map(r => r.game_date))

  if (targetSeason === currentSeason) {
    // 현재 시즌: 미래 예약도 포함
    let resQuery = supabase
      .from('reservations')
      .select('date')
      .eq('is_confirmed', true)

    if (seasonStartDate) {
      // 현재 시즌 시작일 이후 예약만
      resQuery = resQuery.gte('date', seasonStartDate)
    } else {
      // 현재 시즌 경기가 없으면 → 이전 시즌 마지막 이후 예약만
      const { data: prevData } = await supabase
        .from('matches')
        .select('game_date')
        .neq('season', currentSeason)
        .order('game_date', { ascending: false })
        .limit(1)
      if (prevData && prevData.length > 0) {
        resQuery = resQuery.gt('date', prevData[0].game_date)
      }
    }

    const { data: resData } = await resQuery
    ;(resData || []).forEach(r => allDatesSet.add(r.date))
  }

  // 6) 챔스 제외 + 정렬
  const dates = [...allDatesSet].filter(d => !champsDates.has(d))
  if (!dates.includes(date)) dates.push(date)
  dates.sort()

  // 7) 시즌 첫 경기일 = 1·2R부터
  const targetIdx = dates.indexOf(date)
  if (targetIdx === -1) return null

  const first = 1 + targetIdx * 2
  return { first, second: first + 1 }
}