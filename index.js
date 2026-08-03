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
