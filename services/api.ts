// services/api.ts
import axios from 'axios';
import { BusArrivalInfo, BusRouteDetails, City, StopSearchResult, BusLocation, BusRouteStop, FavoriteBus } from '../types';
import { allCities } from '../data/cities';

const SERVICE_KEY = '8KL46HqqhxK4T/UAB0bJfFacYRrfoNpOhZrvgwr1MVBIdUAJqoOhZe7WZZwjsKSJbuatjZDvR2+GZBhvdBGdng==';

/** 정류장 경유 노선 목록(정식) — nodeid 사용 */
export const fetchRoutesForStop = async (stopId: string, cityCode: string): Promise<FavoriteBus[]> => {
  const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList`;
  const params = {
    serviceKey: SERVICE_KEY,
    _type: 'json',
    nodeId: stopId,   // 일부 구현 호환
    nodeid: stopId,   // 공식 파라미터
    cityCode,
    numOfRows: '200',
  };
  try {
    const { data } = await axios.get(url, { params });
    const items = data?.response?.body?.items?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list
      .map((it: any) => ({ routeId: it.routeid, routeNo: it.routeno?.toString?.() ?? String(it.routeno) }))
      .filter(r => r.routeId);
  } catch (e) {
    console.error(`[${stopId}] 경유 노선 목록 API 실패:`, e);
    return [];
  }
};

/** [테스트용] 기존 함수 유지 */
export const fetchRoutesForStop_Test = async (stopId: string, cityCode: string): Promise<FavoriteBus[]> => {
  const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList`;
  const params = {
    serviceKey: SERVICE_KEY,
    _type: 'json',
    nodeId: stopId,
    nodeid: stopId,
    cityCode,
    numOfRows: '150',
  };
  try {
    const { data } = await axios.get(url, { params });
    const items = data?.response?.body?.items?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.map((it: any) => ({ routeId: it.routeid, routeNo: it.routeno.toString() })).filter(r => r.routeId);
  } catch (e) {
    console.error(`[테스트 에러] ${stopId} 경유 노선 목록 API 실패:`, e);
    return [];
  }
};

export const getCityFromCoords = async (latitude: number, longitude: number): Promise<City | null> => {
  const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList`;
  const params = { serviceKey: SERVICE_KEY, _type: 'json', gpsLati: latitude, gpsLong: longitude, numOfRows: '1' };
  try {
    const { data } = await axios.get(url, { params });
    const item = data?.response?.body?.items?.item?.[0];
    if (item && item.citycode) {
      const code = item.citycode.toString();
      const name = allCities.find(c => c.code === code)?.name || item.cityname;
      if (name) return { code, name };
    }
    return null;
  } catch (e) { console.error('도시 정보 조회 API 실패:', e); return null; }
};

export const fetchNearbyStops = async (latitude: number, longitude: number): Promise<StopSearchResult[]> => {
  const url = `http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList`;
  const params = { serviceKey: SERVICE_KEY, _type: 'json', gpsLati: latitude, gpsLong: longitude, numOfRows: '50' };
  try {
    const { data } = await axios.get(url, { params });
    const items = data?.response?.body?.items?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.map((it: any) => ({
      id: it.nodeid, name: it.nodenm, stopNo: it.nodeno, cityCode: it.citycode.toString(), direction: ''
    }));
  } catch (e) { console.error('주변 정류장 검색 API 실패:', e); return []; }
};

export const fetchAllBusesForStop = async (stopId: string, cityCode: string): Promise<BusArrivalInfo[]> => {
  const url = `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList`;
  const params = {
    serviceKey: SERVICE_KEY,
    _type: 'json',
    nodeId: stopId,
    nodeid: stopId,
    cityCode,
    numOfRows: '100'
  };
  try {
    const { data } = await axios.get(url, { params });
    const items = data?.response?.body?.items?.item || [];
    const list = Array.isArray(items) ? items : [items];
    return list.map((it: any) => ({
      routeId: it.routeid,
      routeNo: it.routeno.toString(),
      arrTime: Math.max(0, Math.floor(it.arrtime / 60)),
      remainingStops: it.arrprevstationcnt,
    }));
  } catch (e) { console.error(`[${stopId}] 버스 도착 정보 API 실패:`, e); return []; }
};

export const fetchBusRouteDetails = async (routeId: string, cityCode: string): Promise<BusRouteDetails> => {
  const routeApiUrl = `http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList`;
  const locationApiUrl = `http://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList`;
  const commonParams = { serviceKey: SERVICE_KEY, _type: 'json', routeId, cityCode };
  try {
    const [routeRes, locRes] = await Promise.all([
      axios.get(routeApiUrl, { params: { ...commonParams, numOfRows: '150' } }),
      axios.get(locationApiUrl, { params: { ...commonParams, numOfRows: '20' } }),
    ]);
    const rItems = routeRes.data?.response?.body?.items?.item || [];
    const routeStops: BusRouteStop[] = (Array.isArray(rItems) ? rItems : [rItems])
      .map((it: any) => ({ id: it.nodeid, name: it.nodenm, order: it.nodeord }))
      .sort((a, b) => a.order - b.order);

    const lItems = locRes.data?.response?.body?.items?.item || [];
    const busLocations: BusLocation[] = (Array.isArray(lItems) ? lItems : [lItems])
      .map((it: any) => ({ currentStopId: it.nodeid, plateNo: it.vehicleno }));

    return { routeStops, busLocations };
  } catch (e) {
    console.error(`[${routeId}] 버스 노선/위치 정보 API 실패:`, e);
    return { routeStops: [], busLocations: [] };
  }
};
