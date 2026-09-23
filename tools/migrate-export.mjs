/**
 * Convertit un export de l'ancienne version en document Firestore.
 * ---------------------------------------------------------------------------
 *
 * Usage :
 *   node tools/migrate-export.mjs --file <export.json> --uid <identifiant Firebase>
 *
 * Options :
 *   --account <id>   compte à reprendre, si l'export en contient plusieurs
 *                    (par défaut : celui qui était connecté)
 *   --out <fichier>  où écrire le document (par défaut : migration/users-<uid>.json)
 *   --list           affiche seulement les comptes trouvés, sans rien convertir
 *
 * Le script n'écrit rien dans Firebase : il produit un fichier et un rapport,
 * pour que la conversion soit vérifiable avant toute mise en ligne. L'écriture
 * se fait ensuite avec `tools/import-to-firestore.mjs`, ou depuis l'écran
 * Profil de l'application (« Restaurer une sauvegarde »).
 *
 * La conversion réutilise le code de l'application (`storage/migrate.ts`),
 * compilé à la volée : pas de seconde implémentation qui pourrait divergir.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ------------------------------------------------------------- arguments

const args = parseArgs(process.argv.slice(2));

if (!args.file) {
    fail('Indiquez le fichier d\'export : --file <export.json>');
}
if (!args.uid && !args.list) {
    fail('Indiquez l\'identifiant du compte Firebase : --uid <uid>');
}

// -------------------------------------------------- code de l'application

const migrate = await loadModule('src/app/core/services/storage/migrate.ts', 'migrate');
const appData = await loadModule('src/app/core/services/storage/app-data.ts', 'app-data');

// ------------------------------------------------------------- conversion

const raw = JSON.parse(readFileSync(resolve(args.file), 'utf8'));

// Le fichier « restauration » contient directement les données stockées ; un
// export de la nouvelle version les range sous `data`.
const source = raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;

if (source.users === undefined) {
    // Données déjà au format d'un seul compte.
    finish(migrate.normalizeUserData(source), '(compte unique)');
}

const app = migrate.migrateAppData(source);
const accounts = Object.entries(app.users);
const chosen = pick();

if (args.list || !chosen) {
    console.log('Comptes présents dans l\'export :\n');
    for (const [id, data] of accounts) {
        console.log(
            '  ' + id + (id === app.currentUserId ? '  (connecté)' : '') +
            '\n      ' + data.profile.email +
            ' — ' + data.applications.length + ' candidature(s), ' +
            data.companies.length + ' entreprise(s), ' +
            data.contacts.length + ' contact(s), ' +
            data.tasks.length + ' tâche(s)'
        );
    }
    if (args.list) process.exit(0);
    fail('\nPlusieurs comptes et aucun connecté : choisissez avec --account <id>.');
}

finish(chosen[1], chosen[0]);

// --------------------------------------------------------------- fonctions

function pick() {
    if (args.account) {
        const found = accounts.find(([id]) => id === args.account);
        if (!found) fail('Aucun compte « ' + args.account + ' » dans cet export.');
        return found;
    }
    if (app.currentUserId && app.users[app.currentUserId]) {
        return [app.currentUserId, app.users[app.currentUserId]];
    }
    return accounts.length === 1 ? accounts[0] : null;
}

function finish(data, accountId) {
    // Forme exacte du document Firestore attendu par l'application :
    // `schemaVersion` en plus, et les échéances de tâches en chaînes ISO.
    // Le document appartient au compte Firebase : c'est son identifiant qui
    // fait foi, pas celui que portait l'ancien stockage.
    const document = {
        ...data,
        schemaVersion: appData.SCHEMA_VERSION,
        profile: { ...data.profile, id: args.uid },
        tasks: data.tasks.map(task => ({
            ...task,
            dueDate: new Date(task.dueDate).toISOString()
        }))
    };

    report(document, accountId);

    const problems = verify(document);
    if (problems.length > 0) {
        console.log('\nContrôles : ' + problems.length + ' anomalie(s)');
        for (const problem of problems) console.log('  - ' + problem);
    } else {
        console.log('\nContrôles : cohérent (références, dates, identifiants).');
    }

    const out = resolve(args.out ?? join(root, 'migration', 'users-' + args.uid + '.json'));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(document, null, 2), 'utf8');

    console.log('\nDocument écrit : ' + out);
    console.log('Destination prévue : users/' + args.uid);
    console.log('\nRien n\'a été envoyé à Firebase. Pour l\'écrire :');
    console.log('  node tools/import-to-firestore.mjs --file "' + out + '" --uid ' + args.uid + ' --key <cle.json> --confirm');
    process.exit(0);
}

function report(document, accountId) {
    const counts = {};
    for (const application of document.applications) {
        const status = lastStatus(application);
        counts[status] = (counts[status] ?? 0) + 1;
    }

    const dates = document.applications
        .flatMap(application => application.events.map(event => event.at))
        .sort();

    console.log('Compte repris : ' + accountId);
    console.log('  profil           : ' + document.profile.fullName + ' <' + document.profile.email + '>');
    console.log('  candidatures     : ' + document.applications.length);
    console.log('  entreprises      : ' + document.companies.length);
    console.log('  contacts         : ' + document.contacts.length);
    console.log('  tâches           : ' + document.tasks.length);
    console.log('  campagnes        : ' + document.campaigns.length);
    console.log('  prochain id      : ' + document.nextId);
    console.log('  statuts actuels  : ' + JSON.stringify(counts));
    if (dates.length > 0) {
        console.log('  période couverte : ' + dates[0].slice(0, 10) + ' → ' + dates[dates.length - 1].slice(0, 10));
    }

    const sansEntreprise = document.applications.filter(entry => entry.companyId === null).length;
    if (sansEntreprise > 0) {
        console.log('  dont sans entreprise nommée : ' + sansEntreprise);
    }
}

/**
 * Vérifie que le document se tient debout tout seul : pas de référence dans
 * le vide, pas de date illisible, pas d'identifiant qui se répète.
 */
