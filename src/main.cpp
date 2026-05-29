#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <FS.h>
#include <LittleFS.h>
#include <SD.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ESPAsyncWebServer.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include <Adafruit_ADS1X15.h>
#include <RTClib.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include "config.h"
#include "models.h"

// Global Objects
Adafruit_ADS1115 ads;
RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(LCD_ADDR, 16, 2);
DHT dht(DHT_PIN, DHT22);
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
AsyncWebServer server(80);
DNSServer dnsServer;

// FreeRTOS Mutexes
SemaphoreHandle_t i2cMutex;
SemaphoreHandle_t bufferMutex;

// Global State
SystemMode currentSystemMode = MODE_OFFLINE;
RelayConfig relays[8];
SensorData latestSensors[MAX_SENSORS];
float sensorBuffer[MAX_SENSORS][BUFFER_SIZE];
int bufferIndex = 0;

// WiFi Config
char wifi_ssid[32] = "Your_SSID";
char wifi_pass[64] = "Your_PASS";
const char* ap_ssid = "SmartFarm-AP";
const char* ap_pass = "12345678";

// MQTT Topics (Globals)
String baseTopic;
String controlTopic;
String statusTopic;
String logTopic;

// Task Handles
TaskHandle_t hSensorRead;
TaskHandle_t hRelayControl;
TaskHandle_t hHealthCheck;
TaskHandle_t hStorage;
TaskHandle_t hNetwork;

// Forward Declarations
void Task_SensorRead(void *pvParameters);
void Task_RelayControl(void *pvParameters);
void Task_HealthCheck(void *pvParameters);
void Task_Storage(void *pvParameters);
void Task_Network(void *pvParameters);
void loadConfig();
void saveConfig();

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    JsonDocument doc;
    deserializeJson(doc, payload, length);
    
    if (String(topic) == controlTopic) {
        int channel = doc["channel"];
        if (channel >= 1 && channel <= 8) {
            RelayConfig &r = relays[channel - 1];
            if (doc["mode"].is<const char*>()) r.current_mode = (doc["mode"] == "Manual") ? RELAY_MANUAL : RELAY_AUTO;
            if (doc["state"].is<bool>()) r.current_state = doc["state"];
            if (doc["duration"].is<int>()) {
                r.manual_override_end_ms = millis() + (uint32_t)doc["duration"] * 60000;
            }
            Serial.printf("Relay %d updated via MQTT\n", channel);
        }
    }
}

void setup() {
    Serial.begin(115200);
    for (int i = 0; i < 8; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH);
        relays[i].current_mode = RELAY_AUTO;
        relays[i].bound_sensor_id = S_NONE;
    }
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);

    i2cMutex = xSemaphoreCreateMutex();
    bufferMutex = xSemaphoreCreateMutex();

    Wire.begin(I2C_SDA, I2C_SCL);
    lcd.init();
    lcd.backlight();
    
    if (!ads.begin(ADS1115_ADDR)) currentSystemMode = MODE_SAFE;
    rtc.begin();
    dht.begin();
    LittleFS.begin(true);
    SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, SD_CS);
    SD.begin(SD_CS);

    loadConfig();

    xTaskCreatePinnedToCore(Task_SensorRead, "SensorRead", TASK_STACK_SIZE, NULL, TASK_PRIO_MID, &hSensorRead, 1);
    xTaskCreatePinnedToCore(Task_RelayControl, "RelayControl", TASK_STACK_SIZE, NULL, TASK_PRIO_MID, &hRelayControl, 1);
    xTaskCreatePinnedToCore(Task_HealthCheck, "HealthCheck", TASK_STACK_SIZE, NULL, TASK_PRIO_HIGH, &hHealthCheck, 0);
    xTaskCreatePinnedToCore(Task_Storage, "Storage", TASK_STACK_SIZE, NULL, TASK_PRIO_LOW, &hStorage, 0);
    xTaskCreatePinnedToCore(Task_Network, "Network", TASK_STACK_SIZE * 2, NULL, TASK_PRIO_MID, &hNetwork, 0);
}

void loop() { vTaskDelay(pdMS_TO_TICKS(1000)); }

