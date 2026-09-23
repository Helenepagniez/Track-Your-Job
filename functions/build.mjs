/**
 * Assemble la fonction en un seul fichier.
 *
 * On passe par esbuild plutôt que par `tsc` parce que la fonction importe du
 * code de l'application (`../src/app/core/parsing`), en dehors de son propre
 * dossier : `tsc` produirait une arborescence de sortie biscornue, alors
 * qu'un paquet unique reste simple à déployer.
 *
 * Les bibliothèques Firebase restent externes : elles sont installées par
 * Firebase sur la machine qui exécute la fonction.
 */
import { build } from 'esbuild';

await build({
    entryPoints: ['src/index.ts'],
    outfile: 'lib/index.js',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: true,
    logLevel: 'info',
    external: ['firebase-admin', 'firebase-functions']
});