function verify(document) {
    const problems = [];
    const companyIds = new Set(document.companies.map(company => company.id));
    const ids = [];

    for (const application of document.applications) {
        ids.push('candidature ' + application.id);

        if (application.companyId !== null && !companyIds.has(application.companyId)) {
            problems.push('candidature ' + application.id + ' : entreprise ' + application.companyId + ' introuvable');
        }
        if (!application.events.some(event => event.type === 'status')) {
            problems.push('candidature ' + application.id + ' : aucun statut daté');
        }
        for (const event of application.events) {
            if (isNaN(new Date(event.at).getTime())) {
                problems.push('candidature ' + application.id + ' : date illisible (' + event.at + ')');
            }
        }
    }

    for (const contact of document.contacts) {
        for (const affiliation of contact.affiliations ?? []) {
            if (!companyIds.has(affiliation.companyId)) {
                problems.push('contact ' + contact.id + ' : entreprise ' + affiliation.companyId + ' introuvable');
            }
        }
    }

    const maxId = Math.max(
        0,
        ...document.applications.map(entry => entry.id),
        ...document.companies.map(entry => entry.id),
        ...document.contacts.map(entry => entry.id),
        ...document.campaigns.map(entry => entry.id),
        ...document.tasks.map(entry => entry.id)
    );
    if (document.nextId <= maxId) {
        problems.push('nextId (' + document.nextId + ') n\'est pas au-delà du plus grand identifiant (' + maxId + ')');
    }

    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    for (const duplicate of new Set(duplicates)) {
        problems.push('identifiant en double : ' + duplicate);
    }

    return problems;
}

function lastStatus(application) {
    const statuses = application.events.filter(event => event.type === 'status');
    return statuses.length > 0 ? statuses[statuses.length - 1].status : '(aucun)';
}

/**
 * Compile un fichier TypeScript de l'application en module utilisable par
 * Node. esbuild est déjà présent : c'est celui d'Angular.
 */
async function loadModule(relativePath, name) {
    const outfile = join(root, 'node_modules', '.cache', 'migrate-export', name + '.mjs');
    mkdirSync(dirname(outfile), { recursive: true });

    await build({
        entryPoints: [join(root, relativePath)],
        outfile,
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node18',
        logLevel: 'warning'
    });

    return import(pathToFileURL(outfile).href);
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
