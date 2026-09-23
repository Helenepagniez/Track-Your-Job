import { JobPosting } from '../models/job-search.models';

/**
 * Lecture d'une annonce d'emploi : on en tire de quoi préremplir le
 * formulaire de candidature.
 *
 * Trois entrées possibles, traitées par le même analyseur :
 *  - un lien seul : le navigateur ne peut pas aller chercher la page (les
 *    sites d'emploi interdisent la lecture croisée), on ne déduit donc que
 *    la source ;
 *  - le texte de l'annonce, copié depuis la page ;
 *  - le code d'une page, d'où l'on tire le bloc `JobPosting` en JSON-LD que
 *    la plupart des sites d'emploi publient pour les moteurs de recherche.
 *
 * Rien ici ne dépend d'Angular : c'est du calcul pur, donc testable ligne
 * par ligne, et réutilisable tel quel par une fonction serveur.
 */

export interface ParsedOffer {
    title?: string;
    companyName?: string;
    /** Vrai quand l'annonce parle de « notre client » sans le nommer. */
    employerNotNamed?: boolean;
    agencyName?: string;
    location?: string;
    contractType?: string;
    contractDuration?: string;
    weeklyHours?: string;
    salary?: string;
    source?: string;
    link?: string;
    posting?: JobPosting;
}

const KNOWN_SOURCES: { match: string; label: string }[] = [
    { match: 'hellowork', label: 'HelloWork' },
    { match: 'indeed', label: 'Indeed' },
    { match: 'francetravail', label: 'France Travail' },
    { match: 'pole-emploi', label: 'France Travail' },
    { match: 'linkedin', label: 'LinkedIn' },
    { match: 'welcometothejungle', label: 'Welcome to the Jungle' },
    { match: 'apec', label: 'Apec' },
    { match: 'ouestfrance-emploi', label: 'Ouest France Emploi' },
    { match: 'monster', label: 'Monster' },
    { match: 'glassdoor', label: 'Glassdoor' }
];

/** Devine la source d'une candidature à partir du lien de l'annonce. */
export function sourceFromLink(link?: string): string | undefined {
    if (!link) return undefined;
    let host: string;
    try {
        host = new URL(link).hostname.toLowerCase();
    } catch {
        return undefined;
    }
    const known = KNOWN_SOURCES.find(source => host.includes(source.match));
    if (known) return known.label;
    return host.replace(/^www\./, '');
}

/**
 * Analyse ce qui a été collé : lien, texte d'annonce, ou code de page.
 * Ne renvoie que ce qui a été réellement reconnu ; rien n'est inventé.
 */
export function parseJobOffer(input: string): ParsedOffer {
    const raw = (input ?? '').trim();
    if (!raw) return {};

    const link = firstLink(raw);
    const fromLink: ParsedOffer = link ? { link, source: sourceFromLink(link) } : {};

    // Un lien seul : il n'y a rien d'autre à lire.
    if (link && raw === link) return fromLink;

    const structured = parseJsonLd(raw);
    // Les règles ne travaillent que sur le contenu de l'annonce : une page de
    // site d'emploi contient aussi des menus, des fenêtres d'aide et d'autres
    // annonces, où les règles piocheraient n'importe quoi.
    const text = toPlainText(extractMainContent(raw));
    const guessed = parseText(text);

    // Le JSON-LD est déclaré par le site : il passe devant le lien, qui passe
    // devant les devinettes. Un merge ne remplace jamais ce qui est déjà là,
    // donc la source la plus fiable vient en premier.
    return merge(merge(structured, fromLink), guessed);
}

// ---------------------------------------------------------------- JSON-LD

/**
 * Cherche un `JobPosting` schema.org dans les blocs JSON-LD d'une page.
 * C'est la source la plus fiable : ce sont les champs que le site déclare
 * lui-même aux moteurs de recherche.
 */
function parseJsonLd(raw: string): ParsedOffer {
    const blocks = [...raw.matchAll(
        /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
    )].map(match => match[1]);

    // Le contenu peut aussi être collé sans sa balise.
    if (blocks.length === 0 && raw.includes('"JobPosting"')) {
        blocks.push(raw);
    }

    for (const block of blocks) {
        let data: unknown;
        try {
            data = JSON.parse(block.trim());
        } catch {
            continue;
        }
        const posting = findJobPosting(data);
        if (posting) return fromJobPosting(posting);
    }
    return {};
}

/** Le `JobPosting` peut être enfoui dans un tableau ou un `@graph`. */
function findJobPosting(data: unknown): Record<string, unknown> | null {
    if (Array.isArray(data)) {
        for (const entry of data) {
            const found = findJobPosting(entry);
            if (found) return found;
        }
        return null;
    }
    if (!data || typeof data !== 'object') return null;

    const node = data as Record<string, unknown>;
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('JobPosting')) return node;

    for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
        if (node[key] !== undefined) {
            const found = findJobPosting(node[key]);
            if (found) return found;
        }
    }
    return null;
}

