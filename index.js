/* =========================================================
   VIDEO COMPRESSOR UNIFIN
   BLOQUE 1 - CONFIGURACIÓN DEL SERVIDOR
========================================================= */

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

app.use(express.json());

app.get("/", (req, res) => {

    res.send("Servidor Video Compressor UNIFIN funcionando correctamente.");

});
/* =========================================================
   BLOQUE 2 - CLOUDINARY
========================================================= */

const { v2: cloudinary } = require("cloudinary");

cloudinary.config({

    cloud_name: process.env.CLOUD_NAME,

    api_key: process.env.API_KEY,

    api_secret: process.env.API_SECRET

});

console.log("Cloudinary configurado correctamente.");
/* =========================================================
   BLOQUE 3 - MULTER
========================================================= */

const multer = require("multer");
const fs = require("fs");
const path = require("path");

// Crear carpeta temporal si no existe
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Configuración de almacenamiento
const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(null, tempDir);

    },

    filename: function (req, file, cb) {

        const extension = path.extname(file.originalname);

        const nombre =
            Date.now() +
            "-" +
            Math.floor(Math.random() * 1000000) +
            extension;

        cb(null, nombre);

    }

});

// Aceptar únicamente videos
const upload = multer({

    storage: storage,

    limits: {

        fileSize: 80 * 1024 * 1024 // 80 MB máximo

    },

    fileFilter: function (req, file, cb) {

        if (file.mimetype.startsWith("video/")) {

            cb(null, true);

        } else {

            cb(new Error("Solo se permiten archivos de video."));

        }

    }

});
/* =========================================================
   BLOQUE 4 - FFMPEG CON BAJO CONSUMO
========================================================= */

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

function comprimirVideo(inputPath, outputPath) {

    return new Promise((resolve, reject) => {

        ffmpeg(inputPath)

            // Máximo 40 segundos también en el servidor
            .duration(40)

            // Máximo 854 px de ancho; no agranda videos pequeños
            .videoFilters(
                "scale='min(854,iw)':-2"
            )

            .videoCodec("libx264")
            .audioCodec("aac")

            .outputOptions([

                // Menos uso de memoria y CPU
                "-preset ultrafast",
                "-threads 1",

                // Compresión
                "-crf 31",

                // Compatibilidad
                "-pix_fmt yuv420p",
                "-movflags +faststart",

                // Audio ligero
                "-b:a 64k",
                "-ac 1",
                "-ar 32000",

                // Evitar colas grandes
                "-max_muxing_queue_size 512"

            ])

            .format("mp4")

            .on("start", (commandLine) => {

                console.log(
                    "Comando FFmpeg:",
                    commandLine
                );

            })

            .on("progress", (progress) => {

                if (progress.percent) {

                    console.log(
                        "Compresión:",
                        Math.round(progress.percent) + "%"
                    );

                }

            })

            .on("end", () => {

                console.log(
                    "Video comprimido correctamente."
                );

                resolve(outputPath);

            })

            .on("error", (error) => {

                console.error(
                    "Error FFmpeg:",
                    error.message
                );

                reject(error);

            })

            .save(outputPath);

    });

}
/* =========================================================
   CONTROL DE COMPRESIONES
========================================================= */

let procesandoVideo = false;

function eliminarArchivo(ruta) {

    try {

        if (
            ruta &&
            fs.existsSync(ruta)
        ) {

            fs.unlinkSync(ruta);

        }

    } catch (error) {

        console.error(
            "No se pudo eliminar archivo temporal:",
            error.message
        );

    }

}
/* =========================================================
   BLOQUE 5 - ENDPOINT /upload
========================================================= */

app.post(
    "/upload",
    upload.single("video"),
    async (req, res) => {

        let rutaOriginal = "";
        let rutaComprimida = "";

        if (procesandoVideo) {

            if (
                req.file &&
                req.file.path &&
                fs.existsSync(req.file.path)
            ) {

                fs.unlinkSync(req.file.path);

            }

            return res.status(429).json({

                success: false,

                error:
                    "El servidor está procesando otro video. " +
                    "Espere unos segundos e intente nuevamente."

            });

        }

        procesandoVideo = true;

        try {

            if (!req.file) {

                procesandoVideo = false;

                return res.status(400).json({

                    success: false,

                    error:
                        "No se recibió ningún video."

                });

            }

            rutaOriginal = req.file.path;

            const nombreComprimido =
                "comprimido-" +
                Date.now() +
                ".mp4";

            rutaComprimida =
                path.join(
                    tempDir,
                    nombreComprimido
                );

            console.log(
                "Video recibido:",
                rutaOriginal
            );

            console.log(
                "Tamaño original:",
                (
                    req.file.size /
                    1024 /
                    1024
                ).toFixed(2) +
                " MB"
            );

            console.log(
                "Iniciando compresión..."
            );

            await comprimirVideo(
                rutaOriginal,
                rutaComprimida
            );

            console.log(
                "Subiendo video comprimido a Cloudinary..."
            );

            const resultadoCloudinary =
                await cloudinary.uploader.upload(
                    rutaComprimida,
                    {

                        resource_type: "video",

                        folder:
                            "autoauditorias",

                        use_filename: true,

                        unique_filename: true,

                        overwrite: false

                    }
                );

            console.log(
                "Video subido correctamente:",
                resultadoCloudinary.secure_url
            );

            eliminarArchivo(rutaOriginal);
            eliminarArchivo(rutaComprimida);

            procesandoVideo = false;

            return res.status(200).json({

                success: true,

                url:
                    resultadoCloudinary.secure_url,

                publicId:
                    resultadoCloudinary.public_id,

                formato:
                    resultadoCloudinary.format,

                bytes:
                    resultadoCloudinary.bytes

            });

        } catch (error) {

            console.error(
                "Error procesando video:",
                error
            );

            eliminarArchivo(rutaOriginal);
            eliminarArchivo(rutaComprimida);

            procesandoVideo = false;

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "No fue posible procesar el video."

            });

        }

    }
);
/* =========================================================
   BLOQUE 6 - ERRORES Y PUERTO PARA RAILWAY
========================================================= */

// Manejo de errores de Multer y errores generales
app.use((error, req, res, next) => {

    console.error("Error general:", error);

   if (
    error &&
    error.message === "Request aborted"
) {

    return res.status(499).json({

        success: false,

        error:
            "La conexión se interrumpió antes de terminar " +
            "de subir el video. Use Wi-Fi o un video más ligero."

    });

}

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {

            return res.status(413).json({
                success: false,
                error: "El video supera el límite permitido de 80 MB."
            });

        }

        return res.status(400).json({
            success: false,
            error: "Error al recibir el archivo: " + error.message
        });

    }

    return res.status(500).json({
        success: false,
        error:
            error.message ||
            "Ocurrió un error inesperado en el servidor."
    });

});


// Railway asigna el puerto mediante process.env.PORT
const PORT = process.env.PORT || 8080;

const server =
    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                "Servidor Video Compressor UNIFIN activo en el puerto " +
                PORT
            );

        }
    );

// No cerrar solicitudes lentas desde Node.
// Railway mantiene su propio límite de subida.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 65000;
