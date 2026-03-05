import serial
import sys
import matplotlib.pyplot as plt
from collections import deque
from datetime import datetime

PORT = "COM5"
BAUD = 115200

HEADER = b'\x02'
FOOTER = b'\x03'

# ================= PACKET STRUCTURE =================
HEADERS = [
    b"TEAM_ID", b"MISSION_TIME", b"PACKET_NO", b"ALTITUDE", b"PRESSURE", b"TEMP",
    b"BATTERY", b"GPS_TIME", b"GPS_LAT", b"GPS_LON", b"GPS_ALT", b"GPS_SATS",
    b"AX", b"AY", b"AZ", b"GX", b"GY", b"GZ", b"STATE", b"CH4", b"CO", b"NH3",
    b"CO2", b"ROLL", b"PITCH", b"YAW"
]

EXPECTED_FIELDS = len(HEADERS)

FLOAT_FIELDS = {
    "ALTITUDE", "PRESSURE", "TEMP", "BATTERY",
    "GPS_LAT", "GPS_LON", "GPS_ALT",
    "AX", "AY", "AZ", "GX", "GY", "GZ",
    "CH4", "CO", "NH3", "CO2",
    "ROLL", "PITCH", "YAW"
}

INT_FIELDS = {"PACKET_NO", "GPS_SATS", "STATE"}

# ================= SLIDING WINDOW =================
packet_deque = deque(maxlen=60)

# ================= PLOT SETUP =================
plt.ion()  # interactive mode ON
fig, ax = plt.subplots()
ax.set_title("Altitude vs Packet Number")
ax.set_xlabel("Packet Number")
ax.set_ylabel("Altitude")
ax.grid(True)

# ================= PARSE FUNCTION =================
def parse_packet(packet: dict) -> dict | None:
    result = {}

    for key_bytes in HEADERS:
        key = key_bytes.decode()
        raw = packet.get(key_bytes, b"").decode().strip()

        try:
            if key in FLOAT_FIELDS:
                result[key] = float(raw)
            elif key in INT_FIELDS:
                result[key] = int(float(raw))  # handles values like 123.0
            else:
                result[key] = raw
        except (ValueError, TypeError):
            return None

    packet_deque.append(result)
    return result

# ================= MAIN =================
def main():
    try:
        ser = serial.Serial(PORT, BAUD, timeout=1)
    except serial.SerialException as e:
        print(f"Error opening {PORT}: {e}")
        sys.exit(1)

    print(f"GCS listening on {PORT} @ {BAUD} baud\n")

    try:
        while True:
            line = ser.readline()
            if not line:
                continue

            if line.strip().startswith(b"TEAM_ID"):
                continue

            line = line.strip()
            values = line.split(b",")

            if len(values) != EXPECTED_FIELDS:
                print(f"Invalid packet length: {len(values)}")
                continue

            packet = dict(zip(HEADERS, values))
            typed = parse_packet(packet)

            if typed is None:
                print("Corrupt packet detected")
                continue

            # ================= TERMINAL OUTPUT =================
            print("\n================ PACKET RECEIVED ================")
            for key, value in typed.items():
                print(f"{key:12}: {value}")
            print("=================================================")

            # ================= LIVE ALTITUDE GRAPH =================
            if len(packet_deque) > 1:
                x_vals = [pkt["PACKET_NO"] for pkt in packet_deque]
                y_vals = [pkt["ALTITUDE"] for pkt in packet_deque]

                ax.clear()
                ax.plot(x_vals, y_vals, marker='o')
                ax.set_title("Altitude vs Packet Number")
                ax.set_xlabel("Packet Number")
                ax.set_ylabel("Altitude")
                ax.grid(True)

                plt.pause(0.05)

    except KeyboardInterrupt:
        print("\nGCS stopped by user")

    finally:
        ser.close()

if __name__ == "__main__":
    main()
