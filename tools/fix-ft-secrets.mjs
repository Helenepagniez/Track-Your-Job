/**
 * Répare un secret Firebase qui a été collé plusieurs fois.
 * ---------------------------------------------------------------------------
 *
 * La saisie de `firebase functions:secrets:set` est masquée : comme rien ne
 * s'affiche, on recolle, et les collages s'additionnent. Le secret contient
 * alors la bonne valeur répétée, et France Travail répond « invalid_client ».
 *
 * La bonne valeur est donc toujours là : il suffit de n'en garder qu'un
 * exemplaire. C'est ce que fait ce script, sans jamais afficher la valeur :
 *   1. il lit le secret avec votre CLI Firebase ;
 *   2. il vérifie que la valeur est la répétition exacte d'un même bloc ;
 *   3. il réenregistre ce bloc seul, depuis un fichier temporaire ;
 *   4. il efface le fichier, puis redéploie la fonction — nécessaire, car un
 *      déploiement fige la version du secret qu'il utilise.
 *
 * Usage :
 *   node tools/fix-ft-secrets.mjs --dry-run   (regarde et explique, n'écrit rien)
 *   node tools/fix-ft-secrets.mjs             (répare, puis redéploie)
 *
 * Rien n'est écrit sur la sortie hormis des longueurs et des comptes.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECRETS = ['FT_CLIENT_ID', 'FT_CLIENT_SECRET'];
const dryRun = process.argv.includes('--dry-run');

/**
 * Chemin du script de la CLI Firebase.
 *
 * On l'exécute avec Node plutôt que d'appeler `firebase.cmd` : sous Windows,
 * un `.cmd` ne s'exécute pas directement depuis Node, et le faire passer par
 * un shell obligerait à échapper les chemins à la main.
 */
function firebaseCli() {
    const root = execFileSync('npm', ['root', '-g'], {
        encoding: 'utf8',
        shell: process.platform === 'win32'
    }).trim();

    const candidate = join(root, 'firebase-tools', 'lib', 'bin', 'firebase.js');
    if (existsSync(candidate)) return candidate;

    throw new Error(
        'CLI Firebase introuvable dans ' + root + '. Installez-la avec '
        + '« npm install -g firebase-tools ».'
    );
}

const CLI = firebaseCli();

/** La CLI Firebase, appelée sans jamais laisser fuir sa sortie. */
function firebase(args, options = {}) {
    return execFileSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', options.showErrors ? 'inherit' : 'pipe']
    });
}

/** Combien de fois la valeur répète-t-elle un même bloc ? */
function repetitionCount(value) {
    for (let size = Math.floor(value.length / 2); size >= 16; size--) {
        if (value.length % size !== 0) continue;
        if (value.slice(0, size).repeat(value.length / size) === value) {
            return value.length / size;
        }
    }
    return 1;
}

let repaired = 0;

for (const name of SECRETS) {
    let stored;
    try {
        stored = firebase(['functions:secrets:access', name]).trim();
    } catch {
        console.log(name.padEnd(17) + ' : lecture impossible (secret absent, ou non connecté)');
        continue;
    }

    const repeats = repetitionCount(stored);
    const blockLength = stored.length / repeats;

    if (repeats === 1) {
        console.log(name.padEnd(17) + ' : ' + stored.length + ' caractères, aucune répétition — rien à faire');
        continue;
    }

    console.log(
        name.padEnd(17) + ' : ' + stored.length + ' caractères = '
        + repeats + ' × ' + blockLength + ' → à ramener à ' + blockLength
    );

    if (dryRun) continue;

    // Fichier temporaire, lisible par vous seule, effacé tout de suite après.
    const folder = mkdtempSync(join(tmpdir(), 'ft-secret-'));
    const file = join(folder, 'value.txt');

    try {
        writeFileSync(file, stored.slice(0, blockLength), { encoding: 'utf8', mode: 0o600 });
        chmodSync(file, 0o600);
        firebase(['functions:secrets:set', name, '--data-file', file], { showErrors: true });

        const after = firebase(['functions:secrets:access', name]).trim();
        console.log(
            name.padEnd(17) + ' : réenregistré, ' + after.length + ' caractères, '
            + repetitionCount(after) + ' répétition(s)'
        );
        repaired++;
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }
}

if (dryRun) {
    console.log('\nEssai à blanc : rien n\'a été modifié.');
    process.exit(0);
}

if (repaired === 0) {
    console.log('\nAucun secret n\'avait besoin d\'être réparé.');
    process.exit(0);
}

// Un déploiement fige la version du secret : sans cette étape, la fonction
// continuerait d'utiliser l'ancienne valeur, celle qui est répétée.
console.log('\nRedéploiement de la fonction, pour qu\'elle prenne la nouvelle version…');
firebase(['deploy', '--only', 'functions:searchJobOffers', '--non-interactive'], { showErrors: true });
console.log('Terminé. Relancez une recherche dans l\'application.');
