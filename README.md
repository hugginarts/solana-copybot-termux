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
