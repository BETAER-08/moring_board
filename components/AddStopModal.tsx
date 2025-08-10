// components/AddStopModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal, SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { TextInput as PaperTextInput, Button as PaperButton, ActivityIndicator as PaperActivityIndicator, List, Divider } from 'react-native-paper';
import { City, SavedStop, FavoriteBus, StopSearchResult, BusArrivalInfo } from '../types';
import { fetchNearbyStops, fetchAllBusesForStop, fetchRoutesForStop } from '../services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (stop: SavedStop) => void;
  currentCity: City | null;
  location: Location.LocationObject | null;
  maxFavorites: number;            // ★ 추가
}
type Step = 'search' | 'selectBus';

export const AddStopModal: React.FC<Props> = ({ visible, onClose, onSave, currentCity, location, maxFavorites }) => {
  const [step, setStep] = useState<Step>('search');
  const [isLoading, setIsLoading] = useState(false);
  const [stopQuery, setStopQuery] = useState('');
  const [allNearbyStops, setAllNearbyStops] = useState<StopSearchResult[]>([]);
  const [stopResults, setStopResults] = useState<StopSearchResult[]>([]);
  const [selectedStop, setSelectedStop] = useState<StopSearchResult | null>(null);
  const [buses, setBuses] = useState<FavoriteBus[]>([]);
  const [selectedBuses, setSelectedBuses] = useState<FavoriteBus[]>([]);
  const [allRoutesAtStop, setAllRoutesAtStop] = useState<FavoriteBus[]>([]);

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
      const filtered = allNearbyStops.filter(stop =>
        stop.name.toLowerCase().includes(stopQuery.toLowerCase()) ||
        (stop.stopNo?.toString() ?? '').includes(stopQuery)
      );
      const score = (name: string, q: string) => {
        const n = name.toLowerCase(); const s = q.toLowerCase();
        if (n === s) return 3; if (n.startsWith(s)) return 2; if (n.includes(s)) return 1; return 0;
      };
      setStopResults(filtered.sort((a, b) => score(b.name, stopQuery) - score(a.name, stopQuery)));
    } else {
      setStopResults([]);
    }
  }, [stopQuery, allNearbyStops]);

  const handleStopSelect = async (stop: StopSearchResult) => {
    if (!stop.id) { Alert.alert('조회 불가', '고유 ID가 없는 정류장입니다.'); return; }
    setSelectedStop(stop);
    setStep('selectBus');
    setIsLoading(true);
    const routes = await fetchRoutesForStop(stop.id, stop.cityCode);
    setAllRoutesAtStop(routes);
    const arrivals: BusArrivalInfo[] = await fetchAllBusesForStop(stop.id, stop.cityCode);
    // const arrivalsMap = new Map(arrivals.map(a => [a.routeId, a])); // 필요 시 사용
    setBuses(routes);
    setIsLoading(false);
  };

  const toggleBusSelection = (bus: FavoriteBus) => {
    setSelectedBuses(prev => {
      const on = prev.some(b => b.routeId === bus.routeId);
      return on ? prev.filter(b => b.routeId !== bus.routeId) : (prev.length < maxFavorites ? [...prev, bus] : prev);
    });
  };

  const handleSave = () => {
    if (selectedStop && selectedStop.id && selectedStop.cityCode && selectedBuses.length > 0) {
      onSave({
        cityCode: selectedStop.cityCode,
        stopId: selectedStop.id,
        stopName: selectedStop.name,
        favoriteBuses: selectedBuses,
        allDiscoveredBuses: allRoutesAtStop.length ? allRoutesAtStop : selectedBuses,
      });
      handleClose();
    }
  };

  const resetState = () => {
    setStep('search');
    setStopQuery(''); setStopResults([]); setSelectedStop(null);
    setBuses([]); setSelectedBuses([]); setAllRoutesAtStop([]);
  };

  const handleClose = () => { resetState(); onClose(); };

  const handleBack = () => {
    if (step === 'selectBus') { setBuses([]); setSelectedBuses([]); setStep('search'); }
  };

  const renderStepContent = () => {
    if (isLoading) return <PaperActivityIndicator style={{ marginTop: 40 }} />;
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
              <Text style={styles.emptyText}>
                {stopQuery.length > 1 ? '검색 결과가 없습니다.' : '주변 정류장을 검색해보세요.'}
              </Text>
            }
          />
        );
      case 'selectBus':
        return (
          <FlatList
            data={buses}
            keyExtractor={(item, index) => `${item.routeId}-${index}`}
            renderItem={({ item }) => {
              const isSelected = selectedBuses.some(b => b.routeId === item.routeId);
              return (
                <>
                  <List.Item
                    title={`${item.routeNo}번`}
                    description={isSelected ? '선택됨' : undefined}
                    onPress={() => toggleBusSelection(item)}
                    right={props => isSelected ? <List.Icon {...props} icon="check" /> : null}
                  />
                  <Divider />
                </>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>표시할 노선이 없습니다.</Text>}
          />
        );
    }
  };

  const getTitle = () => step === 'search'
    ? `${currentCity?.name || ''} 주변 정류장 검색`
    : `${selectedStop?.name || ''} 버스 선택 (최대 ${maxFavorites}개)`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          {step !== 'search'
            ? <TouchableOpacity onPress={handleBack}><Text style={styles.headerButton}>뒤로</Text></TouchableOpacity>
            : <View style={{ width: 50 }} />}
          <Text style={styles.title}>{getTitle()}</Text>
          <TouchableOpacity onPress={handleClose}><Text style={styles.headerButton}>닫기</Text></TouchableOpacity>
        </View>
        <View style={styles.content}>
          {step === 'search' && (
            <PaperTextInput
              mode="outlined"
              placeholder="정류장 이름 또는 번호 검색"
              value={stopQuery}
              onChangeText={setStopQuery}
              style={styles.input}
            />
          )}
          {renderStepContent()}
        </View>
        {step === 'selectBus' && (
          <View style={styles.footer}>
            <PaperButton mode="contained" onPress={handleSave} disabled={selectedBuses.length === 0}>
              {`${selectedBuses.length}개 버스 저장하기`}
            </PaperButton>
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
  input: { marginBottom: 16, backgroundColor: 'white' },
  listItem: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  stopInfoContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  text: { fontSize: 16 },
  stopNumberText: { fontSize: 14, color: '#9CA3AF', marginLeft: 8 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#9CA3AF' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
});
