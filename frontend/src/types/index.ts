export type SensorType = 'pH' | 'TDS' | 'Soil' | 'Temp' | 'Humid' | 'WaterLevel' | 'Rain' | 'LDR';

export interface SensorData {
  type: SensorType;
  value: number;
  unit: string;
  status: 'Online' | 'Error';
  threshold: {
    min: number;
    max: number;
    optimal: number;
  };
}

export interface RelayConfig {
  channel: number;
  name: string;
  status: boolean;
  mode: 'Auto' | 'Manual';
  bound_sensor?: SensorType;
  countdown?: number; // in seconds
}

export interface SystemStatus {
  isOnline: boolean;
  uptime: string;
  sdUsage: number;
  ramUsage: number;
  lastSeen: string;
}
