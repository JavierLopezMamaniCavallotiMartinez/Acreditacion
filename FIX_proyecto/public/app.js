// FIX | JavaScript del sitio público y del panel de administración

// API y utilidades comunes
const API_BASE = '/api';
const esRutaAdministracion = window.location.pathname.startsWith('/admin');

async function solicitarAPI(ruta, opciones = {}) {
    const configuracion = {
        method: opciones.method || 'GET',
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
            ...(opciones.headers || {})
        },
        ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {})
    };

    const respuesta = await fetch(API_BASE + ruta, configuracion);
    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        throw new Error(datos.mensaje || 'No se pudo completar la operación.');
    }

    return datos;
}

function establecerMensaje(elemento, texto, tipo = '') {
    if (!elemento) return;
    elemento.textContent = texto;
    elemento.className = tipo ? `admin-feedback ${tipo}` : 'admin-feedback';
}

// Formulario público de contacto
const formulario = document.getElementById('formulario');

const campos = {
    nombre: document.getElementById('nombre'),
    email: document.getElementById('email'),
    telefono: document.getElementById('telefono'),
    asunto: document.getElementById('asunto'),
    mensaje: document.getElementById('mensaje')
};

const resultado = document.getElementById('resultado-formulario');

function mostrarError(nombreCampo, texto) {
    const campo = campos[nombreCampo];
    const error = document.getElementById('error-' + nombreCampo);
    error.textContent = texto;
    campo.classList.toggle('invalido', texto !== '');
    campo.setAttribute('aria-invalid', texto !== '' ? 'true' : 'false');
}

function validarFormulario() {
    let valido = true;
    const nombre = campos.nombre.value.trim();
    const email = campos.email.value.trim();
    const telefono = campos.telefono.value.trim();
    const asunto = campos.asunto.value.trim();
    const mensaje = campos.mensaje.value.trim();
    const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const formatoTelefono = /^[0-9+\-\s]{6,20}$/;

    if (!nombre || nombre.length > 100) {
        mostrarError('nombre', 'Ingresá un nombre (máximo 100 caracteres).');
        valido = false;
    } else mostrarError('nombre', '');

    if (!email) {
        mostrarError('email', 'El email es obligatorio.');
        valido = false;
    } else if (!formatoEmail.test(email) || email.length > 150) {
        mostrarError('email', 'Ingresá un email válido.');
        valido = false;
    } else mostrarError('email', '');

    if (telefono && !formatoTelefono.test(telefono)) {
        mostrarError('telefono', 'Usá números, espacios, + o - (6 a 20 caracteres).');
        valido = false;
    } else mostrarError('telefono', '');

    if (!asunto || asunto.length > 150) {
        mostrarError('asunto', 'El asunto es obligatorio (máximo 150 caracteres).');
        valido = false;
    } else mostrarError('asunto', '');

    if (!mensaje || mensaje.length < 10 || mensaje.length > 5000) {
        mostrarError('mensaje', 'El mensaje debe tener entre 10 y 5000 caracteres.');
        valido = false;
    } else mostrarError('mensaje', '');

    return valido;
}

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    resultado.textContent = '';
    resultado.className = '';

    if (!validarFormulario()) {
        resultado.textContent = 'Revisá los campos marcados.';
        resultado.className = 'mensaje-error';
        return;
    }

    const datos = Object.fromEntries(
        Object.entries(campos).map(([clave, campo]) => [clave, campo.value.trim()])
    );

    const boton = formulario.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Enviando...';

    try {
        await solicitarAPI('/consultas', { method: 'POST', body: datos });
        formulario.reset();
        Object.keys(campos).forEach((nombreCampo) => mostrarError(nombreCampo, ''));
        resultado.textContent = 'Tu consulta fue enviada correctamente. Gracias por contactarte con FIX.';
        resultado.className = 'mensaje-ok';
    } catch (error) {
        resultado.textContent = error.message || 'No se pudo enviar la consulta. Intentá nuevamente.';
        resultado.className = 'mensaje-error';
    } finally {
        boton.disabled = false;
        boton.textContent = 'Enviar consulta';
    }
});

// Servicios obtenidos desde MySQL
const iconosServicios = [
    '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3c3 0 4 3 0 7M21 12c0 3-3 4-7 0M12 21c-3 0-4-3 0-7M3 12c0-3 3-4 7 0"/></svg>',
    '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14"/><path d="M8 21h8M12 17v4"/></svg>',
    '<svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>'
];

