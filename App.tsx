// App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Calendar from 'expo-calendar';
import axios from 'axios';
import { WeatherInfo, ScheduleInfo, SavedStop, DisplayStop, iconMap, HourlyWeather, City } from './types';
import { AddStopModal } from './components/AddStopModal';
import { BusRouteModal } from './components/BusRouteModal';
import { fetchAllBusesForStop, getCityFromCoords } from './services/api';

// LegacyApiService는 이전과 동일합니다.
class LegacyApiService {
    private readonly WEATHER_API_KEY = '8KL46HqqhxK4T/UAB0bJfFacYRrfoNpOhZrvgwr1MVBIdUAJqoOhZe7WZZwjsKSJbuatjZDvR2+GZBhvdBGdng==';
    private convertToGrid(lat: number, lon: number) {
        const RE = 6371.00877; const GRID = 5.0; const SLAT1 = 30.0; const SLAT2 = 60.0;
        const OLON = 126.0; const OLAT = 38.0; const XO = 43; const YO = 136;
        const DEGRAD = Math.PI / 180.0;
        const re = RE / GRID; const slat1 = SLAT1 * DEGRAD; const slat2 = SLAT2 * DEGRAD;
        const olon = OLON * DEGRAD; const olat = OLAT * DEGRAD;
        let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
        sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
        let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
        sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
        let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
        ro = re * sf / Math.pow(ro, sn);
        let ra = Math.tan(Math.PI * 0.25 + (lat) * DEGRAD * 0.5);
        ra = re * sf / Math.pow(ra, sn);
        let theta = lon * DEGRAD - olon;
        if (theta > Math.PI) theta -= 2.0 * Math.PI;
        if (theta < -Math.PI) theta += 2.0 * Math.PI;
        theta *= sn;
        const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
        const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
        return { nx, ny };
    }
    async fetchWeather(location: Location.LocationObject): Promise<WeatherInfo | null> {
        try {
            const { latitude, longitude } = location.coords;
            const { nx, ny } = this.convertToGrid(latitude, longitude);
            const now = new Date();
            let base_date_obj = new Date();
            const availableHours = [2, 5, 8, 11, 14, 17, 20, 23];
            const currentHour = now.getHours();
            let base_hour = availableHours.slice().reverse().find(h => h <= currentHour);
            if (base_hour === undefined) { base_hour = 23; base_date_obj.setDate(now.getDate() - 1); }
            const base_date = `${base_date_obj.getFullYear()}${String(base_date_obj.getMonth() + 1).padStart(2, '0')}${String(base_date_obj.getDate()).padStart(2, '0')}`;
            const base_time = `${String(base_hour).padStart(2, '0')}00`;
            const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(this.WEATHER_API_KEY)}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
            const response = await axios.get(url);
            const items = response.data?.response?.body?.items?.item;
            if (!items || items.length === 0) throw new Error("날씨 데이터를 받아오지 못했습니다.");
            const fcstTime = `${String(currentHour).padStart(2, '0')}00`;
            const currentTempItem = items.find((i: any) => i.category === 'TMP' && i.fcstTime === fcstTime);
            const currentTemp = currentTempItem ? parseInt(currentTempItem.fcstValue, 10) : 0;
            const skyItem = items.find((i: any) => i.category === 'SKY' && i.fcstTime === fcstTime);
            const ptyItem = items.find((i: any) => i.category === 'PTY' && i.fcstTime === fcstTime);
            const sky = skyItem?.fcstValue; const pty = ptyItem?.fcstValue;
            let condition: keyof typeof iconMap = '맑음';
            if (pty && pty !== '0') { if (pty === '1') condition = '비'; else if (pty === '3') condition = '눈'; else if (pty === '4') condition = '소나기'; } 
            else if (sky) { if (sky === '3') condition = '구름많음'; else if (sky === '4') condition = '흐림'; }
            const hourlyForecast: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => {
                const forecastHour = (currentHour + i) % 24;
                const forecastTime = `${String(forecastHour).padStart(2, '0')}00`;
                const temp = items.find((item: any) => item.category === 'TMP' && item.fcstTime === forecastTime)?.fcstValue || '0';
                const rain = items.find((item: any) => item.category === 'POP' && item.fcstTime === forecastTime)?.fcstValue || '0';
                const skyF = items.find((item: any) => item.category === 'SKY' && item.fcstTime === forecastTime)?.fcstValue;
                const ptyF = items.find((item: any) => item.category === 'PTY' && item.fcstTime === forecastTime)?.fcstValue;
                let hourlyCondition: keyof typeof iconMap = '맑음';
                if (ptyF && ptyF !== '0') { if (ptyF === '1') hourlyCondition = '비'; else if (ptyF === '3') hourlyCondition = '눈'; else if (ptyF === '4') hourlyCondition = '소나기'; } 
                else if (skyF) { if (skyF === '3') hourlyCondition = '구름많음'; else if (skyF === '4') hourlyCondition = '흐림'; }
                return { time: `${forecastHour}시`, icon: hourlyCondition, temp: parseInt(temp, 10), rainChance: parseInt(rain, 10) };
            });
            const dateString = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
            return { date: dateString, conditionIcon: condition, temperature: currentTemp, hourly: hourlyForecast };
        } catch (error) { console.error("날씨 정보 API 호출 실패:", error); return null; }
    }
    async fetchSchedule(): Promise<ScheduleInfo> {
        const { status } = await Calendar.requestCalendarPermissionsAsync();
        if (status !== 'granted') return { title: "캘린더 권한 없음", hasSchedule: false };
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const defaultCalendar = calendars.find(cal => cal.isPrimary) || calendars[0];
        if (!defaultCalendar) return { title: "캘린더를 찾을 수 없습니다.", hasSchedule: false };
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const events = await Calendar.getEventsAsync([defaultCalendar.id], todayStart, todayEnd);
        if (events.length === 0) return { title: "오늘 예정된 일정이 없습니다.", hasSchedule: false };
        const firstEvent = events[0];
        const eventTime = new Date(firstEvent.startDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        return { title: `${eventTime} - ${firstEvent.title}`, hasSchedule: true };
    }
}