function fromJobPosting(node: Record<string, unknown>): ParsedOffer {
    const offer: ParsedOffer = {};

    const title = text(node['title']);
    if (title) offer.title = clean(title);

    const organisation = node['hiringOrganization'];
    const company = typeof organisation === 'string'
        ? organisation
        : text((organisation as Record<string, unknown>)?.['name']);
    if (company) offer.companyName = clean(company);

    const place = locationOf(node['jobLocation']);
    if (place) offer.location = place;

    const employment = employmentOf(node['employmentType']);
    if (employment.contractType) offer.contractType = employment.contractType;
    if (employment.weeklyHours) offer.weeklyHours = employment.weeklyHours;

    const salary = salaryOf(node['baseSalary']);
    if (salary) offer.salary = salary;

    const url = text(node['url']);
    if (url) {
        offer.link = url;
        offer.source = sourceFromLink(url);
    }

    // La description contient souvent toute l'annonce, sections comprises.
    const description = text(node['description']);
    if (description) {
        const body = toPlainText(description);
        const sections = splitSections(body.split(/\r?\n/).map(line => line.trim()));
        offer.posting = Object.values(sections).some(Boolean)
            ? sections
            : { description: body };
    }

    return offer;
}

function locationOf(value: unknown): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    if (!first) return undefined;
    if (typeof first === 'string') return clean(first);

    const address = (first as Record<string, unknown>)['address'];
    if (typeof address === 'string') return clean(address);
    if (!address || typeof address !== 'object') return undefined;

    const parts = address as Record<string, unknown>;
    const city = text(parts['addressLocality']);
    const code = text(parts['postalCode']);
    const region = text(parts['addressRegion']);

    if (city && code) return clean(city) + ' (' + clean(code).slice(0, 2) + ')';
    return clean(city || region || code || '') || undefined;
}

/**
 * `employmentType` mélange deux choses : le type de contrat et le temps de
 * travail. Les sites français y écrivent souvent « CDI » directement.
 */
function employmentOf(value: unknown): { contractType?: string; weeklyHours?: string } {
    const entries = (Array.isArray(value) ? value : [value])
        .map(entry => text(entry))
        .filter((entry): entry is string => !!entry);

    const result: { contractType?: string; weeklyHours?: string } = {};

    for (const entry of entries) {
        const key = fold(entry);
        if (key === 'full_time' || key === 'fulltime') result.weeklyHours ??= 'Temps plein';
        else if (key === 'part_time' || key === 'parttime') result.weeklyHours ??= 'Temps partiel';
        else if (key === 'intern' || key === 'internship') result.contractType ??= 'Stage';
        else if (key === 'contractor') result.contractType ??= 'Freelance';
        else if (key === 'temporary') result.contractType ??= 'Intérim';
        else if (key === 'apprenticeship') result.contractType ??= 'Alternance';
        else {
            const french = contractFromText(entry);
            if (french) result.contractType ??= french;
        }
    }
    return result;
}

function salaryOf(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string' || typeof value === 'number') return clean(String(value));

    const node = value as Record<string, unknown>;
    const currency = text(node['currency']) === 'EUR' ? '€' : (text(node['currency']) ?? '€');
    const amount = node['value'];
    if (!amount) return undefined;

    if (typeof amount === 'string' || typeof amount === 'number') {
        return format(Number(amount)) + ' ' + currency;
    }

    const parts = amount as Record<string, unknown>;
    const min = Number(parts['minValue'] ?? NaN);
    const max = Number(parts['maxValue'] ?? NaN);
    const single = Number(parts['value'] ?? NaN);
    const period = periodOf(text(parts['unitText']));

    if (!isNaN(min) && !isNaN(max)) {
        return format(min) + ' à ' + format(max) + ' ' + currency + period;
    }
    const alone = !isNaN(single) ? single : (!isNaN(min) ? min : max);
    if (isNaN(alone)) return undefined;
    return format(alone) + ' ' + currency + period;
}

function periodOf(unit?: string): string {
    switch (fold(unit ?? '')) {
        case 'year': return ' brut / an';
        case 'month': return ' brut / mois';
        case 'week': return ' brut / semaine';
        case 'day': return ' brut / jour';
        case 'hour': return ' brut / heure';
        default: return '';
    }
}