function crearTarjetaServicio(servicio, indice) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'tarjeta servicio';
    tarjeta.insertAdjacentHTML('beforeend', iconosServicios[indice % iconosServicios.length]);

    const titulo = document.createElement('h3');
    titulo.textContent = servicio.nombre;

    const descripcion = document.createElement('p');
    descripcion.textContent = servicio.descripcion;

    const precio = document.createElement('p');
    precio.className = 'precio';
    precio.textContent = servicio.precio || 'Consultar';

    tarjeta.append(titulo, descripcion, precio);
    return tarjeta;
}

async function cargarServicios() {
    const contenedor = document.getElementById('lista-servicios');
    try {
        const respuesta = await solicitarAPI('/servicios');
        const servicios = Array.isArray(respuesta) ? respuesta : respuesta.servicios;
        if (!Array.isArray(servicios) || servicios.length === 0) return;
        contenedor.replaceChildren(...servicios.map(crearTarjetaServicio));
    } catch (error) {
        console.warn('No se pudieron cargar los servicios desde la API:', error.message);
    }
}

if (!esRutaAdministracion) cargarServicios();
const sitioPublico = document.getElementById('sitio-publico');
const panelAdmin = document.getElementById('admin-app');

// Panel de administración
const vistaLogin = document.getElementById('admin-login-view');
const vistaSetup = document.getElementById('admin-setup-view');
const vistaDashboard = document.getElementById('admin-dashboard-view');
const loginForm = document.getElementById('admin-login-form');
const setupForm = document.getElementById('admin-setup-form');
const loginMensaje = document.getElementById('admin-login-mensaje');
const setupMensaje = document.getElementById('admin-setup-mensaje');
const panelMensaje = document.getElementById('admin-panel-mensaje');

let consultasActuales = [];
let consultaSeleccionada = null;

function mostrarVistaAdmin(vista) {
    vistaLogin.hidden = vista !== 'login';
    vistaSetup.hidden = vista !== 'setup';
    vistaDashboard.hidden = vista !== 'dashboard';
}

async function consultarEstadoSesion() {
    return solicitarAPI('/admin/estado');
}

async function iniciarPanel() {
    sitioPublico.hidden = true;
    panelAdmin.hidden = false;

    try {
        const estado = await consultarEstadoSesion();
        if (estado.autenticado) {
            document.getElementById('admin-sesion-usuario').textContent = estado.usuario || 'Administrador';
            mostrarVistaAdmin('dashboard');
            await cargarConsultas();
        } else if (estado.requiereRegistro) {
            mostrarVistaAdmin('setup');
        } else {
            mostrarVistaAdmin('login');
        }
    } catch (error) {
        mostrarVistaAdmin('login');
        establecerMensaje(loginMensaje, 'No se pudo conectar con el servidor. Verificá que Node.js esté iniciado.', 'error');
    }
}

loginForm.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    establecerMensaje(loginMensaje, '');

    const usuario = document.getElementById('admin-usuario').value.trim();
    const password = document.getElementById('admin-password').value;
    const boton = loginForm.querySelector('button[type="submit"]');
    boton.disabled = true;

    try {
        const respuesta = await solicitarAPI('/admin/login', {
            method: 'POST',
            body: { usuario, password }
        });
        document.getElementById('admin-sesion-usuario').textContent = respuesta.usuario || usuario;
        loginForm.reset();
        mostrarVistaAdmin('dashboard');
        await cargarConsultas();
    } catch (error) {
        establecerMensaje(loginMensaje, error.message, 'error');
    } finally {
        boton.disabled = false;
    }
});

setupForm.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    establecerMensaje(setupMensaje, '');

    const claveConfiguracion = document.getElementById('setup-key').value;
    const usuario = document.getElementById('setup-usuario').value.trim();
    const password = document.getElementById('setup-password').value;
    const boton = setupForm.querySelector('button[type="submit"]');
    boton.disabled = true;

    try {
        const respuesta = await solicitarAPI('/admin/registro', {
            method: 'POST',
            body: { claveConfiguracion, usuario, password }
        });
        document.getElementById('admin-sesion-usuario').textContent = respuesta.usuario || usuario;
        setupForm.reset();
        mostrarVistaAdmin('dashboard');
        await cargarConsultas();
    } catch (error) {
        establecerMensaje(setupMensaje, error.message, 'error');
    } finally {
        boton.disabled = false;
    }
});

