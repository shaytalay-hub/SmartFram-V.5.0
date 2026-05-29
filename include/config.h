#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// I2C Bus Pins
#define I2C_SDA 21
#define I2C_SCL 22

// SPI Bus Pins (for SD Card)
#define SPI_SCK  18
#define SPI_MISO 19
#define SPI_MOSI 23
#define SD_CS    5

// Direct ESP32 Pins
#define DHT_PIN         4
#define TRIG_PIN        13
#define ECHO_PIN        12
#define RAIN_PIN        34 // ADC1_CH6
#define LDR_PIN         35 // ADC1_CH7
#define BUZZER_PIN      2

// Relay Pins
const uint8_t RELAY_PINS[8] = {25, 26, 27, 14, 32, 33, 16, 17};

// I2C Device Addresses
#define ADS1115_ADDR    0x48
#define LCD_ADDR        0x27

// Task Parameters
#define TASK_STACK_SIZE 4096
#define TASK_PRIO_HIGH  5
#define TASK_PRIO_MID   3
#define TASK_PRIO_LOW   1

// Constants
#define MAX_SENSORS     10
#define BUFFER_SIZE     60 // 10 minutes of data at 1 sample/10s
#define STORAGE_INTERVAL 600000 // 10 minutes in ms

#endif // CONFIG_H
