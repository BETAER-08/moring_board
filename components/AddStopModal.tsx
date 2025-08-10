// components/AddStopModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal, SafeAreaView, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Button, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { City, SavedStop, FavoriteBus, StopSearchResult, BusArrivalInfo } from '../types';
// fetchRoutesForStop_Test 함수를 import 합니다.
import { fetchNearbyStops, fetchAllBusesForStop, fetchRoutesForStop_Test } from '../services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (stop: SavedStop) => void;
  currentCity: City | null;
  location: Location.LocationObject | null;
}
type Step = 'search' | 'selectBus';

export const AddStopModal: React.FC<Props> = ({ visible, onClose, onSave, currentCity, location }) => {
  const [step, setStep] = useState<Step>('search');
  const [isLoading, setIsLoading] = useState(false);
  const [stopQuery, setStopQuery] = useState('');
  const [allNearbyStops, setAllNearbyStops] = useState<StopSearchResult[]>([]);
  const [stopResults, setStopResults] = useState<StopSearchResult[]>([]);
  const [selectedStop, setSelectedStop] = useState<StopSearchResult | null>(null);
  const [buses, setBuses] = useState<FavoriteBus[]>([]);
  const [selectedBuses, setSelectedBuses] = useState<FavoriteBus[]>([]);

  useEffect(() => {
    const loadAndReset = async () => {
        if (visible) {
            resetState();
            if (location) {
                setIsLoading(true);
                const nearby = await fetchNearbyStops(location.coords.latitude, location.coords.longitude);
                setAllNearbyStops(nearby);
                setIsLoading(false);
            }
        } else {
            setAllNearbyStops([]);
        }
    };
    loadAndReset();
  }, [visible, location]);

  useEffect(() => {
    if (stopQuery.length > 1) {
      const filteredResults = allNearbyStops.filter(stop => 
        stop.name.toLowerCase().includes(stopQuery.toLowerCase()) || 
        (stop.stopNo?.toString() ?? '').includes(stopQuery)
      );
      const getScore = (name: string, query: string) => {
          const lowerName = name.toLowerCase();
          const lowerQuery = query.toLowerCase();
          if (lowerName === lowerQuery) return 3;
          if (lowerName.startsWith(lowerQuery)) return 2;
          if (lowerName.includes(lowerQuery)) return 1;
          return 0;
      };
      const sortedResults = filteredResults.sort((a, b) => getScore(b.name, stopQuery) - getScore(a.name, stopQuery));
      setStopResults(sortedResults);
    } else {
      setStopResults([]);
    }
  }, [stopQuery, allNearbyStops]);
  
  const handleStopSelect = async (stop: StopSearchResult) => {
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★
    //          요청하신 로그 추가 부분
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★
    console.groupCollapsed(`[정류장 선택 로그] ${stop.name}`);
    console.log("정류장 이름:", stop.name);
    console.log("정류장 번호 (nodeno):", stop.stopNo);
    console.log("정류장 시스템 ID (nodeid):", stop.id);
    console.log("도시 코드 (cityCode):", stop.cityCode);

    if (stop.stopNo && stop.cityCode) {
        // '모든 노선 조회' API를 호출하여 로그를 출력합니다.
        const allRoutesList = await fetchRoutesForStop_Test(stop.stopNo.toString(), stop.cityCode);
        const routeNumbers = allRoutesList.map(route => route.routeNo);
        console.log(`이 정류장을 지나는 것으로 조회된 전체 노선 목록 (${routeNumbers.length}개):`, routeNumbers);
    } else {
        console.log("정류장 번호 또는 도시 코드가 없어 노선 목록을 조회할 수 없습니다.");
    }
    console.groupEnd();
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★
    //            로그 추가 끝
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★


    // --- 이하 기존 앱의 UI를 위한 로직은 변경 없이 그대로 실행됩니다. ---
    if (!stop.stopNo) {
        Alert.alert("조회 불가", "고유 번호가 없는 정류장입니다.");
        return;
    }
    setSelectedStop(stop);
    setStep('selectBus');
    setIsLoading(true);
    // UI에는 안정적인 실시간 도착 정보 API 결과를 사용합니다.
    const arrivalInfo: BusArrivalInfo[] = await fetchAllBusesForStop(stop.stopNo.toString(), stop.cityCode);
    const routesFromArrivals: FavoriteBus[] = arrivalInfo.map(bus => ({
        routeId: bus.routeId,
        routeNo: bus.routeNo,
    }));
    const uniqueRoutes = Array.from(new Map(routesFromArrivals.map(route => [route.routeId, route])).values());
    setBuses(uniqueRoutes);
    setIsLoading(false);
  };

  const toggleBusSelection = (bus: FavoriteBus) => {
    setSelectedBuses(prev => {
      const isSelected = prev.some(b => b.routeId === bus.routeId);
      if (isSelected) {
        return prev.filter(b => b.routeId !== bus.routeId);
      } else {
        return prev.length < 5 ? [...prev, bus] : prev;
      }
    });
  };
  
  const handleSave = () => {
    if (selectedStop && selectedStop.stopNo && selectedStop.cityCode && selectedBuses.length > 0) {
      onSave({
        cityCode: selectedStop.cityCode,
        stopId: selectedStop.stopNo.toString(),
        stopName: selectedStop.name,
        favoriteBuses: selectedBuses,
        allDiscoveredBuses: selectedBuses,
      });
      handleClose();
    }
  };

  const resetState = () => {
      setStep('search');
      setStopQuery(''); setStopResults([]); setSelectedStop(null);
      setBuses([]); setSelectedBuses([]);
  }

  const handleClose = () => { resetState(); onClose(); };
  
  const handleBack = () => {
      if (step === 'selectBus') {
          setBuses([]);
          setSelectedBuses([]);
          setStep('search');
      }
  }

  const renderStepContent = () => {
    if (isLoading) {
        return <ActivityIndicator style={{ marginTop: 40 }} size="large" />;
    }
    
    switch (step) {
      case 'search':
        return (
          <FlatList 
            data={stopResults} 
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => handleStopSelect(item)}>
                <View style={styles.stopInfoContainer}>
                    <Text style={styles.text}>{item.name}</Text>
                    {item.stopNo && <Text style={styles.stopNumberText}>[{item.stopNo}]</Text>}
                </View>
              </TouchableOpacity>
            )} 
            ListEmptyComponent={
                !isLoading && stopQuery.length > 1 ? 
                <Text style={styles.emptyText}>검색 결과가 없습니다.</Text> : 
                <Text style={styles.emptyText}>주변 정류장을 검색해보세요.</Text>
            }
          />
        );
      case 'selectBus':
        return (
          <FlatList data={buses} 
            keyExtractor={(item, index) => `${item.routeId}-${index}`}
            renderItem={({ item }) => {
              const isSelected = selectedBuses.some(b => b.routeId === item.routeId);
              return (
                <TouchableOpacity style={[styles.listItem, isSelected && styles.selectedItem]} onPress={() => toggleBusSelection(item)}>
                  <Text style={isSelected ? styles.selectedText : styles.text}>{item.routeNo}번</Text>
                </TouchableOpacity>
              )}
            } ListEmptyComponent={<Text style={styles.emptyText}>현재 운행중인 버스가 없습니다.</Text>}
          />
        );
    }
  };
  
  const getTitle = () => {
      switch(step) {
          case 'search': return `${currentCity?.name || ''} 주변 정류장 검색`;
          case 'selectBus': return `${selectedStop?.name || ''} 버스 선택 (최대 5개)`;
      }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          {step !== 'search' ? 
            <TouchableOpacity onPress={handleBack}><Text style={styles.headerButton}>뒤로</Text></TouchableOpacity> : <View style={{width: 50}} />}
          <Text style={styles.title}>{getTitle()}</Text>
          <TouchableOpacity onPress={handleClose}><Text style={styles.headerButton}>닫기</Text></TouchableOpacity>
        </View>
        <View style={styles.content}>
            {step === 'search' && <TextInput style={styles.input} placeholder="정류장 이름 또는 번호 검색" value={stopQuery} onChangeText={setStopQuery} autoFocus />}
            {renderStepContent()}
        </View>
        {step === 'selectBus' && (
            <View style={styles.footer}>
                <Button title={`${selectedBuses.length}개 버스 저장하기`} onPress={handleSave} disabled={selectedBuses.length === 0} />
            </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    title: { fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
    headerButton: { fontSize: 16, color: '#2563EB', width: 50 },
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
    input: { height: 44, borderColor: '#D1D5DB', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginBottom: 16, backgroundColor: 'white' },
    listItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    selectedItem: { backgroundColor: '#DBEAFE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 },
    stopInfoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
    text: { fontSize: 16 },
    selectedText: { fontSize: 16, fontWeight: 'bold', color: '#1D4ED8' },
    subText: { fontSize: 12, color: '#6B7280' },
    stopNumberText: { fontSize: 14, color: '#9CA3AF', marginLeft: 8 },
    emptyText: { textAlign: 'center', marginTop: 40, color: '#9CA3AF' },
    footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' }
});