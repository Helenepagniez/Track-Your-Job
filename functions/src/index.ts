import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { isFetchableUrl } from '../../src/app/core/parsing/fetchable-url';
import { ParsedOffer, parseJobOffer, sourceFromLink } from '../../src/app/core/parsing/job-offer-parser';

// Recherche d'offres par l'API France Travail, dans son propre fichier.
export { searchJobOffers } from './search-offers';

/**
 * Lecture d'une annonce d'emploi à partir de son lien.
 *
 * Le navigateur n'a pas le droit de lire la page d'un autre site : c'est donc
 * cette fonction qui va la chercher, en tire ce qu'elle peut, et renvoie les
 * champs du formulaire. L'analyse elle-même est celle de l'application
 * (`src/app/core/parsing`), importée telle quelle : une seule implémentation,
 * testée avec le reste.
 *
 * `onCall` vérifie le jeton Firebase tout seul : seule une personne connectée
 * peut appeler la fonction, et `maxInstances` borne la dépense même en cas
 * d'emballement.
 */

setGlobalOptions({
    region: 'europe-west1',
    maxInstances: 5,
    memory: '256MiB',
    timeoutSeconds: 30
});

/** Au-delà, ce n'est pas une annonce : on arrête de lire. */
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

/** Certains sites renvoient une page vide aux clients sans navigateur. */
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/125.0 Safari/537.36 TrackYourJob/1.0';

export interface ReadOfferResult {
    offer: ParsedOffer;
    /** Ce qui a été reconnu, ou vide si la page n'a rien livré. */
    fields: string[];
    /** Renseigné quand la lecture a abouti mais n'a rien donné d'exploitable. */
    note?: string;
}

export const readJobOffer = onCall<{ url?: string }, Promise<ReadOfferResult>>(
    async request => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Connectez-vous pour lire une annonce.');
        }

        const check = isFetchableUrl(String(request.data?.url ?? ''));
        if (!check.ok || !check.url) {
            throw new HttpsError('invalid-argument', check.reason ?? 'Adresse illisible.');
        }

        const page = await fetchPage(check.url);
        const offer = parseJobOffer(page.body);

        // Le lien demandé fait foi : une page contient aussi des adresses de
        // mesure d'audience ou de schémas, dont on ne veut pas déduire la
        // source.
        offer.link = check.url;
        offer.source = sourceFromLink(check.url) ?? offer.source;

        const fields = describe(offer);

        return {
            offer,
            fields,
            note: fields.length <= 2
                ? "La page n'a pas livré grand-chose : elle charge sans doute son contenu en JavaScript. "
                + "Copiez le texte de l'annonce, l'application saura le lire."
                : undefined
        };
    }
);

// --------------------------------------------------------------- lecture

interface FetchedPage {
    body: string;
    finalUrl: string;
}

/**
 * Va chercher la page, en suivant les redirections une par une : chaque
 * étape est revérifiée, sinon une redirection suffirait à contourner le
 * contrôle d'adresse.
 */
async function fetchPage(startUrl: string): Promise<FetchedPage> {
    let current = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        let response: Response;
        try {
            response = await fetch(current, {
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'user-agent': USER_AGENT,
                    'accept': 'text/html,application/xhtml+xml',
                    'accept-language': 'fr-FR,fr;q=0.9'
                }
            });
        } catch (failure) {
            clearTimeout(timer);
            const aborted = (failure as Error)?.name === 'AbortError';
            throw new HttpsError(
                aborted ? 'deadline-exceeded' : 'unavailable',
                aborted
                    ? "Le site n'a pas répondu à temps."
                    : "Le site n'a pas pu être joint."
            );
        }
        clearTimeout(timer);

        if (response.status >= 300 && response.status < 400) {
            const target = response.headers.get('location');
            if (!target) break;

            const next = isFetchableUrl(new URL(target, current).toString());
            if (!next.ok || !next.url) {
                throw new HttpsError('invalid-argument', next.reason ?? 'Redirection refusée.');
            }
            current = next.url;
            continue;
        }

        if (response.status === 403 || response.status === 429) {
            throw new HttpsError(
                'permission-denied',
                'Ce site refuse la lecture automatique. Collez le texte de l\'annonce à la place.'
            );
        }
        if (!response.ok) {
            throw new HttpsError('not-found', 'La page est introuvable (erreur ' + response.status + ').');
        }

        return { body: await readCapped(response), finalUrl: current };
    }

    throw new HttpsError('unavailable', 'Trop de redirections.');
}

/** Lit le corps de la réponse, en s'arrêtant à la taille maximale. */
async function readCapped(response: Response): Promise<string> {
    const declared = Number(response.headers.get('content-length') ?? NaN);
    if (!isNaN(declared) && declared > MAX_BYTES) {
        throw new HttpsError('resource-exhausted', 'La page est trop volumineuse.');
    }

    const reader = response.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder('utf-8');
    let size = 0;
    let text = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
            await reader.cancel();
            break;
        }
        text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
}

/** Les champs reconnus, dans les mots de l'interface. */
function describe(offer: ParsedOffer): string[] {
    const labels: [keyof ParsedOffer, string][] = [
        ['title', 'intitulé'],
        ['companyName', 'entreprise'],
        ['agencyName', 'agence'],
        ['location', 'lieu'],
        ['contractType', 'contrat'],
        ['contractDuration', 'durée'],
        ['weeklyHours', 'temps de travail'],
        ['salary', 'salaire'],
        ['source', 'source']
    ];

    const found = labels
        .filter(([key]) => offer[key] !== undefined)
        .map(([, label]) => label);

    if (offer.posting?.description) found.push('description');
    if (offer.posting?.missions) found.push('missions');
    if (offer.posting?.profile) found.push('profil');
    if (offer.posting?.benefits) found.push('avantages');
    if (offer.posting?.recruitmentProcess) found.push('process');

    return found;
}
