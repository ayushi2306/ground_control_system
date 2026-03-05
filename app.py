from flask import Flask, jsonify
import serial
import threading

app = Flask(__name__)

latest_packet = ""


ser = serial.Serial('COM5',115200)   


def read_arduino():
    global latest_packet

    while True:
        try:
            data = ser.readline().decode().strip()
            latest_packet = data
            print(data)   
        except:
            pass


@app.route("/packet")
def get_packet():
    return jsonify({"packet": latest_packet})


if __name__ == "__main__":

    thread = threading.Thread(target=read_arduino)
    thread.daemon = True
    thread.start()

    app.run(port=5000)
