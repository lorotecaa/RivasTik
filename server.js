const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
require("dotenv").config();


// ============================================================
// TIKTOK LIVE CONNECTOR
// ============================================================

let WebcastPushConnection = null;

try {
    const tiktokModule = require("tiktok-live-connector");

    console.log(
        "📦 Claves disponibles en tiktok-live-connector:",
        Object.keys(tiktokModule)
    );

    // IMPORTANTE:
    // Usamos exclusivamente WebcastPushConnection.
    // NO buscamos una función cualquiera dentro del módulo.
    if (
        tiktokModule.WebcastPushConnection &&
        typeof tiktokModule.WebcastPushConnection === "function"
    ) {
        WebcastPushConnection = tiktokModule.WebcastPushConnection;
    }

    console.log(
        "🔍 WebcastPushConnection:",
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
// ARCHIVOS WEB
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
// CONEXIONES TIKTOK
// ============================================================

const conexionesTikTok = {};


// ============================================================
// PARTICIPANTES
// ============================================================

let participantes = {};


// ============================================================
// NORMALIZAR NOMBRE DEL REGALO
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
// MAPA DE REGALOS DE ALTO VALOR
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
// CONFIGURAR EVENTOS DE TIKTOK
// ============================================================

function configurarEventosTikTok(
    tiktokConn,
    streamerId,
    io
) {

    // --------------------------------------------------------
    // REGALOS
    // --------------------------------------------------------

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


            // ------------------------------------------------
            // EVITAR PROCESAR CADA PARTE DE UN COMBO
            // ------------------------------------------------

            if (
                data.giftType === 1 &&
                data.repeatEnd === false
            ) {
                console.log(
                    "⏳ Combo todavía activo, esperando repeatEnd..."
                );

                return;
            }


            // ------------------------------------------------
            // DATOS BÁSICOS
            // ------------------------------------------------

            const userId = data.uniqueId;

            const giftName =
                data.giftName || "Regalo desconocido";

            const repeatCount =
                Number(data.repeatCount) || 1;


            // ------------------------------------------------
            // CALCULAR DIAMANTES
            // ------------------------------------------------

            let diamantes = 0;


            const giftNameKeyNormalized =
                normalizeGiftName(giftName);


            // Buscar primero por nombre original
            // y después por nombre normalizado.

            const mapValue =
                highValueGiftMap[giftName] ||
                highValueGiftMap[giftNameKeyNormalized];


            if (mapValue) {

                diamantes =
                    mapValue * repeatCount;

            } else {

                // Preferimos totalDiamondCount cuando TikTok
                // lo proporciona.

                diamantes =
                    Number(data.totalDiamondCount) ||
                    (
                        Number(data.diamondCount || 0) *
                        repeatCount
                    ) ||
                    0;
            }


            // ------------------------------------------------
            // ROSA / HEART ME
            // ------------------------------------------------

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


            console.log(
                `💎 ${giftName} x${repeatCount} = ${diamantes} diamantes`
            );


            // ------------------------------------------------
            // ACTUALIZAR PARTICIPANTE
            // ------------------------------------------------

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


            // ------------------------------------------------
            // ACTUALIZAR CLIENTES
            // ------------------------------------------------

            io.to(streamerId).emit(
                "update_participantes",
                participantes
            );


            // ------------------------------------------------
            // NOTIFICAR NUEVO REGALO
            // ------------------------------------------------

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


    // --------------------------------------------------------
    // CHAT
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // LIKES
    // --------------------------------------------------------

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
// SOCKET.IO
// ============================================================

io.on("connection", (socket) => {

    console.log(
        "🟢 Cliente conectado:",
        socket.id
    );


    // ========================================================
    // CONECTAR TIKTOK
    // ========================================================

    socket.on(
        "conectar-tiktok",
        async (data) => {

            const username =
                data.user
                    ?.replace("@", "")
                    .trim();


            // ------------------------------------------------
            // VALIDAR USUARIO
            // ------------------------------------------------

            if (!username) {

                socket.emit(
                    "new_gift",
                    {

                        nickname: "SISTEMA",

                        giftName:
                            "❌ Usuario de TikTok inválido",

                        diamondCount: 0
                    }
                );

                return;
            }


            // ------------------------------------------------
            // VALIDAR LIBRERÍA
            // ------------------------------------------------

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
                            "❌ Error: WebcastPushConnection no está disponible",

                        diamondCount: 0
                    }
                );

                return;
            }


            console.log(
                `🎥 Intentando conectar al Live de TikTok: @${username}`
            );


            // ------------------------------------------------
            // UNIR SOCKET A LA SALA
            // ------------------------------------------------

            socket.join(username);


            // ------------------------------------------------
            // CERRAR CONEXIÓN ANTERIOR
            // ------------------------------------------------

            if (conexionesTikTok[username]) {

                console.log(
                    `🔄 Ya existía una conexión para @${username}. Cerrándola...`
                );

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

                } catch (e) {

                    console.log(
                        "⚠️ Error cerrando conexión anterior:",
                        e.message
                    );
                }

                delete conexionesTikTok[username];
            }


            // ------------------------------------------------
            // CREAR CONEXIÓN
            // ------------------------------------------------

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
                            `🔴 Error creando conexión: ${error.message}`,

                        diamondCount: 0
                    }
                );

                return;
            }


            // ------------------------------------------------
            // COMPROBAR MÉTODO CONNECT
            // ------------------------------------------------

            if (
                typeof tiktokConn.connect !==
                "function"
            ) {

                console.error(
                    "❌ La conexión creada no tiene método .connect()"
                );

                console.error(
                    "Métodos disponibles:",
                    Object.keys(tiktokConn)
                );

                socket.emit(
                    "new_gift",
                    {

                        nickname:
                            "SISTEMA",

                        giftName:
                            "🔴 La versión instalada de TikTok Live Connector no es compatible con este código.",

                        diamondCount: 0
                    }
                );

                return;
            }


            // ------------------------------------------------
            // CONECTAR
            // ------------------------------------------------

            try {

                console.log(
                    `⏳ Conectando a @${username}...`
                );


                await tiktokConn.connect();


                // ------------------------------------------------
                // CONEXIÓN EXITOSA
                // ------------------------------------------------

                console.log(
                    `✅ ¡Conectado con éxito al Live de @${username}!`
                );


                conexionesTikTok[
                    username
                ] = tiktokConn;


                // ------------------------------------------------
                // REGISTRAR EVENTOS
                // ------------------------------------------------

                configurarEventosTikTok(
                    tiktokConn,
                    username,
                    io
                );


                // ------------------------------------------------
                // MENSAJE AL PANEL
                // ------------------------------------------------

                io.to(username).emit(
                    "new_gift",
                    {

                        nickname:
                            "SISTEMA",

                        giftName:
                            `🟢 Conectado exitosamente al Live de @${username}`,

                        diamondCount: 0
                    }
                );


            } catch (err) {

                console.error(
                    `❌ Error conectando al Live de @${username}:`,
                    err
                );


                console.error(
                    "Mensaje:",
                    err.message
                );


                socket.emit(
                    "new_gift",
                    {

                        nickname:
                            "SISTEMA",

                        giftName:
                            `🔴 Error conectando a @${username}: ${err.message}`,

                        diamondCount: 0
                    }
                );
            }

        }
    );


    // ========================================================
    // PROBAR SERVERTAP
    // ========================================================

    socket.on(
        "probar-servertap",
        async (data) => {

            const {
                ip,
                port,
                password
            } = data;


            const targetUrl =
                `http://${ip}:${port}/v1/server`;


            try {

                console.log(
                    `⚡ Intentando conectar a ServerTap en ${targetUrl}...`
                );


                const response =
                    await fetch(
                        targetUrl,
                        {

                            method: "GET",

                            headers:
                                {
                                    key:
                                        password,

                                    Accept:
                                        "application/json"
                                },

                            signal:
                                AbortSignal.timeout(
                                    5000
                                )
                        }
                    );


                // ------------------------------------------------
                // ÉXITO
                // ------------------------------------------------

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
                                `Error HTTP: ${response.status}. Revisa la contraseña.`
                        }
                    );
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
                            "No se pudo alcanzar el host. Revisa la IP, puerto o firewall."
                    }
                );
            }

        }
    );


    // ========================================================
    // SIMULAR REGALO
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
    // DESCONECTAR SOCKET
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
// INICIAR SERVIDOR
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🚀 Servidor corriendo en puerto ${PORT}`
        );

        console.log(
            `🌐 Puerto: ${PORT}`
        );

        console.log(
            `🎵 TikTok Connector: ${
                typeof WebcastPushConnection
            }`
        );
    }
);
