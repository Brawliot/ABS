#!/usr/bin/env npx tsx
/**
 * Generador de informe: checklist, cobertura y métricas.
 * Uso: npm run generar -- --profile p01-barberia
 */

import { bootSampleProfile } from "../web/boot-profile.js";
import {
  checklistDe,
  revisar,
  GENERADOR_GESTION,
  GENERADOR_WEB,
} from "../generator/checklist.js";

function main() {
  const args = process.argv.slice(2);
  let profileId = "p01-barberia";

  // Parsear argumentos
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) {
      profileId = args[i + 1];
      i++;
    }
  }

  console.log(`📋 Informe de Generación\n`);
  console.log(`Perfil: ${profileId}\n`);

  let boot;
  try {
    boot = bootSampleProfile(profileId);
  } catch (e) {
    console.error(
      `❌ Error cargando perfil: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }

  console.log(`Negocio: ${boot.brandName}\n`);

  // === CHECKLIST ===
  console.log(`\n📝 CHECKLIST\n`);

  const checklist = checklistDe(boot.input);
  console.log(`Total de puntos: ${checklist.length}\n`);

  for (const punto of checklist) {
    const cubre =
      GENERADOR_GESTION.cubre(boot.input).includes(punto.id) ||
      GENERADOR_WEB.cubre(boot.input).includes(punto.id);

    const cubreStr = cubre ? "✓" : "✘";
    const generador = GENERADOR_GESTION.cubre(boot.input).includes(punto.id)
      ? "gestion"
      : GENERADOR_WEB.cubre(boot.input).includes(punto.id)
        ? "web"
        : "SIN CUBRIR";

    console.log(`${cubreStr} [${punto.id}] ${punto.que}`);
    console.log(`  └ Generador: ${generador}`);
    console.log(`  └ Por qué: ${punto.porque}\n`);
  }

  // === RESUMEN DE COBERTURA ===
  console.log(`\n📊 COBERTURA\n`);

  const resultado = revisar(
    checklist,
    [GENERADOR_GESTION, GENERADOR_WEB],
    boot.input,
  );

  const cubiertosCount = resultado.cubiertos.length;
  const sinCubrirCount = resultado.sinCubrir.length;
  const totalCount = checklist.length;
  const porcentaje =
    totalCount > 0
      ? Math.round((cubiertosCount / totalCount) * 100)
      : 0;

  console.log(`Cubiertos: ${cubiertosCount}/${totalCount} (${porcentaje}%)`);
  console.log(`Sin cubrir: ${sinCubrirCount}\n`);

  if (sinCubrirCount > 0) {
    console.log(`⚠️  Puntos sin cubrir:\n`);
    for (const punto of resultado.sinCubrir) {
      console.log(`  • [${punto.id}] ${punto.que}`);
    }
  } else {
    console.log(`✅ Todos los puntos están cubiertos.\n`);
  }

  // === MÓDULOS DETECTADOS ===
  console.log(`\n🔧 MÓDULOS\n`);
  const modulos = checklistDe(boot.input).filter((p) => p.id.startsWith("mod."));
  console.log(`Detectados: ${modulos.length}\n`);

  for (const mod of modulos) {
    console.log(`  • ${mod.id}: ${mod.que}`);
  }

  // === ROLES ===
  console.log(`\n👥 ROLES\n`);
  console.log(`Total: ${boot.roles.length}\n`);
  for (const role of boot.roles) {
    console.log(`  • ${role.id}: ${role.label}`);
  }

  // === CANALES ===
  console.log(`\n📡 CANALES\n`);
  console.log(`Total: ${boot.input.channels.length}\n`);
  for (const channel of boot.input.channels) {
    console.log(`  • ${channel}`);
  }

  console.log(`\n\n✨ Generación completada.\n`);
}

main();
