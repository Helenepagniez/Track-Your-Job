/**
 * Contrôle d'une adresse avant d'aller la lire côté serveur.
 *
 * C'est une précaution nécessaire : une fonction qui récupère l'adresse
 * qu'on lui donne peut être détournée pour aller interroger des machines
 * qui ne sont joignables que depuis l'intérieur (métadonnées de
 * l'hébergeur, services privés, réseau local). On n'autorise donc que
 * http/https vers un nom public.
 *
 * Le code vit ici, avec l'analyseur d'annonce, pour être testé avec le
 * reste de l'application : la fonction serveur l'importe tel quel.
 */

export interface UrlCheck {
    ok: boolean;
    /** Adresse normalisée, quand elle est acceptée. */
    url?: string;
    /** Phrase affichable, quand elle est refusée. */
    reason?: string;
}

/** Noms d'hôtes qui ne désignent jamais une annonce publique. */
const BLOCKED_HOSTS = [
    'localhost',
    'metadata.google.internal',
    'metadata',
    '169.254.169.254'
];

const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

export function isFetchableUrl(raw: string): UrlCheck {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
        return { ok: false, reason: 'Aucune adresse fournie.' };
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return { ok: false, reason: "Cette adresse n'est pas une adresse web valide." };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: 'Seules les adresses http et https peuvent être lues.' };
    }

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (BLOCKED_HOSTS.includes(host) || BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))) {
        return { ok: false, reason: 'Cette adresse désigne une machine privée.' };
    }

    // Un nom public contient toujours un point (sinon c'est un nom de machine
    // du réseau local, comme « intranet »).
    if (!host.includes('.') && !host.includes(':')) {
        return { ok: false, reason: 'Cette adresse désigne une machine privée.' };
    }

    if (isPrivateAddress(host)) {
        return { ok: false, reason: 'Cette adresse désigne une machine privée.' };
    }

    return { ok: true, url: url.toString() };
}

/** Adresses IP réservées : boucle locale, réseaux privés, lien-local. */
function isPrivateAddress(host: string): boolean {
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 0 || a === 10 || a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
        if (a >= 224) return true;
        return false;
    }

    // IPv6 : boucle locale, lien-local, adresses uniques locales, et les
    // adresses IPv4 encapsulées.
    if (host.includes(':')) {
        if (host === '::1' || host === '::') return true;
        if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
        if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
        const mapped = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        return false;
    }

    return false;
}
