import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import type { SensorData, SystemStatus } from '../types';

const IS_OFFLINE = window.location.hostname === '192.168.4.1' || window.location.hostname.startsWith('192.168.');

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
);

export const apiService = {
  async getSystemStatus(): Promise<SystemStatus> {
    if (IS_OFFLINE) {
      const res = await axios.get('/api/status');
      return res.data;
    } else {
      const { data } = await supabase.from('devices').select('*').single();
      return {
        isOnline: data?.status === 'Online',
        uptime: 'N/A',
        sdUsage: 45,
        ramUsage: 60,
        lastSeen: data?.last_seen || ''
      };
    }
  },

  async getSensors(): Promise<SensorData[]> {
    if (IS_OFFLINE) {
      const res = await axios.get('/api/sensors');
      return Object.entries(res.data).map(([key, val]) => ({
        type: key as any,
        value: val as number,
        unit: '',
        status: 'Online',
        threshold: { min: 0, max: 100, optimal: 50 }
      }));
    } else {
      const { data } = await supabase.from('sensor_configs').select('*');
      return (data || []).map((d: any) => ({
        type: d.sensor_type,
        value: 0,
        unit: '',
        status: 'Online',
        threshold: { min: d.min_val, max: d.max_val, optimal: d.optimal_val }
      }));
    }
  },

  // Supabase Realtime Subscriptions
  subscribeToSensors(callback: (readings: any) => void) {
    if (IS_OFFLINE) return null;
    return supabase
      .channel('sensor-logs-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_logs' }, (payload) => {
        callback(payload.new.payload);
      })
      .subscribe();
  },

  subscribeToRelays(callback: (relay: any) => void) {
    if (IS_OFFLINE) return null;
    return supabase
      .channel('relay-configs-channel')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'relay_configs' }, (payload) => {
        callback(payload.new);
      })
      .subscribe();
  },

  async updateRelay(channel: number, payload: any) {
    if (IS_OFFLINE) {
      return axios.post(`/api/relay/${channel}`, payload);
    } else {
      return supabase.from('relay_configs').update(payload).eq('channel', channel);
    }
  },

  async updateCalibration(payload: any) {
    if (IS_OFFLINE) {
      return axios.post('/api/calibrate', payload);
    } else {
      return supabase.from('sensor_configs').update({
        display_color_logic: payload 
      }).eq('sensor_type', 'pH');
    }
  }
};
