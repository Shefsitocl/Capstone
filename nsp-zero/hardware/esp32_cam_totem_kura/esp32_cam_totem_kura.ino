/*
 * ============================================================================
 * KURA · FIRMWARE TÓTEM PRESENCIAL IOT (ESP32-CAM AI-THINKER)
 * Lector QR de Cédula de Identidad Chilena con Ring Buffer Offline (< 500 ms)
 * ============================================================================
 */
#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID     = "CESFAM_PROVIDENCIA_IOT";
const char* WIFI_PASSWORD = "CAMBIAR_PASSWORD_WIFI";
const char* API_ENDPOINT  = "http://192.168.1.100:5000/api/iot/checkin";
const char* BATCH_URL     = "http://192.168.1.100:5000/api/iot/batch-sync";
const char* DEVICE_ID     = "TOTEM-SOME-01";
const char* IOT_TOKEN     = "totem-some-providencia-2026";

#define RING_BUFFER_SIZE 32
String offlineBuffer[RING_BUFFER_SIZE];
int bufHead = 0;
int bufCount = 0;

void enqueueOffline(const String& qrPayload) {
  int idx = (bufHead + bufCount) % RING_BUFFER_SIZE;
  offlineBuffer[idx] = qrPayload;
  if (bufCount < RING_BUFFER_SIZE) {
    bufCount++;
  } else {
    bufHead = (bufHead + 1) % RING_BUFFER_SIZE;
  }
}

void flushOfflineBuffer() {
  if (bufCount == 0 || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(BATCH_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-iot-token", IOT_TOKEN);

  String json = "{\"events\":[";
  for (int i = 0; i < bufCount; i++) {
    int idx = (bufHead + i) % RING_BUFFER_SIZE;
    if (i > 0) json += ",";
    json += "{\"rawPayload\":\"" + offlineBuffer[idx] + "\",\"deviceId\":\"" + String(DEVICE_ID) + "\"}";
  }
  json += "]}";

  int code = http.POST(json);
  if (code >= 200 && code < 300) {
    bufHead = 0;
    bufCount = 0;
    Serial.println("[RingBuffer] Eventos offline sincronizados correctamente.");
  }
  http.end();
}

void sendCheckin(const String& qrPayload) {
  unsigned long t0 = millis();
  if (WiFi.status() != WL_CONNECTED) {
    enqueueOffline(qrPayload);
    Serial.println("[OFFLINE] Guardado en Ring Buffer local.");
    return;
  }

  flushOfflineBuffer();

  HTTPClient http;
  http.begin(API_ENDPOINT);
  http.setTimeout(450);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-iot-token", IOT_TOKEN);

  String body = "{\"rawPayload\":\"" + qrPayload + "\",\"deviceId\":\"" + String(DEVICE_ID) + "\"}";
  int httpCode = http.POST(body);
  unsigned long elapsed = millis() - t0;

  Serial.printf("[Check-In] HTTP %d · Latencia: %lu ms\n", httpCode, elapsed);
  http.end();
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Kura ESP32-CAM Tótem SOME iniciado.");
}

void loop() {
  delay(100);
}
