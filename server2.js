const express = require('express');
const app = express();
const aedes = require('aedes')(); // Servidor MQTT
const net = require('net');
const server = net.createServer(aedes.handle);
const mqtt = require('mqtt');
const axios = require('axios');

// Configuración del Broker MQTT
const brokerUrl = 'mqtt://localhost:1883'; // Dirección IP y puerto del servidor MQTT
const initialTopic = 'mi/tema'; // Tópico principal
const webApiUrl = 'https://alzheimerwebapi.azurewebsites.net/api/ObtenerUbicacionPeriodicamente'; // URL de tu Web API

// Diccionario para mapear direcciones Mac a tópicos específicos
const MacToTopic = {};
let jsonMessage;

// Iniciar el servidor MQTT
server.listen(1883, function () {
  console.log('Servidor MQTT escuchando en el puerto 1883');
});

// Conectar al Broker MQTT
const client = mqtt.connect(brokerUrl);

// Suscribirse al tópico principal una vez
client.on('connect', () => {
  console.log('Conectado al broker MQTT');
  client.subscribe(initialTopic, (err) => {
    if (err) {
      console.error('Error al suscribirse al tópico', err);
    } else {
      console.log('Suscripción al tópico principal exitosa');
    }
  });
});

// Manejo de Mensajes desde el Cliente MQTT
client.on('message', (topic, message) => {
  console.log(`Mensaje recibido en el tópico ${topic}`);

  try {
    jsonMessage = JSON.parse(message.toString()); // Asignar a jsonMessage

    if (topic === initialTopic || topic in MacToTopic) {
      if (jsonMessage.Mac != null && !MacToTopic[jsonMessage.Mac]) {
        // Se recibe la dirección Mac del dispositivo
        const Mac = jsonMessage.Mac;
        console.log(`Mac recibida`, jsonMessage);
        if (Mac) {
          MacToTopic[Mac] = Mac;
        }
      } else if (jsonMessage.Caida === true) {
        const now = new Date();
        jsonMessage.Fecha = now.toISOString().split('T')[0];
        jsonMessage.Hora = now.toTimeString().split(' ')[0];
        console.log('Payload a la Web API:', jsonMessage);

        axios.post(webApiUrl, jsonMessage)
          .then(response => {
            console.log('Mensaje enviado a la Web API correctamente');
          })
          .catch(error => {
            console.error('Error al enviar mensaje a la Web API:', error.response ? error.response.data : error.message);
            console.error(error.message);
          });
        console.log('Alerta de caída recibida', jsonMessage);
      } else if (jsonMessage.Latitud != null && !jsonMessage.Mac) {
        console.log('Ubicación recibida', jsonMessage);
      } else if (jsonMessage.Error === "Datos GPS inválidos.") {
        console.log('GPS sin conexión', jsonMessage);
      }
    }
  } catch (error) {
    console.error('Error al analizar el mensaje JSON:', error);
  }
});

// Ruta para manejar solicitudes GET del backend
app.get('/mqtt-request/:mac', (req, res) => {
  console.log('Solicitud GET recibida desde el backend');

  const mac = req.params.mac; // Obtener la MAC del dispositivo desde la ruta

  if (mac && MacToTopic[mac]) {
    const requestData = 'obtener_datos';
    client.publish(mac, requestData, (err) => {
      if (err) {
        console.error('Error al enviar la solicitud al cliente MQTT:', err);
        res.status(500).send('Error al enviar la solicitud al cliente MQTT');
      } else {
        const now = new Date();
        jsonMessage.Fecha = now.toISOString().split('T')[0];
        jsonMessage.Hora = now.toTimeString().split(' ')[0];
        console.log(`Solicitud de datos enviada al cliente MQTT en el tópico ${MacToTopic[mac]}`);
        res.status(200).send(JSON.stringify(jsonMessage));
      }
    });
  } else {
    res.status(404).send('MAC no encontrada');
  }
});

// Configurar el servidor para escuchar en el puerto 3000
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor Express escuchando en el puerto ${port}`);
});

