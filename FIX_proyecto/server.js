// FIX backend express + MySQL

// dependencias y configuración del servidor
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const CARPETA_PUBLICA = path.join(__dirname, 'public');
const origenesPermitidos = [
    `http://localhost:${PUERTO}`,
    `http://127.0.0.1:${PUERTO}`,
    ...(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origen) => origen.trim())
        .filter(Boolean)
];

app.use(cors({
    origin(origen, callback) {
        if (!origen || origenesPermitidos.includes(origen)) {
            return callback(null, true);
        }
        return callback(new Error('El origen no está autorizado por CORS.'));
    },
    credentials: true
}));

app.use(express.json({ limit: '20kb' }));
app.use(express.static(CARPETA_PUBLICA));
app.get(['/admin', '/admin/login'], (req, res) => {
    res.sendFile(path.join(CARPETA_PUBLICA, 'index.html'));
});

// conexion unica a MySQL con createConnection
const configuracionDB = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fix_db',
    charset: 'utf8mb4',
    timezone: 'local'
};
let conexion;
let reconectando = false;

function crearConexion() {
    const nuevaConexion = mysql.createConnection(configuracionDB);

    nuevaConexion.on('error', (error) => {
        console.error('Error en la conexión MySQL:', error.code || error.message);
        if ((error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ECONNREFUSED' || error.fatal) && !reconectando) {
            reconectando = true;
            setTimeout(() => {
                conexion = crearConexion();
                reconectando = false;
                console.log('Se creó una nueva conexión directa con MySQL.');
            }, 1500);
        }
    });

    return nuevaConexion;
}

conexion = crearConexion();
let colaDB = Promise.resolve();

function ejecutarDB(tarea) {
    const trabajo = colaDB.then(async () => {
        if (!conexion) {
            throw new Error('La conexión con MySQL todavía no está disponible.');
        }
        return tarea(conexion.promise());
    });
    colaDB = trabajo.catch(() => undefined);
    return trabajo;
}

// Sesiones y contraseñas
const NOMBRE_COOKIE = 'fix_session';
const DURACION_SESION_SEGUNDOS = 8 * 60 * 60;
const sesiones = new Map();
const usarCookieSegura = process.env.COOKIE_SECURE === 'true';
const claveSetupGenerada = process.env.ADMIN_SETUP_KEY
    ? null
    : crypto.randomBytes(18).toString('hex');
const claveConfiguracionInicial = process.env.ADMIN_SETUP_KEY || claveSetupGenerada;

function generarHashPassword(password) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, sal, 64).toString('hex');
    return `${sal}:${hash}`;
}

function verificarPassword(password, hashGuardado) {
    try {
        const partes = String(hashGuardado).split(':');
        if (partes.length !== 2) return false;

        const [sal, hashHex] = partes;
        const hashOriginal = Buffer.from(hashHex, 'hex');
        if (hashOriginal.length !== 64) return false;

        const hashIngresado = crypto.scryptSync(password, sal, 64);
        return crypto.timingSafeEqual(hashOriginal, hashIngresado);
    } catch (error) {
        return false;
    }
}

function leerCookie(req, nombre) {
    const encabezado = req.headers.cookie || '';
    const cookies = encabezado.split(';');

    for (const cookie of cookies) {
        const separador = cookie.indexOf('=');
        if (separador === -1) continue;

        const clave = cookie.slice(0, separador).trim();
        const valor = cookie.slice(separador + 1).trim();
        if (clave === nombre) return decodeURIComponent(valor);
    }

    return null;
}

function establecerCookieSesion(res, token) {
    const partes = [
        `${NOMBRE_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${DURACION_SESION_SEGUNDOS}`
    ];

    if (usarCookieSegura) partes.push('Secure');
    res.setHeader('Set-Cookie', partes.join('; '));
}

