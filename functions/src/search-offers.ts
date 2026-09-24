import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import {
    JobSearchCriteria,
    JobSearchResult,
    mapOffers,
    searchParams
} from '../../src/app/core/parsing/france-travail';

/**
 * Recherche d'offres par l'API France Travail.
 *
 * Les identifiants de l'API ne peuvent pas vivre dans le navigateur : ils
 * donnent accès à l'API au nom du compte. Ils sont donc gardés comme secrets
 * Firebase, et c'est cette fonction qui appelle l'API, puis renvoie des
 * offres déjà converties (`france-travail.ts`, partagé avec l'application et
 * couvert par ses tests).
 *
 * Mise en place, une fois :
 *   1. créer un compte et une application sur https://francetravail.io,
 *      en demandant l'accès à « Offres d'emploi v2 » ;
 *   2. firebase functions:secrets:set FT_CLIENT_ID
 *      firebase functions:secrets:set FT_CLIENT_SECRET
 *   3. firebase deploy --only functions
 */

const FT_CLIENT_ID = defineSecret('FT_CLIENT_ID');
const FT_CLIENT_SECRET = defineSecret('FT_CLIENT_SECRET');

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const SCOPE = 'api_offresdemploiv2 o2dsoffre';

const FETCH_TIMEOUT_MS = 12_000;

export interface SearchOffersResult {
    offers: JobSearchResult[];
    /** Nombre total d'offres correspondant aux critères, si l'API le dit. */
    total?: number;
    /** Vrai quand l'API a renvoyé une page partielle (code 206). */
    partial?: boolean;
}

/** Jeton d'accès, gardé en mémoire tant qu'il est valable. */
let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Lit un secret, et refuse de travailler avec une valeur visiblement abîmée.
 *
 * `firebase functions:secrets:set` masque la saisie : comme rien ne s'affiche,
 * on recolle, et les collages s'additionnent. La valeur enregistrée est alors
 * la bonne, répétée — et France Travail répond « invalid_client », ce qui
 * n'aide personne.
 *
 * On se contente de le détecter et de le dire. J'ai d'abord voulu réparer en
 * ne gardant qu'un exemplaire ; c'est une mauvaise idée, car une valeur dont
 * le contenu se répète de lui-même serait amputée sans que personne ne le
 * sache. Détecter, oui ; corriger les identifiants de quelqu'un, non.
 */
function readSecret(raw: string, name: string): string {
    const value = raw.trim();
    const repeats = repetitionCount(value);

    if (repeats > 1) {
        logger.warn(name + ' semble collé ' + repeats + ' fois de suite.');
        throw new HttpsError(
            'failed-precondition',
            name + ' contient ' + repeats + ' fois la même valeur : la saisie masquée de '
            + '« firebase functions:secrets:set » a enregistré plusieurs collages. '
            + 'Réenregistrez-le depuis un fichier (--data-file), puis redéployez.'
        );
    }
    return value;
}

/** Combien de fois la valeur est-elle la répétition exacte d'un même bloc ? */
function repetitionCount(value: string): number {
    // Du plus grand bloc vers le plus petit : on rapporte la répétition la
    // plus prudente, et jamais pour un bloc trop court pour être un secret.
    for (let size = Math.floor(value.length / 2); size >= 16; size--) {
        if (value.length % size !== 0) continue;
        if (value.slice(0, size).repeat(value.length / size) === value) {
            return value.length / size;
        }
    }
    return 1;
}

export const searchJobOffers = onCall<JobSearchCriteria, Promise<SearchOffersResult>>(
    {
        // Région déclarée ici, et pas seulement dans `setGlobalOptions` :
        // l'import de ce fichier est évalué avant le corps de `index.ts`, donc
        // les options globales ne sont pas encore posées à cet instant. Sans
        // cette ligne, la fonction partirait en us-central1 alors que le
        // client appelle europe-west1.
        region: 'europe-west1',
        maxInstances: 5,
        memory: '256MiB',
        timeoutSeconds: 30,
        secrets: [FT_CLIENT_ID, FT_CLIENT_SECRET]
    },
    async request => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Connectez-vous pour chercher des offres.');
        }

        const id = readSecret(FT_CLIENT_ID.value(), 'FT_CLIENT_ID');
        const secret = readSecret(FT_CLIENT_SECRET.value(), 'FT_CLIENT_SECRET');
        if (!id || !secret) {
            throw new HttpsError(
                'failed-precondition',
                'La recherche n\'est pas encore configurée : il manque les identifiants '
                + 'France Travail (FT_CLIENT_ID et FT_CLIENT_SECRET).'
            );
        }

        const token = await accessToken(id, secret);
        const params = searchParams(request.data ?? {});
        const url = SEARCH_URL + '?' + new URLSearchParams(params).toString();

        const response = await call(url, {
            headers: { authorization: 'Bearer ' + token, accept: 'application/json' }
        });

        // 204 : aucune offre ne correspond. Ce n'est pas une erreur.
        if (response.status === 204) {
            return { offers: [], total: 0 };
        }
        if (response.status === 401 || response.status === 403) {
            cachedToken = null;
            throw new HttpsError(
                'permission-denied',
                'France Travail refuse la requête : vérifiez que l\'application a bien '
                + 'accès à « Offres d\'emploi v2 ».'
            );
        }
        if (response.status === 429) {
            throw new HttpsError('resource-exhausted', 'Trop de recherches d\'affilée. Réessayez dans une minute.');
        }
        if (!response.ok) {
            throw new HttpsError('unavailable', 'France Travail a répondu ' + response.status + '.');
        }

        const payload = await response.json() as { resultats?: unknown[] };
        const offers = mapOffers(payload);

        return {
            offers,
            total: totalFrom(response.headers.get('content-range')) ?? offers.length,
            partial: response.status === 206 ? true : undefined
        };
    }
);