void Task_SensorRead(void *pvParameters) {
    for (;;) {
        if (currentSystemMode == MODE_SAFE) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
        if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            float ph_volts = ads.readADC_SingleEnded(0) * 0.0001875;
            latestSensors[S_PH].value = (ph_volts * calib.ph_slope) + calib.ph_intercept;
            
            float tds_volts = ads.readADC_SingleEnded(1) * 0.0001875;
            latestSensors[S_TDS].value = tds_volts * 1000 * calib.tds_factor; 

            latestSensors[S_SOIL].value = map(ads.readADC_SingleEnded(2), 0, 26000, 100, 0);
            xSemaphoreGive(i2cMutex);
        }
        latestSensors[S_TEMP].value = dht.readTemperature();
        latestSensors[S_HUMID].value = dht.readHumidity();
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}

void Task_RelayControl(void *pvParameters) {
    for (;;) {
        if (currentSystemMode == MODE_SAFE) {
            for (int i = 0; i < 8; i++) digitalWrite(RELAY_PINS[i], HIGH);
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }
        for (int i = 0; i < 8; i++) {
            RelayConfig &r = relays[i];
            if (r.current_mode == RELAY_AUTO && r.bound_sensor_id != S_NONE) {
                float val = latestSensors[r.bound_sensor_id].value;
                if (val < r.min_val) r.current_state = true;
                else if (val > r.max_val) r.current_state = false;
            }
            digitalWrite(RELAY_PINS[i], r.current_state ? LOW : HIGH);
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void Task_HealthCheck(void *pvParameters) {
    for (;;) {
        bool ads_ok = false;
        if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            Wire.beginTransmission(ADS1115_ADDR);
            ads_ok = (Wire.endTransmission() == 0);
            xSemaphoreGive(i2cMutex);
        }
        if (!ads_ok) {
            if (currentSystemMode != MODE_SAFE) {
                currentSystemMode = MODE_SAFE;
                if (mqttClient.connected()) mqttClient.publish(statusTopic.c_str(), "{\"status\":\"Safe Mode\", \"error\":\"ADS1115 FAIL\"}");
            }
            digitalWrite(BUZZER_PIN, HIGH);
        } else {
            if (currentSystemMode == MODE_SAFE) {
                currentSystemMode = MODE_OFFLINE;
                if (mqttClient.connected()) mqttClient.publish(statusTopic.c_str(), "{\"status\":\"Online\"}");
            }
            digitalWrite(BUZZER_PIN, LOW);
        }
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}

int wifi_retries = 0;
const int MAX_WIFI_RETRIES = 3;

void setupWebServer() {
    // Serve Static Files from LittleFS (Gzipped)
    server.serveStatic("/", LittleFS, "/www/").setDefaultFile("index.html").setCacheControl("max-age=600");

    // Local API: Get Sensors
    server.on("/api/sensors", HTTP_GET, [](AsyncWebServerRequest *request){
        JsonDocument doc;
        for(int i=0; i<S_NONE; i++) {
            if (latestSensors[i].is_valid) doc[String(i)] = latestSensors[i].value;
        }
        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // Local API: Get/Set Relays
    server.on("/api/relays", HTTP_GET, [](AsyncWebServerRequest *request){
        JsonDocument doc;
        JsonArray arr = doc.to<JsonArray>();
        for(int i=0; i<8; i++) {
            JsonObject r = arr.add<JsonObject>();
            r["channel"] = i + 1;
            r["mode"] = (relays[i].current_mode == RELAY_MANUAL) ? "Manual" : "Auto";
            r["state"] = relays[i].current_state;
        }
        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // Local API: Update WiFi Config
    server.on("/api/config", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
        JsonDocument doc;
        deserializeJson(doc, data);
        if (doc.containsKey("ssid") && doc.containsKey("pass")) {
            strlcpy(wifi_ssid, doc["ssid"], sizeof(wifi_ssid));
            strlcpy(wifi_pass, doc["pass"], sizeof(wifi_pass));
            saveConfig();
            request->send(200, "application/json", "{\"success\":true}");
            delay(1000);
            ESP.restart();
        } else {
            request->send(400, "application/json", "{\"error\":\"Missing SSID/Pass\"}");
        }
    });

    // Local API: Calibrate Sensors
    server.on("/api/calibrate", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
        JsonDocument doc;
        deserializeJson(doc, data);
        if (doc["ph_slope"].is<float>()) calib.ph_slope = doc["ph_slope"];
        if (doc["ph_intercept"].is<float>()) calib.ph_intercept = doc["ph_intercept"];
        if (doc["tds_factor"].is<float>()) calib.tds_factor = doc["tds_factor"];
        saveConfig();
        request->send(200, "application/json", "{\"success\":true}");
    });

    // Captive Portal Redirect
    server.onNotFound([](AsyncWebServerRequest *request){
        request->redirect("http://192.168.4.1/");
    });

    server.begin();
}

void Task_Network(void *pvParameters) {
    baseTopic = "farm/" + WiFi.macAddress();
    controlTopic = baseTopic + "/relay/control";
    statusTopic = baseTopic + "/status";
    logTopic = baseTopic + "/logs";

    espClient.setInsecure(); 
    mqttClient.setServer("mqtt.yourbroker.com", 8883);
    mqttClient.setCallback(mqttCallback);

    setupWebServer();

    for (;;) {
        if (currentSystemMode != MODE_OFFLINE) {
            if (WiFi.status() == WL_CONNECTED) {
                wifi_retries = 0;
                if (!mqttClient.connected()) {
                    if (mqttClient.connect(WiFi.macAddress().c_str(), "user", "pass")) {
                        mqttClient.subscribe(controlTopic.c_str());
                        mqttClient.publish(statusTopic.c_str(), "{\"status\":\"Online\"}");
                    }
                }
                mqttClient.loop();
            } else {
                WiFi.begin(wifi_ssid, wifi_pass);
                wifi_retries++;
                if (wifi_retries >= MAX_WIFI_RETRIES) {
                    Serial.println("Switching to Offline AP Mode...");
                    currentSystemMode = MODE_OFFLINE;
                    WiFi.disconnect();
                    WiFi.softAP("SmartFarm_Config", "12345678");
                    dnsServer.start(53, "*", WiFi.softAPIP());
                }
                vTaskDelay(pdMS_TO_TICKS(5000));
            }
        } else {
            // AP Mode / Captive Portal Logic
            dnsServer.processNextRequest();
        }
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void Task_Storage(void *pvParameters) {
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(STORAGE_INTERVAL));
        File file = SD.open("/data.csv", FILE_APPEND);
        if (file) {
            file.printf("Timestamp,%f,%f\n", latestSensors[S_TEMP].value, latestSensors[S_HUMID].value);
            file.close();
        }
        if (mqttClient.connected()) {
            JsonDocument doc;
            doc["device_id"] = WiFi.macAddress();
            JsonObject readings = doc["readings"].to<JsonObject>();
            for (int i = 0; i < S_NONE; i++) {
                readings[String(i)] = serialized(String(latestSensors[i].value, 2));
            }
            String payload;
            serializeJson(doc, payload);
            mqttClient.publish(logTopic.c_str(), payload.c_str());
        }
    }
}

// Global Calibration
CalibrationData calib = {-3.5, 14.0, 1.0}; // Defaults

void loadConfig() {
    File file = LittleFS.open("/config.json", "r");
    if (file) {
        JsonDocument doc;
        deserializeJson(doc, file);
        strlcpy(wifi_ssid, doc["ssid"] | wifi_ssid, sizeof(wifi_ssid));
        strlcpy(wifi_pass, doc["pass"] | wifi_pass, sizeof(wifi_pass));
        if (doc["calib"].is<JsonObject>()) {
            calib.ph_slope = doc["calib"]["ph_slope"] | calib.ph_slope;
            calib.ph_intercept = doc["calib"]["ph_intercept"] | calib.ph_intercept;
            calib.tds_factor = doc["calib"]["tds_factor"] | calib.tds_factor;
        }
        file.close();
    }
}

void saveConfig() {
    File file = LittleFS.open("/config.json", "w");
    if (file) {
        JsonDocument doc;
        doc["ssid"] = wifi_ssid;
        doc["pass"] = wifi_pass;
        JsonObject c = doc["calib"].to<JsonObject>();
        c["ph_slope"] = calib.ph_slope;
        c["ph_intercept"] = calib.ph_intercept;
        c["tds_factor"] = calib.tds_factor;
        serializeJson(doc, file);
        file.close();
    }
}
