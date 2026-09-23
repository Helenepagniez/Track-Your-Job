import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ParsedOffer } from '../parsing/job-offer-parser';

/** Ce que renvoie la fonction `readJobOffer`. */
interface ReadOfferResult {
    offer: ParsedOffer;
    fields: string[];
    note?: string;
}

export interface LookupOutcome {
    ok: boolean;
    offer?: ParsedOffer;
    fields?: string[];
    /** Phrase à afficher : refus du site, page vide, panne réseau. */
    message?: string;
}

/**
 * Lecture d'une annonce à partir de son lien.
 *
 * Le navigateur n'a pas le droit de lire la page d'un autre site : c'est la
 * fonction Firebase `readJobOffer` qui s'en charge, puis renvoie les champs.
 * Elle n'accepte que les personnes connectées.
 */
@Injectable({
    providedIn: 'root'
})
export class OfferLookupService {
    private functions = inject(Functions);

    async read(link: string): Promise<LookupOutcome> {
        const call = httpsCallable<{ url: string }, ReadOfferResult>(this.functions, 'readJobOffer');

        try {
            const answer = await call({ url: link });
            const data = answer.data;

            return {
                ok: true,
                offer: data.offer,
                fields: data.fields,
                message: data.note
            };
        } catch (failure) {
            return { ok: false, message: describe(failure) };
        }
    }
}

/** Traduit les codes d'erreur des fonctions Firebase en phrases lisibles. */
function describe(failure: unknown): string {
    const error = failure as { code?: string; message?: string };
    const code = (error?.code ?? '').replace(/^functions\//, '');

    switch (code) {
        case 'unauthenticated':
            return 'Reconnectez-vous pour lire une annonce.';
        case 'invalid-argument':
            // La fonction explique elle-même ce qui ne va pas dans l'adresse.
            return error.message ?? "Cette adresse n'est pas lisible.";
        case 'permission-denied':
            return error.message
                ?? "Ce site refuse la lecture automatique. Collez le texte de l'annonce à la place.";
        case 'deadline-exceeded':
            return "Le site n'a pas répondu à temps. Réessayez, ou collez le texte de l'annonce.";
        case 'not-found':
            return error.message ?? 'La page est introuvable.';
        case 'resource-exhausted':
            return 'La page est trop volumineuse pour être lue.';
        case 'unavailable':
            return "Le site n'a pas pu être joint.";
        case 'internal':
            return 'La lecture a échoué. Collez le texte de l\'annonce à la place.';
        default:
            return error?.message
                ?? "La lecture a échoué. Collez le texte de l'annonce à la place.";
    }
}