/** Espace insécable fine pour les milliers, comme le fait l'usage français. */
function format(amount: number): string {
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ------------------------------------------------------------------ texte

/**
 * Devine les champs à partir du texte de l'annonce. Chaque règle cherche
 * d'abord une ligne étiquetée (« Lieu : Rennes »), puis se rabat sur une
 * tournure courante.
 */
function parseText(text: string): ParsedOffer {
    const allLines = text.split(/\r?\n/).map(line => line.trim());
    // Les règles de champ ignorent l'interface ; le découpage en sections, lui,
    // a besoin de ces lignes pour savoir où l'annonce s'arrête.
    const lines = allLines.filter(line => !isChromeLine(line));
    const body = lines.join('\n');
    const offer: ParsedOffer = {};

    const title = labelled(lines, ['intitule du poste', 'intitule', 'poste', 'titre'])
        ?? firstTitleLine(lines);
    if (title) offer.title = title;

    // « Pour notre client » : l'employeur n'est pas nommé, et c'est voulu.
    if (/pour (le compte d(e|'un)|l'un de )?(notre|nos|son|ses) clients?/i.test(body)
        || /notre client\b/i.test(body)) {
        offer.employerNotNamed = true;
        const agency = agencyName(lines);
        if (agency && plausibleCompany(agency)) offer.agencyName = agency;
    } else {
        const company = labelled(lines, ['entreprise', 'societe', 'employeur', 'raison sociale'])
            ?? companyFromPhrase(lines);
        if (company && plausibleCompany(company)) offer.companyName = company;
    }

    // Une valeur étiquetée passe par le même nettoyage que le texte libre :
    // « Lieu : Rennes (35000) » doit donner « Rennes (35) » comme ailleurs.
    const labelledPlace = labelled(lines, ['lieu de travail', 'lieu', 'localisation', 'ville', 'localite']);
    const place = (labelledPlace ? locationFromText(labelledPlace) ?? labelledPlace : undefined)
        ?? locationFromText(body);
    if (place) offer.location = withRemote(place, body);

    const contract = labelled(lines, ['type de contrat', 'contrat'])
        ?? undefined;
    offer.contractType = (contract ? contractFromText(contract) : undefined)
        ?? contractFromText(body);

    const duration = labelled(lines, ['duree du contrat', 'duree'])
        ?? durationFromText(body);
    if (duration) offer.contractDuration = duration;

    const labelledHours = labelled(lines, ['temps de travail', 'horaires', 'duree hebdomadaire']);
    const hours = (labelledHours ? hoursFromText(labelledHours) ?? labelledHours : undefined)
        ?? hoursFromText(body);
    if (hours) offer.weeklyHours = hours;

    const salary = labelled(lines, ['salaire', 'remuneration', 'salaire brut'])
        ?? salaryFromText(lines);
    if (salary) offer.salary = salary;

    const sections = splitSections(allLines, title);
    if (Object.values(sections).some(Boolean)) offer.posting = sections;

    return offer;
}

/** Valeur d'une ligne « Étiquette : valeur », accents et casse ignorés. */
function labelled(lines: string[], labels: string[]): string | undefined {
    for (const line of lines) {
        const match = line.match(/^([^:•\-–]{2,40})\s*[:：]\s*(.+)$/);
        if (!match) continue;
        const key = fold(match[1]).replace(/\s+/g, ' ').trim();
        if (labels.includes(key)) {
            const value = clean(match[2]);
            if (value) return value;
        }
    }
    return undefined;
}

/** Première ligne qui ressemble à un intitulé de poste. */
function firstTitleLine(lines: string[]): string | undefined {
    for (const line of lines) {
        if (!line || line.length > 120) continue;
        if (/^https?:\/\//i.test(line)) continue;
        if (line.includes(':')) continue;
        if (isHeading(line)) continue;
        // Les sites tronquent les descriptions par des points de suspension :
        // ce morceau de phrase n'est pas un intitulé de poste.
        if (/(\.{3}|…)$/.test(line)) continue;
        // Une phrase se termine par un point ; un intitulé, non.
        if (/[.!?]$/.test(line) && line.split(' ').length > 8) continue;
        const candidate = clean(line);
        if (candidate.length < 8 && candidate.split(' ').length < 2) continue;
        return candidate;
    }
    return undefined;
}

function companyFromPhrase(lines: string[]): string | undefined {
    for (const line of lines) {
        const recruits = line.match(
            /^([A-ZÀ-Ý][\wÀ-ÿ&'’.\- ]{1,40}?)\s+(?:recrute|recherche|embauche)\b/
        );
        if (recruits) return clean(recruits[1]);

        const at = line.match(/\bchez\s+([A-ZÀ-Ý][\wÀ-ÿ&'’.\-]*(?:\s+[A-ZÀ-Ý][\wÀ-ÿ&'’.\-]*){0,3})/);
        if (at) return clean(at[1]);

        const join = line.match(/\brejoign(?:ez|re)\s+([A-ZÀ-Ý][\wÀ-ÿ&'’.\-]*(?:\s+[A-ZÀ-Ý][\wÀ-ÿ&'’.\-]*){0,3})/);
        if (join) return clean(join[1]);
    }
    return undefined;
}

/** Nom de l'agence qui recrute pour un client non nommé. */
function agencyName(lines: string[]): string | undefined {
    for (const line of lines) {
        const match = line.match(
            /^([A-ZÀ-Ý][\wÀ-ÿ&'’.\- ]{1,40}?)\s+(?:recrute|recherche|embauche)\b/
        );
        if (match) return clean(match[1]);
    }
    return undefined;
}

/**
 * Un nom d'entreprise n'est ni une phrase, ni un bouton. Mieux vaut ne rien
 * proposer que de recopier un morceau d'interface.
 */
function plausibleCompany(name: string): boolean {
    if (name.length < 2 || name.length > 60) return false;
    if (/[?!×·…]|\.{2,}/.test(name)) return false;
    if (!/[A-Za-zÀ-ÿ]/.test(name)) return false;
    if (isChromeLine(name)) return false;
    return companyShaped(name);
}

/** Petits mots qui relient les mots d'une raison sociale. */
const COMPANY_CONNECTORS = ['de', 'du', 'des', 'la', 'le', 'les', 'et', '&', 'en', 'aux', 'au', 'd'];

/**
 * Un nom d'entreprise s'écrit en majuscules initiales, éventuellement relié
 * par de petits mots : « Atelier Verso », « Université de Rennes », « CHU ».
 * Sans ce contrôle, une phrase comme « Vous pouvez y associer un rayon de
 * recherche » passe pour une entreprise qui recherche quelqu'un.
 */
function companyShaped(name: string): boolean {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 6) return false;

    return words.every((word, index) => {
        const bare = word.replace(/^[«"'(\[]+/, '').replace(/[»"')\]]+$/, '');
        if (!bare) return false;
        if (index > 0 && COMPANY_CONNECTORS.includes(fold(bare))) return true;
        return /^[A-ZÀ-Ý0-9]/.test(bare);
    });
}

/** Mots qui apparaissent entre parenthèses sans désigner une ville. */
const NOT_A_CITY = [
    'cdi', 'cdd', 'stage', 'alternance', 'interim', 'freelance', 'apprentissage',
    'temps plein', 'temps partiel', 'h f', 'f h', 'non renseigne', 'publie',
    'offre', 'offres', 'emploi', 'contrat', 'salaire', 'entreprise', 'poste',
    'candidature', 'description', 'profil', 'missions'
];

/**
 * Les sites d'emploi écrivent souvent la ville en capitales (« RENNES »,
 * « SAINT-MALO »). On la remet en casse normale, sinon elle crie dans les
 * listes de candidatures.
 */
function tidyCity(name: string): string {
    if (name !== name.toUpperCase()) return name;

    return name
        .toLowerCase()
        .replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_, before, letter) => before + letter.toUpperCase());
}

function plausibleCity(name: string): boolean {
    if (name.length < 3 || name.length > 40) return false;
    const key = fold(name).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return !NOT_A_CITY.includes(key);
}

function locationFromText(body: string): string | undefined {
    // « Rennes (35) » ou « Rennes (35000) »
    for (const match of body.matchAll(/([A-ZÀ-Ý][\wÀ-ÿ'’\-]+(?:[ -][A-ZÀ-Ý]?[\wÀ-ÿ'’\-]+)?)\s*\((\d{2}|\d{5})\)/g)) {
        if (plausibleCity(match[1])) return tidyCity(clean(match[1])) + ' (' + match[2].slice(0, 2) + ')';
    }

    // « 35000 Rennes »
    for (const match of body.matchAll(/\b(\d{5})\s+([A-ZÀ-Ý][\wÀ-ÿ'’\-]+(?:[ -][A-ZÀ-Ý]?[\wÀ-ÿ'’\-]+)?)/g)) {
        if (plausibleCity(match[2])) return tidyCity(clean(match[2])) + ' (' + match[1].slice(0, 2) + ')';
    }

    // « 35 - Rennes », comme l'écrit France Travail
    for (const match of body.matchAll(/\b(\d{2})\s*-\s*([A-ZÀ-Ý][\wÀ-ÿ'’\-]+(?:[ -][A-ZÀ-Ý]?[\wÀ-ÿ'’\-]+)?)/g)) {
        if (plausibleCity(match[2])) return tidyCity(clean(match[2])) + ' (' + match[1] + ')';
    }

    // « basé à Cesson-Sévigné ». Pas de \b devant le « à » : en JavaScript,
    // une limite de mot ne reconnaît pas les lettres accentuées.
    for (const match of body.matchAll(/(?:^|[\s(])[àa]\s+([A-ZÀ-Ý][\wÀ-ÿ'’\-]{2,}(?:[ -][A-ZÀ-Ý][\wÀ-ÿ'’\-]+)?)/gm)) {
        if (plausibleCity(match[1])) return tidyCity(clean(match[1]));
    }

    return undefined;
}

function withRemote(place: string, body: string): string {
    if (/full\s*remote|100\s*%\s*(?:de\s*)?t[ée]l[ée]travail/i.test(body)) {
        return place + ' · full remote';
    }
    if (/t[ée]l[ée]travail|remote/i.test(body) && !/t[ée]l[ée]travail/i.test(place)) {
        return place + ' · télétravail';
    }
    return place;
}

function contractFromText(body: string): string | undefined {
    const tests: [RegExp, string][] = [
        [/\bC\.?D\.?I\.?\b/i, 'CDI'],
        [/\bC\.?D\.?D\.?\b/i, 'CDD'],
        [/alternance|apprentissage|contrat de professionnalisation/i, 'Alternance'],
        [/\bstage\b|stagiaire|convention de stage/i, 'Stage'],
        [/int[ée]rim|mission temporaire|travail temporaire/i, 'Intérim'],
        [/freelance|ind[ée]pendant|portage salarial|prestation/i, 'Freelance']
    ];
    let earliest: { index: number; label: string } | undefined;
    for (const [test, label] of tests) {
        const found = test.exec(body);
        if (found && (earliest === undefined || found.index < earliest.index)) {
            earliest = { index: found.index, label };
        }
    }
    return earliest?.label;
}

function durationFromText(body: string): string | undefined {
    for (const line of body.split('\n')) {
        if (!/\b(cdd|mission|contrat|dur[ée]e|stage|alternance)\b/i.test(line)) continue;
        const match = line.match(/\b(?:de\s+)?(\d+)(?:\s*(?:[àa]|-|–)\s*(\d+))?\s*(mois|semaines?|ans?)\b/i);
        if (match) {
            const unit = match[3].toLowerCase();
            return match[2]
                ? match[1] + ' à ' + match[2] + ' ' + unit
                : match[1] + ' ' + unit;
        }
    }
    return undefined;
}

function hoursFromText(body: string): string | undefined {
    const explicit = body.match(/\b(\d{2}(?:[.,]\d{1,2})?)\s*(?:h|heures)\b(?:\s*(?:\/|par)\s*semaine|\s*hebdomadaires?)?/i);
    if (explicit) return explicit[1].replace('.', ',') + 'h';
    if (/temps\s*plein/i.test(body)) return 'Temps plein';
    if (/temps\s*partiel/i.test(body)) return 'Temps partiel';
    return undefined;
}

/**
 * Prend le fragment qui parle d'argent. Le champ est du texte libre : mieux
 * vaut recopier fidèlement « entre 30 000 et 35 000 € brut annuel » que de
 * réduire l'information à un nombre.
 */
function salaryFromText(lines: string[]): string | undefined {
    for (const line of lines) {
        // « Euros » avec une majuscule est courant sur les sites publics.
        if (!/€|\beuros?\b|k€/i.test(line)) continue;

        // On isole la phrase concernée, pour ne pas ramener tout un paragraphe.
        const sentence = line
            .split(/(?<=[.;])\s+/)
            .find(part => /€|\beuros?\b/i.test(part)) ?? line;

        // Sans mise en forme, une page peut coller plusieurs informations sur
        // la même ligne : on repart du mot « salaire » s'il apparaît en cours
        // de route.
        const fromLabel = sentence.search(/salaire|r[ée]mun[ée]ration/i);
        const fragment = fromLabel > 0 ? sentence.slice(fromLabel) : sentence;

        // L'étiquette peut apparaître deux fois de suite (« Salaire- Salaire
        // brut : »), on la retire tant qu'elle se présente.
        let cleaned = clean(fragment.replace(/^[-•*\s]+/, ''));
        const label = /^(salaire\s*brut|salaire|r[ée]mun[ée]ration)\s*[:：-]?\s*/i;
        while (label.test(cleaned)) {
            cleaned = cleaned.replace(label, '').trim();
        }

        if (cleaned.length <= 120) return cleaned;
    }
    return undefined;
}

// --------------------------------------------------------------- sections

const SECTION_KEYS: { field: keyof JobPosting; keys: string[] }[] = [
    {
        field: 'missions',
        keys: ['missions', 'vos missions', 'les missions', 'missions principales',
            'ce que vous ferez', 'votre role', 'activites', 'taches', 'descriptif du poste',
            'vos futures missions', 'activites principales', 'vos activites']
    },
    {
        field: 'profile',
        keys: ['profil', 'profil recherche', 'profil souhaite', 'votre profil',
            'le profil recherche', 'competences', 'competences requises',
            'qualifications', 'vous etes', 'ce que nous recherchons', 'pre-requis',
            'prerequis', 'experience', 'savoir etre professionnels', 'savoirs etre professionnels',
            'formation', 'formations', 'permis']
    },
    {
        field: 'benefits',
        keys: ['avantages', 'nos avantages', 'ce que nous offrons', 'nous vous proposons',
            'ce que nous vous offrons', 'remuneration et avantages', 'pourquoi nous rejoindre']
    },
    {
        field: 'recruitmentProcess',
        keys: ['processus de recrutement', 'process de recrutement', 'process',
            'deroulement des entretiens', 'les etapes du recrutement', 'comment postuler']
    },
    {
        field: 'description',
        keys: ['description', 'description du poste', 'description de l offre',
            'le poste', 'a propos du poste', 'presentation', 'a propos',
            'l entreprise', 'entreprise', 'qui sommes nous', 'contexte',
            'conditions de travail', 'informations complementaires']
    }
];

/** Le titre de section reconnu sur une ligne, s'il y en a un. */
function headingField(line: string): keyof JobPosting | null {
    if (!line || line.length > 80) return null;
    const key = fold(line).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) return null;

    for (const section of SECTION_KEYS) {
        if (section.keys.includes(key)) return section.field;
    }
    return null;
}

