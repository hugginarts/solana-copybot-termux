# 🤖 Solana CopyBot (Termux Edition)

> Bot de seguimiento de wallets en Solana con simulación *paper trading* optimizado para Termux. El modo live está diseñado de forma segura para no ejecutar compras reales de manera accidental.

---

## 📋 Características Principales

*   **Seguimiento en tiempo real:** Monitorea operaciones de wallets objetivo en la red Solana.
*   **Modo Paper Trading:** Simula entradas y salidas sin arriesgar capital real.
*   **Optimizado para Termux:** Diseñado para correr de forma ligera directamente en dispositivos móviles mediante Android/Termux.
*   **Infraestructura conectada:** Preparado para trabajar con proveedores RPC eficientes.

---

## ⚙️ Requisitos Previos

Antes de arrancar, asegúrate de tener instalado en tu entorno (Termux / Node.js):
*   Node.js (versión 18 o superior recomendada)
*   Git

---

## 🚀 Instalación y Arranque

Clona el repositorio e instala las dependencias ejecutando los siguientes comandos en tu terminal:

```bash
# Clona el repositorio
git clone [https://github.com/hugginarts/solana-copybot-termux.git](https://github.com/hugginarts/solana-copybot-termux.git)

# Entra al directorio del proyecto
cd solana-copybot-termux

# Instala las dependencias y arranca el bot
npm install && npm start

## 📂 Configuración

1. Crea un archivo de configuración o renombra el archivo de ejemplo (si aplica).
2. Configura tus variables de entorno (como tu proveedor RPC de Helius o keys de prueba) en el archivo `.env`.

---

## 🤝 ¿Cómo colaborar?

¡Las contribuciones de la comunidad son bienvenidas para potenciar esta herramienta! Si quieres ayudar a mejorar el código:

1. **Haz un Fork** del proyecto.
2. Crea una rama para tu nueva característica (`git checkout -b feature/nueva-funcion`).
3. Realiza tus cambios y guárdalos (`git commit -m 'Agregada nueva función de análisis'`).
4. Sube los cambios a tu rama (`git push origin feature/nueva-funcion`).
5. Abre una **Pull Request** explicando detalladamente tu aporte.

También puedes abrir un **Issue** si encuentras algún error (*bug*) o tienes ideas para nuevas funciones.

---

## 📜 Licencia

Este proyecto está bajo la Licencia **MIT**. Eres libre de usarlo, modificarlo y compartirlo. Consulta el archivo `LICENSE` para más detalles.
