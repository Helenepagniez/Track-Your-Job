/**
 * Écrit le document produit par `migrate-export.mjs` dans Firestore.
 * ---------------------------------------------------------------------------
 *
 * Deux façons d'importer vos données ; celle-ci est la seconde.
 *
 *   1. Depuis l'application : se connecter, puis Profil → « Restaurer une
 *      sauvegarde » avec le fichier d'export. Rien à installer, aucune clé à
 *      manipuler. C'est le chemin recommandé.
 *
 *   2. Ce script, pour un import scripté et reproductible. Il demande une clé
 *      de compte de service, qui donne un accès complet au projet : à traiter
 *      comme un mot de passe, et à supprimer après usage.
 *
 * Préparation :
 *   npm install --no-save firebase-admin
 *   Console Firebase → Paramètres du projet → Comptes de service →
 *   « Générer une nouvelle clé privée » (fichier JSON).
 *
 * Usage :
 *   node tools/import-to-firestore.mjs --file <document.json> --uid <uid> --key <cle.json>
 *       → simulation : dit ce qui serait écrit, n'écrit rien
 *
 *   ... --confirm              écrit vraiment
 *   ... --confirm --overwrite  écrit même si le compte contient déjà des données
 *
 * Après l'import, supprimez la clé :
 *   rm <cle.json>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));

if (!args.file) fail('Indiquez le document à écrire : --file <document.json>');
if (!args.uid) fail('Indiquez le compte de destination : --uid <uid>');

const keyPath = args.key ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
    fail(
        'Indiquez la clé du compte de service : --key <cle.json>\n' +
        '(Console Firebase → Paramètres du projet → Comptes de service.)'
    );
}

// ------------------------------------------------------------- le document

const document = JSON.parse(readFileSync(resolve(args.file), 'utf8'));

for (const field of ['profile', 'campaigns', 'companies', 'contacts', 'applications', 'tasks']) {
    if (document[field] === undefined) {
        fail('Ce fichier n\'a pas la forme attendue : « ' + field + ' » manque.');
    }
}

if (document.profile.id !== args.uid) {
    fail(
        'Le document appartient au compte « ' + document.profile.id + ' », pas à « ' + args.uid + ' ».\n' +
        'Relancez migrate-export.mjs avec le bon --uid.'
    );
}

const weight = Buffer.byteLength(JSON.stringify(document), 'utf8');
if (weight > 900 * 1024) {
    fail(
        'Document trop lourd : ' + (weight / 1024).toFixed(0) + ' ko. Firestore limite ' +
        'un document à 1 Mo, et l\'application en utilise un seul par compte.'
    );
}

console.log('À écrire dans users/' + args.uid + ' :');
console.log('  ' + document.applications.length + ' candidature(s), ' +
    document.companies.length + ' entreprise(s), ' +
    document.contacts.length + ' contact(s), ' +
    document.tasks.length + ' tâche(s)');
console.log('  poids : ' + (weight / 1024).toFixed(1) + ' ko');

// -------------------------------------------------------------- Firestore

const admin = await loadAdmin();

const credential = JSON.parse(readFileSync(resolve(keyPath), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(credential) });

const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

const reference = firestore.collection('users').doc(args.uid);
const existing = await reference.get();

if (existing.exists) {
    const current = existing.data();
    console.log('\nLe compte contient déjà un document :');
    console.log('  ' + (current.applications?.length ?? 0) + ' candidature(s), ' +
        (current.companies?.length ?? 0) + ' entreprise(s), ' +
        (current.contacts?.length ?? 0) + ' contact(s), ' +
        (current.tasks?.length ?? 0) + ' tâche(s)');

    if (!args.overwrite) {
        fail(
            '\nRien n\'a été écrit : l\'import remplacerait ces données.\n' +
            'Ajoutez --overwrite si c\'est bien ce que vous voulez.'
        );
    }
    console.log('  → il sera remplacé (--overwrite).');
}

if (!args.confirm) {
    console.log('\nSimulation : rien n\'a été écrit. Ajoutez --confirm pour écrire.');
    process.exit(0);
}

await reference.set(document);

// Relecture : on ne se contente pas du retour de l'écriture.
const written = await reference.get();
const data = written.data();

console.log('\nÉcrit. Relecture depuis Firestore :');
console.log('  ' + (data.applications?.length ?? 0) + ' candidature(s), ' +
    (data.companies?.length ?? 0) + ' entreprise(s), ' +
    (data.contacts?.length ?? 0) + ' contact(s), ' +
    (data.tasks?.length ?? 0) + ' tâche(s)');
console.log('\nPensez à supprimer la clé du compte de service : ' + resolve(keyPath));
process.exit(0);

// --------------------------------------------------------------- fonctions

async function loadAdmin() {
    try {
        const module = await import('firebase-admin');
        return module.default ?? module;
    } catch {
        fail(
            'firebase-admin n\'est pas installé. Lancez :\n' +
            '  npm install --no-save firebase-admin'
        );
    }
}

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const name = token.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
            result[name] = true;
        } else {
            result[name] = next;
            i++;
        }
    }
    return result;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
