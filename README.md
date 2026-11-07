# Raíces · Árbol familiar

Aplicación web progresiva (PWA) para crear, cargar y explorar el árbol genealógico de tu familia.
Estilo sereno y minimalista, con ramas y hojas. Funciona sin conexión y todos los datos se guardan
**solo en tu dispositivo** (almacenamiento local del navegador).

## Qué puedes hacer

- **Añadir personas** con nombre, apellidos, género, fechas, lugar de nacimiento, foto y notas.
- **Hacer crecer el árbol** desde cada persona: añadir padre/madre, pareja o hijos, o vincular a alguien que ya está en el árbol.
- **Cargar un árbol** desde un archivo `.json` (copia de Raíces) o **GEDCOM** (`.ged`), el formato estándar que exportan MyHeritage, Ancestry, FamilySearch, Gramps, etc.
- **Guardar una copia** en `.json` o **exportar a GEDCOM**.
- **Explorar**: arrastra para moverte, rueda o pellizco para ampliar, busca por nombre (atajo `/`), y al tocar a alguien se resalta su línea directa.
- **Crecer hacia arriba**: opción en el menú para ver a los antepasados como raíces abajo y a los descendientes como ramas arriba.
- Modo claro y oscuro automáticos.

## Usarla

Es una web estática, sin dependencias ni compilación. Sírvela por HTTP (necesario para el modo sin conexión):

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Para tenerla en el móvil, publícala en cualquier hosting estático con HTTPS (por ejemplo **GitHub Pages**:
Settings → Pages → rama del repositorio, carpeta raíz) y desde el navegador elige **“Añadir a pantalla de inicio”**
o **“Instalar aplicación”** en el menú de Raíces.

> Consejo: como los datos viven en el navegador, guarda de vez en cuando una copia (`.json`) desde el menú.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la app |
| `styles.css` | Estilos (tema bosque, claro/oscuro, móvil) |
| `app.js` | Lógica: datos, disposición del árbol, dibujo, importación/exportación |
| `sw.js` | Service worker para funcionar sin conexión |
| `manifest.webmanifest`, `icons/` | Instalación como app |
