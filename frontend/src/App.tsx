import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  BarChart3, 
  Wifi, 
  WifiOff, 
  Activity,
  Zap
} from 'lucide-react';
import type { SensorData, RelayConfig, SystemStatus } from './types';
import { apiService } from './services/api';

import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

const mockChartData = [
  { time: '00:00', temp: 25, humid: 60, ph: 6.5 },
  { time: '04:00', temp: 23, humid: 65, ph: 6.6 },
  { time: '08:00', temp: 28, humid: 55, ph: 6.4 },
  { time: '12:00', temp: 32, humid: 45, ph: 6.3 },
  { time: '16:00', temp: 30, humid: 50, ph: 6.5 },
  { time: '20:00', temp: 26, humid: 58, ph: 6.6 },
];

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [sensors, setSensors] = useState<SensorData[]>([]);
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingRelay, setPendingRelay] = useState<number | null>(null);
  
  const [isCalibOpen, setIsCalibOpen] = useState(false);
  const [calibStep, setCalibStep] = useState(0);
  const [calibData, setCalibData] = useState({ ph4: 0, ph7: 0, tds: 0 });

  useEffect(() => {
    // 1. Initial Fetch
    const init = async () => {
      try {
        const [s, sens] = await Promise.all([
          apiService.getSystemStatus(),
          apiService.getSensors()
        ]);
        setStatus(s);
        setSensors(sens);
        
        // Use standard fetching or the service to get initial relays
        // For brevity, we'll keep the mock logic if service isn't fully implemented for initial relays
        // But the requirement is about Realtime, so let's focus on subscriptions.
        setRelays(Array.from({ length: 8 }, (_, i) => ({
            channel: i + 1,
            name: `Relay ${i + 1}`,
            status: false,
            mode: 'Auto',
            bound_sensor: 'Soil'
          } as RelayConfig)));
      } catch (err) {
        console.error("Init failed", err);
      }
    };
    init();

    // 2. Setup Realtime Subscriptions via apiService
    const sensorSub = apiService.subscribeToSensors((readings) => {
      setSensors(prev => prev.map(s => ({
        ...s,
        value: readings[s.type] !== undefined ? readings[s.type] : s.value
      })));
    });

    const relaySub = apiService.subscribeToRelays((updatedRelay) => {
      setRelays(prev => prev.map(r => r.channel === updatedRelay.channel ? {
        ...r,
        mode: updatedRelay.mode,
        status: updatedRelay.mode === 'Manual' // Simplified logic
      } : r));
    });

    return () => {
      if (sensorSub) sensorSub.unsubscribe();
      if (relaySub) relaySub.unsubscribe();
    };
  }, []);

  const handleRelayToggle = (channel: number) => {
    const relay = relays.find(r => r.channel === channel);
    if (relay?.mode === 'Manual' && relay.status) {
      setPendingRelay(channel);
      setIsModalOpen(true);
    } else {
      // Optimistic UI update
      setRelays(prev => prev.map(r => r.channel === channel ? { ...r, status: !r.status } : r));
      // Call service to update backend
      apiService.updateRelay(channel, { mode: 'Manual', state: !relay?.status });
    }
  };

  const confirmStop = () => {
    if (pendingRelay) {
      setRelays(prev => prev.map(r => r.channel === pendingRelay ? { ...r, status: false } : r));
      apiService.updateRelay(pendingRelay, { mode: 'Auto' });
    }
    setIsModalOpen(false);
  };

  const startCalib = () => {
    setCalibStep(1);
    setIsCalibOpen(true);
  };

  const handleCalibSave = async () => {
    const slope = (6.86 - 4.0) / (calibData.ph7 - calibData.ph4);
    const intercept = 4.0 - slope * calibData.ph4;
    await apiService.updateCalibration({
      ph_slope: slope,
      ph_intercept: intercept,
      tds_factor: 1.0
    });
    setIsCalibOpen(false);
    setCalibStep(0);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <nav className="fixed bottom-0 w-full bg-white dark:bg-gray-800 border-t dark:border-gray-700 md:relative md:w-64 md:h-screen md:border-t-0 md:border-r z-50">
        <div className="p-4 hidden md:block">
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Zap size={24} /> SmartFram
          </h1>
        </div>
        <div className="flex md:flex-col justify-around p-2 md:p-4 gap-2">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col md:flex-row items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <LayoutDashboard size={20} /> <span className="text-xs md:text-base">Dashboard</span>
          </button>
          <button onClick={() => setActiveTab('analytics')} className={`flex flex-col md:flex-row items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'analytics' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <BarChart3 size={20} /> <span className="text-xs md:text-base">Analytics</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col md:flex-row items-center gap-3 p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <Settings size={20} /> <span className="text-xs md:text-base">Settings</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white uppercase tracking-tight">{activeTab}</h2>
            <p className="text-gray-500 dark:text-gray-400">System is {status?.isOnline ? 'performing optimally' : 'offline'}</p>
          </div>
          <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-2 px-4 rounded-2xl shadow-sm border dark:border-gray-700">
            <div className="flex items-center gap-2">
              {status?.isOnline ? <Wifi className="text-green-500" size={18} /> : <WifiOff className="text-red-500" size={18} />}
              <span className="text-sm font-medium">{status?.isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {sensors.map((sensor) => (
                <div key={sensor.type} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border dark:border-gray-700 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                      <Activity size={24} />
                    </div>
                  </div>
                  <h3 className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{sensor.type}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-gray-800 dark:text-white">{sensor.value.toFixed(1)}</span>
                  </div>
                  <div className="mt-4 h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (sensor.value / 100) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </section>

            <section className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {relays.map((relay) => (
                  <div key={relay.channel} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border dark:border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${relay.status ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
                        <Zap size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold">{relay.name}</h4>
                        <p className="text-xs opacity-60">{relay.mode} • {relay.bound_sensor}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRelayToggle(relay.channel)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${relay.status ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${relay.status ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700">
              <h3 className="text-lg font-bold mb-6">Environmental Trends</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockChartData}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.1} />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="temp" stroke="#10b981" fillOpacity={1} fill="url(#colorTemp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700">
                  <h3 className="font-bold mb-4">Export Data</h3>
                  <div className="flex gap-3">
                    <button className="flex-1 bg-gray-100 dark:bg-gray-700 p-3 rounded-xl font-medium hover:bg-gray-200 transition-colors">CSV</button>
                    <button className="flex-1 bg-gray-100 dark:bg-gray-700 p-3 rounded-xl font-medium hover:bg-gray-200 transition-colors">PDF</button>
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700">
              <h3 className="font-bold mb-4">Network Configuration</h3>
              <div className="space-y-4">
                <input type="text" placeholder="WiFi SSID" className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20" />
                <input type="password" placeholder="WiFi Password" className="w-full bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border dark:border-gray-700">
              <h3 className="font-bold mb-4">Sensor Precision</h3>
              <button 
                onClick={startCalib}
                className="w-full bg-secondary/10 text-secondary p-4 rounded-2xl font-bold border border-secondary/20 hover:bg-secondary/20 transition-all"
              >
                Run Calibration Wizard
              </button>
            </div>
            <button className="w-full bg-primary text-white p-4 rounded-2xl font-bold shadow-lg shadow-primary/20">Apply All Changes</button>
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full border dark:border-gray-700">
            <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-white">Stop Manual Override?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">This will return the relay to Automatic control mode.</p>
            <div className="flex gap-3">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white">Cancel</button>
              <button onClick={confirmStop} className="flex-1 p-3 rounded-xl font-bold bg-red-500 text-white shadow-lg shadow-red-500/30">Stop Now</button>
            </div>
          </div>
        </div>
      )}

      {isCalibOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-[40px] shadow-2xl max-w-md w-full border dark:border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Calibration Wizard</h3>
              <div className="text-sm font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">Step {calibStep}/3</div>
            </div>

            {calibStep === 1 && (
              <div className="space-y-4">
                <p className="text-gray-500 dark:text-gray-400">Place the pH sensor in a <span className="font-bold text-red-500">pH 4.0</span> buffer solution.</p>
                <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-3xl text-center border dark:border-gray-700">
                   <span className="text-4xl font-mono font-bold text-gray-800 dark:text-white">{sensors.find(s => s.type === 'pH')?.value.toFixed(2) || '0.00'}</span>
                </div>
                <button onClick={() => {
                   setCalibData({...calibData, ph4: sensors.find(s => s.type === 'pH')?.value || 0});
                   setCalibStep(2);
                }} className="w-full bg-primary text-white p-4 rounded-2xl font-bold">Capture pH 4.0</button>
              </div>
            )}

            {calibStep === 2 && (
              <div className="space-y-4">
                <p className="text-gray-500 dark:text-gray-400">Rinse and place in <span className="font-bold text-green-500">pH 6.86</span> solution.</p>
                <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-3xl text-center border dark:border-gray-700">
                   <span className="text-4xl font-mono font-bold text-gray-800 dark:text-white">{sensors.find(s => s.type === 'pH')?.value.toFixed(2) || '0.00'}</span>
                </div>
                <button onClick={() => {
                   setCalibData({...calibData, ph7: sensors.find(s => s.type === 'pH')?.value || 0});
                   setCalibStep(3);
                }} className="w-full bg-primary text-white p-4 rounded-2xl font-bold">Capture pH 6.86</button>
              </div>
            )}

            {calibStep === 3 && (
              <div className="space-y-6">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100 dark:border-green-800">
                   <p className="text-green-600 dark:text-green-400 text-sm font-medium text-center">Data captured successfully. Ready to sync offsets.</p>
                </div>
                <button onClick={handleCalibSave} className="w-full bg-primary text-white p-4 rounded-2xl font-bold shadow-lg shadow-primary/20">Finalize & Save</button>
              </div>
            )}
            
            <button onClick={() => setIsCalibOpen(false)} className="w-full mt-4 text-gray-500 font-medium py-2">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
