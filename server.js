const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
require("dotenv").config();


// ============================================================
// TIKTOK LIVE CONNECTOR (BÚSQUEDA MULTINIVEL BLINDADA)
// ============================================================

let WebcastPushConnection = null;

try {
    const tiktokModule = require("tiktok-live-connector");

    console.log(
        "📦 Claves disponibles en tiktok-live-connector:",
        Object.keys(tiktokModule)
    );

    // Búsqueda exhaustiva para v2.x en CommonJS
    WebcastPushConnection = 
        tiktokModule.WebcastPushConnection || 
        tiktokModule.default?.WebcastPushConnection || 
        tiktokModule.default || 
        tiktokModule;

    // Si aún no es una función, buscar la primera función disponible en el módulo
    if (typeof WebcastPushConnection !== "function") {
        const foundKey = Object.keys(tiktokModule).find(
            (k) => typeof tiktokModule[k] === "function"
        );
        if (foundKey) {
            WebcastPushConnection = tiktokModule[foundKey];
        } else if (tiktokModule.default && typeof tiktokModule.default === "object") {
            const defaultKey = Object.keys(tiktokModule.default).find(
                (k) => typeof tiktokModule.default[k] === "function"
            );
            if (defaultKey) {
                WebcastPushConnection = tiktokModule.default[defaultKey];
            }
        }
    }

    console.log(
        "🔍 WebcastPushConnection tipo final:",
        typeof WebcastPushConnection
    );

} catch (error) {
    console.error(
        "❌ Error crítico al cargar tiktok-live-connector:",
        error.message
    );
}


// ============================================================
// EXPRESS + SOCKET.IO
// ============================================================

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 10000;


// ============================================================
// ARCHIVOS WEB[cite: 1]
// ============================================================

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.get("/widget", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});


// ============================================================
// CONEXIONES TIKTOK[cite: 1]
// ============================================================

const conexionesTikTok = {};


// ============================================================
// PARTICIPANTES[cite: 1]
// ============================================================

let participantes = {};


// ============================================================
// NORMALIZAR NOMBRE DEL REGALO[cite: 1]
// ============================================================

const normalizeGiftName = (name) => {

    if (!name) return "";

    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ñ/g, "n")
        .replace(/\s/g, "");
};


// ============================================================
// MAPA DE REGALOS DE ALTO VALOR[cite: 1]
// ============================================================

const highValueGiftMap = {

    "HeartMe": 1,
    "Rose": 1,

    "SelloBienvenidaPequeño": 99,
    "SelloBienvenida": 99,
    "WelcomeSealSmall": 99,

    "Gorra": 100,
    "Cap": 100,

    "Confeti": 100,
    "Confetti": 100,
    "MarvelousConfetti": 100,

    "Galaxia": 1000,
    "Galaxy": 1000,

    "TikTokStars": 39999,

    "TikTokUniverse": 44999,
    "Universe": 44999
};


// ============================================================
// CONFIGURAR EVENTOS DE TIKTOK[cite: 1]
// ============================================================