function isHeading(line: string): boolean {
    return headingField(line) !== null;
}

/**
 * Lignes « Étiquette : valeur » dont la valeur part déjà dans son propre
 * champ : les recopier dans le texte de l'annonce ne ferait que du bruit.
 */
const METADATA_LABELS = [
    'lieu', 'lieu de travail', 'localisation', 'ville', 'localite',
    'type de contrat', 'contrat', 'duree', 'duree du contrat',
    'temps de travail', 'horaires', 'duree hebdomadaire',
    'salaire', 'salaire brut', 'remuneration',
    'entreprise', 'societe', 'employeur', 'raison sociale',
    'intitule du poste', 'intitule', 'poste', 'titre',
    'reference', 'date de publication', 'source'
];

function isMetadataLine(line: string): boolean {
    const match = line.match(/^([^:•\-–]{2,40})\s*[:：]\s*(.+)$/);
    if (!match) return false;
    const key = fold(match[1]).replace(/\s+/g, ' ').trim();
    return METADATA_LABELS.includes(key);
}

/**
 * Découpe l'annonce en sections. Ce qui précède la première section connue
 * devient la description, et une section inconnue va dans « autres ».
 */
function splitSections(lines: string[], title?: string): JobPosting {
    const buckets: Record<string, string[]> = {};
    let current: keyof JobPosting | 'intro' = 'intro';

    let introClosed = false;

    for (const line of lines) {
        const field = headingField(line);
        if (field) {
            current = field;
            continue;
        }
        if (isChromeLine(line)) {
            // Tout ce qui suit un bouton, une fenêtre d'aide ou une mention de
            // liste de résultats ne fait plus partie de l'annonce.
            introClosed = true;
            continue;
        }
        if (isMetadataLine(line)) continue;
        if (current === 'intro' && introClosed) continue;
        if (!line) {
            if (buckets[current]?.length) buckets[current].push('');
            continue;
        }
        if (current === 'intro' && title && clean(line) === title) continue;

        (buckets[current] ??= []).push(line);
    }

    const posting: JobPosting = {};
    for (const [field, content] of Object.entries(buckets)) {
        const value = content.join('\n').trim();
        if (!value) continue;
        if (field === 'intro') {
            posting.description = posting.description
                ? value + '\n\n' + posting.description
                : value;
        } else {
            posting[field as keyof JobPosting] = value;
        }
    }

    // Une intro seule ne vaut pas la peine d'être appelée « annonce ».
    if (Object.keys(posting).length === 1 && posting.description
        && posting.description.split('\n').length < 2
        && posting.description.length < 80) {
        return {};
    }
    return posting;
}

