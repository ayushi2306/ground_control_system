<!-- Chart.js Library -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>

const ctx = document.getElementById("altitudeChart").getContext("2d");

let packetNumbers = [];
let altitudeValues = [];

const altitudeChart = new Chart(ctx, {
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
        responsive: true,
        animation: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Packet Number"
                }
            },
            y: {
                title: {
                    display: true,
                    text: "Altitude"
                }
            }
        }
    }
});


async function fetchTelemetry() {

    try {

        const response = await fetch("http://localhost:5000/telemetry");
        const data = await response.json();

        if(data.ALTITUDE !== undefined){

            packetNumbers.push(data.PACKET_NO);
            altitudeValues.push(data.ALTITUDE);

            if(packetNumbers.length > 60){
                packetNumbers.shift();
                altitudeValues.shift();
            }

            altitudeChart.update();
        }

    } catch(err){
        console.log("Waiting for telemetry...");
    }
}


setInterval(fetchTelemetry, 500);

</script>
