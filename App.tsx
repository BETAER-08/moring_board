// App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, StatusBar, RefreshControl, AppState } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Calendar from 'expo-calendar';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Provider as PaperProvider, MD3LightTheme as DefaultTheme, Modal, Portal, TextInput as PaperTextInput, Button as PaperButton } from 'react-native-paper';
import { WeatherInfo, ScheduleInfo, SavedStop, DisplayStop, iconMap, HourlyWeather, City } from './types';
import { AddStopModal } from './components/AddStopModal';
import { BusRouteModal } from './components/BusRouteModal';
import { fetchAllBusesForStop, getCityFromCoords, fetchRoutesForStop } from './services/api';

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: '#2563EB' } };
const STORAGE = { STOPS: 'savedStops:v1', MAXFAV: 'maxFavorites:v1' };

// LegacyApiService
class LegacyApiService {
  private readonly WEATHER_API_KEY = '8KL46HqqhxK4T/UAB0bJfFacYRrfoNpOhZrvgwr1MVBIdUAJqoOhZe7WZZwjsKSJbuatjZDvR2+GZBhvdBGdng==';
  private convertToGrid(lat: number, lon: number) {
    const RE=6371.00877,GRID=5,SLAT1=30,SLAT2=60,OLON=126,OLAT=38,XO=43,YO=136,DEGRAD=Math.PI/180;
    const re=RE/GRID,slat1=SLAT1*DEGRAD,slat2=SLAT2*DEGRAD,olon=OLON*DEGRAD,olat=OLAT*DEGRAD;
    let sn=Math.tan(Math.PI*0.25+slat2*0.5)/Math.tan(Math.PI*0.25+slat1*0.5);
    sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);
    let sf=Math.tan(Math.PI*0.25+slat1*0.5); sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;
    let ro=Math.tan(Math.PI*0.25+olat*0.5); ro=re*sf/Math.pow(ro,sn);
    let ra=Math.tan(Math.PI*0.25+(lat)*DEGRAD*0.5); ra=re*sf/Math.pow(ra,sn);
    let theta=lon*DEGRAD-olon; if(theta>Math.PI)theta-=2*Math.PI; if(theta<-Math.PI)theta+=2*Math.PI; theta*=sn;
    const nx=Math.floor(ra*Math.sin(theta)+XO+0.5); const ny=Math.floor(ro-ra*Math.cos(theta)+YO+0.5);
    return {nx,ny};
  }
  async fetchWeather(location: Location.LocationObject): Promise<WeatherInfo | null> {
    try {
      const { latitude, longitude } = location.coords; const { nx, ny } = this.convertToGrid(latitude, longitude);
      const now = new Date(); let base_date_obj = new Date(); const hours=[2,5,8,11,14,17,20,23]; const h=now.getHours();
      let base = hours.slice().reverse().find(x=>x<=h); if(base===undefined){base=23;base_date_obj.setDate(now.getDate()-1);}
      const base_date=`${base_date_obj.getFullYear()}${String(base_date_obj.getMonth()+1).padStart(2,'0')}${String(base_date_obj.getDate()).padStart(2,'0')}`;
      const base_time=`${String(base).padStart(2,'0')}00`;
      const url=`http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(this.WEATHER_API_KEY)}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
      const { data } = await axios.get(url);
      const items=data?.response?.body?.items?.item; if(!items||items.length===0) return null;
      const fcstTime=`${String(h).padStart(2,'0')}00`;
      const curTemp=items.find((i:any)=>i.category==='TMP'&&i.fcstTime===fcstTime)?.fcstValue||'0';
      const sky=items.find((i:any)=>i.category==='SKY'&&i.fcstTime===fcstTime)?.fcstValue;
      const pty=items.find((i:any)=>i.category==='PTY'&&i.fcstTime===fcstTime)?.fcstValue;
      let cond:keyof typeof iconMap='맑음'; if(pty&&pty!=='0'){ if(pty==='1')cond='비'; else if(pty==='3')cond='눈'; else if(pty==='4')cond='소나기'; } else if(sky){ if(sky==='3')cond='구름많음'; else if(sky==='4')cond='흐림'; }
      const hourly:HourlyWeather[]=Array.from({length:24},(_,i)=>{const hh=(h+i)%24; const t=`${String(hh).padStart(2,'0')}00`;
        const temp=items.find((it:any)=>it.category==='TMP'&&it.fcstTime===t)?.fcstValue||'0';
        const rain=items.find((it:any)=>it.category==='POP'&&it.fcstTime===t)?.fcstValue||'0';
        const skyF=items.find((it:any)=>it.category==='SKY'&&it.fcstTime===t)?.fcstValue;
        const ptyF=items.find((it:any)=>it.category==='PTY'&&it.fcstTime===t)?.fcstValue;
        let icon:keyof typeof iconMap='맑음'; if(ptyF&&ptyF!=='0'){ if(ptyF==='1')icon='비'; else if(ptyF==='3')icon='눈'; else if(ptyF==='4')icon='소나기'; } else if(skyF){ if(skyF==='3')icon='구름많음'; else if(skyF==='4')icon='흐림'; }
        return { time:`${hh}시`, icon, temp:parseInt(temp,10), rainChance:parseInt(rain,10)};
      });
      const dateString=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(now);
      return { date:dateString, conditionIcon:cond, temperature:parseInt(curTemp,10), hourly };
    } catch { return null; }
  }
  async fetchSchedule(): Promise<ScheduleInfo> {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return { title:'캘린더 권 없음', hasSchedule:false };
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const cal = calendars.find(c=>c.isPrimary) || calendars[0]; if(!cal) return { title:'캘린더 없음', hasSchedule:false };
    const s=new Date(); s.setHours(0,0,0,0); const e=new Date(); e.setHours(23,59,59,999);
    const events = await Calendar.getEventsAsync([cal.id], s, e);
    if(events.length===0) return { title:'오늘 일정 없음', hasSchedule:false };
    const first=events[0]; const time=new Date(first.startDate).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});
    return { title:`${time} - ${first.title}`, hasSchedule:true };
  }
}

const HourlyWeatherItem: React.FC<{ item: HourlyWeather }> = ({ item }) => (
  <View style={styles.hourlyItem}>
    <Text style={styles.hourlyTime}>{item.time}</Text>
    <Ionicons name={iconMap[item.icon]} size={28} color="#333" style={{ marginVertical: 4 }} />
    <Text style={styles.hourlyTemp}>{item.temp}°</Text>
    <Text style={styles.hourlyRain}>{item.rainChance}%</Text>
  </View>
);

export default function App() {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<Location.LocationObject | null>(null);
  const [isCityLoading, setIsCityLoading] = useState(true);
  const [savedStops, setSavedStops] = useState<SavedStop[]>([]);
  const [displayStops, setDisplayStops] = useState<DisplayStop[]>([]);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isRouteModalVisible, setIsRouteModalVisible] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<{ routeId: string, cityCode: string, routeName: string } | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [maxFavorites, setMaxFavorites] = useState<number>(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingMax, setPendingMax] = useState<string>('5');

  // race token for refresh
  const genRef = useRef(0);

  // AppState-based persistence
  const appState = useRef(AppState.currentState);
  const dirtyRef = useRef(false);

  // load persisted
  useEffect(() => {
    (async () => {
      try {
        const [stopsStr, maxStr] = await Promise.all([
          AsyncStorage.getItem(STORAGE.STOPS),
          AsyncStorage.getItem(STORAGE.MAXFAV),
        ]);
        if (stopsStr) {
          const parsed: SavedStop[] = JSON.parse(stopsStr);
          setSavedStops(parsed);
          setDisplayStops(parsed as any);
        }
        if (maxStr) {
          const n = parseInt(maxStr, 10);
          if (!Number.isNaN(n) && n > 0 && n <= 20) { setMaxFavorites(n); setPendingMax(String(n)); }
        }
      } catch {}
    })();
  }, []);

  // mark dirty on changes
  useEffect(() => { dirtyRef.current = true; }, [savedStops, maxFavorites]);

  const persistNow = useCallback(async () => {
    try {
      await AsyncStorage.multiSet([
        [STORAGE.STOPS, JSON.stringify(savedStops)],
        [STORAGE.MAXFAV, String(maxFavorites)],
      ]);
      dirtyRef.current = false;
    } catch {}
  }, [savedStops, maxFavorites]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appState.current.match(/active/) && next.match(/inactive|background/)) {
        if (dirtyRef.current) persistNow();
      }
      appState.current = next;
    });
    return () => { sub.remove(); if (dirtyRef.current) persistNow(); };
  }, [persistNow]);

  const refreshBusData = useCallback(async () => {
    const cfg = savedStops;
    const myGen = ++genRef.current;

    if (cfg.length === 0) {
      setDisplayStops([]);
      setLastUpdated(new Date());
      return;
    }

    const updated = await Promise.all(cfg.map(async (stop) => {
      const allRoutes = await fetchRoutesForStop(stop.stopId, stop.cityCode);
      const arrivals  = await fetchAllBusesForStop(stop.stopId, stop.cityCode);
      const rtMap = new Map(arrivals.map(a => [a.routeId, a]));
      const merged = allRoutes.map(r =>
        rtMap.get(r.routeId) ?? ({ routeId: r.routeId, routeNo: r.routeNo, arrTime: -1, remainingStops: 0 })
      );
      const favIds = new Set(stop.favoriteBuses.map(b => b.routeId));
      const finalArrivals = stop.favoriteBuses.length > 0 ? merged.filter(x => favIds.has(x.routeId)) : merged;
      return { ...stop, arrivals: finalArrivals, allDiscoveredBuses: allRoutes };
    }));

    if (myGen !== genRef.current) return; // stale
    setDisplayStops(updated);
    setLastUpdated(new Date());
  }, [savedStops]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshBusData(); } finally { setRefreshing(false); }
  }, [refreshBusData]);

  useEffect(() => {
    const init = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('위치 권한이 필요합니다.', '앱 설정에서 위치 권한을 허용해주세요.'); setIsLoading(false); setIsCityLoading(false); return; }
      const loc = await Location.getCurrentPositionAsync({});
      setCurrentUserLocation(loc);
      setIsCityLoading(true);
      const city = await getCityFromCoords(loc.coords.latitude, loc.coords.longitude);
      setCurrentCity(city);
      setIsCityLoading(false);
      const svc = new LegacyApiService();
      const [w, s] = await Promise.all([svc.fetchWeather(loc), svc.fetchSchedule()]);
      setWeather(w); setSchedule(s); setIsLoading(false);
      setLastUpdated(new Date());
    };
    init();
  }, []);

  useEffect(() => {
    refreshBusData();
    const id = setInterval(refreshBusData, 30000);
    return () => clearInterval(id);
  }, [refreshBusData]);

  const handleSaveStop = (newStop: SavedStop) => {
    if (savedStops.some(s => s.stopId === newStop.stopId)) {
      Alert.alert('중복된 정류장', `'${newStop.stopName}' 정류장은 이미 추가되어 있습니다.`, [{ text: '확인' }]);
      return;
    }
    setSavedStops(prev => [...prev, newStop]);
    setDisplayStops(prev => [...prev, { ...newStop, arrivals: [] }]); // optimistic
  };

  const handleBusPress = (routeId: string, routeName: string, cityCode: string) => {
    setSelectedRoute({ routeId, routeName, cityCode });
    setIsRouteModalVisible(true);
  };

  const handleOpenAddModal = () => {
    if (currentUserLocation) setIsAddModalVisible(true);
    else Alert.alert('위치 정보 확인 실패', '현재 위치 정보를 가져올 수 없습니다.');
  };

  // 정류장 삭제
  const handleRemoveStop = (stopId: string) => {
    setSavedStops(prev => prev.filter(s => s.stopId !== stopId));
    setDisplayStops(prev => prev.filter(s => s.stopId !== stopId));
  };

  // 버스 삭제. 카드가 비면 정류장도 삭제.
  const handleRemoveBus = (stopId: string, routeId: string) => {
    setSavedStops(prev => prev
      .map(s => s.stopId === stopId ? { ...s, favoriteBuses: s.favoriteBuses.filter(b => b.routeId !== routeId) } : s)
      .filter(s => s.stopId !== stopId || s.favoriteBuses.length > 0)
    );
    setDisplayStops(prev => prev
      .map(s => s.stopId === stopId ? { ...s, arrivals: s.arrivals.filter(a => a.routeId !== routeId) } : s)
      .filter(s => s.stopId !== stopId || s.arrivals.length > 0)
    );
  };

  const fmtTime = (d: Date | null) =>
    d ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d) : '-';

  if (isLoading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <PaperProvider theme={theme}>
      <SafeAreaView style={styles.safeArea}>
        {weather && (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.dateText}>{weather.date}</Text>
                <Text style={styles.timeText}>
                  {new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: 'numeric', hour12: true })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.tempText}>
                  <Ionicons name={iconMap[weather.conditionIcon]} size={32} /> {weather.temperature}°
                </Text>
              </View>
            </View>
            <View style={styles.hourlyContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
                {weather.hourly.map((item, i) => <HourlyWeatherItem key={i} item={item} />)}
              </ScrollView>
            </View>
          </>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
        >
          {schedule && (
            <View style={styles.moduleContainer}>
              <Text style={styles.moduleTitle}>오늘의 첫 일정</Text>
              <View style={styles.scheduleCard}>
                <MaterialCommunityIcons name="calendar-check-outline" size={20} color="#6B7280" />
                <Text style={[styles.scheduleText, !schedule.hasSchedule && styles.noScheduleText]}>
                  {schedule.title}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.moduleContainer}>
            <View style={styles.moduleHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.moduleTitle}>나의 정류장</Text>
                <Text style={{ marginLeft: 8, color: '#6B7280', fontSize: 12 }}>마지막 갱신 {fmtTime(lastUpdated)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setSettingsOpen(true)} style={{ marginRight: 12 }}>
                  <Ionicons name="settings-outline" size={22} color="#6B7280" />
                </TouchableOpacity>
                {isCityLoading ? (
                  <ActivityIndicator color="#2563EB" />
                ) : (
                  <TouchableOpacity onPress={handleOpenAddModal}>
                    <Ionicons name="add-circle-outline" size={28} color="#2563EB" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {displayStops.length > 0 ? displayStops.map(stop => {
              const busCount = stop.arrivals.length;
              return (
                <View key={stop.stopId} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardTitle}>{stop.stopName}</Text>
                    {busCount === 1 && (
                      <TouchableOpacity onPress={() => handleRemoveStop(stop.stopId)} accessibilityLabel="정류장 제거">
                        <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {busCount > 0 ? stop.arrivals.map(bus => (
                    <View key={bus.routeId} style={[styles.busItem, { alignItems: 'center' }]}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => handleBusPress(bus.routeId, bus.routeNo, stop.cityCode)}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={styles.busRouteText}>{bus.routeNo}번</Text>
                          <Text style={[styles.busArrivalText, bus.arrTime === -1 && styles.noBusServiceText]}>
                            {bus.arrTime === -1 ? '운행 정보 없음' : (bus.arrTime < 1 ? '곧 도착' : `${bus.arrTime}분`)}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {busCount > 1 && (
                        <TouchableOpacity
                          onPress={() => handleRemoveBus(stop.stopId, bus.routeId)}
                          style={{ paddingLeft: 12 }}
                          accessibilityLabel="버스 제거"
                        >
                          <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )) : <Text style={styles.noBusStopText}>선택하신 버스의 도착 정보가 없습니다.</Text>}
                </View>
              );
            }) : (
              <View style={styles.card}>
                <Text style={styles.noBusStopText}>추가된 정류장이 없습니다. '+' 버튼을 눌러 추가하세요.</Text>
              </View>
            )}
          </View>
        </ScrollView>

        <AddStopModal
          visible={isAddModalVisible}
          onClose={() => setIsAddModalVisible(false)}
          onSave={handleSaveStop}
          currentCity={currentCity}
          location={currentUserLocation}
          maxFavorites={maxFavorites}
        />
        {selectedRoute && (
          <BusRouteModal
            visible={isRouteModalVisible}
            onClose={() => { setIsRouteModalVisible(false); setSelectedRoute(null); }}
            routeId={selectedRoute.routeId}
            routeName={selectedRoute.routeName}
            cityCode={selectedRoute.cityCode}
          />
        )}

        <Portal>
          <Modal visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} contentContainerStyle={{ backgroundColor: 'white', padding: 16, margin: 16, borderRadius: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>설정</Text>
            <PaperTextInput
              mode="outlined"
              label="즐겨찾기 최대 개수"
              value={pendingMax}
              onChangeText={setPendingMax}
              keyboardType="number-pad"
            />
            <PaperButton
              mode="contained"
              style={{ marginTop: 12 }}
              onPress={() => {
                const n = parseInt(pendingMax, 10);
                if (!Number.isNaN(n) && n > 0 && n <= 20) { setMaxFavorites(n); setSettingsOpen(false); }
                else Alert.alert('유효하지 않은 값', '1~20 사이의 숫자를 입력하세요.');
              }}
            >
              저장
            </PaperButton>
            <PaperButton mode="text" onPress={persistNow} style={{ marginTop: 8 }}>
              지금 저장
            </PaperButton>
          </Modal>
        </Portal>
      </SafeAreaView>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContainer: { paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  dateText: { fontSize: 14, color: '#6B7280' },
  timeText: { fontSize: 36, fontWeight: 'bold', color: '#111827' },
  tempText: { fontSize: 32, fontWeight: 'bold', color: '#111827' },
  hourlyContainer: { paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB' },
  hourlyItem: { alignItems: 'center', width: 60 },
  hourlyTime: { fontSize: 12, fontWeight: '500', color: '#4B5563' },
  hourlyTemp: { fontSize: 16, fontWeight: 'bold', color: '#1F2937' },
  hourlyRain: { fontSize: 12, color: '#3B82F6' },
  moduleContainer: { marginTop: 24, paddingHorizontal: 16 },
  moduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, minHeight: 28 },
  moduleTitle: { fontSize: 18, fontWeight: 'bold' },
  scheduleCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  scheduleText: { marginLeft: 12, fontSize: 14, fontWeight: '500', flex: 1 },
  noScheduleText: { color: '#9CA3AF', fontStyle: 'italic' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold' },
  busItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  busRouteText: { fontSize: 16, fontWeight: '500' },
  busArrivalText: { fontSize: 16, fontWeight: 'bold', color: '#2563EB' },
  noBusServiceText: { color: '#9CA3AF', fontWeight: 'normal' },
  noBusStopText: { color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
});
