import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
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

export const searchJobOffers = onCall<JobSearchCriteria, Promise<SearchOffersResult>>(
    { secrets: [FT_CLIENT_ID, FT_CLIENT_SECRET] },
    async request => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Connectez-vous pour chercher des offres.');
        }

        const id = FT_CLIENT_ID.value();
        const secret = FT_CLIENT_SECRET.value();
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
 */
async function accessToken(id: string, secret: string): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 30_000) {
        return cachedToken.value;
    }

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
        scope: SCOPE
    });

    const response = await call(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    if (!response.ok) {
        throw new HttpsError(
            'permission-denied',
            'France Travail a refusé les identifiants (' + response.status + '). '
            + 'Vérifiez FT_CLIENT_ID et FT_CLIENT_SECRET.'
        );
    }

    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
        throw new HttpsError('unavailable', 'France Travail n\'a pas renvoyé de jeton.');
    }

    cachedToken = {
        value: payload.access_token,
        expiresAt: now + (payload.expires_in ?? 1200) * 1000
    };
    return cachedToken.value;
}

/** Appel réseau avec un délai maximal : une fonction ne doit pas s'éterniser. */
async function call(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (failure) {
        const aborted = (failure as Error)?.name === 'AbortError';
        throw new HttpsError(
            aborted ? 'deadline-exceeded' : 'unavailable',
            aborted
                ? 'France Travail n\'a pas répondu à temps.'
                : 'France Travail est injoignable.'
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
