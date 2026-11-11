# Mapa del tutorial de Stoic

Para que Juan y Claude hablen de lo mismo: qué parte es, cuándo sale, qué dice y cómo avanza.
Los textos son los de español (los de inglés viven junto a ellos en `index.html`, `T.en` / `T.es`).
El 🎓 de arriba abre la lista de partes (✅ vista / ⚪ pendiente) y deja repetir cada una.

**Cómo avanza un paso:** `Siguiente` = botón Siguiente · `hacer` = lo avanza una acción real (se prende el resaltado) ·
`tocar` = hay que presionar justo lo resaltado · `formulario` = vive dentro del formulario de nueva tarea (Atrás recorre solo esos pasos).

**Reglas que conviene recordar**
- Parte 1 se lanza sola con una cuenta nueva o invitado. Al terminar (o al saltarla) queda todo abierto y se prenden los tours.
- Los tours salen la primera vez que se toca cada lugar. Saltar un tour lo cuenta como visto. Se pueden apagar desde el 🎓.
- La primera tarea (💧💧💧 / nota «Tomar agua») se repite cada 8 h: al detener su ⏱ se marca hecha sola. Por eso `colour` cambia de texto (alt) y `tick` se salta.
- La 🏁 de la parte 1 queda a ~5 h: `vHide` la muestra escondida; en la noche (si nada está lo bastante lejos) usa el texto alterno.
- Las partes 2 y 3 largas siguen en el código (`TUT_STAGES[2]`, `[3]`) solo como fuente de los pasos de los tours.

## Parte 1 · Lo esencial

| Paso | Cómo avanza | Texto |
|---|---|---|
| `hi` | Siguiente | Te damos la bienvenida a Stoic 🏛️ ⏎ Aquí rindes más y ves tus estadísticas crecer. ⏎ Tu día es una lista de tareas y un color. ⏎ Te lo explico paso a paso. |
| `howto` | Siguiente | ¿Con prisa? ⏎ ⏸ Pausar: usa la app y sigue después. ⏎ Saltar: brinca esto. ⏎ ← Atrás: vuelve a leer. |
| `plus` | hacer | Hagamos tu lista. Toca ＋. |
| `type` | formulario | Ejemplo listo: 💧💧💧 es el título y «Tomar agua» la nota. Los emojis dejan leer la tarea de un vistazo. Dale Siguiente. |
| `time` | formulario | Te sugerí una hora. Cámbiala o dale Siguiente. |
| `rep` | formulario | Esta tarea se repite cada 8 horas: vuelve sola. Dale Siguiente. |
| `addIt` | formulario | Toca «Agregar». |
| `doIt` | hacer | Ahora hazla de verdad. Toca su ⏱, hazla y vuelve. |
| `stopIt` | hacer | Toca ⏹ para detener el reloj. El tiempo se guarda y, como se repite, la tarea se marca hecha. |
| `plus2` | hacer | Ahora lo más importante de hoy. Toca ＋. |
| `flag` | formulario | Prende 🏁 Meta del día: lo que más importa hoy. |
| `type2` | formulario | Otro ejemplo: 🏃🏃🏃 con la nota «Salir a correr». Dale Siguiente. |
| `time2` | formulario | Te puse una hora dentro de 5 horas, para que aún no estorbe. Cámbiala o dale Siguiente. |
| `addIt2` | formulario | Toca «Agregar». |
| `vScope` | tocar | «Todos» muestra todo lo pendiente. «Este día», solo ese día y lo atrasado. Toca uno. |
| `vLayout` | hacer | Toca ▦ para ver cuadritos. |
| `vGrid` | Siguiente | Así cabe más. Dale Siguiente y regreso tu lista a ☰. |
| `vSort` | tocar | Aquí cambias el orden. Toca 📅↓: lo más nuevo primero. |
| `vSorted` | Siguiente | Tu lista cambió de orden. Se queda así y tus puntos no cambian. |
| `vHide` | Siguiente | Tu 🏁 tiene hora y falta mucho, así que no se ve. Las tareas con hora aparecen unas horas antes (aquí eliges cuántas). *(alt: … Ahora ninguna tuya está lo bastante lejos.)* |
| `flagged` | Siguiente | Metas por exterminar: las metas largas (semana, trimestre o año) a las que apunta tu 🏁. Aún no tienes, por eso sale ⚠️. Las crearás después. |
| `colour` | Siguiente | Este es tu día. En rojo no has hecho nada. Meta: salir del rojo. *(alt si ya hay 1 hecha: Mitad hecha: amarillo 🟡 y se prende la vela 🕯️…)* |
| `tick` | hacer | Marca esta tarea como hecha. *(se salta si el ⏱ ya la marcó)* |
| `half` | Siguiente | Mitad hecha: amarillo 🟡 y se prende la vela 🕯️. Cada día sin rojo suma a tu racha. *(se salta si `colour` ya lo dijo)* |
| `tick2` | hacer | Ahora marca tu 🏁 meta del día. |
| `end` | Siguiente | Tu color depende de cuánto termines: 🔴 menos de 50% · 🟡 50% · 🟢 85% · 🟣 100%. Mejor color, más puntos. Terminar todas tus 🏁 sube un color. Meta: salir del rojo. |
| `untick` | hacer | ¿Marcaste una por error? Se desmarca igual. Desmarca tu 🏁 para ligarla después a una meta. |
| `prefs` | Siguiente | Aquí arriba: modo claro u oscuro, idioma y 🎓 con las partes del tutorial. |
| `next1` | Siguiente | Eso es lo esencial ✅ ⏎ Todo Stoic está abierto: juega. Cuando toques algo nuevo, te lo explico. El 🎓 lista las partes del tutorial. |

## Tours

| Tour | Se dispara | Pasos (ids) |
|---|---|---|
| Puntaje `score` | Al abrir Puntaje | points, streak, sleep, work, rewards, rewards2, rewGear, rewIn |
| Pomodoro `pomo` | Al tocar algo dentro de la tarjeta del Pomodoro | pomoNote |
| Cronómetro `sw` | Al tocar algo dentro de la tarjeta del Cronómetro | swGo, swStop, swAdd, swPick |
| Estadísticas `stats` | Al abrir Estadísticas | stats, statsIn, tlCard, tlRow, tlEntry |
| Metas `goals` | Al abrir tus Metas | goalAdd, goalGo, stepPlus, stepType, stepGo, goalBack, goalLink, goalPick, goalDone, goalHow |
| Diario `diary` | Al abrir la nota de un día | diary, dTitle, dTpl, dSaved, dHist, dHistIn |
| Tu semana `week` | Al abrir 📊 Tu semana | weekIn |
| Cuadrantes `quad` | Al elegir ✜ cuadrantes | quadIn, quadPlus, fQuad, quadAdd, quadEnd (crea una tarea nueva con cuadrante) |
| Formulario completo `form` | Al abrir ＋ después de la parte 1 | fNlp, fNlpGo, fQuad, fTags, fRep, fMorn, fAdd |
| Calendario del día `cal` | Al abrir 📅 | dayIn, dayMove, dayOff, dayOrder, dayDone |
| Etiquetas `tags` | Al tocar una etiqueta | tagsNote |
| Elegir varias `select` | Al activar ☑ | selIn |

Los textos de cada paso salen de las claves `tut2-*`, `tut3-*`, `tour-*` en `index.html`.

## Pendiente / por revisar juntos
- Probar todo en celular (burbuja, ventanas, scroll).
- Quién decide qué tour sale primero si dos coinciden (hoy: el orden de la tabla).
- El tour de Cuadrantes siempre crea una tarea nueva; no pide editar una existente.