// ------------------------------------------------------------------ outils

/**
 * Le premier lien http(s) rencontré, en ignorant les adresses de vocabulaire
 * qui peuplent les blocs JSON-LD.
 */
function firstLink(raw: string): string | undefined {
    // Une page déclare son adresse : c'est plus sûr que de prendre le premier
    // lien trouvé, qui est souvent une feuille de style ou une icône.
    const canonical = /<link[^>]+rel=["']?canonical["']?[^>]*href=["']([^"']+)["']/i.exec(raw)
        ?? /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?canonical["']?/i.exec(raw)
        ?? /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i.exec(raw);
    if (canonical && /^https?:\/\//i.test(canonical[1])) return canonical[1];

    const ignoredHosts = [
        'schema.org', 'www.w3.org', 'ogp.me', 'json-ld.org',
        // Mesure d'audience : présente sur beaucoup de pages, jamais l'annonce.
        'dynatrace.com', 'googletagmanager.com', 'google-analytics.com',
        'doubleclick.net', 'hotjar.com', 'cookielaw.org', 'clarity.ms'
    ];
    // Fichiers servis par la page, et adresses de schémas XML : ce ne sont
    // jamais des annonces.
    const assetPattern = /\.(?:ico|png|jpe?g|gif|svg|webp|css|js|mjs|woff2?|ttf|eot|pdf|xml|xsd|dtd|xsl|json|map)(?:\?|$)/i;

    for (const match of raw.matchAll(/https?:\/\/[^\s"'<>)|]+/g)) {
        const link = match[0];
        if (ignoredHosts.some(host => link.includes(host))) continue;
        if (assetPattern.test(link)) continue;
        if (/\/(?:cdn|static|assets|media)\b/i.test(link)) continue;
        return link;
    }
    return undefined;
}

/** Éléments sans fermeture : ils ne délimitent aucun contenu. */
const VOID_TAGS = new Set([
    'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'area',
    'base', 'col', 'embed', 'param', 'track', 'wbr'
]);

/**
 * Ne garde que le contenu de l'annonce.
 *
 * Une page de site d'emploi, c'est l'annonce plus tout le reste : navigation,
 * pied de page, fenêtres modales d'aide, autres offres suggérées. Sans ce
 * tri, les règles de lecture prennent un intitulé de bouton pour un nom
 * d'entreprise.
 */
export function extractMainContent(raw: string): string {
    if (!/<[a-z!/][\s\S]*>/i.test(raw)) return raw;

    const html = raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<svg[\s\S]*?<\/svg>/gi, '')
        .replace(/<template[\s\S]*?<\/template>/gi, '');

    // D'abord la région que la page désigne elle-même : c'est le signal le
    // plus fiable, et il met d'un coup de côté l'en-tête, les menus et le
    // pied de page. Élaguer avant de faire ça supprimerait l'annonce.
    const region = declaredMainRegion(html) ?? html;

    // Puis l'habillage qui subsiste à l'intérieur : boutons « Postuler »,
    // fenêtres d'aide, encarts d'offres voisines.
    return pruneChrome(region);
}

/** La région de contenu déclarée par la page, si elle en déclare une. */
function declaredMainRegion(html: string): string | null {
    const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(html);
    if (main && main[1].trim().length > 200) return main[1];

    const byRole = /<([a-z]+)\b[^>]*role\s*=\s*["']?main["']?[^>]*>([\s\S]*)<\/\1>/i.exec(html);
    if (byRole && byRole[2].trim().length > 200) return byRole[2];

    const article = /<article\b[^>]*>([\s\S]*)<\/article>/i.exec(html);
    if (article && article[1].trim().length > 200) return article[1];

    const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html);
    if (body) return body[1];

    return null;
}

/**
 * Retire de la région ce qui relève de l'interface du site.
 *
 * On se fie aux rôles déclarés (role="dialog", aria-modal) et aux balises de
 * structure, pas à des noms de classes devinés : France Travail range
 * l'annonce dans un div de classe « modal-details-offre », et un filtre sur
 * le mot « modal » supprimait donc l'annonce elle-même. Seuls quelques noms
 * de blocs sans ambiguïté restent listés, et le filtre de lignes
 * (isChromeLine) sert de seconde barrière.
 */
function pruneChrome(region: string): string {
    return removeElements(region, (tag, attrs) => {
        if (['nav', 'header', 'footer', 'aside', 'dialog', 'form', 'select', 'button'].includes(tag)) {
            return true;
        }
        const value = attrs.toLowerCase();
        if (/role\s*=\s*["']?(dialog|navigation|banner|contentinfo|search|menu|toolbar)/.test(value)) {
            return true;
        }
        if (/aria-modal\s*=\s*["']?true/.test(value)) return true;

        return /(?:class|id)\s*=\s*["'][^"']*(breadcrumb|cookie|other-offers|autres-offres|offres-similaires|related-services|related-offers|suggestion|dropdown-menu|skip-link|partage|sharing)/
            .test(value);
    });
}

/** Retire les éléments retenus par le test, contenu compris. */
function removeElements(html: string, matches: (tag: string, attrs: string) => boolean): string {
    let out = '';
    let index = 0;

    while (index < html.length) {
        const start = html.indexOf('<', index);
        if (start < 0) {
            out += html.slice(index);
            break;
        }
        out += html.slice(index, start);

        const tag = /^<([a-zA-Z][\w-]*)([^>]*)>/.exec(html.slice(start));
        if (!tag) {
            out += '<';
            index = start + 1;
            continue;
        }

        const [whole, name, attrs] = tag;
        const lower = name.toLowerCase();
        const selfClosing = attrs.trimEnd().endsWith('/');

        if (!VOID_TAGS.has(lower) && !selfClosing && matches(lower, attrs)) {
            index = skipElement(html, start + whole.length, lower);
            continue;
        }

        out += whole;
        index = start + whole.length;
    }
    return out;
}

/** Position juste après la balise de fermeture correspondante. */
function skipElement(html: string, from: number, name: string): number {
    const pattern = new RegExp('<(/?)' + name + '(?=[\\s>/])', 'gi');
    pattern.lastIndex = from;
    let depth = 1;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
        depth += match[1] ? -1 : 1;
        if (depth === 0) {
            const close = html.indexOf('>', match.index);
            return close < 0 ? html.length : close + 1;
        }
    }
    return html.length;
}

/**
 * Tournures qui n'appartiennent jamais à une annonce : boutons, fenêtres
 * d'aide, mentions de liste de résultats.
 */
const CHROME_MARKERS = [
    'fermer', 'fermer la fenetre', 'afficher plus', 'voir plus', 'en savoir plus',
    'cliquez', 'deja vu', 'publie il y a', 'signaler', 'annuler',
    'envoyer a un ami', 'cookie', 'connectez vous', 'besoin d aide',
    'offres partenaires', 'service indisponible', 'non renseigne',
    'une erreur technique', 'tous les champs sont obligatoires',
    'ajouter a votre selection', 'creer une alerte', 'imprimer',
    'retour aux resultats', 'postuler a cette offre', 'accueil'
];

/** Vrai si la ligne relève de l'interface du site, pas de l'annonce. */
function isChromeLine(line: string): boolean {
    const key = fold(line).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!key) return false;
    return CHROME_MARKERS.some(marker => key.includes(marker));
}

/** Transforme du HTML en texte : les blocs deviennent des sauts de ligne. */
function toPlainText(raw: string): string {
    if (!/<[a-z!/][\s\S]*>/i.test(raw)) return raw;

    return raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|section|ul|ol)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&eacute;/gi, 'é')
        .replace(/&egrave;/gi, 'è')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Sans accents, en minuscules : pour comparer des libellés. */
function fold(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function clean(value: string): string {
    return value
        .replace(/\s+/g, ' ')
        .replace(/^[-•*–\s]+/, '')
        .replace(/[\s,;:–-]+$/, '')
        .trim();
}

/** `next` complète `base` sans jamais écraser ce qui a déjà été reconnu. */
function merge(base: ParsedOffer, next: ParsedOffer): ParsedOffer {
    const result: ParsedOffer = { ...base };
    for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '') continue;
        if (key === 'posting') {
            result.posting = { ...(value as JobPosting), ...(result.posting ?? {}) };
            continue;
        }
        if (result[key as keyof ParsedOffer] === undefined) {
            (result as Record<string, unknown>)[key] = value;
        }
    }
    return result;
}

/** Les champs effectivement reconnus, pour pouvoir le dire à l'utilisateur. */
export function parsedFields(offer: ParsedOffer): string[] {
    const labels: { key: keyof ParsedOffer; label: string }[] = [
        { key: 'title', label: 'intitulé' },
        { key: 'companyName', label: 'entreprise' },
        { key: 'agencyName', label: 'agence' },
        { key: 'location', label: 'lieu' },
        { key: 'contractType', label: 'contrat' },
        { key: 'contractDuration', label: 'durée' },
        { key: 'weeklyHours', label: 'temps de travail' },
        { key: 'salary', label: 'salaire' },
        { key: 'source', label: 'source' },
        { key: 'link', label: 'lien' }
    ];

    const found = labels
        .filter(entry => offer[entry.key] !== undefined)
        .map(entry => entry.label);

    if (offer.employerNotNamed) found.push('employeur non communiqué');

    const sections: { key: keyof JobPosting; label: string }[] = [
        { key: 'description', label: 'description' },
        { key: 'missions', label: 'missions' },
        { key: 'profile', label: 'profil' },
        { key: 'benefits', label: 'avantages' },
        { key: 'recruitmentProcess', label: 'process' },
        { key: 'others', label: 'autres' }
    ];
    for (const section of sections) {
        if (offer.posting?.[section.key]) found.push(section.label);
    }

    return found;
}

function text(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number') return String(value);
    return undefined;
}
