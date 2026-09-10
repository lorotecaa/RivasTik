// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK & SERVERTAP
// ===============================

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
require("dotenv").config();

// 📦 IMPORTACIÓN ANALIZADORA PARA TIKTOK-LIVE-CONNECTOR
let WebcastPushConnection = null;
try {
    const tiktokModule = require("tiktok-live-connector");
    console.log("📦 Claves disponibles en tiktok-live-connector:", Object.keys(tiktokModule));

    if (typeof tiktokModule === 'function') {
        WebcastPushConnection = tiktokModule;
    } else if (tiktokModule.WebcastPushConnection && typeof tiktokModule.WebcastPushConnection === 'function') {
        WebcastPushConnection = tiktokModule.WebcastPushConnection;
    } else if (tiktokModule.default && typeof tiktokModule.default === 'function') {
        WebcastPushConnection = tiktokModule.default;
    } else if (tiktokModule.default && typeof tiktokModule.default.WebcastPushConnection === 'function') {
        WebcastPushConnection = tiktokModule.default.WebcastPushConnection;
    } else {
        const foundKey = Object.keys(tiktokModule).find(k => typeof tiktokModule[k] === 'function');
        if (foundKey) {
            WebcastPushConnection = tiktokModule[foundKey];
        }
    }

    console.log("🔍 Tipo final asignado a WebcastPushConnection:", typeof WebcastPushConnection);
} catch (error) {
    console.error("❌ Error crítico al cargar tiktok-live-connector:", error.message);
}

// ===============================
// 🌐 CONFIGURACIÓN EXPRESS
// ===============================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});
const PORT = process.env.PORT || 10000;

// Carpeta pública
app.use(express.static(path.join(__dirname, "public")));

// Ruta para el Dashboard principal
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Ruta para el Widget
app.get("/widget", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// ⚙️ CONEXIONES TIKTOK POR USUARIO
// ===============================
const conexionesTikTok = {}; 
let participantes = {};

// ===============================
// 💎 MAPA DE VALORES PARA REGALOS
// ===============================
const normalizeGiftName = (name) => {
    return name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ñ/g, 'n')
        .replace(/\s/g, '');
};

const highValueGiftMap = {
    "HeartMe": 1, "Rose": 1, 
    "SelloBienvenidaPequeño": 99, "SelloBienvenida": 99, "WelcomeSealSmall": 99,
    "Gorra": 100, "Cap": 100, "Confeti": 100, "Confetti": 100, "MarvelousConfetti": 100,
    "Galaxia": 1000, "Galaxy": 1000,
    "TikTokStars": 39999, "TikTokUniverse": 44999, "Universe": 44999 
};

function configurarEventosTikTok(tiktokConn, streamerId, io) {
    tiktokConn.on("gift", (data) => {
        if (data.giftType === 1 && data.repeatEnd === false) {
            return; 
        }
        
        const userId = data.uniqueId;
        const giftName = data.giftName;
        const repeatCount = data.repeatCount || 1;
        let diamantes = 0; 
        
        const giftNameKeyNormalized = normalizeGiftName(giftName); 
        const mapValue = highValueGiftMap[giftName] || highValueGiftMap[giftNameKeyNormalized];

        if (mapValue) {
            diamantes = mapValue * repeatCount;
        } else {
            diamantes = data.totalDiamondCount || (data.diamondCount * repeatCount) || 0;
        }
        
        if (diamantes === 0 && (giftName === 'Heart Me' || giftName === 'Rose')) {
            diamantes = 1 * repeatCount; 
        }
        
        if (diamantes > 0) {
            if (participantes[userId]) {
                participantes[userId].cantidad += diamantes;
            } else {
                participantes[userId] = {
                    userId: userId,
                    usuario: data.nickname,
                    cantidad: diamantes,
                    avatar_url: data.profilePictureUrl
                };
            }
        }

        io.to(streamerId).emit("update_participantes", participantes); 
        io.to(streamerId).emit("new_gift", {
            userId: userId,
            nickname: data.nickname,
            giftName: data.giftName,
            diamondCount: diamantes,
            avatar_url: data.profilePictureUrl || 'https://via.placeholder.com/25/555/FFFFFF?text=U'
        });
    });

    tiktokConn.on("chat", (data) => {
        io.to(streamerId).emit("new_chat", { user: data.uniqueId, comment: data.comment });
    });

    tiktokConn.on("like", (data) => {
        io.to(streamerId).emit("new_like", { user: data.uniqueId, likeCount: data.likeCount });
    });
}

