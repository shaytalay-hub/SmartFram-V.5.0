#ifndef MODELS_H
#define MODELS_H

#include <Arduino.h>

enum SensorID {
    S_PH,
    S_TDS,
    S_SOIL,
    S_THERM,
    S_TEMP,
    S_HUMID,
    S_WATER_LEVEL,
    S_RAIN,
    S_LDR,
    S_NONE
};

enum SystemMode {
    MODE_ONLINE,
    MODE_OFFLINE,
    MODE_SAFE
};

enum RelayMode {
    RELAY_AUTO,
    RELAY_MANUAL
};

struct SensorData {
    SensorID id;
    float value;
    bool is_valid;
    uint32_t timestamp;
};

struct RelayConfig {
    SensorID bound_sensor_id;
    float min_val;
    float max_val;
    float optimal_val;
    uint32_t work_duration_sec;
    uint32_t wait_duration_sec;
    RelayMode current_mode;
    bool current_state;
    uint32_t manual_override_end_ms;
    bool safety_halt;
};

struct CalibrationData {
    float ph_slope;
    float ph_intercept;
    float tds_factor;
};

extern CalibrationData calib;

#endif // MODELS_H