function eliminarCookieSesion(res) {
    const partes = [
        `${NOMBRE_COOKIE}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
    ];

    if (usarCookieSegura) partes.push('Secure');
    res.setHeader('Set-Cookie', partes.join('; '));
}

function crearSesion(res, administrador) {
    const token = crypto.randomBytes(32).toString('hex');
    const expira = Date.now() + DURACION_SESION_SEGUNDOS * 1000;

    sesiones.set(token, {
        id_admin: administrador.id_admin,
        usuario: administrador.usuario,
        expira
    });

    establecerCookieSesion(res, token);
}

function obtenerSesion(req) {
    const token = leerCookie(req, NOMBRE_COOKIE);
    if (!token) return null;

    const sesion = sesiones.get(token);
    if (!sesion) return null;

    if (Date.now() > sesion.expira) {
        sesiones.delete(token);
        return null;
    }

    return { token, ...sesion };
}

function requerirAutenticacion(req, res, next) {
    const sesion = obtenerSesion(req);

    if (!sesion) {
        return res.status(401).json({
            mensaje: 'Sesión no válida o vencida. Iniciá sesión nuevamente.'
        });
    }

    req.admin = sesion;
    next();
}

function validarCredencialesAdmin(usuario, password) {
    const usuarioValido = /^[a-zA-Z0-9._-]{3,50}$/.test(usuario);
    return usuarioValido && typeof password === 'string' && password.length >= 10 && password.length <= 128;
}

// Validaciones de entrada
function limpiarTexto(valor) {
    return typeof valor === 'string' ? valor.trim() : '';
}

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 150;
}

// Consultas: recepción pública y listado/detalle privados
app.post('/api/consultas', async (req, res, next) => {
    const nombre = limpiarTexto(req.body.nombre);
    const email = limpiarTexto(req.body.email).toLowerCase();
    const telefono = limpiarTexto(req.body.telefono) || null;
    const asunto = limpiarTexto(req.body.asunto);
    const mensaje = limpiarTexto(req.body.mensaje);

    if (!nombre || nombre.length > 100) {
        return res.status(400).json({ mensaje: 'El nombre es obligatorio y no puede superar los 100 caracteres.' });
    }
    if (!validarEmail(email)) {
        return res.status(400).json({ mensaje: 'Ingresá un email válido.' });
    }
    if (telefono && !/^[0-9+\-\s]{6,20}$/.test(telefono)) {
        return res.status(400).json({ mensaje: 'El teléfono tiene un formato no válido.' });
    }
    if (!asunto || asunto.length > 150) {
        return res.status(400).json({ mensaje: 'El asunto es obligatorio y no puede superar los 150 caracteres.' });
    }
    if (mensaje.length < 10 || mensaje.length > 5000) {
        return res.status(400).json({ mensaje: 'El mensaje debe tener entre 10 y 5000 caracteres.' });
    }

    try {
        const idConsulta = await ejecutarDB(async (db) => {
            await db.beginTransaction();

            try {
                const [resultadoCliente] = await db.execute(
                    `INSERT INTO clientes (nombre, email, telefono)
                     VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        id_cliente = LAST_INSERT_ID(id_cliente),
                        nombre = VALUES(nombre),
                        telefono = VALUES(telefono)`,
                    [nombre, email, telefono]
                );

                const idCliente = resultadoCliente.insertId;

                const [resultadoConsulta] = await db.execute(
                    `INSERT INTO consultas (id_cliente, asunto, mensaje, leida)
                     VALUES (?, ?, ?, 0)`,
                    [idCliente, asunto, mensaje]
                );

                await db.commit();
                return resultadoConsulta.insertId;
            } catch (error) {
                await db.rollback();
                throw error;
            }
        });

        return res.status(201).json({
            mensaje: 'La consulta se guardó correctamente.',
            id_consulta: idConsulta
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/consultas', requerirAutenticacion, async (req, res, next) => {
    try {
        const consultas = await ejecutarDB(async (db) => {
            const condiciones = [];
            const parametros = [];

            if (req.query.estado === 'leida') condiciones.push('q.leida = 1');
            if (req.query.estado === 'no-leida') condiciones.push('q.leida = 0');

            if (typeof req.query.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)) {
                condiciones.push('DATE(q.fecha) = ?');
                parametros.push(req.query.fecha);
            }

            if (typeof req.query.buscar === 'string' && req.query.buscar.trim()) {
                condiciones.push('(c.nombre LIKE ? OR c.email LIKE ?)');
                const busqueda = `%${req.query.buscar.trim().slice(0, 100)}%`;
                parametros.push(busqueda, busqueda);
            }

            const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
            const [filas] = await db.execute(
                `SELECT
                    q.id_consulta,
                    c.nombre,
                    c.email,
                    c.telefono,
                    q.asunto,
                    q.mensaje,
                    DATE_FORMAT(q.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                    q.leida
                 FROM consultas AS q
                 INNER JOIN clientes AS c ON c.id_cliente = q.id_cliente
                 ${where}
                 ORDER BY q.fecha DESC, q.id_consulta DESC`,
                parametros
            );

            return filas;
        });

        res.json({ consultas });
    } catch (error) {
        next(error);
    }
});

app.get('/api/consultas/:id', requerirAutenticacion, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: 'El identificador de consulta no es válido.' });
    }

    try {
        const consulta = await ejecutarDB(async (db) => {
            const [filas] = await db.execute(
                `SELECT
                    q.id_consulta,
                    c.nombre,
                    c.email,
                    c.telefono,
                    q.asunto,
                    q.mensaje,
                    DATE_FORMAT(q.fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
                    q.leida
                 FROM consultas AS q
                 INNER JOIN clientes AS c ON c.id_cliente = q.id_cliente
                 WHERE q.id_consulta = ?
                 LIMIT 1`,
                [id]
            );
            return filas[0] || null;
        });

        if (!consulta) {
            return res.status(404).json({ mensaje: 'No se encontró la consulta solicitada.' });
        }

        res.json({ consulta });
    } catch (error) {
        next(error);
    }
});

// Servicios públicos
app.get('/api/servicios', async (req, res, next) => {
    try {
        const servicios = await ejecutarDB(async (db) => {
            const [filas] = await db.execute(
                `SELECT
                    id_servicio,
                    nombre,
                    descripcion,
                    precio_texto AS precio,
                    orden
                 FROM servicios
                 WHERE activo = 1
                 ORDER BY orden ASC, id_servicio ASC`
            );
            return filas;
        });

        res.json({ servicios });
    } catch (error) {
        next(error);
    }
});
// Administración: alta inicial, login y logout
app.get('/api/admin/estado', async (req, res, next) => {
    try {
        const totalAdministradores = await ejecutarDB(async (db) => {
            const [filas] = await db.execute('SELECT COUNT(*) AS total FROM admins');
            return Number(filas[0].total);
        });

        const sesion = obtenerSesion(req);
        res.json({
            autenticado: Boolean(sesion),
            requiereRegistro: totalAdministradores === 0,
            usuario: sesion ? sesion.usuario : null
        });
    } catch (error) {
        next(error);
    }
});
app.post('/api/admin/registro', async (req, res, next) => {
    const usuario = limpiarTexto(req.body.usuario);
    const password = req.body.password;
    const claveSetup = typeof req.body.claveConfiguracion === 'string'
        ? req.body.claveConfiguracion
        : '';

    if (!validarCredencialesAdmin(usuario, password)) {
        return res.status(400).json({
            mensaje: 'El usuario debe tener entre 3 y 50 caracteres (letras, números, punto, guion o guion bajo) y la contraseña entre 10 y 128 caracteres.'
        });
    }

    try {
        const totalAdministradores = await ejecutarDB(async (db) => {
            const [filas] = await db.execute('SELECT COUNT(*) AS total FROM admins');
            return Number(filas[0].total);
        });

        const sesion = obtenerSesion(req);
        if (totalAdministradores === 0) {
            const bufferIngresado = Buffer.from(claveSetup);
            const bufferEsperado = Buffer.from(claveConfiguracionInicial);
            const claveValida = bufferIngresado.length === bufferEsperado.length &&
                crypto.timingSafeEqual(bufferIngresado, bufferEsperado);

            if (!claveValida) {
                return res.status(403).json({ mensaje: 'La clave de configuración inicial no es correcta.' });
            }
        } else if (!sesion) {
            return res.status(401).json({ mensaje: 'Solo un administrador autenticado puede registrar otra cuenta.' });
        }

        const hash = generarHashPassword(password);
        const nuevoAdmin = await ejecutarDB(async (db) => {
            const [resultado] = await db.execute(
                'INSERT INTO admins (usuario, password_hash, activo) VALUES (?, ?, 1)',
                [usuario, hash]
            );
            return { id_admin: resultado.insertId, usuario };
        });
        if (totalAdministradores === 0) crearSesion(res, nuevoAdmin);

        res.status(201).json({
            mensaje: 'La cuenta de administración se creó correctamente.',
            usuario: nuevoAdmin.usuario
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ mensaje: 'Ese nombre de usuario ya está registrado.' });
        }
        next(error);
    }
});
app.post('/api/admin/login', async (req, res, next) => {
    const usuario = limpiarTexto(req.body.usuario);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!usuario || !password) {
        return res.status(400).json({ mensaje: 'Ingresá usuario y contraseña.' });
    }

    try {
        const administrador = await ejecutarDB(async (db) => {
            const [filas] = await db.execute(
                `SELECT id_admin, usuario, password_hash
                 FROM admins
                 WHERE usuario = ? AND activo = 1
                 LIMIT 1`,
                [usuario]
            );
            return filas[0] || null;
        });

        if (!administrador || !verificarPassword(password, administrador.password_hash)) {
            return res.status(401).json({ mensaje: 'Usuario o contraseña incorrectos.' });
        }

        crearSesion(res, administrador);
        res.json({ mensaje: 'Inicio de sesión correcto.', usuario: administrador.usuario });
    } catch (error) {
        next(error);
    }
});
app.post('/api/admin/logout', (req, res) => {
    const token = leerCookie(req, NOMBRE_COOKIE);
    if (token) sesiones.delete(token);
    eliminarCookieSesion(res);
    res.json({ mensaje: 'La sesión se cerró correctamente.' });
});

// Cambio de estado desde el panel privado
app.patch('/api/consultas/:id/estado', requerirAutenticacion, async (req, res, next) => {
    const id = Number(req.params.id);
    const leida = req.body.leida;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: 'El identificador de consulta no es válido.' });
    }
    if (typeof leida !== 'boolean') {
        return res.status(400).json({ mensaje: 'El estado debe ser true o false.' });
    }

    try {
        const afectadas = await ejecutarDB(async (db) => {
            const [resultado] = await db.execute(
                'UPDATE consultas SET leida = ? WHERE id_consulta = ?',
                [leida ? 1 : 0, id]
            );
            return resultado.affectedRows;
        });

        if (!afectadas) {
            return res.status(404).json({ mensaje: 'No se encontró la consulta solicitada.' });
        }

        res.json({ mensaje: 'El estado de la consulta se actualizó correctamente.', leida });
    } catch (error) {
        next(error);
    }
});

// Errores y rutas inexistentes
app.use('/api', (req, res) => {
    res.status(404).json({ mensaje: 'La ruta solicitada no existe.' });
});

app.use((error, req, res, next) => {
    console.error('Error del servidor:', error);

    if (res.headersSent) return next(error);

    const mensaje = error.message === 'El origen no está autorizado por CORS.'
        ? error.message
        : 'Ocurrió un error interno. Revisá la consola del servidor.';

    res.status(500).json({ mensaje });
});

// Comprobación de MySQL e inicio de Express
async function iniciarServidor() {
    try {
        const totalAdministradores = await ejecutarDB(async (db) => {
            await db.query('SELECT 1');
            const [filas] = await db.execute('SELECT COUNT(*) AS total FROM admins');
            return Number(filas[0].total);
        });

        console.log('Conexión con MySQL establecida mediante createConnection().');
        if (totalAdministradores === 0) {
            console.log('\n======================================================');
            console.log('CONFIGURACIÓN INICIAL DE FIX');
            console.log('Todavía no existe un administrador.');
            console.log('Clave de configuración inicial:');
            console.log(claveConfiguracionInicial);
            console.log('Abrí http://localhost:' + PUERTO + '/admin/login para crear la primera cuenta.');
            console.log('======================================================\n');
        }
    } catch (error) {
        console.error('No se pudo conectar con MySQL. Verificá XAMPP y base_de_datos_fix.sql.');
        console.error(error.message);
        if (claveSetupGenerada) {
            console.log('Clave temporal de configuración inicial (solo sirve si admins está vacía):');
            console.log(claveSetupGenerada);
        }
    }

    app.listen(PUERTO, () => {
        console.log(`Servidor FIX iniciado en http://localhost:${PUERTO}`);
        console.log(`Panel de administración: http://localhost:${PUERTO}/admin/login`);
    });
}

iniciarServidor();
