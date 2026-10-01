import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteTareasCrmStore } from '../adapters/sqlite-tareas-crm-store.js';
import { MotorTareas } from '../policies/tareas.js';

describe('Tareas Fase 2', () => {
  let store: SqliteTareasCrmStore;

  beforeEach(() => {
    store = new SqliteTareasCrmStore(':memory:');
  });

  it('crea y obtiene una tarea', () => {
    const tarea = store.crearTarea('Implementar login', 'alta');
    const obtenida = store.obtenerTarea(tarea.id);

    expect(obtenida).toBeDefined();
    expect(obtenida?.texto).toBe('Implementar login');
    expect(obtenida?.prioridad).toBe('alta');
    expect(obtenida?.estado).toBe('pendiente');
  });

  it('lista todas las tareas', () => {
    store.crearTarea('Tarea 1', 'baja');
    store.crearTarea('Tarea 2', 'media');
    store.crearTarea('Tarea 3', 'alta');

    const tareas = store.listarTareas();
    expect(tareas.length).toBe(3);
  });

  it('completa una tarea', () => {
    const tarea = store.crearTarea('Tarea a completar', 'media');
    store.completarTarea(tarea.id);

    const completada = store.obtenerTarea(tarea.id);
    expect(completada?.estado).toBe('completada');
    expect(completada?.completadoEn).toBeDefined();
  });

  it('crea una etiqueta', () => {
    const etiqueta = store.crearEtiqueta('urgente', '#FF0000', 'Tareas urgentes');

    expect(etiqueta.nombre).toBe('urgente');
    expect(etiqueta.color).toBe('#FF0000');
    expect(etiqueta.descripcion).toBe('Tareas urgentes');
  });

  it('agrega y remueve etiquetas de una tarea', () => {
    const tarea = store.crearTarea('Tarea con etiquetas', 'media');
    const etiqueta1 = store.crearEtiqueta('urgente', '#FF0000');
    const etiqueta2 = store.crearEtiqueta('importante', '#00FF00');

    store.agregarEtiqueta(tarea.id, etiqueta1.id);
    store.agregarEtiqueta(tarea.id, etiqueta2.id);

    let etiquetas = store.obtenerEtiquetasDeTarea(tarea.id);
    expect(etiquetas.length).toBe(2);

    store.removerEtiqueta(tarea.id, etiqueta1.id);
    etiquetas = store.obtenerEtiquetasDeTarea(tarea.id);
    expect(etiquetas.length).toBe(1);
    expect(etiquetas[0]!.nombre).toBe('importante');
  });

  it('agrega comentarios a una tarea', () => {
    const tarea = store.crearTarea('Tarea con comentarios', 'media');
    store.agregarComentario(tarea.id, 'usuario-1', 'Primer comentario');
    store.agregarComentario(tarea.id, 'usuario-2', 'Segundo comentario');

    const comentarios = store.obtenerComentarios(tarea.id);
    expect(comentarios.length).toBe(2);
    expect(comentarios[0]!.texto).toBe('Primer comentario');
    expect(comentarios[1]!.texto).toBe('Segundo comentario');
  });

  it('filtra tareas por prioridad y estado', () => {
    store.crearTarea('Alta 1', 'alta');
    store.crearTarea('Media 1', 'media');
    store.crearTarea('Baja 1', 'baja');

    const tareas = store.listarTareas();
    const motor = new MotorTareas(tareas);

    const altasPendientes = motor.filtrarTareas({
      prioridad: 'alta',
      estado: 'pendiente',
    });

    expect(altasPendientes.length).toBe(1);
    expect(altasPendientes[0]!.prioridad).toBe('alta');
  });

  it('filtra tareas sin asignar', () => {
    store.crearTarea('Asignada', 'media', 'usuario-1');
    store.crearTarea('Sin asignar 1', 'media');
    store.crearTarea('Sin asignar 2', 'alta');

    const tareas = store.listarTareas();
    const motor = new MotorTareas(tareas);

    const sinAsignar = motor.filtrarTareas({ sinAsignar: true });
    expect(sinAsignar.length).toBe(2);
  });

  it('obtiene tareas que vencen hoy', () => {
    const hoy = new Date();
    hoy.setHours(12, 0, 0, 0);

    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    store.crearTarea('Vence hoy', 'media', undefined, hoy);
    store.crearTarea('Vence mañana', 'media', undefined, mañana);

    const tareas = store.listarTareas();
    const motor = new MotorTareas(tareas);

    const vencidasHoy = motor.obtenerTareasVencidasHoy();
    expect(vencidasHoy.length).toBe(1);
    expect(vencidasHoy[0]!.texto).toBe('Vence hoy');
  });

  it('obtiene tareas próximas a vencer', () => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const mañana = new Date(hoy);
    mañana.setDate(mañana.getDate() + 1);

    const pasado = new Date(hoy);
    pasado.setDate(pasado.getDate() - 1);

    store.crearTarea('Vence mañana', 'media', undefined, mañana);
    store.crearTarea('Ya venció', 'media', undefined, pasado);

    const tareas = store.listarTareas();
    const motor = new MotorTareas(tareas);

    const proximasAvencer = motor.obtenerTareasProximasAVencer(1);
    expect(proximasAvencer.length).toBe(1);
    expect(proximasAvencer[0]!.texto).toBe('Vence mañana');
  });

  it('genera reporte de productividad', () => {
    const hoy = new Date();
    const hace5Dias = new Date(hoy);
    hace5Dias.setDate(hace5Dias.getDate() - 5);

    const tarea1 = store.crearTarea('Tarea completada 1', 'alta');
    const tarea2 = store.crearTarea('Tarea completada 2', 'media');
    const tarea3 = store.crearTarea('Tarea pendiente', 'baja');

    store.completarTarea(tarea1.id);
    store.completarTarea(tarea2.id);

    const tareas = store.listarTareas();
    const motor = new MotorTareas(tareas);

    const reporte = motor.generarReporteProductividad(hace5Dias, hoy);

    expect(reporte.tareasCompletadas).toBe(2);
    expect(reporte.tareasPromedioXDia).toBeGreaterThan(0);
    expect(reporte.tasaPrioridad.alta).toBe(1);
    expect(reporte.tasaPrioridad.media).toBe(1);
    expect(reporte.tasaPrioridad.baja).toBe(0);
  });

  it('filtra tareas por etiquetas', () => {
    const tarea1 = store.crearTarea('Tarea 1', 'media');
    const tarea2 = store.crearTarea('Tarea 2', 'media');

    const etiqueta1 = store.crearEtiqueta('urgente', '#FF0000');
    const etiqueta2 = store.crearEtiqueta('importante', '#00FF00');

    store.agregarEtiqueta(tarea1.id, etiqueta1.id);
    store.agregarEtiqueta(tarea2.id, etiqueta2.id);

    const tareas = store.listarTareas();
    const motor = new MotorTareas(tareas);

    const conUrgente = motor.filtrarTareas({ etiquetas: [etiqueta1.id] });
    expect(conUrgente.length).toBe(1);
    expect(conUrgente[0]!.texto).toBe('Tarea 1');
  });

  it('asigna tareas a usuarios', () => {
    const tarea = store.crearTarea('Tarea asignada', 'media', 'usuario-1');
    const obtenida = store.obtenerTarea(tarea.id);

    expect(obtenida?.asignadoA).toBe('usuario-1');
  });
});