io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  // ==========================================
  // 📱 MÓDULO 1: CONEXIÓN TIKTOK (Independiente)
  // ==========================================
  socket.on('conectar-tiktok', async (data) => {
      const username = data.user?.replace("@", "").trim();
      if (!username) {
          socket.emit('new_gift', { nickname: 'SISTEMA', giftName: '❌ Usuario de TikTok inválido', diamondCount: 0 });
          return;
      }

      if (typeof WebcastPushConnection !== 'function') {
          console.error("❌ WebcastPushConnection no es una función válida. Tipo:", typeof WebcastPushConnection);
          socket.emit('new_gift', { nickname: 'SISTEMA', giftName: '❌ Error interno: Módulo TikTok no inicializado', diamondCount: 0 });
          return;
      }

      console.log(`🎥 Intentando conectar al Live de TikTok: @${username}`);
      socket.join(username);

      if (conexionesTikTok[username]) {
          try { 
              if (typeof conexionesTikTok[username].disconnect === 'function') conexionesTikTok[username].disconnect();
              else if (typeof conexionesTikTok[username].stop === 'function') conexionesTikTok[username].stop();
          } catch(e) {}
      }

      const tiktokConn = new WebcastPushConnection(username, {
          enableWebsocketUpgrade: true,
          requestOptions: { timeout: 10000 },
          disableEulerFallbacks: true
      });

      try {
          if (typeof tiktokConn.connect === 'function') {
              await tiktokConn.connect();
          } else if (typeof tiktokConn.start === 'function') {
              await tiktokConn.start();
          } else {
              throw new Error("No se encontró un método de inicio en la conexión.");
          }

          console.log(`✅ ¡Conectado con éxito al Live de @${username}!`);
          conexionesTikTok[username] = tiktokConn;
          configurarEventosTikTok(tiktokConn, username, io);

          io.to(username).emit('new_gift', { 
              nickname: 'SISTEMA', 
              giftName: `🟢 Conectado exitosamente al Live de @${username}`, 
              diamondCount: 0 
          });
      } catch (err) {
          console.error(`❌ Error conectando al Live de @${username}:`, err.message);
          socket.emit('new_gift', { 
              nickname: 'SISTEMA', 
              giftName: `🔴 Error: ¿@${username} está en DIRECTO ahora mismo?`, 
              diamondCount: 0 
          });
      }
  });

  // ==========================================
  // 🔌 MÓDULO 2: SERVERTAP MINECRAFT (Independiente)
  // ==========================================
  socket.on('probar-servertap', async (data) => {
      const { ip, port, password } = data;
      const targetUrl = `http://${ip}:${port}/v1/server`;

      try {
          console.log(`⚡ Intentando conectar a ServerTap en ${targetUrl}...`);
          const response = await fetch(targetUrl, {
              method: 'GET',
              headers: { 
                  'key': password, 
                  'Accept': 'application/json' 
              },
              signal: AbortSignal.timeout(5000)
          });

          if (response.ok) {
              const serverInfo = await response.json().catch(() => ({}));
              console.log("✅ ¡Conexión con ServerTap exitosa!");
              socket.emit('servertap-success', {
                  serverName: serverInfo.name || 'Paper / Spigot Server',
                  version: serverInfo.version || '1.21.1'
              });
          } else {
              socket.emit('servertap-error', { message: `Error HTTP: ${response.status}. Revisa la contraseña.` });
          }
      } catch (error) {
          socket.emit('servertap-error', { message: "No se pudo alcanzar el host. Revisa la IP, puerto o firewall." });
      }
  });

  // ==========================================
  // 🎮 SIMULADOR DE REGALOS (TEST)
  // ==========================================
  socket.on('simular-regalo', (data) => {
    const { user, amount } = data;
    io.emit("new_gift", {
        nickname: user || "TestUser",
        giftName: 'Regalo Simulado',
        diamondCount: amount || 10,
        avatar_url: 'https://via.placeholder.com/25/555/FFFFFF?text=S'
    });
  });

  socket.on('disconnect', () => {
      console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
