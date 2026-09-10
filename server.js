// ===============================
// 📦 SERVIDOR PRINCIPAL TIKTOK (MULTI-USUARIO)
// ===============================

// Dependencias
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { WebcastPushConnection } = require("tiktok-live-connector");
require("dotenv").config();

// ===============================
// 🌐 CONFIGURACIÓN EXPRESS
// ===============================
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 10000;

// Carpeta pública
app.use(express.static(path.join(__dirname, "public")));

// Ruta para el Dashboard principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🛑 AÑADIDO: Ruta para el Widget
app.get("/widget", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// ⚙️ CONEXIONES TIKTOK POR USUARIO
// ===============================
const conexionesTikTok = {}; // Guardará conexiones por streamerId
let participantes = {};
let subastaActiva = false;
// ===============================
// 💎 MAPA DE VALORES PARA REGALOS QUE FALLAN
// ===============================
const normalizeGiftName = (name) => {
    return name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar tildes
        .replace(/ñ/g, 'n') // Quitar ñ por n
        .replace(/\s/g, ''); // Quitar espacios
};
// 🛑 FUNCIÓN AUXILIAR: CALCULAR GANADOR 
function calcularGanador(listaParticipantes) {
    const participantesArray = Object.values(listaParticipantes);

    if (participantesArray.length === 0) {
        return null;
    }

    // Ordenar por cantidad descendente
    participantesArray.sort((a, b) => b.cantidad - a.cantidad);
    
    // Devolver el primero (el de mayor cantidad)
    return participantesArray[0];
}
const highValueGiftMap = {
    // 1 Moneda
    "HeartMe": 1, 
    "Rose": 1, 

    // 99 - 449 Monedas (Añadido Sello de Bienvenida de 99)
    "SelloBienvenidaPequeño": 99,
    "SelloBienvenida": 99, 
    "WelcomeSealSmall": 99,
    "Gorra": 100, 
    "Cap": 100, 
    "Confeti": 100, 
    "Confetti": 100, 
    "MarvelousConfetti": 100, 
    "Marvelous Confetti": 100, // ⬅️ AÑADIDO: Con espacio
    "InfiniteChain": 100, 
    "Cadenainfinita": 100, 
    "HeartShapedBalloons": 149, 
    "Globosconformadecorazon": 149, 
    "Lazo": 149, 
    "Ribbon": 149, 
    "Corazones": 199, 
    "Hearts": 199,
    "Sombrerodemurcielago": 299, 
    "BatHat": 299, 
    "Bailarininflable": 300, 
    "InflatableDancer": 300, 
    "Koalaastronauta": 349, 
    "KoalaAstronaut": 349,
    "Ocarelajada": 399, 
    "RelaxedGoose": 399, 
    "Botindeculces": 449, 
    "SweetBoot": 449, 

    // 450 - 999 Monedas
    "Gorrodivertido": 450, 
    "FunnyHat": 450,
    "Mentepoderosa": 450, 
    "PowerfulMind": 450,
    "Sombrerodivertidode": 450, 
    "FunHatOf": 450,
    "Coral": 499, 
    "Espectaculofloral": 500, 
    "FloralShow": 500,
    "Pistoladedinero": 500, 
    "MoneyGun": 500,
    "FloresXXXL": 500, 
    "XXXLFlowers": 500,
    "Manifestando": 500, 
    "Calentamientoestelar": 500, 
    "StellarWarmup": 500, 
    "Star Warmup": 500, // ⬅️ AÑADIDO: Con espacio
    "GafasdeDJ": 500, 
    "DJGoggles": 500,
    "Abracitos": 500, 
    "Hugs": 500,
    "Polaris": 500, 
    "Coronadedragon": 500, 
    "DragonCrown": 500,
    "Cascodecarrera": 500, 
    "RaceHelmet": 500,
    "Molasunmonton": 500, 
    "YouRock": 500,
    "Prince": 500, 
    "Sacandounapequena": 500, 
    "TakingASmall": 500,
    "GafasdeRV": 500, 
    "VRGoggles": 500,
    "Sombreroorejitas": 500, 
    "EarsHat": 500,
    "Alasradiantes": 600, 
    "RadiantWings": 600,
    "Cisne": 699, 
    "Swan": 699,
    "Escenarioprincipal": 700, 
    "MainStage": 700,
    "Alascoloridas": 700, 
    "ColorfulWings": 700,
    "Tren": 899, 
    "Train": 899,
    "Ondainfinita": 900, 
    "InfiniteWave": 900,
    "Viajejuntos": 999, 
    "JourneyTogether": 999, 

    // 1000 - 4888 Monedas
    "Alasdehadas": 1000, 
    "FairyWings": 1000,
    "RitmoFlamenco": 1000, 
    "FlamencoRhythm": 1000,
    "Jirafa": 1000, 
    "Giraffe": 1000,
    "Galaxia": 1000, 
    "Galaxy": 1000, // ⬅️ CONFIRMADO: Galaxia
    "Oroinfinito": 1000, 
    "InfiniteGold": 1000,
    "Amorsandia": 1000, 
    "WatermelonLove": 1000,
    "Medusabrillante": 1000, 
    "ShiningJellyfish": 1000,
    "Lamparamagica": 1000, 
    "MagicLamp": 1000,
    "SuperLIVEStar": 1000, 
    "Pluma": 1000, 
    "Feather": 1000,
    "Fuegosartificiales": 1088, 
    "Fireworks": 1088,
    "Refugiodelamor": 1200, 
    "LoveRefuge": 1200,
    "Escenariovibrante": 1400, 
    "VibrantStage": 1400,
    "Coronadediamante": 1499, 
    "DiamondCrown": 1499,
    "Bajocontrol": 1500, 
    "UnderControl": 1500,
    "GoldeAlAhly": 1500, 
    "AlAhlyGoal": 1500,
    "Estrellasfugaces": 1580, 
    "ShootingStars": 1580,
    "Navedenivel": 1500, 
    "LevelUpShip": 1500,
    "Debutenlascarreras": 1500, 
    "RaceDebut": 1500,
    "Tarjetadefelicitacion": 1500, 
    "GreetingCard": 1500,
    "Futuroencuentro": 1500, 
    "FutureMeeting": 1500,
    "Todoporunsueno": 1500, 
    "AllForADream": 1500,
    "TrofeoEWC": 1500, 
    "EWC_Trophy": 1500,
    "Zorrodenuevecolas": 1800, 
    "NineTailedFox": 1800,
    "Fuegosartificialesmisil": 1999, 
    "MissileFireworks": 1999,
    "Coopervuelaacasa": 1999, 
    "CooperFliesHome": 1999,
    "Discoteca": 2000, 
    "Disco": 2000,
    "Ballenasumergida": 2150, 
    "SubmergedWhale": 2150,
    "TirabesosconRosie": 2199, 
    "ThrowKissesWithRosie": 2199,
    "ElpunetazodeRocky": 2199, 
    "RockyPunch": 2199,
    "BotdeMonedasdeoro": 2199, 
    "GoldCoinBot": 2199,
    "IslaCorazon": 2199, 
    "HeartIsland": 2199,
    "Bandaanimal": 2500, 
    "AnimalBand": 2500,
    "Acariciame": 2800, 
    "CuddleMe": 2800,
    "Moto": 2988, 
    "Motorcycle": 2988,
    "Camiondehielados": 2988, 
    "IceCreamTruck": 2988,
    "Escalerasalafama": 2999, 
    "StairwayToFame": 2999,
    "Ositoritmico": 2999, 
    "RhythmicBear": 2999,
    "Lagodelamor": 2999, 
    "LoveLake": 2999,
    "Drifting": 3000, 
    "Lluviademeteoritos": 3000, 
    "MeteorShower": 3000,
    "Espirituvolador": 3999, 
    "FlyingSpirit": 3999,
    "Tuconcierto": 4500, 
    "YourConcert": 4500,
    "Dragondefuego": 4888, 
    "FireDragon": 4888,
    "Jetprivado": 4888, 
    "PrivateJet": 4888,
    "Leonelgatito": 4888, 
    "LeonTheKitten": 4888,
    "Navedelheroe": 4999, 
    "HeroShip": 4999,
    "Amordecamello": 4999, 
    "CamelLove": 4999,
    "Avionesvolando": 5000, 
    "FlyingPlanes": 5000,
    "Unicorniodefantasia": 5000, 
    "FantasyUnicorn": 5000,
    "Pistoladediamantes": 5000, 
    "DiamondGun": 5000,
    "Aladelavictoria": 5000, 
    "VictoryWing": 5000,

    // > 5000 Monedas
    "Lobodeldesierto": 5500, 
    "DesertWolf": 5500,
    "Finalportodoloalto": 6000, 
    "GrandFinale": 6000,
    "Trabajomuchoydisfruta": 6000, 
    "WorkHardEnjoy": 6000,
    "Ciudaddelfuturo": 6000, 
    "FutureCity": 6000,
    "LapandilladeBu": 6000, 
    "BuGang": 6000,
    "LeopardaLili": 6599, 
    "Cochedeportivo": 7000, 
    "SportsCar": 7000,
    "DuneCar": 7700, 
    "DiamondShield": 7999,
    "Escudodediamante": 7999, 
    "LeoncitoLili": 9699, 
    "Gloriaeneldesierto": 9999, 
    "DesertGlory": 9999,
    "Bulevardelocaso": 10000, 
    "SunsetBoulevard": 10000,
    "Interstelar": 10000, 
    "Halcon": 10999, 
    "Falcon": 10999,
    "Cochedecarreras": 12000, 
    "RaceCar": 12000,
    "Mundodelacorona": 14999, 
    "CrownWorld": 14999,
    "Sementalarabe": 15000, 
    "ArabianStallion": 15000,
    "Futuroviaje": 15000, 
    "FutureTrip": 15000,
    "Saloninfinito": 15000, 
    "InfiniteLounge": 15000,
    "Rosacosmica": 15000, 
    "CosmicRose": 15000,
    "Quesigalafiesta": 15000, 
    "KeepThePartyGoing": 15000,
    "PuentedelaBahiade": 15000, 
    "BayBridge": 15000,
    "Piramides": 15000, 
    "Pyramids": 15000,
    "Tigreblanco": 15999, 
    "WhiteTiger": 15999,
    "Parquedeatracciones": 17000, 
    "AmusementPark": 17000,
    "Salondorado": 18000, 
    "GoldenLounge": 18000,
    "Transbordador": 20000, 
    "Shuttle": 20000,
    "SelloGranBallena": 20000,
    "WelcomeSeal": 20000, // ⬅️ CONFIRMADO: El grande

    "ElsueñodeAdam": 25999, 
    "AdamsDream": 25999,
    "Fenix": 25999, 
    "Phoenix": 25999,
    "Llamadedragon": 26999, 
    "DragonFlame": 26999,
    "Leon": 29999, 
    "Lion": 29999, 
    "Autodeportivodeoro": 29999, 
    "GoldSportsCar": 29999,
    "LeoncitoLeon": 34000, 
    "TikTokStars": 39999, 
    "TikTokUniverse": 44999, 
    "Universe": 44999 
};

function configurarEventosTikTok(tiktokConn, streamerId, io) {

    // Nota: Se asume que 'subastaActiva' y 'participantes' son variables globales 
    // y que 'highValueGiftMap' y 'normalizeGiftName' están definidos antes.

    // 🎁 Evento: regalo recibido (Lógica de Conteo, Filtro y Emisión de lista)
    tiktokConn.on("gift", (data) => {
    
        // 🛑 FILTRO CRÍTICO 1: Detener el conteo si la subasta no está activa
        if (subastaActiva === false) { 
            return; 
        }

        // 🚨 FILTRO DE DUPLICIDAD (Bug de TikFinity) 🚨
        // Ignorar eventos intermedios de racha (giftType === 1 y repeatEnd === false).
        // SOLO procesar el evento final de la racha (repeatEnd === true) o regalos únicos (giftType === 0).
        if (data.giftType === 1 && data.repeatEnd === false) {
            console.log(`[IGNORADO - Racha en curso] Ignorando evento intermedio para: ${data.giftName}`);
            return; 
        }
        
        const userId = data.uniqueId;
        const giftName = data.giftName;
        const repeatCount = data.repeatCount || 1;
        
        let diamantes = 0; 
        
        // 1. NORMALIZAR y buscar en el mapa (✅ CORRECCIÓN IMPLEMENTADA AQUÍ)
        const giftNameKeyNormalized = normalizeGiftName(giftName); 
        
        // Buscamos el valor en el mapa por el nombre original Y por el nombre normalizado.
        // Esto cubre casos como "Star Warmup" (con espacio) y "StarWarmup" (normalizado).
        const mapValue = highValueGiftMap[giftName] || highValueGiftMap[giftNameKeyNormalized];

        // 2. LÓGICA DE VALOR (Prioridad al Mapa)
        if (mapValue) {
            // ✅ PRIORIDAD A MAPA: Multiplicar el valor unitario del mapa por el conteo de repetición.
            diamantes = mapValue * repeatCount;
            console.log(`[Cálculo - Mapa] Asignando valor por nombre (${giftName}): ${diamantes} 💎`);
        } else {
            // Si NO está en el mapa, usamos el valor reportado por TikTok.
            // Para rachas que acaban, totalDiamondCount es preferido. Para regalos únicos, diamondCount.
            diamantes = data.totalDiamondCount || (data.diamondCount * repeatCount) || 0;
            console.log(`[Cálculo - Reporte] Usando valor reportado: ${diamantes} 💎`);
        }
        
        // 3. FIX CRÍTICO PARA REGALOS DE 1 MONEDA ("Heart Me", "Rose")
        // Si el valor es 0 (fallo común de la API en rachas cortas de 1 moneda), lo forzamos a 1 moneda por repetición.
        if (diamantes === 0 && (giftName === 'Heart Me' || giftName === 'Rose')) {
     diamantes = 1 * repeatCount; 
     console.log(`[Cálculo - FIX Heart/Rose] Forzando valor a: ${diamantes} 💎`);
}
        
        // 4. CONTEO CENTRALIZADO: Lógica de acumulación
        if (diamantes > 0) {
            if (participantes[userId]) {
                // Existe: acumular
                participantes[userId].cantidad += diamantes;
            } else {
                // Nuevo: crear
                participantes[userId] = {
                    userId: userId,
                    usuario: data.nickname,
                    cantidad: diamantes,
                    avatar_url: data.profilePictureUrl
                };
            }
        }

        // 5. Notificar al cliente: Enviar la lista de participantes procesada
        io.to(streamerId).emit("update_participantes", participantes); 

        // 6. Log para el dashboard
        io.to(streamerId).emit("new_gift", {
            userId: userId,
            nickname: data.nickname,
            giftName: data.giftName,
            diamondCount: diamantes 
        });
    });

    // 💬 Evento: mensaje en el chat
    tiktokConn.on("chat", (data) => {
        io.to(streamerId).emit("new_chat", {
            user: data.uniqueId,
            comment: data.comment
        });
    });

    // ❤️ Evento: likes
    tiktokConn.on("like", (data) => {
        io.to(streamerId).emit("new_like", {
            user: data.uniqueId,
            likeCount: data.likeCount
        });
    });
}
io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("join_room", async (data) => {
        const streamerId = data?.streamerId?.replace("@", "");
        if (!streamerId) return;

        console.log(`📡 Cliente unido a sala: ${streamerId}`);
        socket.join(streamerId);

        // Si no existe una conexión activa para este streamer, crearla
        if (!conexionesTikTok[streamerId]) {
            console.log(`🎥 Conectando con TikTok Live de @${streamerId}`);

            const tiktokConn = new WebcastPushConnection(streamerId, {
                enableWebsocketUpgrade: true,
                requestOptions: { timeout: 10000 },
                disableEulerFallbacks: true
            });

            try {
                await tiktokConn.connect();
                console.log(`✅ Conectado a la transmisión de @${streamerId}`);
            } catch (err) {
                console.error(`❌ Error conectando con @${streamerId}:`, err);
                socket.emit("error_conexion", { message: "No se pudo conectar al Live." });
                return;
            }

            // Guardar conexión
            conexionesTikTok[streamerId] = tiktokConn;

            // 🛑 LLAMADA CRÍTICA: Se configura el event listener UNA SOLA VEZ
            configurarEventosTikTok(tiktokConn, streamerId, io); // ⬅️ AÑADIR 'io'
}
    });
  // ===============================
  // ⚡ EVENTOS DE SUBASTA
  // ===============================
  socket.on("iniciar_subasta", (data) => {
    
    // 🛑 SOLUCIÓN BUG TIKFINITY (Paso 1): Limpiar la lista de participantes acumulados
    participantes = {}; 
    subastaActiva = true; // ✅ Subasta activada 
    
    console.log("🚀 Subasta iniciada y lista de participantes limpia.");
    
    // 🛑 SOLUCIÓN BUG TIKFINITY (Paso 2): Notificar a todos los clientes (widgets/dashboard) 
    // que la lista debe estar vacía. Tu cliente escuchará 'update_participantes'.
    io.emit("update_participantes", participantes); 
    
    // Lógica original:
    io.emit("subasta_iniciada", data);
});

  socket.on("sync_time", (time) => {
    socket.broadcast.emit("update_time", time);
  });
socket.on("reset_snipe_state_visual", () => {
    console.log("🚩 Bandera de Snipe Visual reseteada.");
    // Reemite la orden de resetear la bandera lógica en todos los Widgets
    io.emit("reset_snipe_state_visual"); 
});
socket.on("finalizar_subasta", () => {
    console.log("⏹️ Final de tiempo regular. Iniciando tiempo extra (Snipe)...");
    // 🛑 QUITAR: subastaActiva = false;

    io.emit("subasta_finalizada"); 
});
// server.js - Cerca de la línea 193
socket.on("subasta_terminada_total", () => {
    console.log("🛑 Subasta y tiempo extra FINALIZADOS. Deteniendo conteo.");
    subastaActiva = false; 

    // 1. 🥇 CALCULAR GANADOR
    const ganador = calcularGanador(participantes);
    
    if (ganador) {
        // 2. 🗑️ DEJAR SÓLO AL GANADOR EN LA LISTA GLOBAL
        // Creamos una nueva lista que solo contiene al ganador (usando su ID como clave)
        participantes = {
            [ganador.userId]: ganador
        };

        // 3. 📣 ANUNCIAR Y NOTIFICAR:
        // El dashboard usará esto para mostrar la animación, y el widget para el 'popup'.
        io.emit("anunciar_ganador", ganador); 
        
        // 4. 🖼️ ACTUALIZAR LISTA:
        // ¡CRÍTICO! Enviamos la nueva lista (que solo tiene al ganador) a todos los clientes.
        io.emit("update_participantes", participantes);
        
    } else {
        console.log("⚠️ No hubo participantes con donaciones. No se anuncia ganador.");
    }
});

  socket.on("activar_alerta_snipe_visual", () => {
    console.log("⚡ ALERTA SNIPE ACTIVADA");
    io.emit("activar_alerta_snipe_visual");
  });

 socket.on("anunciar_ganador", (ganador) => {
    console.log("🏆 Ganador:", ganador);
    // 🛑 El servidor RE-EMITE la señal a todos los clientes (incluyendo el widget)
    io.emit("anunciar_ganador", ganador);
  });
socket.on("desactivar_alerta_snipe_visual", () => {
    console.log("🧹 ALERTA SNIPE DESACTIVADA");
    // Reemite la orden de limpieza a todos los clientes (widgets)
    io.emit("desactivar_alerta_snipe_visual"); 
});
  socket.on("limpiar_listas", () => {
    console.log("🧹 Limpiando listas...");
    
    // 🛑 CRÍTICO: VACÍAR LA LISTA GLOBAL DEL SERVIDOR
    participantes = {}; 
    
    // Notificar a los clientes que la lista está vacía
    io.emit("update_participantes", participantes); 
    
    // La línea io.emit("limpiar_listas_clientes"); YA NO ES NECESARIA, 
    // ya que el cliente debe escuchar "update_participantes"
});
});
// ===============================
// 🚀 INICIAR SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
