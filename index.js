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

        fileSize: 250 * 1024 * 1024 // 250 MB

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
   BLOQUE 4 - FFMPEG
========================================================= */

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

// Indicar a fluent-ffmpeg dónde está el ejecutable
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Comprime un video
 * @param {string} inputPath Ruta del video original
 * @param {string} outputPath Ruta del video comprimido
 * @returns {Promise<string>}
 */
function comprimirVideo(inputPath, outputPath) {

    return new Promise((resolve, reject) => {

        ffmpeg(inputPath)

            // Codec H264
            .videoCodec("libx264")

            // Codec de audio
            .audioCodec("aac")

            // Calidad
            .outputOptions([
                "-preset veryfast",
                "-crf 30",
                "-movflags +faststart"
            ])

            // Resolución máxima
            .size("1280x?")

            .format("mp4")

            .on("end", () => {

                console.log("Video comprimido correctamente.");

                resolve(outputPath);

            })

            .on("error", (err) => {

                console.error(err);

                reject(err);

            })

            .save(outputPath);

    });

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

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "No se recibió ningún video."
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
                        folder: "autoauditorias",
                        use_filename: true,
                        unique_filename: true,
                        overwrite: false
                    }
                );

            console.log(
                "Video subido correctamente:",
                resultadoCloudinary.secure_url
            );

            if (
                rutaOriginal &&
                fs.existsSync(rutaOriginal)
            ) {

                fs.unlinkSync(rutaOriginal);

            }

            if (
                rutaComprimida &&
                fs.existsSync(rutaComprimida)
            ) {

                fs.unlinkSync(rutaComprimida);

            }

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

            try {

                if (
                    rutaOriginal &&
                    fs.existsSync(rutaOriginal)
                ) {

                    fs.unlinkSync(rutaOriginal);

                }

                if (
                    rutaComprimida &&
                    fs.existsSync(rutaComprimida)
                ) {

                    fs.unlinkSync(rutaComprimida);

                }

            } catch (errorLimpieza) {

                console.error(
                    "Error limpiando archivos:",
                    errorLimpieza
                );

            }

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

    if (error instanceof multer.MulterError) {

        if (error.code === "LIMIT_FILE_SIZE") {

            return res.status(413).json({
                success: false,
                error: "El video supera el límite permitido de 250 MB."
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

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        "Servidor Video Compressor UNIFIN activo en el puerto " +
        PORT
    );

});
