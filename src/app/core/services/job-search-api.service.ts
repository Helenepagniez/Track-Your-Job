import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { JobSearchCriteria, JobSearchResult } from '../parsing/france-travail';

interface SearchOffersResult {
    offers: JobSearchResult[];
    total?: number;
    partial?: boolean;
}

export interface SearchOutcome {
    ok: boolean;
    offers: JobSearchResult[];
    total?: number;
    /** Phrase à afficher : configuration manquante, refus, panne réseau. */
    message?: string;
    /** Vrai quand il ne manque que la configuration, pas le code. */
    needsSetup?: boolean;
}

/**
 * Recherche d'offres.
 *
 * L'appel passe par la fonction Firebase `searchJobOffers`, qui détient les
 * identifiants de l'API France Travail : ils ne peuvent pas vivre dans le
 * navigateur.
 */
@Injectable({
    providedIn: 'root'
})
export class JobSearchApiService {
    private functions = inject(Functions);

    async search(criteria: JobSearchCriteria): Promise<SearchOutcome> {
        const call = httpsCallable<JobSearchCriteria, SearchOffersResult>(
            this.functions,
            'searchJobOffers'
        );

        try {
            const answer = await call(criteria);
            return {
                ok: true,
                offers: answer.data.offers ?? [],
                total: answer.data.total
            };
        } catch (failure) {
            const described = describe(failure);
            return { ok: false, offers: [], ...described };
        }
    }
}

function describe(failure: unknown): { message: string; needsSetup?: boolean } {
    const error = failure as { code?: string; message?: string };
    const code = (error?.code ?? '').replace(/^functions\//, '');

    switch (code) {
        case 'failed-precondition':
            return {
                message: error.message
                    ?? 'La recherche n\'est pas encore configurée.',
                needsSetup: true
            };
        case 'unauthenticated':
            return { message: 'Reconnectez-vous pour chercher des offres.' };
        case 'permission-denied':
            return { message: error.message ?? 'France Travail a refusé la requête.' };
        case 'resource-exhausted':
            return { message: 'Trop de recherches d\'affilée. Réessayez dans une minute.' };
        case 'deadline-exceeded':
            return { message: 'France Travail n\'a pas répondu à temps.' };
        case 'unavailable':
            return { message: error.message ?? 'France Travail est injoignable.' };
        case 'not-found':
        case 'internal':
            // C'est ce que renvoie Firebase quand la fonction n'existe pas
            // encore côté serveur, ou qu'elle s'est interrompue.
            return {
                message: 'La recherche n\'est pas joignable. La fonction « searchJobOffers » '
                    + 'n\'est probablement pas encore déployée.',
                needsSetup: true
            };
        default: {
            // Ne jamais afficher un code brut du genre « internal » : sans
            // phrase, cela n'apprend rien à personne.
            const message = error?.message ?? '';
            return {
                message: /\s/.test(message) ? message : 'La recherche a échoué.'
            };
        }
    }
}
