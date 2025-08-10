// components/BusRouteModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal, SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Button } from 'react-native';
import { BusRouteDetails } from '../types';
import { fetchBusRouteDetails } from '../services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  cityCode: string;
  routeId: string;
  routeName: string;
}

export const BusRouteModal: React.FC<Props> = ({ visible, onClose, cityCode, routeId, routeName }) => {
  const [details, setDetails] = useState<BusRouteDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setIsLoading(true);
      const loadData = async () => {
        const data = await fetchBusRouteDetails(routeId, cityCode);
        setDetails(data);
        setIsLoading(false);
      };
      loadData();
    }
  }, [visible, routeId, cityCode]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{routeName}번 버스 노선 정보</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.headerButton}>닫기</Text></TouchableOpacity>
        </View>
        {isLoading || !details ? <ActivityIndicator style={{marginTop: 20}} size="large" /> : (
          <FlatList
            data={details.routeStops}
            keyExtractor={item => item.id}
            renderItem={({ item, index }) => {
              const isBusHere = details.busLocations.some(loc => loc.currentStopId === item.id);
              return (
                <View style={styles.routeItem}>
                  <View style={styles.timeline}>
                    <View style={styles.line} />
                    <View style={[styles.dot, isBusHere && styles.busDot]} />
                    <View style={styles.line} />
                  </View>
                  <Text style={[styles.routeName, isBusHere && styles.currentStop]}>{item.name}</Text>
                  {isBusHere && <Text style={styles.busIcon}>🚌</Text>}
                </View>
              );
            }}
            contentContainerStyle={{padding: 16}}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    title: { fontSize: 18, fontWeight: 'bold' },
    headerButton: { fontSize: 16, color: '#2563EB' },
    routeItem: { flexDirection: 'row', alignItems: 'center', minHeight: 50 },
    timeline: { width: 20, alignItems: 'center' },
    line: { flex: 1, width: 2, backgroundColor: '#CBD5E1' },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#CBD5E1', marginVertical: 4 },
    busDot: { backgroundColor: '#2563EB' },
    routeName: { flex: 1, marginLeft: 12, fontSize: 16 },
    currentStop: { fontWeight: 'bold', color: '#1E40AF' },
    busIcon: { fontSize: 20, marginLeft: 8 }
});