// --------------------------------------------------------------- jeton

/**
 * Jeton d'accès par « client credentials ». Il vaut une vingtaine de minutes :
 * on le garde en mémoire pour ne pas le redemander à chaque recherche.
 *
 * Deux formes de `scope` existent selon les applications déclarées sur
 * francetravail.io : la forme courte, et une forme historique préfixée de
 * `application_<identifiant client>`. On essaie la première, puis la seconde
 * si le serveur répond « invalid_scope ».
 */
async function accessToken(id: string, secret: string): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 30_000) {
        return cachedToken.value;
    }

    const scopes = [SCOPE, 'application_' + id + ' ' + SCOPE];
    let lastFailure = '';

    for (const scope of scopes) {
        const attempt = await requestToken(id, secret, scope);

        if (attempt.token) {
            cachedToken = {
                value: attempt.token,
                expiresAt: now + (attempt.expiresIn ?? 1200) * 1000
            };
            return cachedToken.value;
        }

        lastFailure = attempt.failure ?? '';
        // Une autre erreur que le périmètre ne sera pas réglée par un second essai.
        if (!/invalid_scope/i.test(lastFailure)) break;
    }

    // Les longueurs, et elles seules : elles disent si la fonction lit bien la
    // version du secret que l'on croit, sans rien révéler de son contenu.
    const shapes = 'identifiant reçu : ' + id.length + ' caractères, clé : '
        + secret.length + ' caractères';

    throw new HttpsError(
        'permission-denied',
        'France Travail a refusé les identifiants. Réponse du serveur : '
        + (lastFailure || 'sans détail') + '. ' + hint(lastFailure)
        + ' (' + shapes + '.)'
    );
}

interface TokenAttempt {
    token?: string;
    expiresIn?: number;
    /** Ce que France Travail répond quand il refuse, mot pour mot. */
    failure?: string;
}

async function requestToken(id: string, secret: string, scope: string): Promise<TokenAttempt> {
    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
        scope
    });

    const response = await call(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (response.ok) {
        const payload = await response.json() as { access_token?: string; expires_in?: number };
        return payload.access_token
            ? { token: payload.access_token, expiresIn: payload.expires_in }
            : { failure: 'réponse sans jeton' };
    }

    // Le corps porte le motif exact : invalid_client, invalid_scope…
    const raw = await response.text().catch(() => '');
    let described = raw.slice(0, 300);
    try {
        const parsed = JSON.parse(raw) as { error?: string; error_description?: string };
        described = [parsed.error, parsed.error_description].filter(Boolean).join(' — ') || described;
    } catch {
        // Le corps n'était pas du JSON : on garde le texte brut, tronqué.
    }

    return { failure: response.status + ' ' + described };
}

/** Traduit le motif de refus en geste à faire. */
function hint(failure: string): string {
    if (/invalid_client/i.test(failure)) {
        // Vérifié en septembre 2026 : ce serveur contrôle l'authentification
        // AVANT le périmètre, et renvoie « invalid_client » aussi bien pour un
        // couple erroné que pour une application dont l'accès à l'API n'est
        // pas encore actif. Les deux pistes méritent donc d'être citées.
        return 'Deux causes possibles : le couple identifiant/clé ne correspond pas, '
            + 'ou l\'application francetravail.io n\'a pas encore d\'accès actif à '
            + '« Offres d\'emploi v2 » (souscription à confirmer, ou en attente de '
            + 'validation). Vérifiez l\'état de la souscription sur le portail.';
    }
    if (/invalid_scope/i.test(failure)) {
        return 'L\'application n\'a pas (encore) accès à « Offres d\'emploi v2 » : '
            + 'vérifiez l\'abonnement à cette API sur francetravail.io.';
    }
    return 'Vérifiez sur francetravail.io que l\'application est bien abonnée à '
        + '« Offres d\'emploi v2 », puis reprenez les deux identifiants.';
}

/** Appel réseau avec un délai maximal : une fonction ne doit pas s'éterniser. */
async function call(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (failure) {
        const error = failure as Error & { cause?: { code?: string; message?: string } };
        const aborted = error?.name === 'AbortError';

        // Le motif technique est rapporté : « injoignable » tout court ne
        // permet pas de distinguer une panne de nom, un refus de connexion et
        // un blocage du réseau d'où part l'appel.
        const cause = [error?.name, error?.message, error?.cause?.code, error?.cause?.message]
            .filter(Boolean)
            .join(' / ')
            .slice(0, 200);

        logger.error('Appel à ' + new URL(url).host + ' impossible : ' + cause);

        throw new HttpsError(
            aborted ? 'deadline-exceeded' : 'unavailable',
            aborted
                ? 'France Travail n\'a pas répondu à temps (' + new URL(url).host + ').'
                : 'France Travail est injoignable depuis le serveur. Motif : ' + cause
        );
    } finally {
        clearTimeout(timer);
    }
}

/** L'en-tête `content-range` porte le total : « offres 0-19/1543 ». */
function totalFrom(header: string | null): number | undefined {
    if (!header) return undefined;
    const match = /\/(\d+)\s*$/.exec(header);
    return match ? Number(match[1]) : undefined;
}