function configurarEventosTikTok(
    tiktokConn,
    streamerId,
    io
) {

    tiktokConn.on("gift", (data) => {

        try {

            console.log("🎁 REGALO RECIBIDO:", {
                usuario: data.uniqueId,
                regalo: data.giftName,
                cantidad: data.repeatCount,
                diamantes: data.diamondCount,
                totalDiamantes: data.totalDiamondCount,
                giftType: data.giftType,
                repeatEnd: data.repeatEnd
            });

            if (
                data.giftType === 1 &&
                data.repeatEnd === false
            ) {
                return;
            }

            const userId = data.uniqueId;
            const giftName =
                data.giftName || "Regalo desconocido";
            const repeatCount =
                Number(data.repeatCount) || 1;

            let diamantes = 0;
            const giftNameKeyNormalized =
                normalizeGiftName(giftName);

            const mapValue =
                highValueGiftMap[giftName] ||
                highValueGiftMap[giftNameKeyNormalized];

            if (mapValue) {
                diamantes =
                    mapValue * repeatCount;
            } else {
                diamantes =
                    Number(data.totalDiamondCount) ||
                    (
                        Number(data.diamondCount || 0) *
                        repeatCount
                    ) ||
                    0;
            }

            if (
                diamantes === 0 &&
                (
                    giftName === "Heart Me" ||
                    giftName === "Rose"
                )
            ) {
                diamantes =
                    1 * repeatCount;
            }

            if (diamantes > 0) {
                if (participantes[userId]) {
                    participantes[userId].cantidad +=
                        diamantes;
                } else {
                    participantes[userId] = {
                        userId: userId,
                        usuario:
                            data.nickname ||
                            userId,
                        cantidad:
                            diamantes,
                        avatar_url:
                            data.profilePictureUrl ||
                            ""
                    };
                }
            }

            io.to(streamerId).emit(
                "update_participantes",
                participantes
            );

            io.to(streamerId).emit(
                "new_gift",
                {
                    userId: userId,
                    nickname:
                        data.nickname ||
                        userId,
                    giftName:
                        giftName,
                    diamondCount:
                        diamantes,
                    avatar_url:
                        data.profilePictureUrl ||
                        "https://via.placeholder.com/25/555/FFFFFF?text=U"
                }
            );

        } catch (error) {
            console.error(
                "❌ Error procesando regalo:",
                error
            );
        }

    });

    tiktokConn.on("chat", (data) => {
        try {
            io.to(streamerId).emit(
                "new_chat",
                {
                    user:
                        data.uniqueId,
                    comment:
                        data.comment
                }
            );
        } catch (error) {
            console.error(
                "❌ Error procesando chat:",
                error
            );
        }
    });

    tiktokConn.on("like", (data) => {
        try {
            io.to(streamerId).emit(
                "new_like",
                {
                    user:
                        data.uniqueId,
                    likeCount:
                        data.likeCount
                }
            );
        } catch (error) {
            console.error(
                "❌ Error procesando like:",
                error
            );
        }
    });
}


// ============================================================
// SOCKET.IO (CONEXIÓN UNIFICADA)[cite: 1]
// ============================================================

