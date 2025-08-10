// services/api.ts
import axios from 'axios';
import { BusArrivalInfo, BusRouteDetails, City, StopSearchResult, BusLocation, BusRouteStop, FavoriteBus } from '../types';
import { allCities } from '../data/cities';

const SERVICE_KEY = '8KL46HqqhxK4T/UAB0bJfFacYRrfoNpOhZrvgwr1MVBIdUAJqoOhZe7WZZwjsKSJbuatjZDvR2+GZBhvdBGdng==';

/**
 * [테스트용 신규 추가] 정류소별 경유 노선 목록 조회
 * 부산 지역에서 API가 정상 동작하는지 테스트하기 위한 함수입니다.
 */
export const fetchRoutesForStop_Test = async (stopId: string, cityCode: string): Promise<FavoriteBus[]> => {
  const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList`;
  const params = {
    serviceKey: SERVICE_KEY,
    _type: 'json',
    nodeId: stopId,
    cityCode: cityCode,
    numOfRows: '150',
  };
  try {
    const response = await axios.get(url, { params });
    const items = response.data?.response?.body?.items?.item || [];
    const routeList = Array.isArray(items) ? items : [items];
    return routeList
      .map((item: any) => ({
        routeId: item.routeid,
        routeNo: item.routeno.toString(),
      }))
      .filter(route => route.routeId);
  } catch (error) {
    console.error(`[테스트 에러] ${stopId} 경유 노선 목록 API 실패:`, error);
    return [];
  }
};


// --- 이하 함수들은 기존과 동일합니다 ---
export const getCityFromCoords = async (latitude: number, longitude: number): Promise<City | null> => {
    const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList`;
    const params = { serviceKey: SERVICE_KEY, _type: 'json', gpsLati: latitude, gpsLong: longitude, numOfRows: '1' };
    try {
        const response = await axios.get(url, { params });
        const item = response.data?.response?.body?.items?.item?.[0];
        if (item && item.citycode) {
            const cityCode = item.citycode.toString();
            const cityName = allCities.find(c => c.code === cityCode)?.name || item.cityname;
            if (cityName) return { code: cityCode, name: cityName };
        }
        return null;
    } catch (error) { console.error("도시 정보 조회 API 실패:", error); return null; }
};
export const fetchNearbyStops = async (latitude: number, longitude: number): Promise<StopSearchResult[]> => {
    const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList`;
    const params = { serviceKey: SERVICE_KEY, _type: 'json', gpsLati: latitude, gpsLong: longitude, numOfRows: '50' };
    try {
        const response = await axios.get(url, { params });
        const items = response.data?.response?.body?.items?.item || [];
        const stopList = Array.isArray(items) ? items : [items];
        return stopList.map((item: any) => ({ id: item.nodeid, name: item.nodenm, stopNo: item.nodeno, cityCode: item.citycode.toString(), direction: '' }));
    } catch (error) { console.error("주변 정류장 검색 API 실패:", error); return []; }
};
export const fetchAllBusesForStop = async (stopId: string, cityCode: string): Promise<BusArrivalInfo[]> => {
  const url = `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList`;
  const params = { serviceKey: SERVICE_KEY, _type: 'json', nodeId: stopId, cityCode: cityCode, numOfRows: '100' };
  try {
    const response = await axios.get(url, { params });
    const items = response.data?.response?.body?.items?.item || [];
    const arrivalList = Array.isArray(items) ? items : [items];
    return arrivalList.map((item: any) => ({ routeId: item.routeid, routeNo: item.routeno.toString(), arrTime: Math.floor(item.arrtime / 60), remainingStops: item.arrprevstationcnt, }));
  } catch (error) { console.error(`[${stopId}] 버스 도착 정보 API 실패:`, error); return []; }
};
export const fetchBusRouteDetails = async (routeId: string, cityCode: string): Promise<BusRouteDetails> => {
  const routeApiUrl = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList`;
  const locationApiUrl = `http://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList`;
  const commonParams = { serviceKey: SERVICE_KEY, _type: 'json', routeId, cityCode };
  try {
    const [routeResponse, locationResponse] = await Promise.all([ axios.get(routeApiUrl, { params: { ...commonParams, numOfRows: '150' } }), axios.get(locationApiUrl, { params: { ...commonParams, numOfRows: '20' } }) ]);
    const routeItems = routeResponse.data?.response?.body?.items?.item || [];
    const routeStops = (Array.isArray(routeItems) ? routeItems : [routeItems]).map((item: any) => ({ id: item.nodeid, name: item.nodenm, order: item.nodeord, })).sort((a, b) => a.order - b.order);
    const locationItems = locationResponse.data?.response?.body?.items?.item || [];
    const busLocations = (Array.isArray(locationItems) ? locationItems : [locationItems]).map((item: any) => ({ currentStopId: item.nodeid, plateNo: item.vehicleno, }));
    return { routeStops, busLocations };
  } catch (error) { console.error(`[${routeId}] 버스 노선/위치 정보 API 실패:`, error); return { routeStops: [], busLocations: [] }; }
};