import { useQuery } from '@tanstack/react-query';
import { getTeamSchedule, getTeamStreaks, getTeamForm, getAllTeamsRanking } from '../services/api';

export function useTeamScheduleQuery(year: number, teamCode: string) {
  return useQuery({
    queryKey: ['teamSchedule', year, teamCode],
    queryFn: () => getTeamSchedule(teamCode, year),
    enabled: !!teamCode,
  });
}

export function useTeamStreaksQuery(year: number, teamCode: string) {
  return useQuery({
    queryKey: ['teamStreaks', year, teamCode],
    queryFn: () => getTeamStreaks(year, teamCode),
    enabled: !!teamCode,
  });
}

export function useTeamFormQuery(year: number, teamCode: string) {
  return useQuery({
    queryKey: ['teamForm', year, teamCode],
    queryFn: () => getTeamForm(year, teamCode),
    enabled: !!teamCode,
  });
}

export function useAllRankingsQuery(year: number) {
  return useQuery({
    queryKey: ['allRankings', year],
    queryFn: () => getAllTeamsRanking(year),
    staleTime: 10 * 60 * 1000,
  });
}
