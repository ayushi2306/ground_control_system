const terminal = document.getElementById("terminalOutput");

function addPacket(packet){
    terminal.textContent += "\n" + JSON.stringify(packet);
    terminal.scrollTop = terminal.scrollHeight;
}

// Altitude vs packet number
const altitudeCtx = document.getElementById("altitudeChart").getContext("2d");

let packetNumbers = [];
let altitudeValues = [];

const altitudeChart = new Chart(altitudeCtx, {
    type: "line",
    data: {
        labels: packetNumbers,
        datasets: [{
            label: "Altitude",
            data: altitudeValues,
            borderWidth: 2,
            tension: 0.3
        }]
    },
    options: {
        animation: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Packet Number"
                },
                grid: {
                    display: true
                }
            },
            y: {
                title: {
                    display: true,
                    text: "Altitude"
                },
                grid: {
                    display: true
                }
            }
        }
    }
});

// Temperature vs mission time
const temperatureCtx = document.getElementById("temperatureChart").getContext("2d");
let timeLabelsTemp = [];
let temperatureValues = [];

const temperatureChart = new Chart(temperatureCtx, {
    type: "line",
    data: {
        labels: timeLabelsTemp,
        datasets: [{
            label: "Temperature",
            data: temperatureValues,
            borderWidth: 2,
            tension: 0.3,
            borderColor: "rgba(255, 99, 132, 1)"
        }]
    },
    options: {
        animation: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Mission Time"
                },
                grid: {
                    display: true
                }
            },
            y: {
                title: {
                    display: true,
                    text: "Temperature"
                },
                grid: {
                    display: true
                }
            }
        }
    }
});

// Battery vs mission time
const batteryCtx = document.getElementById("batteryChart").getContext("2d");
let timeLabelsBattery = [];
let batteryValues = [];

const batteryChart = new Chart(batteryCtx, {
    type: "line",
    data: {
        labels: timeLabelsBattery,
        datasets: [{
            label: "Battery",
            data: batteryValues,
            borderWidth: 2,
            tension: 0.3,
            borderColor: "rgba(54, 162, 235, 1)"
        }]
    },
    options: {
        animation: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Mission Time"
                },
                grid: {
                    display: true
                }
            },
            y: {
                title: {
                    display: true,
                    text: "Battery"
                },
                grid: {
                    display: true
                }
            }
        }
    }
});

async function fetchTelemetry(){

    try{

        const res = await fetch("http://localhost:5000/telemetry");
        const data = await res.json();

        if(data.status === "waiting") return;

        addPacket(data);

        // Altitude vs packet number
        packetNumbers.push(data.PACKET_NO);
        altitudeValues.push(data.ALTITUDE);

        // Temperature vs mission time
        timeLabelsTemp.push(data.MISSION_TIME);
        temperatureValues.push(data.TEMP);

        // Battery vs mission time
        timeLabelsBattery.push(data.MISSION_TIME);
        batteryValues.push(data.BATTERY);

        // Keep only last 60 points
        if(packetNumbers.length > 60){
            packetNumbers.shift();
            altitudeValues.shift();
        }

        if(timeLabelsTemp.length > 60){
            timeLabelsTemp.shift();
            temperatureValues.shift();
        }

        if(timeLabelsBattery.length > 60){
            timeLabelsBattery.shift();
            batteryValues.shift();
        }

        altitudeChart.update();
        temperatureChart.update();
        batteryChart.update();

    }
    catch(e){
        console.log("Waiting for telemetry...");
    }
}

setInterval(fetchTelemetry,500);