function fechaLegible(valor) {
    if (!valor) return 'Sin fecha';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return String(valor);
    return fecha.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function actualizarEstadisticas() {
    const noLeidas = consultasActuales.filter((consulta) => !Boolean(consulta.leida)).length;
    document.getElementById('total-consultas').textContent = consultasActuales.length;
    document.getElementById('total-no-leidas').textContent = noLeidas;
    document.getElementById('total-leidas').textContent = consultasActuales.length - noLeidas;
}

function obtenerConsultasFiltradas() {
    const busqueda = document.getElementById('filtro-busqueda').value.trim().toLowerCase();
    const estado = document.getElementById('filtro-estado').value;
    const fecha = document.getElementById('filtro-fecha').value;

    return consultasActuales.filter((consulta) => {
        const coincideBusqueda = !busqueda ||
            String(consulta.nombre || '').toLowerCase().includes(busqueda) ||
            String(consulta.email || '').toLowerCase().includes(busqueda);
        const leida = Boolean(consulta.leida);
        const coincideEstado = estado === 'todos' ||
            (estado === 'leidas' && leida) ||
            (estado === 'no-leidas' && !leida);
        const fechaConsulta = String(consulta.fecha || '').slice(0, 10);
        const coincideFecha = !fecha || fechaConsulta === fecha;
        return coincideBusqueda && coincideEstado && coincideFecha;
    });
}

function renderizarListaConsultas() {
    const lista = document.getElementById('admin-consultas-list');
    const filtradas = obtenerConsultasFiltradas();
    document.getElementById('cantidad-resultados').textContent = `${filtradas.length} resultados`;
    lista.replaceChildren();

    if (filtradas.length === 0) {
        lista.appendChild(crearElemento('p', 'admin-empty', 'No hay consultas que coincidan con los filtros.'));
        return;
    }

    filtradas.forEach((consulta) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'admin-consulta-item';
        boton.setAttribute('role', 'listitem');
        boton.classList.toggle('seleccionada', Number(consulta.id_consulta) === Number(consultaSeleccionada));
        boton.classList.toggle('no-leida', !Boolean(consulta.leida));

        const primeraFila = crearElemento('span', 'admin-consulta-topline');
        primeraFila.append(
            crearElemento('strong', 'admin-consulta-nombre', consulta.nombre || 'Sin nombre'),
            crearElemento('span', `admin-status ${consulta.leida ? 'leida' : 'no-leida'}`, consulta.leida ? 'Leída' : 'No leída')
        );
        const asunto = crearElemento('span', 'admin-consulta-asunto', consulta.asunto || 'Sin asunto');
        const datos = crearElemento('span', 'admin-consulta-meta', `${consulta.email || ''} · ${fechaLegible(consulta.fecha)}`);
        boton.append(primeraFila, asunto, datos);
        boton.addEventListener('click', () => abrirDetalleConsulta(consulta.id_consulta));
        lista.appendChild(boton);
    });
}

async function cargarConsultas() {
    establecerMensaje(panelMensaje, 'Cargando consultas...');
    try {
        const respuesta = await solicitarAPI('/consultas');
        consultasActuales = Array.isArray(respuesta) ? respuesta : respuesta.consultas || [];
        actualizarEstadisticas();
        renderizarListaConsultas();
        establecerMensaje(panelMensaje, consultasActuales.length ? '' : 'Todavía no se recibieron consultas.');

        if (consultaSeleccionada && consultasActuales.some((consulta) => Number(consulta.id_consulta) === Number(consultaSeleccionada))) {
            await abrirDetalleConsulta(consultaSeleccionada, false);
        } else {
            consultaSeleccionada = null;
            document.getElementById('admin-detalle-vacio').hidden = false;
            document.getElementById('admin-detalle-contenido').hidden = true;
        }
    } catch (error) {
        establecerMensaje(panelMensaje, error.message, 'error');
        if (error.message.toLowerCase().includes('sesión')) {
            mostrarVistaAdmin('login');
        }
    }
}