const HourlyWeatherItem: React.FC<{ item: HourlyWeather }> = ({ item }) => ( <View style={styles.hourlyItem}><Text style={styles.hourlyTime}>{item.time}</Text><Ionicons name={iconMap[item.icon]} size={28} color="#333" style={{ marginVertical: 4 }} /><Text style={styles.hourlyTemp}>{item.temp}°</Text><Text style={styles.hourlyRain}>{item.rainChance}%</Text></View> );

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
  const [selectedRoute, setSelectedRoute] = useState<{routeId: string, cityCode: string, routeName: string} | null>(null);

  const refreshBusData = useCallback(async () => {
    if (savedStops.length === 0) { 
        setDisplayStops([]); 
        return;
    };

    const updatedStopsPromises = savedStops.map(async (stop) => {
        const realTimeArrivals = await fetchAllBusesForStop(stop.stopId, stop.cityCode);
        
        const currentDiscovered = stop.allDiscoveredBuses || stop.favoriteBuses;
        const newDiscoveredBuses = [...currentDiscovered];
        const discoveredMap = new Map(currentDiscovered.map(b => [b.routeId, b]));

        realTimeArrivals.forEach(arrival => {
            if (!discoveredMap.has(arrival.routeId)) {
                newDiscoveredBuses.push({ routeId: arrival.routeId, routeNo: arrival.routeNo });
                discoveredMap.set(arrival.routeId, { routeId: arrival.routeId, routeNo: arrival.routeNo });
            }
        });
        
        const realTimeMap = new Map(realTimeArrivals.map(bus => [bus.routeId, bus]));
        const displayListSource = newDiscoveredBuses;
        
        const mergedArrivals = displayListSource.map(favBus => {
          const realTimeInfo = realTimeMap.get(favBus.routeId);
          if (realTimeInfo) {
            return realTimeInfo;
          } else {
            return {
              routeId: favBus.routeId,
              routeNo: favBus.routeNo,
              arrTime: -1,
              remainingStops: 0,
            };
          }
        });

        const favoriteBusIds = new Set(stop.favoriteBuses.map(b => b.routeId));
        const finalArrivals = mergedArrivals.filter(arrival => favoriteBusIds.has(arrival.routeId));

        return { 
            ...stop, 
            arrivals: finalArrivals,
            allDiscoveredBuses: newDiscoveredBuses,
        };
    });

    const newDisplayStops = await Promise.all(updatedStopsPromises);
    setSavedStops(newDisplayStops);
    setDisplayStops(newDisplayStops);

  }, [savedStops]);

  useEffect(() => {
    const loadInitialData = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert("위치 권한이 필요합니다.", "앱 설정에서 위치 권한을 허용해주세요.");
            setIsLoading(false);
            setIsCityLoading(false);
            return;
        }
        const location = await Location.getCurrentPositionAsync({});
        setCurrentUserLocation(location);
        setIsCityLoading(true);
        const city = await getCityFromCoords(location.coords.latitude, location.coords.longitude);
        setCurrentCity(city);
        setIsCityLoading(false);
        const service = new LegacyApiService();
        const [weatherData, scheduleData] = await Promise.all([ 
            service.fetchWeather(location), 
            service.fetchSchedule() 
        ]);
        setWeather(weatherData);
        setSchedule(scheduleData);
        setIsLoading(false);
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    refreshBusData();
    const intervalId = setInterval(refreshBusData, 30000);
    return () => clearInterval(intervalId);
  }, [refreshBusData]);

  const handleSaveStop = (newStop: SavedStop) => {
    if (!savedStops.some(s => s.stopId === newStop.stopId)) {
      setSavedStops(prev => [...prev, newStop]);
    } else {
      Alert.alert(
          "중복된 정류장",
          `'${newStop.stopName}' 정류장은 이미 추가되어 있습니다.`,
          [{ text: "확인" }]
      );
    }
  };

  const handleBusPress = (routeId: string, routeName: string, cityCode: string) => {
    setSelectedRoute({ routeId, routeName, cityCode });
    setIsRouteModalVisible(true);
  };

  const handleOpenAddModal = () => {
      if (currentUserLocation) {
          setIsAddModalVisible(true);
      } else {
          Alert.alert(
              "위치 정보 확인 실패",
              "현재 위치 정보를 가져올 수 없습니다. 잠시 후 앱을 다시 시작하거나 위치 권한을 확인해주세요."
          );
      }
  };

  if (isLoading) { return <View style={styles.center}><ActivityIndicator size="large" /></View> }

  return (
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
                        {weather.hourly.map((item, index) => <HourlyWeatherItem key={index} item={item} />)}
                    </ScrollView>
                </View>
            </>
        )}
      
      <ScrollView contentContainerStyle={styles.scrollContainer}>
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
            <Text style={styles.moduleTitle}>나의 정류장</Text>
            {isCityLoading ? (
                <ActivityIndicator color="#2563EB" />
            ) : (
                <TouchableOpacity onPress={handleOpenAddModal}>
                  <Ionicons name="add-circle-outline" size={28} color="#2563EB" />
                </TouchableOpacity>
            )}
          </View>
          {displayStops.length > 0 ? displayStops.map(stop => (
            <View key={stop.stopId} style={styles.card}>
              <Text style={styles.cardTitle}>{stop.stopName}</Text>
              {stop.arrivals.length > 0 ? stop.arrivals.map(bus => (
                <TouchableOpacity key={bus.routeId} onPress={() => handleBusPress(bus.routeId, bus.routeNo, stop.cityCode)}>
                  <View style={styles.busItem}>
                    <Text style={styles.busRouteText}>{bus.routeNo}번</Text>
                    <Text style={[styles.busArrivalText, bus.arrTime === -1 && styles.noBusServiceText]}>
                      {bus.arrTime === -1 ? '운행 정보 없음' : (bus.arrTime < 1 ? '곧 도착' : `${bus.arrTime}분`)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )) : <Text style={styles.noBusStopText}>선택하신 버스의 도착 정보가 없습니다.</Text>}
            </View>
          )) : (
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
      />
      {selectedRoute && (
        <BusRouteModal 
          visible={isRouteModalVisible}
          onClose={() => {setIsRouteModalVisible(false); setSelectedRoute(null);}}
          routeId={selectedRoute.routeId}
          routeName={selectedRoute.routeName}
          cityCode={selectedRoute.cityCode}
        />
      )}
    </SafeAreaView>
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
    cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    busItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
    busRouteText: { fontSize: 16, fontWeight: '500' },
    busArrivalText: { fontSize: 16, fontWeight: 'bold', color: '#2563EB' },
    noBusServiceText: { color: '#9CA3AF', fontWeight: 'normal' },
    noBusStopText: { color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
});