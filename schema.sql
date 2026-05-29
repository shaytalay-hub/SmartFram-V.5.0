-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table (linked to Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Farms table
CREATE TABLE public.farms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    line_notify_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Devices table
CREATE TYPE device_status AS ENUM ('Online', 'Offline');
CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    farm_id UUID REFERENCES public.farms(id) ON DELETE CASCADE NOT NULL,
    mac_address TEXT UNIQUE NOT NULL,
    status device_status DEFAULT 'Offline',
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sensor Configurations
CREATE TABLE public.sensor_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    sensor_type TEXT NOT NULL, -- e.g., 'pH', 'TDS', 'Soil'
    min_val FLOAT,
    max_val FLOAT,
    optimal_val FLOAT,
    display_color_logic JSONB DEFAULT '{"low": "blue", "optimal": "green", "high": "red"}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Relay Configurations
CREATE TYPE relay_mode AS ENUM ('Auto', 'Manual');
CREATE TABLE public.relay_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    channel INTEGER CHECK (channel BETWEEN 1 AND 8),
    bound_sensor_id UUID REFERENCES public.sensor_configs(id) ON DELETE SET NULL,
    mode relay_mode DEFAULT 'Auto',
    min_val FLOAT,
    max_val FLOAT,
    work_sec INTEGER DEFAULT 60,
    wait_sec INTEGER DEFAULT 300,
    active_days JSONB DEFAULT '["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]'::jsonb,
    start_time TIME DEFAULT '00:00:00',
    end_time TIME DEFAULT '23:59:59',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Sensor Logs (Time-series)
CREATE TABLE public.sensor_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB NOT NULL, -- { "ph": 6.5, "tds": 800, ... }
    fault_flags JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX idx_sensor_logs_timestamp ON public.sensor_logs(timestamp DESC);
CREATE INDEX idx_sensor_logs_device_id ON public.sensor_logs(device_id, timestamp DESC);
CREATE INDEX idx_devices_mac ON public.devices(mac_address);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relay_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensor_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only see their own profile
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Farms: Users can only see farms they own
CREATE POLICY "Users can manage their own farms" ON public.farms
    FOR ALL USING (auth.uid() = user_id);

-- Devices: Users can only see devices in their farms
CREATE POLICY "Users can view devices in their farms" ON public.devices
    FOR SELECT USING (
        farm_id IN (SELECT id FROM public.farms WHERE user_id = auth.uid())
    );

-- Sensor Configs: Isolated by device -> farm -> user
CREATE POLICY "Users can manage sensor configs for their devices" ON public.sensor_configs
    FOR ALL USING (
        device_id IN (
            SELECT d.id FROM public.devices d
            JOIN public.farms f ON d.farm_id = f.id
            WHERE f.user_id = auth.uid()
        )
    );

-- Relay Configs: Isolated by device -> farm -> user
CREATE POLICY "Users can manage relay configs for their devices" ON public.relay_configs
    FOR ALL USING (
        device_id IN (
            SELECT d.id FROM public.devices d
            JOIN public.farms f ON d.farm_id = f.id
            WHERE f.user_id = auth.uid()
        )
    );

-- Sensor Logs: Isolated by device -> farm -> user
CREATE POLICY "Users can view logs for their devices" ON public.sensor_logs
    FOR SELECT USING (
        device_id IN (
            SELECT d.id FROM public.devices d
            JOIN public.farms f ON d.farm_id = f.id
            WHERE f.user_id = auth.uid()
        )
    );

-- Function to handle profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