async function abrirDetalleConsulta(id, actualizarLista = true) {
    try {
        const respuesta = await solicitarAPI(`/consultas/${encodeURIComponent(id)}`);
        const consulta = respuesta.consulta || respuesta;
        consultaSeleccionada = consulta.id_consulta;

        const contenedor = document.getElementById('admin-detalle-contenido');
        contenedor.replaceChildren();
        document.getElementById('admin-detalle-vacio').hidden = true;
        contenedor.hidden = false;

        contenedor.appendChild(crearElemento('p', 'admin-eyebrow', `// CONSULTA Nº ${consulta.id_consulta}`));
        contenedor.appendChild(crearElemento('h2', 'admin-detail-title', consulta.asunto || 'Sin asunto'));

        const estado = crearElemento('span', `admin-status ${consulta.leida ? 'leida' : 'no-leida'}`, consulta.leida ? 'Leída' : 'No leída');
        contenedor.appendChild(estado);

        const datos = crearElemento('div', 'admin-detail-data');
        [
            ['Nombre', consulta.nombre],
            ['Email', consulta.email],
            ['Teléfono', consulta.telefono || 'No informado'],
            ['Fecha', fechaLegible(consulta.fecha)]
        ].forEach(([etiqueta, valor]) => {
            const grupo = crearElemento('div', 'admin-detail-field');
            grupo.append(crearElemento('span', 'admin-detail-label', etiqueta), crearElemento('strong', '', valor || '—'));
            datos.appendChild(grupo);
        });
        contenedor.appendChild(datos);
        contenedor.appendChild(crearElemento('h3', 'admin-message-heading', 'Mensaje'));
        contenedor.appendChild(crearElemento('p', 'admin-message-body', consulta.mensaje || 'Sin mensaje'));

        const botonEstado = crearElemento('button', 'admin-state-button', consulta.leida ? 'Marcar como no leída' : 'Marcar como leída');
        botonEstado.type = 'button';
        botonEstado.addEventListener('click', async () => {
            botonEstado.disabled = true;
            try {
                await solicitarAPI(`/consultas/${encodeURIComponent(consulta.id_consulta)}/estado`, {
                    method: 'PATCH',
                    body: { leida: !Boolean(consulta.leida) }
                });
                await cargarConsultas();
            } catch (error) {
                establecerMensaje(panelMensaje, error.message, 'error');
            } finally {
                botonEstado.disabled = false;
            }
        });
        contenedor.appendChild(botonEstado);

        if (actualizarLista) renderizarListaConsultas();
    } catch (error) {
        establecerMensaje(panelMensaje, error.message, 'error');
    }
}

document.getElementById('filtro-busqueda').addEventListener('input', renderizarListaConsultas);
['filtro-estado', 'filtro-fecha'].forEach((id) => {
    document.getElementById(id).addEventListener('change', renderizarListaConsultas);
});

document.getElementById('limpiar-filtros').addEventListener('click', () => {
    document.getElementById('filtro-busqueda').value = '';
    document.getElementById('filtro-estado').value = 'todos';
    document.getElementById('filtro-fecha').value = '';
    renderizarListaConsultas();
});

document.getElementById('admin-recargar').addEventListener('click', cargarConsultas);

document.getElementById('admin-logout').addEventListener('click', async () => {
    try {
        await solicitarAPI('/admin/logout', { method: 'POST' });
    } catch (error) {
        console.warn('No se pudo confirmar el cierre de sesión:', error.message);
    }
    consultasActuales = [];
    consultaSeleccionada = null;
    window.location.href = '/admin/login';
});

if (esRutaAdministracion) {
    iniciarPanel();
}

// Efectos visuales del sitio público
const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const tieneMouse = window.matchMedia('(hover: hover)').matches;

function activarInclinacion() {
    const elementos = document.querySelectorAll('#sitio-publico .tarjeta, #sitio-publico .logo-img');
    elementos.forEach((elemento) => {
        elemento.addEventListener('mousemove', (evento) => {
            const caja = elemento.getBoundingClientRect();
            const x = (evento.clientX - caja.left) / caja.width - 0.5;
            const y = (evento.clientY - caja.top) / caja.height - 0.5;
            elemento.style.setProperty('--ry', (x * 6) + 'deg');
            elemento.style.setProperty('--rx', (-y * 6) + 'deg');
        });
        elemento.addEventListener('mouseleave', () => {
            elemento.style.setProperty('--rx', '0deg');
            elemento.style.setProperty('--ry', '0deg');
        });
    });
}

function activarAparicion() {
    const observador = new IntersectionObserver((entradas) => {
        entradas.forEach((entrada) => {
            if (entrada.isIntersecting) {
                entrada.target.classList.add('visible');
                observador.unobserve(entrada.target);
            }
        });
    }, { threshold: 0.15 });

    const elementos = document.querySelectorAll('#sitio-publico section > h2, #sitio-publico .tarjeta, #sitio-publico form, #sitio-publico .intro-contacto');
    elementos.forEach((elemento, indice) => {
        elemento.classList.add('revelar');
        elemento.style.animationDelay = ((indice % 4) * 100) + 'ms';
        observador.observe(elemento);
    });
}

if (!reducirMovimiento && tieneMouse && !esRutaAdministracion) activarInclinacion();
if (!reducirMovimiento && 'IntersectionObserver' in window && !esRutaAdministracion) activarAparicion();
