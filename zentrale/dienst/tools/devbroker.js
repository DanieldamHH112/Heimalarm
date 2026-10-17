// Nur Entwicklung: kleiner MQTT-Broker (1883 + WebSocket 9001) statt Mosquitto.
import Aedes from "aedes";
import { createServer } from "node:net";
import { createServer as http } from "node:http";
import ws from "websocket-stream";

const aedes = new Aedes();
createServer(aedes.handle).listen(1883, () => console.log("MQTT 1883"));
const server = http();
ws.createServer({ server }, aedes.handle);
server.listen(9001, () => console.log("WebSocket 9001"));