io.on("connection", (socket) => {

    console.log(
        "🟢 Cliente conectado:",
        socket.id
    );

    // ========================================================
    // CONECTAR SISTEMA COMPLETO (SERVERTAP + TIKTOK)
    // ========================================================

    socket.on(
        "conectar-sistema",
        async (data) => {

            const {
                ip,
                port,
                password,
                playerName,
                tiktokUser
            } = data;

            const username =
                tiktokUser
                    ?.replace("@", "")
                    .trim();

            if (!ip || !port || !password || !username) {
                socket.emit(
                    "new_gift",
                    {
                        nickname: "SISTEMA",
                        giftName:
                            "⚠️ Faltan datos: Completa ServerTap y el Usuario de TikTok",
                        diamondCount: 0
                    }
                );
                return;
            }

            const targetUrl =
                `http://${ip}:${port}/v1/server`;

            // 1. PROBAR CONEXIÓN SERVERTAP
            try {
                console.log(
                    `⚡ Intentando conectar a ServerTap en ${targetUrl}...`
                );

                const response =
                    await fetch(
                        targetUrl,
                        {
                            method: "GET",
                            headers: {
                                key: password,
                                Accept: "application/json"
                            },
                            signal:
                                AbortSignal.timeout(
                                    5000
                                )
                        }
                    );

                if (response.ok) {
                    const serverInfo =
                        await response
                            .json()
                            .catch(
                                () => ({})
                            );

                    console.log(
                        "✅ ¡Conexión con ServerTap exitosa!"
                    );

                    socket.emit(
                        "servertap-success",
                        {
                            serverName:
                                serverInfo.name ||
                                "Paper / Spigot Server",
                            version:
                                serverInfo.version ||
                                "1.21.1"
                        }
                    );

                } else {
                    socket.emit(
                        "servertap-error",
                        {
                            message:
                                `Error HTTP ServerTap: ${response.status}. Revisa la contraseña.`
                        }
                    );
                    return;
                }

            } catch (error) {
                console.error(
                    "❌ Error ServerTap:",
                    error.message
                );
                socket.emit(
                    "servertap-error",
                    {
                        message:
                            "No se pudo alcanzar ServerTap. Revisa la IP, puerto o firewall."
                    }
                );
                return;
            }

            // 2. CONECTAR AUTOMÁTICAMENTE AL LIVE DE TIKTOK
            if (
                typeof WebcastPushConnection !==
                "function"
            ) {
                console.error(
                    "❌ WebcastPushConnection no está disponible."
                );
                socket.emit(
                    "new_gift",
                    {
                        nickname: "SISTEMA",
                        giftName:
                            "❌ Error: WebcastPushConnection no está disponible en el servidor",
                        diamondCount: 0
                    }
                );
                return;
            }

            console.log(
                `🎥 Conectando automáticamente al Live de TikTok: @${username}`
            );

            socket.join(username);

            if (conexionesTikTok[username]) {
                try {
                    if (
                        typeof conexionesTikTok[
                            username
                        ].disconnect === "function"
                    ) {
                        conexionesTikTok[
                            username
                        ].disconnect();
                    } else if (
                        typeof conexionesTikTok[
                            username
                        ].stop === "function"
                    ) {
                        conexionesTikTok[
                            username
                        ].stop();
                    }
                } catch (e) {}
                delete conexionesTikTok[username];
            }

            let tiktokConn;

            try {
                tiktokConn =
                    new WebcastPushConnection(
                        username,
                        {
                            enableWebsocketUpgrade:
                                true,
                            requestOptions:
                                {
                                    timeout: 10000
                                },
                            disableEulerFallbacks:
                                true
                        }
                    );
            } catch (error) {
                console.error(
                    "❌ Error creando conexión TikTok:",
                    error
                );
                socket.emit(
                    "new_gift",
                    {
                        nickname:
                            "SISTEMA",
                        giftName:
                            `🔴 Error creando conexión TikTok: ${error.message}`,
                        diamondCount: 0
                    }
                );
                return;
            }

            try {
                if (
                    typeof tiktokConn.connect ===
                    "function"
                ) {
                    await tiktokConn.connect();
                } else if (
                    typeof tiktokConn.start ===
                    "function"
                ) {
                    await tiktokConn.start();
                } else {
                    throw new Error(
                        "Método de conexión de TikTok no compatible."
                    );
                }

                console.log(
                    `✅ ¡Conectado con éxito al Live de @${username}!`
                );

                conexionesTikTok[
                    username
                ] = tiktokConn;

                configurarEventosTikTok(
                    tiktokConn,
                    username,
                    io
                );

                io.to(username).emit(
                    "new_gift",
                    {
                        nickname:
                            "SISTEMA",
                        giftName:
                            `🟢 Sistema Sincronizado: ServerTap OK & Live @${username} Activo`,
                        diamondCount: 0
                    }
                );

            } catch (err) {
                console.error(
                    `❌ Error conectando al Live de @${username}:`,
                    err.message
                );
                socket.emit(
                    "new_gift",
                    {
                        nickname:
                            "SISTEMA",
                        giftName:
                            `🔴 ServerTap OK, pero error en TikTok (@${username}): ${err.message}`,
                        diamondCount: 0
                    }
                );
            }

        }
    );


    // ========================================================
    // SIMULAR REGALO[cite: 1]
    // ========================================================

    socket.on(
        "simular-regalo",
        (data) => {
            const {
                user,
                amount
            } = data;

            io.emit(
                "new_gift",
                {
                    nickname:
                        user ||
                        "TestUser",
                    giftName:
                        "Regalo Simulado",
                    diamondCount:
                        amount ||
                        10,
                    avatar_url:
                        "https://via.placeholder.com/25/555/FFFFFF?text=S"
                }
            );
        }
    );


    // ========================================================
    // DESCONECTAR SOCKET[cite: 1]
    // ========================================================

    socket.on(
        "disconnect",
        () => {
            console.log(
                `🔌 Cliente desconectado: ${socket.id}`
            );
        }
    );

});


// ============================================================
// INICIAR SERVIDOR[cite: 1]
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `🚀 Servidor corriendo en puerto ${PORT}`
        );
        console.log(
            `🎵 TikTok Connector: ${
                typeof WebcastPushConnection
            }`
        );
    }
);
