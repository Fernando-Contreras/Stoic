# Stoic Block

Extensión para **Chrome** y **Edge** (es la misma para las dos). Bloquea tus sitios de
distracción cuando tu tiempo de procrastinación de hoy **llega o pasa** lo que te dan
tus pomodoros.

## La regla

Es la misma cuenta que hace Stoic:

- **Lo que te dan:** `máx(30, 30 × pomodoros ÷ 8)` minutos. (0–8 pomodoros: 30 min;
  12: 45 min; 16: 60 min…)
- **Lo que llevas:** los minutos que registraste hoy en Procrastinación.
- **Se bloquea** cuando llevas **igual o más** de lo que te dan. En cuanto terminas
  un pomodoro y el número sube, **se abre solo**.
- El "día" es el de Stoic (Cancún por defecto), no el de tu computadora.

Cada 30 segundos le pregunta a la nube de Stoic cuánto llevas. **Solo lee**: nunca
escribe nada en tus datos.

## Instalar (una vez, 1 minuto)

**Chrome:** abre `chrome://extensions` → activa **Modo de desarrollador** (arriba a la
derecha) → **Cargar descomprimida** → elige esta carpeta `extension`.

**Edge:** abre `edge://extensions` → activa **Modo de desarrollador** (abajo a la
izquierda) → **Cargar descomprimida** → elige esta carpeta `extension`.

Después, haz clic en el ícono de la extensión (si no lo ves, el rompecabezas 🧩 →
fijarlo) → **Opciones** → inicia sesión con **la misma cuenta de Stoic**.

La contraseña **no se guarda**: solo se usa para pedir tu sesión, y esa sesión queda en
el navegador. Si cambias esta carpeta de lugar, hay que volver a cargarla.

## Qué ves

- **Ícono con número verde:** minutos que te quedan. **Amarillo:** pocos (5 o menos).
  **Rojo con X:** bloqueado. **!** falta iniciar sesión. **?** no pude leer Stoic.
- **Sitios bloqueados** (editable en Opciones): WhatsApp Web, Netflix, Instagram,
  Facebook, X/Twitter, TikTok, Reddit y Twitch. YouTube no viene en la lista a
  propósito, pero lo puedes agregar.
- Una pestaña que ya estaba abierta en un sitio bloqueado se manda sola a la página de
  "bloqueado", y regresa a la misma página cuando se desbloquea.

## Si algo falla

- **Sin internet:** un bloqueo que ya estaba puesto aguanta 10 minutos y luego se
  quita; nunca te deja fuera por una falla de wifi.
- **La sesión vence** (o la revocas): la extensión deja de bloquear y el ícono muestra **!**.
- Lo que no puede hacer: no detiene aplicaciones de escritorio (WhatsApp de escritorio,
  Discord…), solo páginas del navegador, y se puede desactivar desde
  `chrome://extensions`. Es una ayuda para ti, no una cárcel.

## Pruebas

```
node extension/test/logic.test.mjs        # la regla, 27 pruebas
node extension/test/background.test.mjs   # todo el comportamiento contra un navegador simulado
```
