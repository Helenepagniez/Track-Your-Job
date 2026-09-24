/**
 * Offres de l'API France Travail, converties pour l'application.
 *
 * L'API renvoie un objet riche et verbeux, avec des libellés en capitales et
 * des codes maison. Tout est ramené ici au vocabulaire de l'application, en
 * calcul pur : la fonction serveur importe ce fichier, et les tests le
 * couvrent sans toucher au réseau.
 *
 * Documentation : https://francetravail.io, API « Offres d'emploi v2 ».
 */

/** Une offre telle que l'affiche l'écran de recherche. */
export interface JobSearchResult {
    /** Identifiant France Travail, par exemple « 214GCJM ». */
    id: string;
    title: string;
    /** Absent quand l'employeur n'est pas communiqué. */
    company?: string;
    location?: string;
    contractType?: string;
    /** Libellé complet du contrat (« CDD - 12 Mois »). */
    contractLabel?: string;
    weeklyHours?: string;
    salary?: string;
    experience?: string;
    /** Date ISO de publication. */
    publishedAt?: string;
    link?: string;
    /** Début de la description, pour la liste de résultats. */
    excerpt?: string;
    description?: string;
    skills?: string[];
    sector?: string;
    alternance?: boolean;
}

/** Critères de recherche, tels que les saisit l'utilisateur. */
export interface JobSearchCriteria {
    keywords?: string;
    /** Département sur deux chiffres, ou code commune INSEE. */
    department?: string;
    commune?: string;
    /** Rayon autour de la commune, en kilomètres. */
    distance?: number;
    contractTypes?: string[];
    /** Publiées depuis N jours : 1, 3, 7, 14 ou 31. */
    publishedWithinDays?: number;
    /** Uniquement les offres en alternance. */
    alternanceOnly?: boolean;
    /** Pagination : index du premier résultat. */
    from?: number;
    limit?: number;
}

/** Codes de contrat de l'API, vers le vocabulaire de l'application. */
const CONTRACT_CODES: Record<string, string> = {
    CDI: 'CDI',
    CDD: 'CDD',
    MIS: 'Intérim',
    SAI: 'CDD',
    DDI: 'CDD',
    DIN: 'Freelance',
    FRA: 'Freelance',
    LIB: 'Freelance',
    REP: 'Freelance',
    TTI: 'Intérim',
    CCE: 'CDI',
    APP: 'Alternance',
    CP: 'Alternance'
};

/** Le contraire : du vocabulaire de l'application vers les codes de l'API. */
const CONTRACT_FILTERS: Record<string, string[]> = {
    CDI: ['CDI'],
    CDD: ['CDD'],
    'Intérim': ['MIS'],
    Alternance: ['CDD'],
    Stage: ['CDD'],
    Freelance: ['DIN', 'LIB']
};

/** Paramètres d'appel de l'API, à partir des critères saisis. */
export function searchParams(criteria: JobSearchCriteria): Record<string, string> {
    const params: Record<string, string> = {};

    const keywords = (criteria.keywords ?? '').trim();
    if (keywords) params['motsCles'] = keywords;

    if (criteria.commune) {
        params['commune'] = criteria.commune;
        if (criteria.distance !== undefined) params['distance'] = String(criteria.distance);
    } else if (criteria.department) {
        params['departement'] = criteria.department;
    }

    const codes = (criteria.contractTypes ?? [])
        .flatMap(type => CONTRACT_FILTERS[type] ?? [])
        .filter((code, index, all) => all.indexOf(code) === index);
    if (codes.length > 0) params['typeContrat'] = codes.join(',');

    if (criteria.publishedWithinDays) {
        // L'API attend un code : 1, 3, 7, 14 ou 31 jours.
        const allowed = [1, 3, 7, 14, 31];
        const closest = allowed.reduce((best, entry) =>
            Math.abs(entry - criteria.publishedWithinDays!) < Math.abs(best - criteria.publishedWithinDays!)
                ? entry
                : best
        );
        params['publieeDepuis'] = String(closest);
    }

    if (criteria.alternanceOnly) params['natureContrat'] = 'E2';

    const from = criteria.from ?? 0;
    const limit = Math.min(criteria.limit ?? 20, 50);
    // L'API veut une plage « début-fin », bornes incluses.
    params['range'] = from + '-' + (from + limit - 1);

    return params;
}

