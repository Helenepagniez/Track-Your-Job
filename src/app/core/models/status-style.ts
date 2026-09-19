import {
    APPLICATION_STATUSES,
    ApplicationStatus,
    LEGACY_TO_STATUS,
    STATUS_LABELS
} from './job-search.models';

/**
 * Habillage des statuts. Les couleurs elles-mêmes vivent dans `src/styles.css`
 * sous la forme de classes `.st-<statut>` : aucun composant n'en écrit plus une
 * seule en dur.
 */

/** Accepte un statut du nouveau modèle ou son ancien libellé anglais. */
export function toStatus(value: ApplicationStatus | string): ApplicationStatus {
    if ((APPLICATION_STATUSES as readonly string[]).includes(value)) {
        return value as ApplicationStatus;
    }
    return LEGACY_TO_STATUS[value] ?? 'to_apply';
}

/** Classe de la pastille : fond et texte du statut. */
export function statusClass(value: ApplicationStatus | string): string {
    return 'st-' + toStatus(value);
}

/** Classe du point coloré, quand il est seul (en-tête de colonne, menu). */
export function statusDotClass(value: ApplicationStatus | string): string {
    return 'dot-' + toStatus(value);
}

export function statusLabel(value: ApplicationStatus | string): string {
    return STATUS_LABELS[toStatus(value)];
}
