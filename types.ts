// types.ts
export const iconMap = { '맑음': 'sunny', '구름많음': 'cloudy', '비': 'rainy', '눈': 'snow', '흐림': 'cloud', '소나기': 'thunderstorm' } as const;
export interface HourlyWeather { time: string; icon: keyof typeof iconMap; temp: number; rainChance: number; }
export interface WeatherInfo { date: string; conditionIcon: keyof typeof iconMap; temperature: number; hourly: HourlyWeather[]; }
export interface ScheduleInfo { title: string; hasSchedule: boolean; }
export interface BusArrivalInfo { routeId: string; routeNo: string; arrTime: number; remainingStops: number; }
export interface FavoriteBus { routeId: string; routeNo: string; }
export interface SavedStop {
  stopId: string;
  stopName: string;
  cityCode: string;
  favoriteBuses: FavoriteBus[];
  allDiscoveredBuses?: FavoriteBus[];
}
export interface DisplayStop extends SavedStop { arrivals: BusArrivalInfo[]; }
export interface BusRouteStop { id: string; name:string; order: number; }
export interface BusLocation { currentStopId: string; plateNo: string; }
export interface BusRouteDetails { routeStops: BusRouteStop[]; busLocations: BusLocation[]; }
export interface City { code: string; name: string; }
export interface StopSearchResult { id: string; name: string; stopNo?: string; cityCode: string; direction: string; }