/** Convertit une offre de l'API. Ne garde que ce qui est réellement présent. */
export function mapOffer(raw: Record<string, unknown>): JobSearchResult | null {
    const id = text(raw['id']);
    const title = text(raw['intitule']);
    if (!id || !title) return null;

    const result: JobSearchResult = { id, title: clean(title) };

    const company = nested(raw, 'entreprise', 'nom');
    if (company) result.company = tidyCaps(clean(company));

    const place = nested(raw, 'lieuTravail', 'libelle');
    if (place) result.location = locationLabel(place);

    const code = text(raw['typeContrat']);
    if (code) result.contractType = CONTRACT_CODES[code] ?? code;
    if (text(raw['alternance']) === 'true' || raw['alternance'] === true) {
        result.alternance = true;
        result.contractType = 'Alternance';
    }

    const contractLabel = text(raw['typeContratLibelle']);
    if (contractLabel) result.contractLabel = clean(contractLabel);

    const hours = text(raw['dureeTravailLibelle']) ?? text(raw['dureeTravailLibelleConverti']);
    if (hours) result.weeklyHours = clean(hours);

    const salary = nested(raw, 'salaire', 'libelle');
    if (salary) result.salary = clean(salary);

    const experience = text(raw['experienceLibelle']);
    if (experience) result.experience = clean(experience);

    const published = text(raw['dateCreation']);
    if (published) result.publishedAt = published;

    const link = nested(raw, 'origineOffre', 'urlOrigine');
    if (link) result.link = link;

    const description = text(raw['description']);
    if (description) {
        result.description = description.trim();
        result.excerpt = excerptOf(description);
    }

    const skills = Array.isArray(raw['competences'])
        ? (raw['competences'] as Record<string, unknown>[])
            .map(entry => text(entry?.['libelle']))
            .filter((entry): entry is string => !!entry)
        : [];
    if (skills.length > 0) result.skills = skills;

    const sector = text(raw['secteurActiviteLibelle']);
    if (sector) result.sector = clean(sector);

    return result;
}

/** Les offres exploitables d'une réponse de l'API. */
export function mapOffers(payload: unknown): JobSearchResult[] {
    const list = (payload as { resultats?: unknown })?.resultats;
    if (!Array.isArray(list)) return [];

    return list
        .map(entry => mapOffer((entry ?? {}) as Record<string, unknown>))
        .filter((entry): entry is JobSearchResult => entry !== null);
}

/**
 * « 35 - RENNES » devient « Rennes (35) », comme partout ailleurs dans
 * l'application.
 */
export function locationLabel(libelle: string): string {
    const match = /^\s*(\d{2,3})\s*-\s*(.+)$/.exec(libelle);
    if (!match) return tidyCity(clean(libelle));

    const city = tidyCity(clean(match[2]));
    return city + ' (' + match[1] + ')';
}

/** Les premières phrases de la description, pour la liste de résultats. */
function excerptOf(description: string): string {
    const flat = description.replace(/\s+/g, ' ').trim();
    if (flat.length <= 220) return flat;

    const cut = flat.slice(0, 220);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' ; '));
    return (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…');
}

// ------------------------------------------------------------------ outils

function text(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
}

function nested(raw: Record<string, unknown>, key: string, field: string): string | undefined {
    const value = raw[key];
    if (!value || typeof value !== 'object') return undefined;
    return text((value as Record<string, unknown>)[field]);
}

function clean(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

/** Petits mots qui restent en minuscules au milieu d'un nom de commune. */
const CITY_CONNECTORS = ['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'aux', 'au', 'lès', 'les'];

/**
 * Nom de commune en casse normale.
 *
 * On ne garde pas les mots courts en capitales ici, contrairement aux noms
 * d'entreprise : une commune n'a pas de sigle, et « BAIN DE BRETAGNE »
 * donnerait sinon « BAIN DE Bretagne ». Les petits mots de liaison passent en
 * minuscules : « Bain de Bretagne ».
 */
function tidyCity(value: string): string {
    if (value !== value.toUpperCase()) return value;

    return value
        .toLowerCase()
        .split(' ')
        .map((word, index) => index > 0 && CITY_CONNECTORS.includes(word)
            ? word
            : word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        // « Saint-Malo », « L'Hermitage ».
        .replace(/([-'’])([a-zà-ÿ])/g, (_, separator, letter) => separator + letter.toUpperCase());
}

/**
 * L'API écrit les noms en capitales. On les remet en casse normale en
 * laissant les sigles courts tranquilles : « CLINIQUE FSEF RENNES » donne
 * « Clinique FSEF Rennes ».
 */
function tidyCaps(value: string): string {
    if (value !== value.toUpperCase()) return value;

    return value
        .split(' ')
        .map(word => word.length <= 4 && /^[A-ZÀ-Ý0-9]+$/.test(word)
            ? word
            : word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ')
        // « Saint-Malo » plutôt que « Saint-malo ».
        .replace(/([-'’])([a-zà-ÿ])/g, (_, sep, letter) => sep + letter.toUpperCase());
}
